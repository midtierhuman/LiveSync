# System Architecture & Service Topography

LiveSync utilizes a decoupled, high-performance microservices architecture where client requests pass through an Nginx edge proxy, routed to specialized backend microservices communicating via HTTP/2 gRPC, Redis Streams, and WebSockets.

---

## 🏗️ High-Level Service Architecture

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

---

## 📦 Microservices Breakdown

| Service Name | Primary Tech Stack | Purpose | Internal Transport | Exposed Port |
| :--- | :--- | :--- | :--- | :--- |
| **`livesync-gateway`** | Go 1.26, `creack/pty`, `coder/websocket` | API Gateway, Live PTY shell, JWT middleware & gRPC client proxy | HTTP/1.1, WS, gRPC client | `8081` |
| **`livesync-sandbox`** | Python 3.14, gRPC, Pytest | Polyglot execution worker, AST Big-O analyzer, PyPI/npm manager | gRPC (HTTP/2) | `50051` (gRPC), `8080` (HTTP) |
| **`livesync-api`** | Java 21, Spring Boot 3, PostgreSQL 18 | Metadata, user authentication, document storage & Redis Stream consumer | REST / JDBC | `5038` |
| **`livesync-realtime`** | Node.js 24, Socket.IO 4.8 | Low-latency room broadcasting, OT collaboration & Redis Stream publisher | WebSockets / Redis | `5000` |
| **`livesync-ui`** | Angular 22, CodeMirror 6, xterm.js | Single-page application code editor & live terminal | HTTP | `4200` / `4000` |

---

## ⚡ Inter-Service Communication Protocol

1. **Client to Go Gateway (`livesync-gateway`)**:
   - `POST /api/execution/run` -> Executes code synchronously.
   - `GET /api/execution/languages` -> Fetches supported polyglot execution runtimes.
   - `WS /api/execution/stream` -> Real-time code execution streaming over WebSockets.
   - `WS /api/terminal/ws` -> Interactive PTY shell session streaming (`cmd.exe` / `/bin/bash`).

2. **Go Gateway to Python Sandbox (`livesync-sandbox`)**:
   - Communicates exclusively over **gRPC on port 50051** via `proto/sandbox.proto`.
   - Python sandbox runs completely isolated behind the Go Gateway without public HTTP route exposure.

3. **Realtime to Database Persistence**:
   - `livesync-realtime` appends document edits to Redis Stream `livesync:stream:document-saves`.
   - `livesync-api` reads from Redis Stream via `XREADGROUP` consumer group `api-save-group` and persists snapshots asynchronously into PostgreSQL.
