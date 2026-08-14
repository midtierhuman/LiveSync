# System Architecture & Service Topography

LiveSync utilizes a decoupled, high-performance microservices architecture where client requests pass through an Nginx edge proxy or Go API Gateway, routed to specialized backend microservices communicating via HTTP/2 gRPC, Redis Streams, and WebSockets.

---

## 🏗️ High-Level Service Architecture

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

---

## 📦 Microservices Breakdown

| Service Name | Primary Tech Stack | Purpose | Internal Transport | Exposed Port |
| :--- | :--- | :--- | :--- | :--- |
| **`livesync-gateway`** | Go 1.26, `creack/pty`, `coder/websocket` | API Gateway, Live PTY shell, JWT middleware & gRPC client proxy | HTTP/1.1, WS, gRPC client | `8081` |
| **`livesync-sandbox`** | Python 3.14, Native gRPC, Pytest | Polyglot execution worker, AST Big-O analyzer, PyPI/npm manager | gRPC (HTTP/2) | `50051` (gRPC) |
| **`livesync-api`** | Java 21, Spring Boot 3, PostgreSQL 18 | Metadata, user authentication, document storage & Redis Stream consumer | REST / JDBC | `8080` (Direct) / `5038` (Nginx) |
| **`livesync-realtime`** | Node.js 24, Socket.IO 4.8 | Low-latency room broadcasting, CRDT collaboration & Redis Stream publisher | WebSockets / Redis | `5000` |
| **`livesync-ui`** | Angular 21, CodeMirror 6, xterm.js | Single-page application code editor & live terminal | HTTP | `4200` (Dev) / `4000` (Prod) |
| **`api-loadbalancer`**| Nginx Alpine | Reverse proxy, path-based routing & SSL termination | HTTP / WS | `5038` |
| **`postgres`** | PostgreSQL 18 | Relational document store, user accounts, and folder trees | TCP / SQL | `5432` |
| **`redis`** | Redis 7-alpine | Event streams (`livesync:stream:document-saves`) & Socket.IO pub/sub adapter | TCP / Redis | `6379` |

---

## ⚡ Inter-Service Communication Protocol

### 1. Client to Go Gateway (`livesync-gateway`)
- `POST /api/execution/run` -> Executes code synchronously via gRPC.
- `GET /api/execution/languages` -> Fetches supported polyglot execution runtimes.
- `WS /api/execution/stream` -> Real-time bi-directional code execution streaming over WebSockets.
- `WS /api/terminal/ws` -> Interactive PTY shell session streaming (`cmd.exe` / `/bin/bash`).
- `POST /api/ai/analyze` -> Triggers AI code analysis (Explain, Refactor, Unit Tests, Suggest).
- `GET /api/ai/models` -> Returns active local and cloud LLM models.
- `GET /api/packages/?query=...&language=...` -> Searches PyPI / npm package registries.

### 2. Go Gateway to Python Sandbox (`livesync-sandbox`)
- Communicates exclusively over **HTTP/2 gRPC on port 50051** via `proto/sandbox.proto`.
- Python sandbox runs completely isolated behind the Go Gateway with zero public HTTP route exposure.

### 3. Realtime to Database Persistence (Write-Behind)
- `livesync-realtime` receives document operations, updates in-memory CRDT / Redis cache, and appends snapshots to Redis Stream `livesync:stream:document-saves`.
- `livesync-api` reads from the Redis Stream via `XREADGROUP` (group: `api-save-group`) and asynchronously flushes document content snapshots into PostgreSQL.
- Periodic and on-disconnect flushers ensure zero data loss during server restarts or room closures.
