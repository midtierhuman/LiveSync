# AWS Deployment Guide - LiveSync.Api

## Overview
The LiveSync.Api application is now configured for automatic database migration on startup, making it ideal for AWS deployment scenarios where the database may not exist initially.

## Database Migration Strategy

### Automatic Migration on Startup
The application now automatically applies pending database migrations when it starts. This is implemented in `Program.cs`:

```csharp
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<ApplicationDbContext>();
        var logger = services.GetRequiredService<ILogger<Program>>();
        
        logger.LogInformation("Applying database migrations...");
        context.Database.Migrate();
        logger.LogInformation("Database migrations applied successfully.");
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred while applying database migrations.");
        throw;
    }
}
```

### Benefits for AWS Deployment
- ? **No manual migration steps required**
- ? **Database is automatically created if it doesn't exist**
- ? **Migrations are applied in the correct order**
- ? **Idempotent** - Safe to run multiple times
- ? **Logged** - Migration status is logged for troubleshooting
- ? **Fails fast** - Application won't start if migrations fail

## AWS Deployment Options

### Option 1: AWS Elastic Beanstalk + RDS

#### Prerequisites
1. AWS Account with appropriate permissions
2. AWS CLI installed and configured
3. EB CLI installed: `pip install awsebcli`

#### Steps

1. **Create RDS Database Instance**
   ```bash
   # Create SQL Server RDS instance
   aws rds create-db-instance \
     --db-instance-identifier livesync-db \
     --db-instance-class db.t3.small \
     --engine sqlserver-ex \
     --master-username admin \
     --master-user-password YourPassword123! \
     --allocated-storage 20
   ```

2. **Update Connection String**
   - Get the RDS endpoint from AWS Console
   - Update `appsettings.json` or use environment variables:
   ```json
   {
     "ConnectionStrings": {
       "DefaultConnection": "Server=livesync-db.xxxxxx.region.rds.amazonaws.com;Database=LiveSyncAuthDb;User Id=admin;Password=YourPassword123!;TrustServerCertificate=True;"
     }
   }
   ```

3. **Initialize Elastic Beanstalk**
   ```bash
   cd LiveSync.Api
   eb init -p "64bit Amazon Linux 2 v2.6.0 running .NET 8" -r us-east-1
   ```

4. **Create Environment**
   ```bash
   eb create livesync-api-env
   ```

5. **Deploy**
   ```bash
   dotnet publish -c Release -o ./publish
   cd publish
   zip -r ../deploy.zip .
   cd ..
   eb deploy
   ```

### Option 2: AWS ECS (Fargate) + RDS

#### Steps

1. **Create Dockerfile** (if not exists)
   ```dockerfile
   FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
   WORKDIR /app
   EXPOSE 80
   EXPOSE 443

   FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
   WORKDIR /src
   COPY ["LiveSync.Api/LiveSync.Api.csproj", "LiveSync.Api/"]
   RUN dotnet restore "LiveSync.Api/LiveSync.Api.csproj"
   COPY . .
   WORKDIR "/src/LiveSync.Api"
   RUN dotnet build "LiveSync.Api.csproj" -c Release -o /app/build

   FROM build AS publish
   RUN dotnet publish "LiveSync.Api.csproj" -c Release -o /app/publish

   FROM base AS final
   WORKDIR /app
   COPY --from=publish /app/publish .
   ENTRYPOINT ["dotnet", "LiveSync.Api.dll"]
   ```

2. **Build and Push Docker Image**
   ```bash
   # Build image
   docker build -t livesync-api .

   # Tag for ECR
   docker tag livesync-api:latest {account-id}.dkr.ecr.{region}.amazonaws.com/livesync-api:latest

   # Push to ECR
   aws ecr get-login-password --region {region} | docker login --username AWS --password-stdin {account-id}.dkr.ecr.{region}.amazonaws.com
   docker push {account-id}.dkr.ecr.{region}.amazonaws.com/livesync-api:latest
   ```

3. **Create ECS Task Definition**
   - Use AWS Console or CLI
   - Set environment variables for connection string
   - Configure health checks

4. **Create ECS Service**
   - Use Fargate launch type
   - Configure Load Balancer
   - Set desired task count

### Option 3: AWS Lambda + API Gateway + RDS

#### Steps

1. **Install AWS Lambda Tools**
   ```bash
   dotnet tool install -g Amazon.Lambda.Tools
   ```

2. **Add Lambda Package**
   ```bash
   cd LiveSync.Api
   dotnet add package Amazon.Lambda.AspNetCoreServer.Hosting
   ```

3. **Update Program.cs**
   ```csharp
   // Add at the top
   builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);
   ```

4. **Deploy**
   ```bash
   dotnet lambda deploy-serverless
   ```

## Environment Configuration

### Using Environment Variables (Recommended for AWS)

Instead of hardcoding connection strings, use environment variables:

#### appsettings.json
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "${CONNECTION_STRING}"
  },
  "Jwt": {
    "Secret": "${JWT_SECRET}",
    "Issuer": "LiveSyncAuthAPI",
    "Audience": "LiveSyncClient",
    "ExpirationHours": 24
  }
}
```

#### Set in AWS
- **Elastic Beanstalk**: Environment Properties
- **ECS**: Task Definition Environment Variables
- **Lambda**: Environment Variables in Function Configuration

## Database Connection String Formats

### For AWS RDS SQL Server
```
Server={rds-endpoint};Database=LiveSyncAuthDb;User Id={username};Password={password};TrustServerCertificate=True;
```

### For AWS RDS SQL Server with SSL
```
Server={rds-endpoint};Database=LiveSyncAuthDb;User Id={username};Password={password};Encrypt=True;TrustServerCertificate=False;
```

## Security Best Practices

### 1. Use AWS Secrets Manager
```csharp
// Install package
// dotnet add package AWSSDK.SecretsManager

