# ⚡ LiveSync

> **Enterprise Real-Time Collaborative Code Editor, Go API Gateway, Python AI Intelligence & Interactive Live Terminal**

<p align="center">
  <img src="./docs/assets/demo_1.png" alt="LiveSync Real-Time Collaborative Cloud IDE Demo" width="100%" />
</p>

LiveSync is a high-performance, real-time collaborative code editor built on a decoupled polyglot microservices architecture. It combines Google Docs-style real-time collaboration with a high-throughput Go API Gateway & native PTY terminal engine, Python AI code intelligence & Big-O complexity analysis, and hybrid AI assistance (Local LLM / Cloud Gemini).

---

## 🚀 Key Capabilities

- **🤝 Real-Time Collaboration & $TP_1$ Conflict Resolution**: Mathematically proven Operational Transformation (OT) and CRDT deterministic tie-breaking engine guaranteeing Transformation Property 1 ($TP_1$) convergence across concurrent multi-user typing sessions without lock contention.
- **⚡ Debounced Hot-State Write-Behind & UNNEST Upserts (`PERF-11` / `PERF-14`)**: Realtime service flushes 2.5s trailing-edge debounced dirty snapshots to Redis Streams (`livesync:stream:document-saves`), consumed in batches of 50 by `livesync-api` and persisted via atomic PostgreSQL `UNNEST()` multi-document upserts.
- **🛡️ Storage Quotas & Dependency Isolation**: Multi-tier dependency shields prevent `node_modules`, `venv`, and binaries from touching persistent storage, with strict project resource caps (30 files, 256 KB/file, 2 MB project limit).
- **⚡ High-Throughput Go API Gateway (`livesync-gateway`)**: Zero-trust API gateway with `sync.Pool` byte slice recycling (`PERF-12`), JWT validation, token bucket rate limiting, PTY shell allocation (`powershell.exe`/`/bin/bash`), direct PyPI/npm package search, HTTP/2 gRPC client connection pooling, and backend-authoritative project compilation.
- **🤖 Universal Python AI & Sub-Millisecond AST Memoization (`livesync-ai`)**: Dedicated worker serving continuous gRPC server token streams (`port 50051`) via `StreamAnalyzeCode` -> Go Gateway SSE bridge (`/api/ai/stream`), featuring a 2,048-entry SHA-256 AST memoization LRU cache for $< 0.05\text{ms}$ Big-O complexity analysis (`PERF-13`), on-demand workspace tool calling (`ARCH-16`), and hybrid local/cloud LLM intelligence.
- **📺 True Interactive Workspace Terminal & Bounded Buffer (`PERF-16`)**: Real-time bi-directional `xterm.js` terminal canvas connected via WebSockets to a native PTY shell (`powershell.exe`/`/bin/bash`) anchored in the project workspace with 5,000-line memory-bounded scrollback and OS read-only protection for locked files.
- **🔒 Backend Manifest Source-of-Truth & DevTools Tamper Shield (`SEC-08`)**: Enforces PostgreSQL/Redis project manifest integrity during workspace disk synchronization, neutralizing client-side DevTools memory manipulation on read-only/revoked files while decoupling full project run execution.
- **🎯 Client Cursor Debouncing & Remote Caret RAF Batching (`PERF-15` / `PERF-16`)**: Dual-edge 50ms cursor throttling with delta compression and CodeMirror 6 `requestAnimationFrame` decoration batching for smooth, zero-jank collaborative editing.

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
│   livesync-api   │           │ livesync-realtime│           │ livesync-gateway │            │ local llama.cpp  │
│ (Go 1.26 REST)   │           │(Node.js/Socket.IO│           │ (Go API Gateway) │            │ (OpenAI Compat)  │
└────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘            └────────┬─────────┘
         │                              │                              │                               ▲
         │ (XREADGROUP)                 │ (XADD Event Stream)          │ gRPC (HTTP/2 Port 50051)      │
         ▼                              ▼                              ▼                               │
┌──────────────────────────────────────────────────┐          ┌──────────────────┐                     │
│                Redis 7 (AOF)                     │          │   livesync-ai    │─────────────────────┘
│         (Streams & Socket.IO Bus)                │          │  (Python gRPC)   │
└──────────────────────────────────────────────────┘          └──────────────────┘
```

### Microservice Registry

| Service | Technology | Role | Port |
| :--- | :--- | :--- | :--- |
| **`livesync-ui`** | Angular 22, CodeMirror 6, xterm.js | Single-page reactive editor & terminal | `4200` (Dev) / `4000` (Prod) |
| **`livesync-gateway`** | Go 1.26, PTY, gRPC client | Zero-trust API Gateway, live PTY shell, JWT authorization, package search | `8081` |
| **`livesync-ai`** | Python 3.14, Native gRPC | AI Pair Assistant, AST Big-O analyzer, LLM proxy | `50051` (gRPC) |
| **`livesync-api`** | Go 1.26, Chi, pgxpool | Auth, user sessions, document/folder CRUD, Redis Stream consumer | `8080` (Internal) |
| **`livesync-realtime`** | Node.js 24, Socket.IO 4.8 | CRDT room broadcasting, cursor sync & Redis Stream publisher | `5000` |
| **`api-loadbalancer`** | Nginx Alpine | Reverse proxy & API Gateway Router | `5038` |
| **`postgres`** | PostgreSQL 17-alpine | Primary relational metadata database | `5432` |
| **`redis`** | Redis 7-alpine | Event streams log & Socket.IO pub/sub bus | `6379` |

---

## 🛠️ Quick Start

### 1. Running the Full Stack with Docker Compose

Rebuild and start all polyglot microservices and databases in detached mode:

```bash
# Linux / macOS
./run-dev.sh

# Windows Command Prompt / Batch
run-dev.bat

# Or direct Docker Compose commands
docker compose down
docker compose up --build -d

# View live streaming logs
docker compose logs -f
```

Access the UI at `http://localhost:4000` (or `http://localhost:5038` via Nginx edge proxy).

---

### 2. Running Microservices Locally for Development

If you prefer running databases in Docker and services locally on your host:

#### Step 1: Start PostgreSQL & Redis
```bash
docker compose up -d postgres redis
```

#### Step 2: Launch the Services

* **Go Core API (`livesync-api`)**:
  ```bash
  cd livesync-api
  go run main.go
  ```

* **Python AI Service (`livesync-ai`)**:
  ```bash
  cd livesync-ai
  .venv/bin/python -m app.main
  ```

* **Go API Gateway (`livesync-gateway`)**:
  ```bash
  cd livesync-gateway
  go run main.go
  ```

* **Node.js Realtime Server (`livesync-realtime`)**:
  ```bash
  cd livesync-realtime
  npm run dev
  ```

* **Angular Frontend (`livesync-ui`)**:
  ```bash
  cd livesync-ui
  npm start
  ```

---

## 📁 Repository Layout

```
LiveSync/
├── proto/               # Protobuf contracts (ai.proto)
├── livesync-gateway/    # Go API Gateway, PTY Terminal Engine & Direct Package Search
├── livesync-ai/         # Python AI Intelligence, Native gRPC Worker & AST Analyzer
├── livesync-api/        # Go 1.26 REST API, PostgreSQL & Redis Stream Consumer
├── livesync-realtime/   # Node.js 24 + Socket.IO Realtime Collaboration Service
├── livesync-ui/         # Angular 22 CodeMirror & xterm.js Workspace App
├── livesync-infra/      # Nginx proxy configuration
├── docs/                # Comprehensive technical documentation
└── docker-compose.yml   # Multi-container orchestration specification
```

---

## 📚 Technical Documentation & Issue Tracking

Comprehensive architectural specifications and agile milestone trackers:

- **[Architecture & Technical Specifications (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)**: System topography, polyglot rationale, formal OT/CRDT conflict resolution proofs ($TP_1$), service deep-dives, and competitive benchmark matrix.
- **[GitHub Issues & Milestones Tracker](https://github.com/subhadipnayek/LiveSync/issues)**: Active backlogs, completed task history, and release milestones.
- **[Microservice Documentation]**:
  - [`livesync-gateway/README.md`](./livesync-gateway/README.md): Go 1.26 API Gateway, PTY Terminal Engine & Token Bucket Rate Limiter
  - [`livesync-ai/README.md`](./livesync-ai/README.md): Python 3.14 Native gRPC Server, AST Big-O Complexity Analyzer & Token Streaming
  - [`livesync-api/README.md`](./livesync-api/README.md): Go 1.26 Identity, Storage Quota Guard & Redis Stream Write-Behind Consumer
  - [`livesync-realtime/README.md`](./livesync-realtime/README.md): Node.js 24 + Socket.IO 4.8 $TP_1$ Conflict Resolver & Presence Hub
  - [`livesync-ui/README.md`](./livesync-ui/README.md): Angular 22 Zoneless Cloud IDE Client, CodeMirror 6 & xterm.js Dock

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
