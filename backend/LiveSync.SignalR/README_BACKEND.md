# LiveSync Backend - Microservices Architecture

## Overview
The LiveSync backend is structured as a microservices architecture with two main services:

1. **LiveSync.AuthApi** - Authentication Service
2. **LiveSync.SignalR** - Real-time Collaboration Service

## Services

### 1. LiveSync.AuthApi (Authentication Service)
**Port:** `https://localhost:7001` (configurable in launchSettings.json)

**Purpose:** Handles all authentication and user management operations.

**Features:**
- User registration with email/password
- User login (email or username)
- JWT token generation
- Password hashing and security
- Account lockout protection
- OAuth integration (planned: Google, GitHub, Microsoft)

**Key Endpoints:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/refresh` - Refresh JWT token

**Technology Stack:**
- ASP.NET Core 8.0
- ASP.NET Core Identity
- Entity Framework Core (In-Memory for development)
- JWT Bearer Authentication
- Swagger/OpenAPI

**Documentation:** See `LiveSync.AuthApi/README.md`

---

### 2. LiveSync.SignalR (Real-time Collaboration Service)
**Port:** `https://localhost:7000` (configurable in launchSettings.json)

**Purpose:** Handles real-time collaborative editing using SignalR.

**Features:**
- Real-time document synchronization
- JWT token validation (from AuthApi)
- SignalR hub for collaborative editing
- CORS support for web clients

**Key Endpoints:**
- `GET /hubs/editor` - SignalR hub for real-time editing

**Technology Stack:**
- ASP.NET Core 8.0
- SignalR
- JWT Bearer Authentication (token validation only)
- Swagger/OpenAPI

**Documentation:** See `LiveSync/README.md` (if exists) or Swagger UI

---

## Getting Started

### Prerequisites
- .NET 8.0 SDK or later
- Visual Studio 2022 / VS Code / Rider (optional)
- Git

### Running the Services

#### Option 1: Run Both Services Simultaneously (Recommended)

**Using Visual Studio:**
1. Right-click on the Solution
2. Select "Configure Startup Projects"
3. Choose "Multiple startup projects"
4. Set both `LiveSync.AuthApi` and `LiveSync.SignalR` to "Start"
5. Press F5

**Using Terminal:**

Terminal 1 (Auth Service):
```bash
cd LiveSync.AuthApi
dotnet run
```

Terminal 2 (SignalR Service):
```bash
cd LiveSync
dotnet run
```

#### Option 2: Run Individual Services

**Auth Service Only:**
```bash
cd LiveSync.AuthApi
dotnet run
```

**SignalR Service Only:**
```bash
cd LiveSync
dotnet run
```

### Testing the Services

1. **Test Authentication:**
   - Navigate to `https://localhost:7001/swagger`
   - Register a new user via `/api/auth/register`
   - Copy the JWT token from the response

2. **Test SignalR with Authentication:**
   - Navigate to `https://localhost:7000/swagger`
   - Click "Authorize" button
   - Enter: `Bearer <your-jwt-token>`
   - Test SignalR-related endpoints

## Configuration

### Shared Configuration
Both services use the same JWT configuration to ensure tokens are compatible:

**appsettings.json (both services):**
```json
{
  "Jwt": {
    "Secret": "YourSuperSecretKeyForJWT_ChangeThisInProduction_32Characters!",
    "Issuer": "LiveSyncAuthAPI",
    "Audience": "LiveSyncClient"
  }
}
```

?? **IMPORTANT:** Ensure both services use the **SAME** JWT Secret, Issuer, and Audience values in production!

### Service-Specific Ports

**LiveSync.AuthApi:**
- HTTPS: `https://localhost:7001`
- HTTP: `http://localhost:5001`

**LiveSync.SignalR:**
- HTTPS: `https://localhost:7000`
- HTTP: `http://localhost:5000`

Configure these in each service's `Properties/launchSettings.json`

## Architecture Diagram

```
???????????????????
?   Frontend      ?
?  (Angular/      ?
?   React/Vue)    ?
???????????????????
         ?
         ???????????????????????????????????????
         ?                  ?                  ?
         ?                  ?                  ?
???????????????????  ????????????????????    ?
? LiveSync.AuthApi?  ? LiveSync.SignalR ?    ?
?  Port: 7001     ?  ?  Port: 7000      ?    ?
???????????????????  ????????????????????    ?
? - Register      ?  ? - SignalR Hub    ?    ?
? - Login         ?  ? - Real-time sync ?    ?
? - JWT Tokens    ?  ? - Token validate ?    ?
? - User Mgmt     ?  ????????????????????    ?
???????????????????           ?              ?
          ?                   ?              ?
          ?                   ?              ?
    ????????????              ?              ?
    ? Identity ?              ?              ?
    ? Database ?              ?              ?
    ????????????              ?              ?
                              ?              ?
                              ?              ?
                        JWT Token Validation
```

## Client Integration

### JavaScript/TypeScript Example

```typescript
// 1. Register/Login to get token
const authResponse = await fetch('https://localhost:7001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    emailOrUsername: 'user@example.com',
    password: 'Password123'
  })
});

const { token } = await authResponse.json();

// 2. Connect to SignalR with token
import * as signalR from '@microsoft/signalr';

const connection = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => token
  })
  .build();

await connection.start();
```

## Development

### Adding New Features

**Authentication-related features:**
- Add to `LiveSync.AuthApi`
- Example: Password reset, email verification, OAuth providers

**Real-time collaboration features:**
- Add to `LiveSync.SignalR`
- Example: Document versioning, presence indicators, conflict resolution

### Database Migration

Currently using in-memory databases for development. To switch to persistent storage:

1. Install database provider (SQL Server, PostgreSQL, etc.)
2. Update `Program.cs` in respective service
3. Run migrations:
```bash
dotnet ef migrations add InitialCreate --project LiveSync.AuthApi
dotnet ef database update --project LiveSync.AuthApi
```

## Deployment

### Docker Deployment (Example)

**Dockerfile.AuthApi:**
```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["LiveSync.AuthApi/LiveSync.AuthApi.csproj", "LiveSync.AuthApi/"]
RUN dotnet restore "LiveSync.AuthApi/LiveSync.AuthApi.csproj"
COPY . .
WORKDIR "/src/LiveSync.AuthApi"
RUN dotnet build "LiveSync.AuthApi.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "LiveSync.AuthApi.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "LiveSync.AuthApi.dll"]
```

### Environment Variables (Production)

Set these environment variables in production:

```bash
# Shared between services
JWT__SECRET=<your-production-secret>
JWT__ISSUER=LiveSyncAuthAPI
JWT__AUDIENCE=LiveSyncClient

# Auth API specific
CONNECTIONSTRINGS__DEFAULTCONNECTION=<your-database-connection-string>

# SignalR specific
CORS__ORIGINS=https://yourdomain.com
```

## Troubleshooting

### JWT Token Not Working
- Ensure both services use the **same** JWT Secret, Issuer, and Audience
- Check token expiration
- Verify the token is sent with "Bearer " prefix

### CORS Issues
- Update CORS policies in both services
- Ensure frontend origin is allowed
- Check for credential requirements in SignalR connections

### Database Connection Issues
- Verify connection strings
- Run migrations if using persistent database
- Check database server is running

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test both services together
5. Submit a pull request

## License

[Your License Here]

## Support

For issues, questions, or contributions, please open an issue on GitHub.
