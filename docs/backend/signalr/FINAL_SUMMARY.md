# LiveSync Realtime Summary

## Current state

- Auth and document APIs live in the Java Spring Boot service
- Realtime collaboration runs in the Node + TypeScript Socket.IO service
- Code execution runs in the Python FastAPI sandbox
- Angular is the frontend

## What changed from the old setup

- Removed the old .NET backend docs and commands
- Replaced SignalR-specific guidance with Socket.IO guidance
- Updated setup instructions to match the current service ports and runtimes

## Service matrix

| Service | Port | Role |
|---------|------|------|
| API | 8080 | Auth, documents, access control |
| Realtime | 5000 | Rooms, operations, cursor updates |
| Sandbox | 8080 | Language execution |

## Next steps

1. Keep the docs aligned with the current Java/Node/Python stack
2. Update deployment notes if ports or environment variables change
3. Add more service-specific tests as features grow
