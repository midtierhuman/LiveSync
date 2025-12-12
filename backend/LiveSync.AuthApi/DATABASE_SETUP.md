# SQL Server Database Setup - Complete ?

## Overview
Successfully configured LiveSync.AuthApi to use SQL Server with Entity Framework Core Code First approach. The database `LiveSyncAuthDb` has been created with all necessary tables.

---

## ? Configuration Summary

### Connection String
```
Data Source=FURY\SQLEXPRESS;
Initial Catalog=LiveSyncAuthDb;
Integrated Security=True;
Persist Security Info=False;
Pooling=False;
MultipleActiveResultSets=False;
Connect Timeout=30;
Encrypt=True;
TrustServerCertificate=True;
Packet Size=4096;
Command Timeout=0
```

### Database Details
- **Server:** `FURY\SQLEXPRESS`
- **Database Name:** `LiveSyncAuthDb`
- **Authentication:** Windows Integrated Security
- **Encryption:** Enabled with TrustServerCertificate

---

## ?? Database Schema

### Tables Created

The following tables were created by ASP.NET Core Identity:

#### 1. **AspNetUsers** (Main User Table)
Custom fields added to default Identity schema:
- `Id` (nvarchar(450), PK) - User ID
- `UserName` (nvarchar(256)) - Username
- `NormalizedUserName` (nvarchar(256)) - Normalized username for lookups
- `Email` (nvarchar(256)) - Email address
- `NormalizedEmail` (nvarchar(256)) - Normalized email for lookups
- `EmailConfirmed` (bit) - Email verification status
- `PasswordHash` (nvarchar(max)) - Hashed password
- `SecurityStamp` (nvarchar(max)) - Security token
- `ConcurrencyStamp` (nvarchar(max)) - Concurrency token
- `PhoneNumber` (nvarchar(max)) - Phone number
- `PhoneNumberConfirmed` (bit) - Phone verification status
- `TwoFactorEnabled` (bit) - 2FA enabled flag
- `LockoutEnd` (datetimeoffset) - Lockout expiration
- `LockoutEnabled` (bit) - Lockout enabled flag
- `AccessFailedCount` (int) - Failed login attempts
- **`FirstName` (nvarchar(50))** ? Custom field
- **`LastName` (nvarchar(50))** ? Custom field
- **`CreatedAt` (datetime2)** ? Custom field
- **`LastLoginAt` (datetime2)** ? Custom field

**Indexes:**
- `IX_AspNetUsers_NormalizedEmail` (EmailIndex)
- `IX_AspNetUsers_NormalizedUserName` (UserNameIndex) - Unique

#### 2. **AspNetRoles**
- `Id` (nvarchar(450), PK)
- `Name` (nvarchar(256))
- `NormalizedName` (nvarchar(256))
- `ConcurrencyStamp` (nvarchar(max))

**Indexes:**
- `IX_AspNetRoles_NormalizedName` (RoleNameIndex) - Unique

#### 3. **AspNetUserRoles** (Many-to-Many)
- `UserId` (nvarchar(450), PK, FK)
- `RoleId` (nvarchar(450), PK, FK)

**Foreign Keys:**
- `FK_AspNetUserRoles_AspNetUsers_UserId`
- `FK_AspNetUserRoles_AspNetRoles_RoleId`

#### 4. **AspNetUserClaims**
- `Id` (int, PK, Identity)
- `UserId` (nvarchar(450), FK)
- `ClaimType` (nvarchar(max))
- `ClaimValue` (nvarchar(max))

**Foreign Keys:**
- `FK_AspNetUserClaims_AspNetUsers_UserId`

#### 5. **AspNetUserLogins** (External Login Providers)
- `LoginProvider` (nvarchar(450), PK)
- `ProviderKey` (nvarchar(450), PK)
- `ProviderDisplayName` (nvarchar(max))
- `UserId` (nvarchar(450), FK)

**Foreign Keys:**
- `FK_AspNetUserLogins_AspNetUsers_UserId`

