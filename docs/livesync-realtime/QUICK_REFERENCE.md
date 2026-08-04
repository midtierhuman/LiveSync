# LiveSync Realtime Quick Reference

## Service URLs

| Service | Port / URL | Purpose |
|---------|------|---------|
| Frontend (`livesync-ui`) | http://localhost:4000 | Code editor & REPL terminal UI |
| API Gateway (`api-loadbalancer`) | http://localhost:5038 | Nginx load balancer for API & sandbox |
| API Backend (`livesync-api`) | http://localhost:8080 | Auth, documents, folders, and RBAC APIs |
| Realtime Service (`livesync-realtime`) | http://localhost:5000 | Socket.IO real-time collaboration service |
| Execution Sandbox (`livesync-sandbox`) | http://localhost:8080 | Code execution sandbox & AST analyzer |
| Prometheus (`livesync-infra`) | http://localhost:9090 | Metrics collection & health monitoring |
| Grafana (`livesync-infra`) | http://localhost:3000 | System observability dashboards |

## Start Services

```powershell
cd livesync-api
.\gradlew.bat bootRun

cd livesync-realtime
npm install
npm run dev
```

## Common Flow

1. Register or log in through `livesync-api` to receive a JWT token.
2. Connect to `livesync-realtime` over Socket.IO passing the JWT token.
3. Join a document room; updates persist instantly to Redis, then publish to the Redis Stream for the Java consumer to save to PostgreSQL.
4. Run polyglot code in the terminal by connecting directly to the sandbox service, which applies hardware specs obfuscation and memory caps.

## Key Realtime Events

- `JoinDocument` / `joinDocument`
- `LeaveDocument` / `leaveDocument`
- `SendContentUpdate` / `sendContentUpdate`
- `SendOperation` / `sendOperation`
- `RequestMissedOperations` / `requestMissedOperations`
- `SendCursorPosition` / `sendCursorPosition`
