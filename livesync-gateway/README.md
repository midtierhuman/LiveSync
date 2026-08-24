# ⚡ LiveSync API Gateway & PTY Engine (`livesync-gateway`)

High-performance, zero-trust API Gateway, interactive PTY Live Terminal engine, and AI proxy microservice written in **Go 1.26**.

---

## 🚀 Key Architecture & Capabilities

1. **Native OS Pseudo-Terminal (PTY) Multiplexing**:
   - **Windows**: Native ConPTY (`CreatePseudoConsole`) executing `powershell.exe -NoLogo`.
   - **Linux/macOS/Docker**: Unix PTY (`github.com/creack/pty`) executing `/bin/bash`.
   - Anchored directly in project workspaces (`./workspaces/{projectId}`) with sub-directory context (`subDir`).
   - OS-level read-only permissions (`chmod 0444`) on locked/view-only files to prevent terminal script tampering.
   - Platform-aware single line-ending normalization (`\n` on Linux/POSIX, `\r\n` on Windows ConPTY) for programmatic command dispatches (`run_command`), preventing duplicate prompt echoes.

2. **Bi-Directional `fsnotify` Disk Watcher**:
   - Watches workspace disk trees and pushes real-time `fs_change` JSON events over WebSocket whenever terminal commands (`mkdir`, `touch`, `npm create vite`) modify files, synchronizing the UI Explorer instantly without polling.
   - Built-in hash-based self-change suppression registry to decouple server-side atomic sync from raw terminal output.

3. **Universal AI Streaming Proxy (`/api/ai/stream`), BYO-Auth Bridge (`FEAT-14`) & CORS Preflight (`SEC-07`)**:
   - Ingests binary gRPC streams from `livesync-ai` over HTTP/2 and flushes Server-Sent Events (SSE) directly to the Angular UI for live token-by-token synthesis typing animations.
   - Forwards client-provided `X-AI-Api-Key`, agent `provider`, and `projectFiles` repository snapshots directly to internal `livesync-ai` gRPC workers.
   - Implements strict CORS preflight handler allowing `X-AI-Api-Key`, `X-Antigravity-Key`, `Authorization`, and `Content-Type`.

4. **Multi-Tier Token Bucket Rate Limiting (`SEC-05`)**:
   - Thread-safe token bucket rate limiters protecting against brute-force and resource starvation:
     - **Execution & Terminal PTY**: 0.5 req/sec (burst: 15).
     - **AI Streaming & Analysis**: 0.5 req/sec (burst: 10).
     - **Package Registry Search**: 1.0 req/sec (burst: 20).
     - **General Workspaces & Models**: 5.0 req/sec (burst: 60).
   - Emits RFC-compliant `X-RateLimit-*` and `Retry-After` headers on HTTP `429 Too Many Requests`.

5. **Backend-Authoritative Code Execution & Ephemeral Sandboxes (`ARCH-13` / `SEC-06`)**:
   - Fetches project manifests directly from `livesync-api` and executes builds in isolated disposable scratch sandboxes (`/run/exec-{id}`), guaranteeing zero pollution of collaborative persistent workspaces.

6. **Live Public Registry Search**:
   - Direct live search proxies querying official NPM (`registry.npmjs.org`) and PyPI (`pypi.org`) registries.

---

## 📡 HTTP & WebSocket Endpoints (Port `8081`)

| Method | Endpoint | Role | Rate Limit Tier |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Gateway readiness probe | None |
| `GET` | `/api/execution/languages` | Supported execution runtimes | General (5 req/s) |
| `POST` | `/api/execution/run` | Ephemeral isolated code execution | Execution (0.5 req/s) |
| `POST` | `/api/ai/analyze` | Unary AI assistant analysis | AI (0.5 req/s) |
| `POST/GET` | `/api/ai/stream` | Server-Sent Events (SSE) AI token stream | AI (0.5 req/s) |
| `GET` | `/api/ai/models` | Available AI models catalog | General (5 req/s) |
| `GET` | `/api/packages/search` | Live NPM / PyPI package search | Package (1 req/s) |
| `GET` | `/api/workspaces/{id}/search` | Multi-file regex workspace search | General (5 req/s) |
| `POST` | `/api/workspaces/{id}/replace`| Multi-file atomic text replacement | General (5 req/s) |
| `POST` | `/api/workspaces/{id}/sync` | Atomic workspace disk mirroring | General (5 req/s) |
| `GET` | `/api/terminal/ws` | Interactive PTY WebSocket connection | Execution (0.5 req/s) |

---

## 🛠️ Local Development & Testing

```bash
# Run unit & integration test suite
go test ./...

# Build binary
go build -v .

# Run gateway service
go run main.go
```
