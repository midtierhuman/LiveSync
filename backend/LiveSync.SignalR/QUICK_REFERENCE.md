# ?? LiveSync Backend - Quick Reference

## Service URLs

| Service | HTTPS | HTTP | Browser | Purpose |
|---------|-------|------|---------|---------|
| **Api** | https://localhost:7001 | http://localhost:5001 | ? Opens (Swagger) | Authentication |
| **SignalR** | https://localhost:7000 | http://localhost:5000 | ? Background | Real-time |

---

## Starting Services

### Visual Studio
```
1. Press F5
2. Api opens in browser with Swagger
3. SignalR runs in background
```

### Terminal
```bash
# Terminal 1
cd LiveSync.Api
dotnet run

# Terminal 2
cd LiveSync.SignalR
dotnet run
```

---

## Quick Test Flow

### 1. Register User (Swagger UI at https://localhost:7001/swagger)
```json
POST /api/auth/register
{
  "email": "test@example.com",
  "password": "Password123",
  "confirmPassword": "Password123",
  "firstName": "Test",
  "lastName": "User"
}
```
**Copy the `token` from response!**

### 2. Connect to SignalR (JavaScript)
```javascript
const connection = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => 'YOUR_TOKEN_HERE'
  })
  .build();

await connection.start();
await connection.invoke('JoinDocument', 'test-doc');

connection.on('ReceiveContentUpdate', (content) => {
  console.log('Received:', content);
});
```

---

## Key Differences

### ? Api (7001)
- Has REST API endpoints
- Has Swagger UI
- Opens browser on launch
- Test via Swagger UI

### ? SignalR (7000)
- Has WebSocket hub
- No Swagger (removed)
- No browser launch
- Test via code/client

---

## JWT Configuration (Must Match!)

**Both services use:**
```json
{
  "Jwt": {
    "Secret": "YourSuperSecretKeyForJWT_ChangeThisInProduction_32Characters!",
    "Issuer": "LiveSyncAuthAPI",
    "Audience": "LiveSyncClient"
  }
}
```

?? **Important:** Keep these values identical in both `appsettings.json` files!

---

## Troubleshooting

### Port in Use?
```bash
# Windows
netstat -ano | findstr :7000
taskkill /PID <pid> /F
```

### Can't Connect to SignalR?
- ? Check service is running
- ? Verify JWT token is valid
- ? Use HTTPS URL
- ? Check CORS settings

### Build Errors?
```bash
dotnet clean
dotnet restore
dotnet build
```

---

## Documentation

- ?? `QUICK_START.md` - Detailed getting started
- ?? `README_BACKEND.md` - Architecture overview
- ?? `LiveSync.Api/README.md` - Auth API docs
- ?? `SWAGGER_REMOVAL.md` - Why no Swagger in SignalR
- ?? `LAUNCH_CONFIGURATION.md` - Launch settings explained

---

## Common Tasks

### Add User
```bash
curl -X POST https://localhost:7001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Password123","confirmPassword":"Password123"}'
```

### Login
```bash
curl -X POST https://localhost:7001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"test@test.com","password":"Password123"}'
```

### Test SignalR (Node.js)
```javascript
const signalR = require("@microsoft/signalr");

const connection = new signalR.HubConnectionBuilder()
  .withUrl("https://localhost:7000/hubs/editor", {
    accessTokenFactory: () => token
  })
  .build();

await connection.start();
console.log("Connected!");
```

---

## Project Structure

```
backend/
??? LiveSync.Api/          (Port 7001)
?   ??? Controllers/           REST API endpoints
?   ??? Services/             Auth business logic
?   ??? Models/               User entities
?   ??? DTOs/                 Request/Response models
?   ??? Data/                 Database context
?
??? LiveSync.SignalR/          (Port 7000)
    ??? Hubs/                  SignalR hubs
    ??? Program.cs            Configuration
```

---

**Need Help?** Check the documentation files listed above! ??
