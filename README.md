# ⚡ LiveSync

> **Enterprise Real-Time Collaborative Code Editor, Go API Gateway, gRPC Polyglot Execution Sandbox & Interactive Live Terminal**

LiveSync is a high-performance, real-time collaborative code editor built on a decoupled polyglot microservices architecture. It combines Google Docs-style real-time collaboration with a native gRPC-powered polyglot code execution sandbox, Go API Gateway & PTY terminal engine, AST Big-O complexity analysis, and hybrid AI assistance (Local LLM / Cloud Gemini).

---

## 🚀 Key Capabilities

- **🤝 Real-Time Collaboration**: Conflict-free collaborative editing with multi-cursor presence, follow mode, and inline threaded comments powered by Node.js, Socket.IO, and Redis.
- **⚡ Go API Gateway (`livesync-gateway`)**: High-throughput gateway handling JWT validation, CORS, PTY shell allocation (`cmd.exe`/`/bin/bash`), and HTTP/2 gRPC client connection pooling.
- **🛡️ Pure gRPC Polyglot Sandbox (`livesync-sandbox`)**: Dedicated worker serving requests over native gRPC (`port 50051`). Supports **Python 3.14**, **JavaScript/Node 24**, **Java 21**, and **C#/.NET 8**.
- **📺 Interactive Live Terminal & Streaming**: Real-time bi-directional PTY shell and code execution streaming over WebSockets.
- **📊 AST Big-O Complexity Analyzer**: Static AST code analysis computing Time ($\mathcal{O}(N)$, $\mathcal{O}(N^2)$) and Space complexity.
- **🤖 Hybrid AI Assistance**: Local OpenAI-compatible LLM (`llama-server` / `Qwen2.5-Coder`) & Google Gemini with zero-cost offline AST structural analysis fallback.
- **⚡ Event-Driven Persistence**: Realtime service appends saves to Redis Streams (`livesync:stream:document-saves`); Java API (`livesync-api`) consumes and persists to PostgreSQL.

---

## 🏗️ System Architecture

```
                                  ┌────────────────────────────────────────┐
                                  │           Angular 21 UI Client         │
                                  │   (CodeMirror 6 + xterm.js + Material) │
                                  └───────────────────┬────────────────────┘
                                                      │
                                              Nginx Edge Proxy (5038)
                                                      │
         ┌───────────────────────────────┬────────────┴──────────────────┬───────────────────────────────┐
         │ (HTTP REST / Auth)            │ (WebSockets / Room Sync)      │ (HTTP REST & WS Streams)      │
         ▼                               ▼                               ▼                               ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐            ┌──────────────────┐
│   livesync-api   │           │ livesync-realtime│           │ livesync-gateway │            │ local llama.cpp  │
│ (Spring Boot 3)  │           │(Node.js/Socket.IO│           │ (Go API Gateway) │            │ (OpenAI Compat)  │
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
| **`livesync-ui`** | Angular 21, CodeMirror 6, xterm.js | Single-page reactive editor & terminal | `4200` (Dev) / `4000` (Prod) |
| **`livesync-gateway`** | Go 1.26, PTY, gRPC client | API Gateway, live PTY shell, WS stream proxy | `8081` |
| **`livesync-sandbox`** | Python 3.14, Native gRPC | Polyglot execution worker, AST analyzer, package search | `50051` (gRPC) |
| **`livesync-api`** | Java 21, Spring Boot 3 | Auth, user sessions, document/folder CRUD, Redis Stream consumer | `8080` (Internal) |
| **`livesync-realtime`** | Node.js 24, Socket.IO 4.8 | CRDT room broadcasting, cursor sync & Redis Stream publisher | `5000` |
| **`api-loadbalancer`** | Nginx Alpine | Reverse proxy & API Gateway Router | `5038` |
| **`postgres`** | PostgreSQL 18 | Primary relational metadata database | `5432` |
| **`redis`** | Redis 7-alpine | Event streams log & Socket.IO pub/sub bus | `6379` |

---

## 🛠️ Quick Start

### 1. Running the Full Stack with Docker Compose

```powershell
# Build and launch all microservices in the background
docker compose up --build -d

# View service logs
docker compose logs -f
```

Access the UI at `http://localhost:4000` (or `http://localhost:5038` via Nginx edge proxy).

---

### 2. Running Microservices Locally for Development

If you prefer running databases in Docker and services locally on your host:

#### Step 1: Start PostgreSQL & Redis
```powershell
docker compose up -d postgres redis
```

#### Step 2: Launch the Services

* **Java Core API (`livesync-api`)**:
  ```powershell
  cd livesync-api
  .\gradlew.bat bootRun
  ```

* **Python Sandbox Worker (`livesync-sandbox`)**:
  ```powershell
  cd livesync-sandbox
  .\venv\Scripts\python -m app.main
  ```

* **Go API Gateway (`livesync-gateway`)**:
  ```powershell
  cd livesync-gateway
  go run main.go
  ```

* **Node.js Realtime Server (`livesync-realtime`)**:
  ```powershell
  cd livesync-realtime
  npm run dev
  ```

* **Angular Frontend (`livesync-ui`)**:
  ```powershell
  cd livesync-ui
  npm start
  ```

---

## 📁 Repository Layout

```
LiveSync/
├── proto/               # Protobuf contracts (sandbox.proto)
├── livesync-gateway/    # Go API Gateway, PTY Terminal Engine & gRPC Client
├── livesync-sandbox/    # Python Polyglot Sandbox, Native gRPC Worker & AST Analyzer
├── livesync-api/        # Java 21 Spring Boot REST API & Redis Stream Consumer
├── livesync-realtime/   # Node.js 24 + Socket.IO Realtime Collaboration Service
├── livesync-ui/         # Angular 21 CodeMirror & xterm.js Workspace App
├── livesync-infra/      # Nginx proxy configuration, Prometheus & Grafana
├── docs/                # Comprehensive technical documentation
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
