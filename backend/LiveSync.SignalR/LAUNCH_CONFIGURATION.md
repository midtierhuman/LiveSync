# Launch Settings Configuration

## Overview
Configured optimal launch settings for both microservices with appropriate browser behavior and consistent ports.

---

## ?? Launch Configuration Summary

### LiveSync.Api (Port 7001)
? **Opens browser** ? Launches Swagger UI automatically  
? **Port:** 7001 (HTTPS), 5001 (HTTP)

**Why?**
- Api is a REST API service
- Swagger UI is useful for testing endpoints
- Developers need immediate visual feedback
- Can test registration/login directly in browser

### LiveSync.SignalR (Port 7000)
? **No browser launch** ? Runs silently in background  
? **Port:** 7000 (HTTPS), 5000 (HTTP)

**Why?**
- SignalR is a WebSocket service, not a web UI
- No Swagger or web interface to display
- Opening a browser would show nothing useful
- Reduces unnecessary browser tabs
- Background service approach

---

## ?? Configuration Details

### LiveSync.Api - launchSettings.json

```json
{
  "profiles": {
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,        // ? Opens browser
      "launchUrl": "swagger",       // ? Goes to Swagger UI
      "applicationUrl": "http://localhost:5001"
    },
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,        // ? Opens browser
      "launchUrl": "swagger",       // ? Goes to Swagger UI
      "applicationUrl": "https://localhost:7001;http://localhost:5001"
    }
  }
}
```

### LiveSync.SignalR - launchSettings.json

```json
{
  "profiles": {
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,       // ? No browser launch
      "applicationUrl": "http://localhost:5000"
    },
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,       // ? No browser launch
      "applicationUrl": "https://localhost:7000;http://localhost:5000"
    }
  }
}
```

---

## ?? Port Allocation

| Service | HTTPS Port | HTTP Port | Browser Launch |
|---------|-----------|-----------|----------------|
| **Api** | 7001 | 5001 | ? Yes (Swagger) |
| **SignalR** | 7000 | 5000 | ? No |

**Port Selection Rationale:**
- **7001/7000** - Easy to remember (7000 series for backend)
- **Sequential** - SignalR (7000), Auth (7001)
- **Standard** - Follows common port conventions
- **Non-conflicting** - Avoids common development ports

---

## ?? Developer Experience

### Starting Services

#### Option 1: Visual Studio (Multiple Startup Projects)
When you press **F5**:
1. ? Api starts ? Browser opens with Swagger UI at `https://localhost:7001/swagger`
2. ? SignalR starts ? Runs silently, console output visible
3. ? Both services ready for development

**Result:**
- One browser tab with useful content (Swagger)
- No unnecessary empty browser tabs
- Clean, professional startup experience

#### Option 2: Terminal
```bash
# Terminal 1 - Auth API (opens browser)
cd LiveSync.Api
dotnet run
# Browser opens automatically to: https://localhost:7001/swagger

# Terminal 2 - SignalR (no browser)
cd LiveSync.SignalR
dotnet run
# Runs silently, listening on: https://localhost:7000
```

---

## ?? Testing Workflow

### 1. Start Both Services (F5 in Visual Studio)
```
? Api starts ? https://localhost:7001/swagger (opens in browser)
? SignalR starts ? https://localhost:7000 (background)
```

### 2. Test Authentication (in opened Swagger UI)
```
1. Register user ? POST /api/auth/register
2. Copy JWT token from response
3. Use token for SignalR connection
```

### 3. Test SignalR (in your app or console)
```javascript
// Connect to SignalR with token from step 2
const connection = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor', {
    accessTokenFactory: () => token
  })
  .build();
```

---

## ?? Comparison: Before vs After

### Before Configuration
```
Start Services:
??? Api starts ? Opens browser to https://localhost:7072/swagger
??? SignalR starts ? Opens browser to https://localhost:7153/swagger
??? Result: 2 browser tabs, one is useless (SignalR has no Swagger)
```

**Problems:**
- ? SignalR opens browser to nothing
- ? Random ports (7072, 7153)
- ? Confusing for developers
- ? Extra browser tab clutter

