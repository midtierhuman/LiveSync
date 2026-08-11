# ⚡ LiveSync

> **Enterprise Real-Time Collaborative Code Editor, Go API Gateway, gRPC Polyglot Execution Sandbox & Interactive Live Terminal**

LiveSync is a high-performance, real-time collaborative code editor built on a decoupled microservices architecture. It combines Google Docs-style real-time collaboration with a gRPC-powered polyglot code execution sandbox, Go API Gateway & PTY terminal engine, AST Big-O complexity analysis, and local Vulkan LLM AI assistance.

---

## 🚀 Key Capabilities

- **🤝 Real-Time Collaboration**: Operational Transformation (OT) engine with live cursor tracking powered by Node.js, Socket.IO, and Redis.
- **⚡ Go API Gateway (`livesync-gateway`)**: High-throughput gateway handling JWT validation, CORS, PTY shell allocation (`cmd.exe`/`/bin/bash`), and HTTP/2 gRPC client pooling.
- **🛡️ gRPC Polyglot Sandbox (`livesync-sandbox`)**: Isolated worker serving requests over gRPC (`port 50051`). Supports **Python 3.14**, **JavaScript/Node 24**, **Java 21**, and **C#/.NET 8**.
- **📺 Interactive Live Terminal & Streaming**: Real-time bi-directional PTY shell and code execution streaming over WebSockets.
- **📊 AST Big-O Complexity Analyzer**: Static AST code analysis computing Time ($\mathcal{O}(N)$, $\mathcal{O}(N^2)$) and Space complexity.
- **🤖 Vulkan Local LLM AI Integration**: Integration with `llama-server` running local model `Qwen2.5-Coder-14B-Instruct-Q4_K_M` for code explanation, refactoring, and test generation.
- **⚡ Event-Driven Persistence**: Realtime service appends saves to Redis Streams (`livesync:stream:document-saves`); Java API (`livesync-api`) consumes and persists to PostgreSQL.

---

## 🏗️ System Architecture

```
                                  ┌────────────────────────────────────────┐
                                  │           Angular 22 UI Client         │
                                  │   (CodeMirror 6 + xterm.js + Material) │
                                  └───────────────────┬────────────────────┘
                                                      │
                                             Nginx Edge Proxy (5038)
                                                      │
         ┌───────────────────────────────┬────────────┴──────────────────┬───────────────────────────────┐
         │ (HTTP REST / Auth)            │ (WebSockets / Room Sync)      │ (HTTP REST & WS Streams)      │
         ▼                               ▼                               ▼                               ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐            ┌──────────────────┐
│   livesync-api   │           │ livesync-realtime│           │ livesync-gateway │            │ local llama.exe  │
│ (Spring Boot 3)  │           │(Node.js/Socket.IO│           │ (Go API Gateway) │            │ (Vulkan / REST)  │
└────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘            └────────┬─────────┘
         │                              │                              │                               ▲
         │ (XREADGROUP)                 │ (XADD Event Stream)          │ gRPC (HTTP/2 Port 50051)      │
         ▼                              ▼                              ▼                               │
┌──────────────────────────────────────────────────┐          ┌──────────────────┐                     │
│                Redis 7 (AOF)                     │          │ livesync-sandbox │─────────────────────┘
│         (Streams & Socket.IO Bus)                │          │  (Python gRPC)   │
└──────────────────────────────────────────────────┘          └──────────────────┘
```

### Microservice Registry

| Service | Technology | Role | Port |
| :--- | :--- | :--- | :--- |
| **`livesync-ui`** | Angular 22, CodeMirror 6, xterm.js | Code editor single-page web app | `4000` / `4200` |
| **`livesync-gateway`** | Go 1.26, PTY, gRPC client | API Gateway, live PTY shell, WS stream proxy | `8081` |
| **`livesync-sandbox`** | Python 3.14, gRPC server | Polyglot execution, AST analyzer, package search | `50051` (gRPC) |
| **`livesync-api`** | Java 21, Spring Boot 3 | Auth, user sessions, document metadata & Redis Stream consumer | `5038` |
| **`livesync-realtime`** | Node.js 24, Socket.IO 4.8 | OT room broadcasting, cursor sync & Redis Stream publisher | `5000` |
| **`livesync-postgres`** | PostgreSQL 18 | Primary relational metadata database | `5432` |
| **`livesync-redis`** | Redis 7-alpine | Event streams log & Socket.IO pub/sub bus | `6379` |

---

## 🛠️ Quick Start

### Running with Docker Compose

Build and launch the complete microservice stack:

```bash
docker compose up --build
```

Access the UI at `http://localhost:4000` (or `http://localhost:5038` via Nginx edge proxy).

---

## 📁 Repository Layout

```
LiveSync/
├── proto/               # Protobuf contracts (sandbox.proto)
├── livesync-gateway/    # Go API Gateway, PTY Terminal Engine & gRPC Client
├── livesync-sandbox/    # Python Polyglot Sandbox, gRPC Worker & AST Analyzer
├── livesync-api/        # Java 21 Spring Boot REST API & Redis Stream Consumer
├── livesync-realtime/   # Node.js 24 + Socket.IO Realtime Collaboration Service
├── livesync-ui/         # Angular 22 CodeMirror Workspace App
├── livesync-infra/      # Nginx proxy configuration, Prometheus & Grafana
├── docs/                # Technical documentation index
└── docker-compose.yml   # Multi-container orchestration specification
```

---

## 📚 Technical Documentation Index

Detailed service guides and specifications are located in the [`docs/`](./docs/DOCS_INDEX.md) folder:

- **[Architecture Overview](./docs/SYSTEM_ARCHITECTURE.md)**
- **[Go API Gateway Guide](./docs/GO_GATEWAY_SERVICE.md)**
- **[Sandbox Execution Guide](./docs/SANDBOX_EXECUTION_SERVICE.md)**
- **[Realtime Collaboration Guide](./docs/REALTIME_COLLABORATION_SERVICE.md)**
- **[Spring Boot API Guide](./docs/SPRING_BOOT_API_SERVICE.md)**
- **[Conflict Resolution Design](./docs/CONFLICT_RESOLUTION_DESIGN.md)**
- **[Testing & Verification Guide](./docs/TESTING_GUIDE.md)**
- **[Project Roadmap](./docs/PROJECT_ROADMAP.md)**

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
