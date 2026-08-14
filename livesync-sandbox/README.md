# 🐍 LiveSync Polyglot Sandbox & AI Service

A modern, high-performance polyglot code execution and AI microservice built with **Python 3.14** operating over pure native **gRPC on port `50051`**.

---

## 🚀 Key Features

- **Polyglot Execution Engine**: Isolated execution environments for **Python 3.14** and **JavaScript (Node.js 24)**.
- **Security & Sandboxing Hardening**:
  - **Recursive Process Tree Killing (`process_killer.py`)**: Uses `psutil` to kill processes and all spawned child subprocesses/workers on timeout or client disconnect.
  - **Memory Allocation Caps**: Caps Node.js V8 heap memory at **256MB** (`--max-old-space-size=256`) to prevent OOM memory exhaustion attacks.
  - **Hardware Obfuscation (`node_preload.js`)**: Preloads hardware masking hooks via `--require` to virtualize `os.cpus()`, `os.totalmem()`, and system fingerprinting API calls.
  - **Sanitized Environment (`env_sanitizer.py`)**: Purges API keys, database credentials, and secrets from sub-process environment variables.
  - **Container Quotas**: Throttled in Docker Compose (`cpus: '1.5'`, `memory: 512M`).
- **AST Big-O Complexity Analyzer**: Automated AST code inspection to calculate Time & Space complexity ($\mathcal{O}(1)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, etc.) with explanations.
- **Hybrid AI Assistant**: Multi-tier local LLM (`llama-server`, Ollama) / Google Gemini with zero-cost offline AST fallback.
- **Package Manager Integration**: Native package lookup and dependency resolution for PyPI and npm.

---

## 📡 gRPC Interface (Port 50051)

Defined in [`proto/sandbox.proto`](../proto/sandbox.proto):
- `ExecuteCode` - Synchronous isolated code execution.
- `StreamExecution` - Bi-directional interactive execution stream.
- `GetLanguages` - Returns supported runtime descriptors.
- `AnalyzeCode` - AST and LLM AI code analysis.
- `SearchPackages` - PyPI and npm package discovery.

---

## 🛠️ Local Development

1. Setup virtual environment:
   ```powershell
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Run native gRPC worker:
   ```powershell
   python -m app.main
   ```

3. Run test suite:
   ```powershell
   python -m pytest
   ```
