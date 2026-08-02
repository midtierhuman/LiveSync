# LiveSync Documentation

LiveSync is now a polyglot system:

- **Frontend**: Angular + TypeScript
- **Auth / document API**: Java 21 + Spring Boot
- **Realtime service**: Node.js + TypeScript + Socket.IO + Redis
- **Sandbox**: Python + FastAPI

## Backend

| File | Description |
|------|-------------|
| [AUTO_MIGRATION_GUIDE.md](./backend/AUTO_MIGRATION_GUIDE.md) | How auto-migrations work on startup |
| [BACKEND_CHANGES_SUMMARY.md](./backend/BACKEND_CHANGES_SUMMARY.md) | Summary of recent backend changes |
| [TESTING_GUIDE.md](./backend/TESTING_GUIDE.md) | Guide for running and writing backend tests |

### API (`livesync-api`)

| File | Description |
|------|-------------|
| [README.md](./backend/api/README.md) | Java auth and document API overview |
| [DATABASE_QUICK_REFERENCE.md](./backend/api/DATABASE_QUICK_REFERENCE.md) | PostgreSQL quick command reference |

### Realtime service (`livesync-realtime`)

| File | Description |
|------|-------------|
| [README_BACKEND.md](./backend/signalr/README_BACKEND.md) | Node/Socket.IO realtime service overview |
| [README_AUTH.md](./backend/signalr/README_AUTH.md) | How realtime auth uses the Java API |
| [QUICK_REFERENCE.md](./backend/signalr/QUICK_REFERENCE.md) | Quick command/endpoint reference |
| [QUICK_START.md](./backend/signalr/QUICK_START.md) | Getting started with the realtime service |
| [LAUNCH_CONFIGURATION.md](./backend/signalr/LAUNCH_CONFIGURATION.md) | Launch profiles and configuration |
| [MIGRATION_CHECKLIST.md](./backend/signalr/MIGRATION_CHECKLIST.md) | Checklist from the realtime migration |
| [MIGRATION_SUMMARY.md](./backend/signalr/MIGRATION_SUMMARY.md) | Summary of the realtime migration |
| [MIGRATION_COMPLETE.md](./backend/signalr/MIGRATION_COMPLETE.md) | Migration completion notes |
| [FINAL_SUMMARY.md](./backend/signalr/FINAL_SUMMARY.md) | Final state summary after migration |
| [SWAGGER_REMOVAL.md](./backend/signalr/SWAGGER_REMOVAL.md) | Notes on removing Swagger from the realtime service |

### Sandbox (`livesync-sandbox`)

| File | Description |
|------|-------------|
| [README.md](../backend/livesync/livesync-sandbox/README.md) | Python FastAPI sandbox overview |

## Deployment

| File | Description |
|------|-------------|
| [AWS_DEPLOYMENT_GUIDE.md](./deployment/AWS_DEPLOYMENT_GUIDE.md) | Guide for deploying to AWS |

## Frontend

| File | Description |
|------|-------------|
| [BACKEND_CHANGES_REQUIRED.md](./frontend/BACKEND_CHANGES_REQUIRED.md) | Backend changes required by the frontend |
