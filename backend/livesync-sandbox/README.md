# 🐍 LiveSync Polyglot Sandbox Service

A modern, high-performance polyglot code execution microservice built with **Python 3** and **FastAPI**.

## Features

- **Polyglot Execution Engine**: Isolated execution environments for Python 3, JavaScript (Node.js), and C# (.NET).
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
   pip install -r requirements.txt
   ```

2. Run the development server:
   ```bash
   uvicorn app.main:app --port 4000 --reload
   ```

3. Open API docs in browser:
   [http://localhost:4000/docs](http://localhost:4000/docs)
