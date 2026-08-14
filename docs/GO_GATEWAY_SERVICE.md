# Go API Gateway & Live Terminal Engine (`livesync-gateway`)

The `livesync-gateway` microservice is built with **Go** to act as the primary high-throughput entry point for execution requests, AI code analysis, package manager lookups, and interactive live terminal streaming.

---

## 🛠️ Architecture & Core Responsibilities

1. **gRPC Client Pool (`client/sandbox_client.go`)**:
   - Maintains a thread-safe connection to `livesync-sandbox` over HTTP/2 gRPC (`port 50051`).
   - Dispatches `ExecuteCode`, `StreamExecution`, `AnalyzeCode`, `SearchPackages`, and `GetLanguages` RPCs.

2. **Live PTY Terminal Engine (`handlers/terminal.go`)**:
   - Allocates full OS pseudo-terminals (`cmd.exe` on Windows, `/bin/bash` on Linux/Docker) using `creack/pty`.
   - Handles full-duplex bi-directional WebSocket streaming (`/api/terminal/ws`) with `coder/websocket`.
   - Supports terminal resizing frames (`cols`, `rows`) and interactive input (`stdin`).

3. **JWT Authentication & CORS (`middleware/auth.go` & `middleware/cors.go`)**:
   - Enforces HMAC SHA-256 JWT validation on incoming requests (`LIVESYNC_JWT_SECRET`).
   - Configures origin policies matching Angular frontend clients.

---

## 🔌 API Endpoint Mappings

| Endpoint | Protocol | Handler | Target Backend |
| :--- | :--- | :--- | :--- |
| `POST /api/execution/run` | HTTP REST | `ExecutionHandler.RunCode` | `SandboxService.ExecuteCode` (gRPC) |
| `GET /api/execution/languages` | HTTP REST | `ExecutionHandler.GetLanguages` | `SandboxService.GetLanguages` (gRPC) |
| `WS /api/execution/stream` | WebSocket | `TerminalHandler.ServeExecutionStream` | `SandboxService.StreamExecution` (gRPC) |
| `WS /api/terminal/ws` | WebSocket | `TerminalHandler.ServeWS` | Native OS PTY (`cmd.exe` / `/bin/bash`) |
| `POST /api/ai/analyze` | HTTP REST | `AIHandler.AnalyzeCode` | `SandboxService.AnalyzeCode` (gRPC) |
| `GET /api/ai/models` | HTTP REST | `AIHandler.ListModels` | In-memory local & cloud model registry |
| `GET /api/packages/` | HTTP REST | `PackagesHandler.SearchPackages` | `SandboxService.SearchPackages` (gRPC) |
| `GET /health` | HTTP REST | Inline anonymous handler | Gateway health status JSON |

---

## ⚙️ Configuration & Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8081` | Gateway HTTP/WS listening port |
| `LIVESYNC_SANDBOX_GRPC_URL` | `127.0.0.1:50051` | Target Python Sandbox gRPC worker address |
| `LIVESYNC_JWT_SECRET` | `LiveSync-Development-Only-Secret-Change-Me!` | JWT signing secret |
| `LOCAL_LLM_URL` | `http://127.0.0.1:8080` | Local LLM server address |
| `LOCAL_LLM_MODEL` | `Qwen2.5-Coder-14B-Instruct-Q4_K_M` | Active local LLM model identifier |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200,...` | Comma-delimited allowed origins |

---

## 🛠️ Running Locally

```powershell
cd livesync-gateway
go run main.go
```
