# LiveSync Agent Instructions & Engineering Rules

## 📌 Project Overview
LiveSync is a high-performance, real-time collaborative code editor built on a decoupled polyglot microservices architecture:
- **`livesync-ui`**: Angular 22 (Zoneless signals, CodeMirror 6, xterm.js).
- **`livesync-gateway`**: Go 1.26 (PTY live terminal, WebSocket streaming, JWT auth, gRPC client pool).
- **`livesync-sandbox`**: Python 3.14 (Pure native gRPC server on port `50051`, supporting Python 3.14 & Node.js 24, AST Big-O complexity analyzer, hybrid AI code assistant).
- **`livesync-api`**: Go 1.26 (PostgreSQL storage via pgxpool, identity & RBAC, Redis Stream write-behind persistence consumer).
- **`livesync-realtime`**: Node.js 24 + Socket.IO 4.8 (CRDT & OT conflict resolution, presence, Redis adapter).

---

## 🚨 MANDATORY RULE: Continuous Documentation & README Synchronization

> **CRITICAL INSTRUCTION**: Whenever you make **ANY** change to the codebase (such as updating endpoints, ports, models, protocols, conflict algorithms, database schemas, dependencies, Docker configurations, or service logic), you **MUST** immediately update the relevant README files and documentation in [`docs/`](./docs/DOCS_INDEX.md).

### Documentation Maintenance Checklist
Every code modification must be reflected across corresponding documentation:
1. **Root [`README.md`](./README.md)**: Keep architecture diagrams, port mappings, microservice registry, and quick-start commands accurate.
2. **[`docs/DOCS_INDEX.md`](./docs/DOCS_INDEX.md)**: Keep documentation catalog and index descriptions up-to-date.
3. **[`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md)**: Keep inter-service communication flows, protocols, and port topography synchronized.
4. **Service Documentation**:
   - Updates to Go gateway -> Update [`docs/GO_GATEWAY_SERVICE.md`](./docs/GO_GATEWAY_SERVICE.md).
   - Updates to Python sandbox / gRPC / AI -> Update [`docs/SANDBOX_EXECUTION_SERVICE.md`](./docs/SANDBOX_EXECUTION_SERVICE.md).
   - Updates to Go API -> Update [`docs/GO_API_SERVICE.md`](./docs/GO_API_SERVICE.md).
   - Updates to Realtime / Socket.IO -> Update [`docs/REALTIME_COLLABORATION_SERVICE.md`](./docs/REALTIME_COLLABORATION_SERVICE.md).
   - Updates to OT / CRDT algorithms -> Update [`docs/CONFLICT_RESOLUTION_DESIGN.md`](./docs/CONFLICT_RESOLUTION_DESIGN.md).
5. **[`docs/TESTING_GUIDE.md`](./docs/TESTING_GUIDE.md)**: Keep test and verification commands working and up-to-date.

---

## 🧪 Testing & Quality Assurance
- Never consider a task complete without running and verifying test suites across modified services:
  - **Angular**: `npm test -- --watch=false` and `npm run build`
  - **Python Sandbox**: `.\venv\Scripts\python -m pytest`
  - **Go Gateway**: `go test ./...` and `go build -v .`
  - **Go API (`livesync-api`)**: `cd livesync-api && go test ./...` and `go build -v .`
  - **Node Realtime**: `npm test` and `npm run build`
