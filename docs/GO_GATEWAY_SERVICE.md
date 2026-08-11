# Go API Gateway & Live Terminal Engine (`livesync-gateway`)

The `livesync-gateway` microservice is built using **Go** to act as the primary high-throughput entry point for execution requests, AI code analysis, package manager lookups, and live terminal streaming.

---

## 🛠️ Architecture & Core Responsibilities

1. **gRPC Client Pool (`client/sandbox_client.go`)**:
   - Maintains a thread-safe connection to `livesync-sandbox` over HTTP/2 gRPC (`port 50051`).
   - Invokes `ExecuteCode`, `StreamExecution`, `AnalyzeCode`, `SearchPackages`, and `GetLanguages` RPCs.

2. **Live PTY Terminal Engine (`handlers/terminal.go`)**:
   - Allocates pseudo-terminals (`cmd.exe` on Windows, `/bin/bash` on Linux/Docker) using `creack/pty`.
   - Handles full-duplex bi-directional WebSocket streaming (`/api/terminal/ws`) with `coder/websocket`.
   - Supports terminal resizing events (`cols`, `rows`) and interactive input (`stdin`).

3. **JWT Authentication & CORS (`middleware/auth.go`)**:
   - Enforces HMAC SHA-256 JWT validation on incoming requests (`LIVESYNC_JWT_SECRET`).
   - Configures origin policy matching Angular frontend clients.

---

## 🔌 API Endpoint Mappings

| Endpoint | Protocol | Handler | Target Backend |
| :--- | :--- | :--- | :--- |
| `POST /api/execution/run` | HTTP | `ExecutionHandler.RunCode` | `SandboxService.ExecuteCode` (gRPC) |
| `GET /api/execution/languages` | HTTP | `ExecutionHandler.GetLanguages` | `SandboxService.GetLanguages` (gRPC) |
| `WS /api/execution/stream` | WebSocket | `TerminalHandler.ServeExecutionStream` | `SandboxService.StreamExecution` (gRPC) |
| `WS /api/terminal/ws` | WebSocket | `TerminalHandler.ServeWS` | Native OS PTY (`cmd.exe` / `/bin/bash`) |
| `POST /api/ai/analyze` | HTTP | `AIHandler.AnalyzeCode` | `SandboxService.AnalyzeCode` (gRPC) |
| `GET /api/ai/models` | HTTP | `AIHandler.ListModels` | In-memory local model registry |
| `GET /api/packages/` | HTTP | `PackagesHandler.SearchPackages` | `SandboxService.SearchPackages` (gRPC) |

---

## ⚙️ Configuration & Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8081` | Gateway HTTP/WS listening port |
| `LIVESYNC_SANDBOX_GRPC_URL` | `sandbox:50051` | Target Python Sandbox gRPC worker address |
| `LIVESYNC_JWT_SECRET` | `LiveSync-Development-Only-Secret-Change-Me!` | JWT signing secret |
| `LOCAL_LLM_MODEL` | `Qwen2.5-Coder-14B-Instruct-Q4_K_M` | Active local Vulkan LLM model name |