### After Configuration
```
Start Services:
??? Api starts ? Opens browser to https://localhost:7001/swagger ?
??? SignalR starts ? Runs in background (no browser) ?
??? Result: 1 useful browser tab, clean console output
```

**Benefits:**
- ? Only useful browser tabs
- ? Consistent, memorable ports
- ? Clear service purposes
- ? Professional experience

---

## ?? Service Endpoints Reference

### Api (Browser-Friendly)
| Endpoint | URL | Opens in Browser |
|----------|-----|------------------|
| Swagger UI | https://localhost:7001/swagger | ? Yes |
| Register | https://localhost:7001/api/auth/register | Via Swagger |
| Login | https://localhost:7001/api/auth/login | Via Swagger |
| Get Me | https://localhost:7001/api/auth/me | Via Swagger |

### SignalR (Client-Only)
| Endpoint | URL | Opens in Browser |
|----------|-----|------------------|
| Hub | https://localhost:7000/hubs/editor | ? No (WebSocket) |

---

## ?? Development Tips

### Tip 1: Keep Console Output Visible
When running SignalR without a browser, you'll see all console output:
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: https://localhost:7000
info: Microsoft.Hosting.Lifetime[0]
      Application started. Press Ctrl+C to shut down.
```

### Tip 2: Test SignalR Connection
Use browser console on any web page:
```javascript
// Paste this in browser console to test
var connection = new signalR.HubConnectionBuilder()
  .withUrl('https://localhost:7000/hubs/editor')
  .build();

connection.start().then(() => console.log('Connected!'));
```

### Tip 3: Monitor Both Services
Use Visual Studio's Output window:
- **View ? Output**
- Switch between services in the dropdown
- See real-time logs from both

### Tip 4: Debugging
- Set breakpoints in both projects
- Press F5 to debug both simultaneously
- No browser doesn't mean no debugging!

---

## ?? Troubleshooting

### Issue: Port Already in Use
**Error:** `Unable to bind to https://localhost:7000`

**Solution:**
```bash
# Find process using port
netstat -ano | findstr :7000

# Kill the process (Windows)
taskkill /PID <process-id> /F
```

### Issue: Browser Opens for SignalR Anyway
**Cause:** Using old launch profile or IIS Express

**Solution:**
- Use the "https" or "http" profile (not IIS Express)
- Verify `launchBrowser` is set to `false`
- Restart Visual Studio to reload settings

### Issue: Can't Connect to SignalR
**Check:**
1. ? Service is running: `https://localhost:7000`
2. ? CORS is configured correctly
3. ? JWT token is valid (from Api)
4. ? Using HTTPS (not HTTP for tokens)

---

## ?? Summary

### What Changed

| Setting | Api | SignalR |
|---------|---------|---------|
| `launchBrowser` | `true` ? | `false` ? |
| HTTPS Port | 7001 | 7000 |
| HTTP Port | 5001 | 5000 |
| Launch URL | `/swagger` | *(none)* |

### Why It Matters

1. **Better UX** - Only opens useful browser tabs
2. **Clear Purpose** - Api is interactive, SignalR is background
3. **Consistent Ports** - Easy to remember and document
4. **Professional** - Follows microservice best practices
5. **Efficient** - Reduces resource usage

### Benefits

? **For Developers:**
- Cleaner workspace
- Obvious which service does what
- Faster startup time

? **For Documentation:**
- Consistent URLs in examples
- Easy to reference ports
- Clear service boundaries

? **For Testing:**
- Immediate access to Swagger
- SignalR doesn't interfere
- Focused testing approach

---

## ?? Best Practice Learned

**Microservice Launch Configuration:**

| Service Type | Launch Browser | When to Use |
|--------------|----------------|-------------|
| **REST API** | ? Yes | Has Swagger UI or web interface |
| **WebSocket** | ? No | SignalR, gRPC, background services |
| **Web App** | ? Yes | MVC, Razor Pages, Blazor |
| **Background Worker** | ? No | Hosted services, message queues |
| **API Gateway** | ? Maybe | Depends on documentation needs |

---

**Status:** ? **Configured Optimally**

**Build:** ? **Successful**

**Developer Experience:** ? **Improved**
