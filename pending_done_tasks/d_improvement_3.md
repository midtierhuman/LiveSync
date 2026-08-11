# Improvement Ticket: Decouple API Layer from Sandbox & Migrate Gateway to Go [DONE]

## Summary
Re-architected `livesync-sandbox` by decoupling the API gateway layer from Python. Built a high-performance **Go API Gateway & Live PTY Terminal Manager** (`livesync-gateway`), retaining Python as a lightweight, stateless code execution worker.

---

## Architecture Blueprint

```
[ UI (xterm.js / REST) ] 
       │ (WebSockets / HTTP)
       ▼
[ Go API Gateway & PTY Manager ] ──► [ Postgres / Redis ]
       │ (gRPC / HTTP RPC)
       ▼
[ Python Sandbox Worker Nodes ] ──► [ Isolated Code Execution ]
```

---

## Detailed Requirements & Rationale

### 1. Go API Gateway Layer
* **High Concurrency:** Go goroutines handle 100k+ concurrent connections with low memory footprint (~2KB per goroutine).
* **JWT & Auth:** Validate authentication headers and rate-limiting at the Go edge before invoking execution workers.
* **Model Router:** Handle AI assistant requests and route them to `llama-server` or worker nodes cleanly.

### 2. Live Interactive Terminal Manager (Go WebSockets)
* **PTY Handler:** Implemented pseudo-terminal attachment using `github.com/creack/pty` or fallback process pipes.
* **WebSocket Bridge:** Pipe `xterm.js` terminal input/output bidirectional streams directly through Go WebSockets without Python GIL bottlenecks.

### 3. Stateless Python Sandbox Worker
* **Isolated Executor:** Python dedicated solely to code execution, AST parsing (`complexity_analyzer`), and language subprocess management.
* **RPC Interface:** Expose endpoints on Python worker containers called by the Go Gateway.

---

## Technical Tasks Implemented

### Phase 1: Go API Gateway (`livesync-gateway`)
- [x] Initialized Go microservice project with high-performance `net/http` router.
- [x] Implemented JWT authentication middleware and CORS support (`middleware/auth.go`).
- [x] Implemented AI assistant proxy endpoints (`/api/ai/analyze`, `/api/ai/models`).

### Phase 2: Live Terminal PTY Streaming
- [x] Implemented WebSocket handler for interactive terminal (`handlers/terminal.go`).
- [x] Connected Go WebSocket stream to PTY process (`creack/pty`).
- [x] Implemented terminal resize (`SIGWINCH`) and session cleanup logic.

### Phase 3: Infrastructure Integration
- [x] Created multi-stage Dockerfile (`livesync-gateway/Dockerfile`).
- [x] Integrated `gateway` service into `docker-compose.yml`.
- [x] Updated Nginx config (`livesync-infra/nginx/nginx.conf`) to route `/api/terminal/` to the Go gateway.
