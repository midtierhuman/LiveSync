# LiveSync Polyglot Sandbox Service (`livesync-sandbox`)

A modern, high-performance polyglot code execution microservice built with **Python 3.14** and **FastAPI**.

## Features

- **Polyglot Execution Engine**: Isolated execution environments for Python 3.14, JavaScript (Node.js 24), Java 21, C# (.NET 8), and C++.
- **Security & Sandboxing Hardening**:
  - **Recursive Process Tree Killing (`process_killer.py`)**: Uses `psutil` to kill processes and all spawned child subprocesses/workers on timeout or client disconnect.
  - **Memory Allocation Caps**: Caps Node.js V8 heap memory at **256MB** (`--max-old-space-size=256`) to prevent OOM memory exhaustion attacks.
  - **Hardware Obfuscation (`node_preload.js`)**: Preloads hardware masking hooks via `--require` to virtualize `os.cpus()`, `os.totalmem()`, and system fingerprinting API calls.
  - **Sanitized Environment (`env_sanitizer.py`)**: Purges API keys, database credentials, and secrets from sub-process environment variables.
  - **Container Quotas**: Throttled in Docker Compose (`cpus: '1.5'`, `memory: 512M`).
- **Interactive REPL Terminal (WebSockets)**: Bi-directional streaming execution over WebSockets (`/ws/execution/stream`) supporting live interactive `stdin` input.
- **AST Big-O Complexity Analyzer**: Automated AST code inspection to calculate Time & Space complexity ($\mathcal{O}(1)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, etc.) with explanations.
- **Process Resource Metrics**: Real-time monitoring of process CPU time and peak RAM memory usage via Prometheus (`/metrics`).
- **Timeout & Process Isolation**: Execution timeout boundaries (`asyncio.wait_for`) with automatic temporary file and directory cleanup.

## API Endpoints

- `GET /health`: Health check status.
- `GET /metrics`: Prometheus telemetry metrics.
- `GET /api/execution/languages`: List all available execution engines.
- `POST /api/execution/run`: Batch execute a code snippet.
- `WS /ws/execution/stream`: Interactive WebSocket stream for live REPL execution.

## Local Development

1. Install dependencies:
   ```bash
   cd livesync-sandbox
   pip install -r requirements.txt
   ```

2. Run the development server:
   ```bash
   uvicorn app.main:app --port 8080 --reload
   ```

3. Open API docs in browser:
   [http://localhost:8080/docs](http://localhost:8080/docs)
