# LiveSync - Quick Start Guide

## ?? Get Started in 5 Minutes

This guide will help you get the LiveSync backend services running locally.

## Prerequisites

- ? .NET 8.0 SDK installed ([Download here](https://dotnet.microsoft.com/download/dotnet/8.0))
- ? A code editor (Visual Studio 2022, VS Code, or Rider)
- ? Git installed
- ? Terminal/Command Prompt

## Step 1: Clone and Navigate

```bash
cd backend
```

You should see two main projects:
- `LiveSync.Api/` - Authentication service
- `LiveSync/` - SignalR real-time service

## Step 2: Start Both Services

### Option A: Using Visual Studio 2022

1. Open the solution file in Visual Studio
2. Right-click on the Solution in Solution Explorer
3. Select **"Set Startup Projects"**
4. Choose **"Multiple startup projects"**
5. Set both `LiveSync.Api` and `LiveSync.SignalR` to **"Start"**
6. Press **F5** to run both services

### Option B: Using Terminal (Two Terminals)

**Terminal 1 - Start Authentication Service:**
```bash
cd LiveSync.Api
dotnet run
```

Wait for: `Now listening on: https://localhost:7001`

**Terminal 2 - Start SignalR Service:**
```bash
cd LiveSync
dotnet run
```

Wait for: `Now listening on: https://localhost:7000`

## Step 3: Test the Services

### Test Authentication API

Open your browser and go to:
```
https://localhost:7001/swagger
```

You should see the Swagger UI with authentication endpoints.

### Register a Test User

1. In Swagger UI, find `POST /api/auth/register`
2. Click **"Try it out"**
3. Use this JSON body:
```json
{
  "email": "test@example.com",
  "password": "Password123",
  "confirmPassword": "Password123",
  "firstName": "Test",
  "lastName": "User"
}
```
4. Click **"Execute"**
5. You should get a **200 OK** response with a JWT token

**Copy the `token` value from the response!**

### Test SignalR Service

Open your browser and go to:
```
https://localhost:7000/swagger
```

1. Click the **"Authorize"** button (top right)
2. Enter: `Bearer <your-token-here>` (paste the token you copied)
3. Click **"Authorize"**
4. Click **"Close"**

Now you can test protected endpoints!

### Test "Get Current User" Endpoint

1. In Api Swagger (`https://localhost:7001/swagger`)
2. You should still be authorized from before
3. Find `GET /api/auth/me`
4. Click **"Try it out"**
5. Click **"Execute"**
6. You should see your user information

## Step 4: Test from Code

### Using JavaScript/TypeScript

```typescript
// 1. Login
const loginResponse = await fetch('https://localhost:7001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    emailOrUsername: 'test@example.com',
    password: 'Password123',
    rememberMe: false
  })
});

const { success, token, user } = await loginResponse.json();
console.log('Logged in:', user);
console.log('Token:', token);

// 2. Connect to SignalR
import * as signalR from '@microsoft/signalr';

const connection = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => token
  })
  .build();

await connection.start();
console.log('Connected to SignalR!');

// 3. Join a document
await connection.invoke('JoinDocument', 'my-document-id');

// 4. Listen for updates
connection.on('ReceiveContentUpdate', (content) => {
  console.log('Content updated:', content);
});

// 5. Send updates
await connection.invoke('SendContentUpdate', 'my-document-id', 'Hello World!');
```

### Using C#

```csharp
using System.Net.Http.Json;
using Microsoft.AspNetCore.SignalR.Client;

// 1. Login
var client = new HttpClient();
var loginRequest = new 
{
    emailOrUsername = "test@example.com",
    password = "Password123",
    rememberMe = false
};

var response = await client.PostAsJsonAsync(
    "https://localhost:7001/api/auth/login", 
    loginRequest);
var result = await response.Content.ReadFromJsonAsync<AuthResponse>();
var token = result.Token;

// 2. Connect to SignalR
var connection = new HubConnectionBuilder()
    .WithUrl("https://localhost:7000/hubs/editor", options =>
    {
        options.AccessTokenProvider = () => Task.FromResult(token);
    })
    .Build();

await connection.StartAsync();
Console.WriteLine("Connected!");

// 3. Join document and listen for updates
connection.On<string>("ReceiveContentUpdate", content =>
{
    Console.WriteLine($"Content: {content}");
});

await connection.InvokeAsync("JoinDocument", "my-document-id");
await connection.InvokeAsync("SendContentUpdate", "my-document-id", "Hello!");
```

## Step 5: Test Real-time Collaboration

Open two browser tabs:

**Tab 1:**
```javascript
const connection1 = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => 'your-token-here'
  })
  .build();

await connection1.start();
await connection1.invoke('JoinDocument', 'test-doc');

connection1.on('ReceiveContentUpdate', (content) => {
  console.log('Tab 1 received:', content);
});
```

**Tab 2:**
```javascript
const connection2 = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => 'your-token-here'
  })
  .build();

await connection2.start();
await connection2.invoke('JoinDocument', 'test-doc');

connection2.on('ReceiveContentUpdate', (content) => {
  console.log('Tab 2 received:', content);
});

// Send from Tab 2
await connection2.invoke('SendContentUpdate', 'test-doc', 'Hello from Tab 2!');
```

You should see "Tab 1 received: Hello from Tab 2!" in Tab 1's console!

## Common Issues & Solutions

### Issue: "SSL certificate problem"
**Solution:** Trust the development certificates
```bash
dotnet dev-certs https --trust
```

### Issue: "Port already in use"
**Solution:** Stop other applications using ports 7000, 7001, or change ports in `Properties/launchSettings.json`

### Issue: "401 Unauthorized" in SignalR
**Solution:** 
- Make sure you got a token from Api first
- Use `Bearer <token>` format in Authorization header
- Check token hasn't expired (24 hours by default)

### Issue: Services don't start
**Solution:**
```bash
# Clean and rebuild
dotnet clean
dotnet build
dotnet run
```

### Issue: "Database connection error"
**Solution:** Both services use in-memory databases by default - no setup needed! Data is reset when services restart.

## Service URLs

| Service | URL | Swagger UI |
|---------|-----|------------|
| Authentication API | https://localhost:7001 | https://localhost:7001/swagger |
| SignalR API | https://localhost:7000 | https://localhost:7000/swagger |

## API Endpoints Quick Reference

### Authentication API (Port 7001)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires token)
- `POST /api/auth/refresh` - Refresh token (not implemented yet)

### SignalR Hub (Port 7000)
- `JoinDocument(documentId)` - Join a document for editing
- `LeaveDocument(documentId)` - Leave a document
- `SendContentUpdate(documentId, content)` - Broadcast changes
- `SendCursorPosition(documentId, position)` - Broadcast cursor position

## Next Steps

? You now have both services running!

**What to do next:**
1. ?? Read `README_BACKEND.md` for architecture details
2. ?? Read `LiveSync.Api/README.md` for authentication details
3. ?? Write unit tests for your features
4. ?? Deploy to Azure/AWS (see deployment guides)
5. ?? Build your frontend application

## Need More Help?

- ?? Check `MIGRATION_CHECKLIST.md` for detailed setup
- ?? Read `MIGRATION_SUMMARY.md` for architecture overview
- ?? Check troubleshooting sections in README files
- ?? Open an issue on GitHub

## Visual Studio Tips

### Debugging Multiple Projects
1. Set breakpoints in both projects
2. Press F5
3. Both services will start with debugging enabled
4. You can debug across service boundaries!

### Hot Reload
Both projects support hot reload. Make code changes and see them applied without restart (in most cases).

### View Output
- Go to **View ? Output**
- Select "Debug" from dropdown to see console output
- Switch between services to see their logs

---

**?? Congratulations!** You're ready to develop with LiveSync!

Happy coding! ??
