# Polyglot Sandbox Execution & AI Service (`livesync-sandbox`)

The `livesync-sandbox` microservice is an isolated execution engine built with Python. It serves gRPC requests on port `50051`, providing code execution, AST complexity analysis, package discovery, and local LLM AI assistance.

---

## 🚀 Polyglot Language Runtimes

The execution catalog supports isolation, process limits, and memory monitoring for:
- 🐍 **Python 3.14** (`python`)
- 🟨 **JavaScript / Node.js 24** (`javascript`)
- ☕ **Java 21** (`java`)
- 🔷 **C# / .NET 8** (`csharp`)

---

## 🧠 AST Big-O Complexity Analyzer

Located in `app/services/complexity_analyzer.py`, the AST analyzer statically parses code ASTs to compute algorithmic complexity:
- **Time Complexity**: $\mathcal{O}(1)$, $\mathcal{O}(\log N)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, $\mathcal{O}(N^k)$, $\mathcal{O}(2^N)$.
- **Space Complexity**: Memory allocations, dynamic 2D matrices, and recursion depth tracking.
- Structural loop depth and recursive call tree verification.

---

## 🤖 Local LLM AI Integration (`ai_assistant.py`)

Communicates with local Vulkan-accelerated `llama-server`:
- Target Model: `Qwen2.5-Coder-14B-Instruct-Q4_K_M`
- Actions: `explain`, `refactor`, `unit_tests`, `suggest`.
- Parameters: `stream: false`, `top_p: 0.95`, `temperature: 0.2`, `max_tokens: 600`.

---

## 📡 gRPC Interface (`app/grpc_server.py`)

Serves gRPC protocol defined in [`proto/sandbox.proto`](../proto/sandbox.proto):
- `ExecuteCode`: Runs code in subprocess sandbox with execution duration & memory tracking.
- `StreamExecution`: Streams execution output chunks.
- `GetLanguages`: Returns polyglot execution descriptors.
- `AnalyzeCode`: Triggers AST + LLM AI code analysis.
- `SearchPackages`: Queries PyPI and npm package registries.
