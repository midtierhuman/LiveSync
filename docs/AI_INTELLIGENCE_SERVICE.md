# AI Code Intelligence & Static AST Analysis Service (`livesync-ai`)

The `livesync-ai` microservice is an AI pair programming and static code intelligence engine built with **Python 3.14**. It operates over **native gRPC on port `50051`**, providing hybrid LLM code assistance, AST Big-O complexity analysis, unit test generation, and intelligent refactoring.

---

## 🤖 Hybrid AI Code Assistant (`app/services/ai_assistant.py`)

Provides a resilient multi-tier architecture for code generation, explanation, and unit testing:
1. **Google Gemini Cloud API**: Uses `gemini-flash-latest` / `gemini-3.5-flash` when `GEMINI_API_KEY` is provided.
2. **Local LLM Server**: Connects to OpenAI-compatible local endpoints (`llama-server`, Ollama, vLLM) on port `8080` / `11434` / `1234` running models like `Qwen2.5-Coder-14B-Instruct`.
3. **Offline CPU AST Fallback**: High-speed, zero-cost static analysis for structural code explanations, refactoring, and test skeleton generation when no external LLMs are reachable.

---

## 🧠 AST Big-O Complexity Analyzer (`app/services/complexity_analyzer.py`)

Statically parses code abstract syntax trees (AST) across Python and JavaScript to compute algorithmic complexity without executing untrusted code:
- **Time Complexity**: Computes algorithmic classification ($\mathcal{O}(1)$, $\mathcal{O}(\log N)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, $\mathcal{O}(N^k)$, $\mathcal{O}(2^N)$) through structural loop nesting and recursion analysis.
- **Space Complexity**: Estimates auxiliary space by tracking data structure allocations, multidimensional matrices, and call-stack recursion depths.

---

## 📡 gRPC Interface (`app/grpc_server.py`)

Implements the contract defined in [`proto/ai.proto`](../proto/ai.proto):

| RPC Method | Request | Response | Description |
| :--- | :--- | :--- | :--- |
| `AnalyzeCode` | `AiAnalysisRequest` | `AiAnalysisResponse` | Triggers AST + LLM analysis (Explain, Refactor, Unit Tests, Suggest, Complexity). |
| `GetLanguages` | `Empty` | `LanguagesResponse` | Returns descriptors for supported execution runtimes. |

---

## ⚙️ Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `50051` | Native gRPC listening port |
| `GEMINI_API_KEY` | `""` | Google Gemini API key (optional) |
| `LOCAL_LLM_URL` | `http://127.0.0.1:8080` | Local OpenAI-compatible LLM endpoint |
| `LOCAL_LLM_MODEL` | `Qwen2.5-Coder-14B-Instruct-Q4_K_M` | Active local model identifier |

---

## 🛠️ Running Locally

```powershell
cd livesync-ai

# Activate venv & install dependencies
.\venv\Scripts\python -m pip install -r requirements.txt

# Run the native gRPC server (port 50051)
.\venv\Scripts\python -m app.main

# Run unit tests
.\venv\Scripts\python -m pytest
```