// In Program.cs
var secretName = "livesync-db-connection";
var region = "us-east-1";

using (var client = new AmazonSecretsManagerClient(RegionEndpoint.GetBySystemName(region)))
{
    var request = new GetSecretValueRequest { SecretId = secretName };
    var response = await client.GetSecretValueAsync(request);
    var connectionString = response.SecretString;
    
    builder.Configuration["ConnectionStrings:DefaultConnection"] = connectionString;
}
```

### 2. Use IAM Database Authentication
For RDS, you can use IAM authentication instead of passwords:
```csharp
// Enable IAM authentication in RDS
// Use AWS SDK to generate auth token
var authToken = RdsAuthTokenGenerator.GenerateAuthToken(
    hostname: "rds-endpoint",
    port: 1433,
    username: "admin"
);
```

### 3. Security Group Configuration
- Create separate security groups for API and Database
- Only allow API security group to access database
- Use least privilege principle

## Monitoring and Logging

### CloudWatch Integration
The application logs are already configured and will automatically flow to CloudWatch:
- Migration logs: `"Applying database migrations..."`
- Success logs: `"Database migrations applied successfully."`
- Error logs: `"An error occurred while applying database migrations."`

### Set Up Alarms
1. **Migration Failures**
   - Monitor for error logs containing "database migrations"
   - Set up SNS notifications

2. **Application Health**
   - Use ELB/ALB health checks
   - Monitor response times
   - Track error rates

## Migration Verification

### Check Migration Status
After deployment, verify migrations were applied:

1. **Connect to RDS Database**
   ```sql
   SELECT * FROM [__EFMigrationsHistory]
   ORDER BY [MigrationId] DESC;
   ```

2. **Expected Migrations**
   - Latest migration should be: `20251213041104_AddDefaultAccessLevelToDocument`

3. **Verify Schema**
   ```sql
   -- Check if DefaultAccessLevel column exists
   SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = 'Documents' AND COLUMN_NAME = 'DefaultAccessLevel';
   ```

## Rollback Strategy

### If Migration Fails
1. **Check CloudWatch Logs** for error details
2. **Review Migration History** in database
3. **Apply Rollback Migration** if needed:
   ```bash
   dotnet ef migrations remove
   dotnet publish
   # Redeploy
   ```

### Database Backup
- Enable automated RDS backups
- Take manual snapshot before major deployments
- Test restore procedures

## Cost Optimization

### Development/Testing
- Use `db.t3.small` for RDS
- Single AZ deployment
- Minimal storage (20-50 GB)

### Production
- Use `db.m5.large` or higher
- Multi-AZ deployment for high availability
- Enable read replicas if needed
- Use Aurora Serverless for variable workloads

## Troubleshooting

### Issue: Migration Timeout
**Solution**: Increase database connection timeout
```csharp
options.UseSqlServer(
    connectionString,
    sqlServerOptions => {
        sqlServerOptions.CommandTimeout(300); // 5 minutes
        sqlServerOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(30),
            errorNumbersToAdd: null
        );
    }
);
```

### Issue: Connection Refused
**Solution**: Check security groups
- Ensure API can reach database port (1433 for SQL Server)
- Verify VPC configuration
- Check network ACLs

### Issue: Authentication Failed
**Solution**: Verify credentials
- Check connection string format
- Verify RDS username/password
- Ensure database exists

## Health Check Endpoint

Consider adding a health check endpoint:

```csharp
// In Program.cs
app.MapGet("/health", async (ApplicationDbContext db) =>
{
    try
    {
        await db.Database.CanConnectAsync();
        return Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: 503,
            title: "Database connection failed"
        );
    }
});
```

## Continuous Deployment

### GitHub Actions Example
```yaml
name: Deploy to AWS

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup .NET
      uses: actions/setup-dotnet@v1
      with:
        dotnet-version: 8.0.x
    
    - name: Restore dependencies
      run: dotnet restore
      
    - name: Build
      run: dotnet build --configuration Release
      
    - name: Publish
      run: dotnet publish -c Release -o ./publish
      
    - name: Deploy to Elastic Beanstalk
      uses: einaregilsson/beanstalk-deploy@v21
      with:
        aws_access_key: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws_secret_key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        application_name: livesync-api
        environment_name: livesync-api-env
        version_label: ${{ github.sha }}
        region: us-east-1
        deployment_package: publish.zip
```

## Post-Deployment Checklist

- [ ] Verify application starts successfully
- [ ] Check CloudWatch logs for migration success
- [ ] Test health check endpoint
- [ ] Verify database schema is correct
- [ ] Test API endpoints with Swagger
- [ ] Configure CORS for production domain
- [ ] Set up monitoring and alarms
- [ ] Enable automated backups
- [ ] Document RDS endpoint and credentials (securely)
- [ ] Test rollback procedure
- [ ] Configure SSL certificate for HTTPS
- [ ] Update DNS records if needed

## Support

For issues or questions:
- Check CloudWatch Logs first
- Review RDS database logs
- Verify security group rules
- Check IAM permissions
