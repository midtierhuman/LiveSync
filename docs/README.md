# LiveSync Documentation

LiveSync is a polyglot system:

- **Frontend**: Angular 19 + TypeScript + CodeMirror 6
- **Auth / Document API**: Java 21 + Spring Boot + PostgreSQL
- **Realtime Service**: Node.js + TypeScript + Socket.IO + Redis
- **Execution Sandbox**: Python 3 + FastAPI + WebSockets + AST Complexity Analyzer

## Main Project Overview

- [Main Root README.md](../README.md) - Full repository overview, architecture diagrams, and quick start guide.

## Backend Documentation

| File | Description |
|------|-------------|
| [AUTO_MIGRATION_GUIDE.md](./backend/AUTO_MIGRATION_GUIDE.md) | How auto-migrations work on startup |
| [BACKEND_CHANGES_SUMMARY.md](./backend/BACKEND_CHANGES_SUMMARY.md) | Summary of backend changes |
| [TESTING_GUIDE.md](./backend/TESTING_GUIDE.md) | Guide for running and writing backend tests |

### API (`livesync-api`)

| File | Description |
|------|-------------|
| [README.md](./backend/api/README.md) | Java auth and document API overview |
| [DATABASE_QUICK_REFERENCE.md](./backend/api/DATABASE_QUICK_REFERENCE.md) | PostgreSQL quick command reference |

### Realtime Service (`livesync-realtime`)

| File | Description |
|------|-------------|
| [README_BACKEND.md](./backend/signalr/README_BACKEND.md) | Node/Socket.IO realtime service overview |
| [README_AUTH.md](./backend/signalr/README_AUTH.md) | How realtime auth integrates with the Java API |
| [QUICK_REFERENCE.md](./backend/signalr/QUICK_REFERENCE.md) | Quick command/endpoint reference |
| [QUICK_START.md](./backend/signalr/QUICK_START.md) | Getting started with the realtime service |
| [LAUNCH_CONFIGURATION.md](./backend/signalr/LAUNCH_CONFIGURATION.md) | Launch profiles and configuration |

### Sandbox (`livesync-sandbox`)

| File | Description |
|------|-------------|
| [README.md](../backend/livesync-sandbox/README.md) | Python FastAPI sandbox, AST complexity analyzer & streaming REPL |

## Deployment

| File | Description |
|------|-------------|
| [AWS_DEPLOYMENT_GUIDE.md](./deployment/AWS_DEPLOYMENT_GUIDE.md) | Guide for deploying to AWS |

## Architecture & Roadmap

| File | Description |
|------|-------------|
| [CONFLICT_RESOLUTION_DESIGN.md](./CONFLICT_RESOLUTION_DESIGN.md) | Real-time conflict resolution design |
| [FAANG_READINESS_CHECKLIST.md](./FAANG_READINESS_CHECKLIST.md) | Production & FAANG readiness checklist |
| [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md) | Project roadmap & feature milestones |
