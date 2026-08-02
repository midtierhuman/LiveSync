# LiveSync Realtime Quick Reference

## Service URLs

| Service | HTTP | Purpose |
|---------|------|---------|
| API | http://localhost:8080 | Auth and document APIs |
| Realtime | http://localhost:5000 | Socket.IO collaboration service |
| Sandbox | http://localhost:8080 | Code execution sandbox |

## Start services

```powershell
cd backend\livesync\livesync-api
gradlew.bat bootRun

cd backend\livesync\livesync-realtime
npm install
npm run dev
```

## Common flow

1. Register or log in through the API
2. Copy the JWT token
3. Connect to the realtime service with that token
4. Join a document room and send updates

## Key realtime events

- `JoinDocument`
- `LeaveDocument`
- `SendContentUpdate`
- `SendOperation`
- `RequestMissedOperations`
- `SendCursorPosition`

## Troubleshooting

- Check Redis if document state is missing
- Check the API if access checks fail
- Check the browser console for Socket.IO errors
