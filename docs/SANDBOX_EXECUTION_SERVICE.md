# Polyglot Sandbox Execution & AI Service (`livesync-sandbox`)

The `livesync-sandbox` microservice is an isolated execution engine and AI worker built with Python. It operates purely over **native gRPC on port `50051`**, providing code execution, AST complexity analysis, package discovery, and hybrid local/cloud LLM AI assistance.

---

## 🚀 Language Runtimes & Multi-File Project Mounting
 
The sandbox manages isolated subprocess execution, timeouts, and resource monitoring for:
- 🐍 **Python 3.14** (`python`) — Executed with unbuffered stdout and process memory tracking.
- 🟨 **JavaScript / Node.js 24** (`javascript`) — Executed with isolated heap limit (`--max-old-space-size=256`) and process tree cleanup.

### 📦 Multi-File Project Workspace Snapshots
Both `ExecuteCode` and `StreamExecution` support multi-file full project mounting via `map<string, string> files` and `string entrypoint`:
- Multi-file structures with relative subpaths (e.g. `utils/math.py`, `models/user.js`) are reconstructed inside an isolated sandbox execution directory.
- Subprocesses execute with `cwd=temp_dir`, enabling intra-project imports (`import utils`, `const helper = require('./helper')`), shared configs, and modular packages.
- Automatic entrypoint detection selects `entrypoint`, `main.py`, `index.js`, `app.py`, or explicit buffer codes.
- Complete sandboxed cleanup recursively clears execution directories on process termination.
- Context cancellation callbacks (`context.add_callback`) ensure zero zombie subprocesses if clients disconnect unexpectedly or cancel execution.

---

## 🧠 AST Big-O Complexity Analyzer

Located in [`app/services/complexity_analyzer.py`](../livesync-sandbox/app/services/complexity_analyzer.py), the AST analyzer statically parses code ASTs across languages to compute algorithmic complexity without executing untrusted code:
- **Time Complexity**: Computes algorithmic classification ($\mathcal{O}(1)$, $\mathcal{O}(\log N)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, $\mathcal{O}(N^k)$, $\mathcal{O}(2^N)$) through structural loop nesting and recursion analysis.
- **Space Complexity**: Estimates auxiliary space by tracking data structure allocations, multidimensional matrices, and call-stack recursion depths.

---

## 🤖 Hybrid AI Code Assistant (`ai_assistant.py`)

Provides a multi-tier fallback architecture:
1. **Google Gemini Cloud API**: Uses `gemini-flash-latest` / `gemini-3.5-flash` when `GEMINI_API_KEY` is provided.
2. **Local LLM Server**: Connects to OpenAI-compatible local endpoints (`llama-server`, Ollama, vLLM) on port `8080` / `11434` / `1234` running models like `Qwen2.5-Coder-14B-Instruct`.
3. **Offline CPU AST Fallback**: High-speed, zero-cost static analysis for structural code explanations, refactoring, and test skeleton generation when no LLMs are reachable.

---

## 📡 gRPC Interface (`app/grpc_server.py`)

Implements the contract defined in [`proto/sandbox.proto`](../proto/sandbox.proto):

| RPC Method | Request | Response | Description |
| :--- | :--- | :--- | :--- |
| `ExecuteCode` | `ExecutionRequest` | `ExecutionResponse` | Synchronous isolated execution with stdout, stderr, exit code, CPU time, and memory metrics. |
| `StreamExecution` | `stream ExecutionChunk` | `stream ExecutionChunk` | Bi-directional streaming for interactive processes and live stdin feeding. |
| `GetLanguages` | `Empty` | `LanguagesResponse` | Returns descriptors for supported polyglot runtimes. |
| `AnalyzeCode` | `AiAnalysisRequest` | `AiAnalysisResponse` | Triggers AST + LLM analysis (Explain, Refactor, Unit Tests, Suggest). |
| `SearchPackages` | `PackageSearchRequest` | `PackageSearchResponse` | Queries PyPI and npm registries for dependencies and version metadata. |

---

## 🛠️ Running Locally

```powershell
cd livesync-sandbox
# Install requirements
pip install -r requirements.txt

# Run the native gRPC server (port 50051)
python -m app.main

# Run unit tests
python -m pytest
```
