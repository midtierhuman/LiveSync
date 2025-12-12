# ??? Database Quick Reference

## Connection Info
```
Server: FURY\SQLEXPRESS
Database: LiveSyncAuthDb
Authentication: Windows (Integrated Security)
```

---

## ?? Quick Commands

### EF Core Migrations

```bash
# Navigate to project
cd LiveSync.Api

# Create new migration
dotnet ef migrations add MigrationName

# Apply migrations
dotnet ef database update

# Remove last migration (if not applied)
dotnet ef migrations remove

# List all migrations
dotnet ef migrations list

# Generate SQL script
dotnet ef migrations script > migration.sql

# Drop database
dotnet ef database drop

# View context info
dotnet ef dbcontext info
```

---

## ?? Database Tables

| Table | Purpose |
|-------|---------|
| **AspNetUsers** | User accounts (email, password, custom fields) |
| **AspNetRoles** | User roles (Admin, User, etc.) |
| **AspNetUserRoles** | User-to-role assignments |
| **AspNetUserClaims** | User claims (permissions) |
| **AspNetUserLogins** | External login providers (OAuth) |
| **AspNetUserTokens** | Security tokens |
| **AspNetRoleClaims** | Role-based claims |
| **__EFMigrationsHistory** | Applied migrations tracking |

---

## ?? Useful SQL Queries

### Check User Count
```sql
USE LiveSyncAuthDb;
SELECT COUNT(*) FROM AspNetUsers;
```

### List All Users
```sql
SELECT 
    UserName,
    Email,
    FirstName,
    LastName,
    CreatedAt,
    EmailConfirmed
FROM AspNetUsers
ORDER BY CreatedAt DESC;
```

### Recent Logins
```sql
SELECT TOP 10
    UserName,
    Email,
    LastLoginAt
FROM AspNetUsers
WHERE LastLoginAt IS NOT NULL
ORDER BY LastLoginAt DESC;
```

### Users with Failed Logins
```sql
SELECT 
    UserName,
    Email,
    AccessFailedCount,
    LockoutEnd
FROM AspNetUsers
WHERE AccessFailedCount > 0
   OR LockoutEnd IS NOT NULL;
```

### Delete Test User
```sql
DELETE FROM AspNetUsers 
WHERE Email = 'test@example.com';
```

### Reset Database
```sql
-- Caution: This deletes ALL data!
USE LiveSyncAuthDb;
GO
DELETE FROM AspNetUserTokens;
DELETE FROM AspNetUserRoles;
DELETE FROM AspNetUserLogins;
DELETE FROM AspNetUserClaims;
DELETE FROM AspNetUsers;
DELETE FROM AspNetRoleClaims;
DELETE FROM AspNetRoles;
GO
```

---

## ??? Troubleshooting

### Cannot Connect
```bash
# Check SQL Server is running
services.msc
# Find "SQL Server (SQLEXPRESS)"
```

### Rebuild Database
```bash
cd LiveSync.Api
dotnet ef database drop --force
dotnet ef database update
```

### View Migration SQL
```bash
dotnet ef migrations script
```

---

## ?? Schema Changes Workflow

1. **Modify Model** (e.g., `ApplicationUser.cs`)
2. **Create Migration:**
   ```bash
   dotnet ef migrations add AddNewField
   ```
3. **Review Migration** (in `Migrations/` folder)
4. **Apply Migration:**
   ```bash
   dotnet ef database update
   ```
5. **Verify in Database** (SSMS or SQL query)

---

## ? Performance Tips

- Use async methods (`await _userManager.CreateAsync()`)
- Enable connection pooling in connection string
- Add indexes for frequently queried fields
- Use `.AsNoTracking()` for read-only queries

---

## ?? Production Checklist

- [ ] Change connection string to use dedicated DB user
- [ ] Enable connection pooling
- [ ] Store connection string in environment variables
- [ ] Never commit connection strings to git
- [ ] Set up database backups
- [ ] Configure monitoring and logging
- [ ] Test connection retry logic
- [ ] Review security permissions

---

**Quick Test:**
```bash
# Start app
cd LiveSync.Api
dotnet run

# Open Swagger
# https://localhost:7001/swagger

# Register user ? Check database
```
