# LiveSync Authentication - MOVED TO LiveSync.AuthApi

## ?? IMPORTANT: Authentication has been moved to a separate service

The authentication functionality has been extracted into a separate microservice: **LiveSync.AuthApi**

Please refer to the `LiveSync.AuthApi/README.md` file for complete authentication documentation.

## Migration Summary
All authentication-related code has been moved from `LiveSync.SignalR` to `LiveSync.AuthApi`:
- Controllers/AuthController.cs ? LiveSync.AuthApi/Controllers/AuthController.cs
- Services/AuthService.cs ? LiveSync.AuthApi/Services/AuthService.cs
- Services/IAuthService.cs ? LiveSync.AuthApi/Services/IAuthService.cs
- Models/ApplicationUser.cs ? LiveSync.AuthApi/Models/ApplicationUser.cs
- Data/ApplicationDbContext.cs ? LiveSync.AuthApi/Data/ApplicationDbContext.cs
- DTOs/AuthDTOs.cs ? LiveSync.AuthApi/DTOs/AuthDTOs.cs

## Architecture
The LiveSync application now uses a microservices architecture:

1. **LiveSync.AuthApi** (Port 7001) - Handles all authentication operations
   - User registration
   - User login
   - JWT token generation
   - OAuth integration (planned)

2. **LiveSync.SignalR** (Port 7000) - Handles real-time collaboration
   - SignalR hub for real-time editing
   - JWT token validation (tokens from AuthApi)
   - Real-time synchronization

## Quick Start

### 1. Start the Authentication Service
```bash
cd LiveSync.AuthApi
dotnet run
```

### 2. Start the SignalR Service
```bash
cd LiveSync
dotnet run
```

### 3. Use the APIs
- Auth API Swagger: `https://localhost:7001/swagger`
- SignalR API Swagger: `https://localhost:7000/swagger`

## Overview (Legacy Information Below)
This authentication system provides JWT-based authentication with support for basic username/email and password login. OAuth support is scaffolded for future implementation.

## Features

### ? Implemented
- User registration with email and password
- Login with email or username
- JWT token generation and validation
- Password hashing and security
- User lockout after failed attempts
- Identity integration with ASP.NET Core
- Swagger documentation with JWT authorization

### ?? Planned (OAuth)
- Google OAuth login
- GitHub OAuth login
- Microsoft OAuth login

## API Endpoints

### 1. Register
**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123",
  "confirmPassword": "Password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Registration successful.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiration": "2024-12-12T10:30:00Z",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "userName": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### 2. Login
**POST** `/api/auth/login`

Login with email or username and password.

**Request Body:**
```json
{
  "emailOrUsername": "user@example.com",
  "password": "Password123",
  "rememberMe": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiration": "2024-12-12T10:30:00Z",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "userName": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### 3. Get Current User
**GET** `/api/auth/me`

Get information about the currently authenticated user.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "userName": "user@example.com",
  "firstName": null,
  "lastName": null
}
```

### 4. Refresh Token
**POST** `/api/auth/refresh`

Refresh an expired JWT token (not yet fully implemented).

**Request Body:**
```json
"your-jwt-token-here"
```

### 5. OAuth Endpoints (Planned)

#### Google OAuth
**POST** `/api/auth/oauth/google`

#### GitHub OAuth
**POST** `/api/auth/oauth/github`

#### Microsoft OAuth
**POST** `/api/auth/oauth/microsoft`

**OAuth Request Body:**
```json
{
  "provider": "Google|GitHub|Microsoft",
  "accessToken": "oauth-access-token-from-provider"
}
```

## Configuration

### appsettings.json
```json
{
  "Jwt": {
    "Secret": "YourSuperSecretKeyForJWT_ChangeThisInProduction_32Characters!",
    "Issuer": "LiveSyncAPI",
    "Audience": "LiveSyncClient",
    "ExpirationHours": 24
  }
}
```

**?? Important:** Change the JWT Secret in production!

## Database

Currently using **In-Memory Database** for development. To switch to a persistent database:

### SQL Server
1. Install package:
```bash
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
```

2. Update `Program.cs`:
```csharp
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
```

3. Add connection string to `appsettings.json`:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=(localdb)\\mssqllocaldb;Database=LiveSyncDb;Trusted_Connection=True;"
  }
}
```

4. Run migrations:
```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```

### PostgreSQL
1. Install package:
```bash
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
```

2. Update `Program.cs`:
```csharp
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
```

## Security Features

### Password Requirements
- Minimum length: 6 characters
- Requires at least one digit
- Requires at least one lowercase letter
- Requires at least one uppercase letter

### Account Lockout
- Max failed attempts: 5
- Lockout duration: 5 minutes

## Usage Example (JavaScript/TypeScript)

### Register
```typescript
const register = async () => {
  const response = await fetch('https://localhost:7000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
      firstName: 'John',
      lastName: 'Doe'
    })
  });
  
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('jwt-token', data.token);
  }
};
```

### Login
```typescript
const login = async () => {
  const response = await fetch('https://localhost:7000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      emailOrUsername: 'user@example.com',
      password: 'Password123',
      rememberMe: false
    })
  });
  
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('jwt-token', data.token);
  }
};
```

### Protected API Call
```typescript
const getProtectedResource = async () => {
  const token = localStorage.getItem('jwt-token');
  
  const response = await fetch('https://localhost:7000/api/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  });
  
  return await response.json();
};
```

### SignalR with JWT
```typescript
import * as signalR from '@microsoft/signalr';

const token = localStorage.getItem('jwt-token');

const connection = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => token
  })
  .build();

await connection.start();
```

## Testing with Swagger

1. Start the application
2. Navigate to `https://localhost:<port>/swagger`
3. Register a new user using `/api/auth/register`
4. Copy the token from the response
5. Click the "Authorize" button at the top of Swagger UI
6. Enter: `Bearer <your-token>`
7. Now you can test protected endpoints like `/api/auth/me`

## Future OAuth Implementation

To implement OAuth providers:

1. **Install OAuth packages:**
```bash
dotnet add package Microsoft.AspNetCore.Authentication.Google
dotnet add package Microsoft.AspNetCore.Authentication.MicrosoftAccount
dotnet add package AspNet.Security.OAuth.GitHub
```

2. **Register OAuth providers in Program.cs:**
```csharp
builder.Services.AddAuthentication()
    .AddGoogle(options => {
        options.ClientId = builder.Configuration["Authentication:Google:ClientId"];
        options.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
    })
    .AddGitHub(options => {
        options.ClientId = builder.Configuration["Authentication:GitHub:ClientId"];
        options.ClientSecret = builder.Configuration["Authentication:GitHub:ClientSecret"];
    });
```

3. **Implement OAuth logic in AuthService.cs:**
   - Validate OAuth tokens with provider APIs
   - Extract user information
   - Create or find user in database
   - Generate JWT token

## Architecture

```
Controllers/
  ??? AuthController.cs      # API endpoints
Services/
  ??? IAuthService.cs        # Service interface
  ??? AuthService.cs         # Authentication logic
Models/
  ??? ApplicationUser.cs     # User entity
DTOs/
  ??? AuthDTOs.cs           # Request/Response models
Data/
  ??? ApplicationDbContext.cs # EF Core context
```

## Notes
- All endpoints return standardized `AuthResponse` objects
- JWT tokens expire after 24 hours (configurable)
- User passwords are hashed using ASP.NET Core Identity
- The in-memory database resets on application restart