#### 6. **AspNetUserTokens** (Security Tokens)
- `UserId` (nvarchar(450), PK, FK)
- `LoginProvider` (nvarchar(450), PK)
- `Name` (nvarchar(450), PK)
- `Value` (nvarchar(max))

**Foreign Keys:**
- `FK_AspNetUserTokens_AspNetUsers_UserId`

#### 7. **AspNetRoleClaims**
- `Id` (int, PK, Identity)
- `RoleId` (nvarchar(450), FK)
- `ClaimType` (nvarchar(max))
- `ClaimValue` (nvarchar(max))

**Foreign Keys:**
- `FK_AspNetRoleClaims_AspNetRoles_RoleId`

#### 8. **__EFMigrationsHistory** (EF Core Metadata)
- `MigrationId` (nvarchar(150), PK)
- `ProductVersion` (nvarchar(32))

---

## ?? Package Changes

### Added Packages
```xml
<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.*" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="8.0.*">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>
```

### Removed Packages
```xml
<!-- Removed: In-memory database no longer needed -->
<PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="8.0.*" />
```

---

## ?? Configuration Files Updated

### appsettings.json
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=FURY\\SQLEXPRESS;Initial Catalog=LiveSyncAuthDb;Integrated Security=True;Persist Security Info=False;Pooling=False;MultipleActiveResultSets=False;Connect Timeout=30;Encrypt=True;TrustServerCertificate=True;Packet Size=4096;Command Timeout=0"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.EntityFrameworkCore.Database.Command": "Information"
    }
  }
}
```

**Key Changes:**
- Added `ConnectionStrings` section
- Added EF Core command logging for development
- Enabled SQL command logging

### Program.cs
```csharp
// Old: In-Memory Database
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseInMemoryDatabase("LiveSyncAuthDb"));

// New: SQL Server with Retry Logic
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlServerOptions => sqlServerOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(30),
            errorNumbersToAdd: null
        )
    ));
```

**Features Added:**
- Connection string from configuration
- Retry logic for transient errors
- Maximum 5 retry attempts
- 30-second max delay between retries

---

## ?? Migration Commands Used

### 1. Create Migration
```bash
cd LiveSync.AuthApi
dotnet ef migrations add InitialCreate
```

**Result:** Created `Migrations/` folder with:
- `YYYYMMDDHHMMSS_InitialCreate.cs` - Migration code
- `ApplicationDbContextModelSnapshot.cs` - Current model snapshot

### 2. Apply Migration (Create Database)
```bash
cd LiveSync.AuthApi
dotnet ef database update
```

**Result:** 
- ? Created database `LiveSyncAuthDb`
- ? Created all Identity tables
- ? Applied indexes and foreign keys
- ? Added migration history entry

---

## ?? Verify Database Creation

### Using SQL Server Management Studio (SSMS)

1. **Connect to Server:**
   ```
   Server Name: FURY\SQLEXPRESS
   Authentication: Windows Authentication
   ```

2. **View Database:**
   - Expand "Databases" node
   - You should see `LiveSyncAuthDb`

3. **View Tables:**
   - Expand `LiveSyncAuthDb` ? Tables
   - You should see all 8 tables listed above

### Using SQL Query

```sql
-- Connect to FURY\SQLEXPRESS

-- List all tables
USE LiveSyncAuthDb;
GO

SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM 
    INFORMATION_SCHEMA.TABLES
ORDER BY 
    TABLE_NAME;

-- View AspNetUsers structure
EXEC sp_help 'AspNetUsers';

-- Check if any users exist
SELECT COUNT(*) as UserCount FROM AspNetUsers;
```

### Using dotnet CLI

```bash
# List migrations
cd LiveSync.AuthApi
dotnet ef migrations list

# View migration SQL (without applying)
dotnet ef migrations script

