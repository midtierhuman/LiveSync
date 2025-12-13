# Automatic Database Migration - Quick Reference

## What Was Added

Automatic database migration on application startup in `Program.cs`:

```csharp
// Apply database migrations automatically
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

## How It Works

1. **On Application Startup**: Creates a service scope to access the database context
2. **Checks for Pending Migrations**: Entity Framework checks what migrations need to be applied
3. **Applies Migrations**: Runs all pending migrations in order
4. **Logs Results**: Logs success or failure for troubleshooting
5. **Fails Fast**: If migrations fail, the application won't start

## Benefits

? **Zero Manual Steps** - No need to run `dotnet ef database update` manually
? **AWS Ready** - Perfect for cloud deployments where database might not exist yet
? **CI/CD Friendly** - Works seamlessly with automated deployments
? **Idempotent** - Safe to run multiple times (won't re-apply existing migrations)
? **Database Creation** - Creates the database if it doesn't exist
? **Logged** - All migration activity is logged for monitoring

## What Happens on First Deployment

```
[Info] Applying database migrations...
[Info] Creating database 'LiveSyncAuthDb'...
[Info] Applying migration '20241201000000_InitialCreate'
[Info] Applying migration '20241202000000_AddSharedDocuments'
[Info] Applying migration '20251213041104_AddDefaultAccessLevelToDocument'
[Info] Database migrations applied successfully.
```

## What Happens on Subsequent Deployments

```
[Info] Applying database migrations...
[Info] No pending migrations found.
[Info] Database migrations applied successfully.
```

## Error Handling

If migration fails:
```
[Error] An error occurred while applying database migrations.
System.Exception: Cannot connect to database...
```

The application **will not start** - ensuring you don't run with an outdated schema.

## Development vs Production

### Development
- Works with local SQL Server Express
- Connection string in `appsettings.json`
- Migrations applied on every `dotnet run`

### Production (AWS)
- Works with RDS SQL Server
- Connection string from environment variables
- Migrations applied on each deployment
- Monitored via CloudWatch logs

## Monitoring

### CloudWatch Logs (AWS)
Look for these log entries:
- `"Applying database migrations..."` - Migration started
- `"Database migrations applied successfully."` - Success
- `"An error occurred while applying database migrations."` - Failure

### Set Up Alerts
Create CloudWatch alarms for:
- Log pattern: `"error occurred while applying database migrations"`
- Action: Send SNS notification to DevOps team

## Testing

### Test Locally
1. Delete your local database
2. Run `dotnet run`
3. Check logs - should see migrations being applied
4. Verify database exists with correct schema

### Test on AWS
1. Deploy to AWS environment
2. Check CloudWatch logs
3. Verify RDS database has all tables and migrations
4. Test API endpoints

## Verification

### Check Migration History
```sql
SELECT * FROM [__EFMigrationsHistory]
ORDER BY [MigrationId] DESC;
```

Expected result:
| MigrationId | ProductVersion |
|-------------|----------------|
| 20251213041104_AddDefaultAccessLevelToDocument | 8.0.22 |
| ... | ... |

### Check Schema
```sql
-- Verify DefaultAccessLevel column exists
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Documents' AND COLUMN_NAME = 'DefaultAccessLevel';
```

Expected result:
| COLUMN_NAME | DATA_TYPE | CHARACTER_MAXIMUM_LENGTH | IS_NULLABLE | COLUMN_DEFAULT |
|-------------|-----------|-------------------------|-------------|----------------|
| DefaultAccessLevel | nvarchar | 50 | NO | ('View') |

## Troubleshooting

### Issue: Application Won't Start
**Symptom**: Application crashes on startup
**Cause**: Migration failed
**Solution**: 
1. Check logs for specific error
2. Verify connection string
3. Check database permissions
4. Ensure database server is accessible

### Issue: Migrations Not Applied
**Symptom**: Old schema exists
**Cause**: Migration code not executed
**Solution**:
1. Verify `Program.cs` has migration code
2. Check application logs
3. Restart application

### Issue: "Database already exists"
**Symptom**: Error about existing database
**Cause**: EF Core migration confused
**Solution**:
- This is actually fine - EF will skip to applying pending migrations
- Check `__EFMigrationsHistory` table

### Issue: Connection Timeout
**Symptom**: Migration times out
**Solution**: Increase command timeout in `Program.cs`:
```csharp
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(
        connectionString,
        sqlServerOptions => sqlServerOptions.CommandTimeout(300) // 5 minutes
    ));
```

## Best Practices

### ? Do
- Monitor migration logs in production
- Set up alerts for migration failures
- Test migrations in staging first
- Keep migrations small and incremental
- Use environment variables for connection strings

### ? Don't
- Don't disable automatic migrations in production
- Don't ignore migration errors
- Don't modify existing migrations
- Don't skip testing migrations before deployment
- Don't use hardcoded credentials

## Disabling Automatic Migrations (Not Recommended)

If you need to disable automatic migrations for some reason:

```csharp
// Comment out or remove the migration block in Program.cs
/*
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    context.Database.Migrate();
}
*/
```

Then apply manually:
```bash
dotnet ef database update
```

## Connection String Examples

### Local Development
```json
"ConnectionStrings": {
  "DefaultConnection": "Server=localhost\\SQLEXPRESS;Database=LiveSyncAuthDb;Integrated Security=True;TrustServerCertificate=True;"
}
```

### AWS RDS
```json
"ConnectionStrings": {
  "DefaultConnection": "Server=livesync-db.xyz.us-east-1.rds.amazonaws.com;Database=LiveSyncAuthDb;User Id=admin;Password=SecurePassword123!;TrustServerCertificate=True;"
}
```

### Using Environment Variable
```bash
# Set environment variable
export ConnectionStrings__DefaultConnection="Server=...;Database=...;"

# Or in AWS Elastic Beanstalk
ConnectionStrings__DefaultConnection = "Server=...;Database=...;"
```

## Summary

The automatic database migration feature:
- ? Simplifies deployment
- ? Reduces manual steps
- ? Ensures schema consistency
- ? Perfect for AWS and cloud deployments
- ? Production-ready with proper logging and error handling

No manual `dotnet ef database update` commands needed! ??
