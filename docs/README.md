# LiveSync Documentation

LiveSync is a high-performance polyglot real-time collaborative code editor and execution engine. The documentation structure mirrors the project's root microservice architecture:

## 📁 Documentation Structure

```
docs/
├── livesync-api/        # Java 21 Spring Boot 3 REST API documentation & auto-migration guide
├── livesync-realtime/   # Node.js 24 Socket.IO realtime service & Redis-stream persistence architecture
├── livesync-sandbox/    # Python 3.14 FastAPI execution engine, sandboxing & AST analyzer
├── livesync-ui/         # Angular 22 CodeMirror 6 frontend workspace documentation
├── livesync-infra/      # AWS deployment guide, Docker manifests, Prometheus & Grafana
├── CONFLICT_RESOLUTION_DESIGN.md  # Real-time conflict resolution & operational position tracking
├── PROJECT_ROADMAP.md             # Feature roadmap & milestones
└── README.md                      # Documentation index
```

---

## 📄 Service Documentation Index

### ☕ API Backend (`livesync-api`)
| File | Description |
|------|-------------|
| [README.md](./livesync-api/README.md) | Java auth, document, folder CRUD, and RBAC API overview |
| [AUTO_MIGRATION_GUIDE.md](./livesync-api/AUTO_MIGRATION_GUIDE.md) | Automatic DDL database migrations on startup |
| [TESTING_GUIDE.md](./livesync-api/TESTING_GUIDE.md) | Unit and integration testing guide |

### 🟨 Realtime Service (`livesync-realtime`)
| File | Description |
|------|-------------|
| [README.md](./livesync-realtime/README.md) | Socket.IO realtime service & Redis-stream write-behind flow |
| [QUICK_START.md](./livesync-realtime/QUICK_START.md) | Development quick start guide |
| [QUICK_REFERENCE.md](./livesync-realtime/QUICK_REFERENCE.md) | Service URLs, ports, and Socket.IO events reference |
| [README_AUTH.md](./livesync-realtime/README_AUTH.md) | Socket.IO JWT authentication and authorization integration |

### 🐍 Execution Sandbox (`livesync-sandbox`)
| File | Description |
|------|-------------|
| [README.md](./livesync-sandbox/README.md) | Polyglot execution sandbox, AST complexity analyzer & streaming REPL |

### 🅰️ Frontend UI (`livesync-ui`)
| File | Description |
|------|-------------|
| [README.md](./livesync-ui/README.md) | Angular 22 CodeMirror workspace, terminal UI & signals performance |

### ⚙️ Infrastructure & Monitoring (`livesync-infra`)
| File | Description |
|------|-------------|
| [AWS_DEPLOYMENT_GUIDE.md](./livesync-infra/AWS_DEPLOYMENT_GUIDE.md) | AWS ECS/EC2 container deployment guide |

### 🧠 Architecture & Design
| File | Description |
|------|-------------|
| [CONFLICT_RESOLUTION_DESIGN.md](./CONFLICT_RESOLUTION_DESIGN.md) | Real-time conflict resolution & operational position tracking |
| [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md) | Project roadmap & feature milestones |