# Check database connection
dotnet ef dbcontext info
```

---

## ?? Test the Setup

### 1. Start the Application
```bash
cd LiveSync.AuthApi
dotnet run
```

**Console Output Should Show:**
```
info: Microsoft.EntityFrameworkCore.Database.Command[20101]
      Executed DbCommand...
```

### 2. Register a Test User (Swagger UI)

Navigate to: `https://localhost:7001/swagger`

**POST** `/api/auth/register`
```json
{
  "email": "testuser@example.com",
  "password": "Test123!",
  "confirmPassword": "Test123!",
  "firstName": "Test",
  "lastName": "User"
}
```

### 3. Verify in Database

```sql
USE LiveSyncAuthDb;
GO

-- Check user was created
SELECT 
    Id,
    UserName,
    Email,
    FirstName,
    LastName,
    CreatedAt,
    EmailConfirmed
FROM 
    AspNetUsers;

-- Check password hash exists (should be a long string)
SELECT 
    UserName,
    LEFT(PasswordHash, 50) + '...' as PasswordHashPreview
FROM 
    AspNetUsers;
```

---

## ?? Security Considerations

### Connection String Security

?? **Production Warning:** Never commit connection strings with credentials to source control!

**For Production:**

1. **Use Environment Variables:**
```bash
# Windows
setx LIVESYNC_DB_CONNECTION "Server=...;Database=...;User Id=...;Password=..."

# Linux/Mac
export LIVESYNC_DB_CONNECTION="Server=...;Database=...;User Id=...;Password=..."
```

2. **Update Program.cs:**
```csharp
var connectionString = Environment.GetEnvironmentVariable("LIVESYNC_DB_CONNECTION") 
    ?? builder.Configuration.GetConnectionString("DefaultConnection");
```

3. **Use User Secrets (Development):**
```bash
cd LiveSync.AuthApi
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "your-connection-string"
```

### Database User Best Practices

For production, create a dedicated database user instead of using integrated security:

```sql
-- Create database user
USE [master];
GO
CREATE LOGIN [LiveSyncApiUser] WITH PASSWORD = 'StrongPassword123!';
GO

USE [LiveSyncAuthDb];
GO
CREATE USER [LiveSyncApiUser] FOR LOGIN [LiveSyncApiUser];
GO

-- Grant necessary permissions
ALTER ROLE db_datareader ADD MEMBER [LiveSyncApiUser];
ALTER ROLE db_datawriter ADD MEMBER [LiveSyncApiUser];
GO
```

**Updated Connection String:**
```
Data Source=FURY\SQLEXPRESS;Initial Catalog=LiveSyncAuthDb;User Id=LiveSyncApiUser;Password=StrongPassword123!;Encrypt=True;TrustServerCertificate=True;
```

---

## ??? Common EF Core Commands

### Create New Migration
```bash
cd LiveSync.AuthApi
dotnet ef migrations add MigrationName
```

### Apply Migrations
```bash
dotnet ef database update
```

### Rollback to Specific Migration
```bash
dotnet ef database update PreviousMigrationName
```

### Remove Last Migration (if not applied)
```bash
dotnet ef migrations remove
```

### Generate SQL Script
```bash
# All migrations
dotnet ef migrations script

# Specific range
dotnet ef migrations script FromMigration ToMigration

# Output to file
dotnet ef migrations script > migration.sql
```

### Drop Database (Caution!)
```bash
dotnet ef database drop
```

### Rebuild Database from Scratch
```bash
cd LiveSync.AuthApi
dotnet ef database drop --force
dotnet ef database update
```

---

## ?? Future Schema Changes

When you need to modify the database schema:

### Example: Add New Field to User

1. **Update Model:**
```csharp
public class ApplicationUser : IdentityUser
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public string? ProfilePictureUrl { get; set; } // NEW FIELD
}
```

2. **Create Migration:**
```bash
dotnet ef migrations add AddProfilePictureToUser
```

3. **Review Generated Migration:**
```csharp
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.AddColumn<string>(
        name: "ProfilePictureUrl",
        table: "AspNetUsers",
        type: "nvarchar(max)",
        nullable: true);
}
```

4. **Apply Migration:**
```bash
dotnet ef database update
```

---

## ?? Database Performance Tips

### 1. Indexes
The Identity framework creates appropriate indexes automatically. For custom queries, add indexes in `OnModelCreating`:

```csharp
protected override void OnModelCreating(ModelBuilder builder)
{
    base.OnModelCreating(builder);

    builder.Entity<ApplicationUser>(entity =>
    {
        entity.Property(e => e.FirstName).HasMaxLength(50);
        entity.Property(e => e.LastName).HasMaxLength(50);
        
        // Add custom index
        entity.HasIndex(e => e.CreatedAt);
    });
}
```

### 2. Connection Pooling
Enable connection pooling for better performance:

```
Pooling=True;Min Pool Size=5;Max Pool Size=100;
```

### 3. Async Operations
Always use async methods:
```csharp
await _userManager.CreateAsync(user, password);
await _dbContext.SaveChangesAsync();
```

---

## ?? Troubleshooting

### Issue: Cannot connect to SQL Server

**Error:** `A network-related or instance-specific error occurred`

**Solutions:**
1. Check SQL Server service is running:
   ```bash
   services.msc
   # Look for "SQL Server (SQLEXPRESS)"
   ```

2. Enable TCP/IP:
   - SQL Server Configuration Manager
   - SQL Server Network Configuration
   - Protocols for SQLEXPRESS
   - Enable TCP/IP

3. Check SQL Server Browser service is running

### Issue: Login failed for user

**Error:** `Login failed for user 'NT AUTHORITY\SYSTEM'`

**Solution:** Ensure Windows Authentication is enabled in SQL Server

### Issue: Certificate validation error

**Error:** `The certificate chain was issued by an authority that is not trusted`

**Solution:** Already handled with `TrustServerCertificate=True` in connection string

### Issue: Database already exists

**Error:** `Cannot create database 'LiveSyncAuthDb' because it already exists`

**Solution:**
```bash
# Drop and recreate
dotnet ef database drop
dotnet ef database update
```

### Issue: Migration already applied

**Error:** `Migration 'InitialCreate' already applied`

**Solution:** This is normal if running `database update` again. EF Core tracks applied migrations.

---

## ? Success Checklist

- [x] SQL Server connection string added to `appsettings.json`
- [x] Program.cs updated to use SQL Server
- [x] EF Core Tools package installed
- [x] SQL Server package added
- [x] In-memory database package removed
- [x] Initial migration created (`InitialCreate`)
- [x] Migration applied to database
- [x] Database `LiveSyncAuthDb` created
- [x] All 8 Identity tables created
- [x] Custom fields (FirstName, LastName, CreatedAt, LastLoginAt) included
- [x] Indexes and foreign keys created
- [x] Retry logic configured
- [x] SQL command logging enabled

---

## ?? Additional Resources

### Entity Framework Core Documentation
- [EF Core Migrations](https://docs.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [SQL Server Provider](https://docs.microsoft.com/en-us/ef/core/providers/sql-server/)
- [Connection Strings](https://docs.microsoft.com/en-us/ef/core/miscellaneous/connection-strings)

### ASP.NET Core Identity
- [Identity Overview](https://docs.microsoft.com/en-us/aspnet/core/security/authentication/identity)
- [Identity Data Model](https://docs.microsoft.com/en-us/aspnet/core/security/authentication/customize-identity-model)

### SQL Server
- [SQL Server Express](https://www.microsoft.com/en-us/sql-server/sql-server-downloads)
- [SSMS Download](https://docs.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms)

---

**Status:** ? **Database Setup Complete!**

**Database:** `LiveSyncAuthDb` on `FURY\SQLEXPRESS`

**Tables:** 8 (Identity + Custom Fields)

**Ready for:** ? **User Registration and Authentication**

---

*Setup completed: [Current Date]*
*EF Core Version: 8.0*
*Database Provider: SQL Server*
