# 🤖 LiveSync AI Intelligence & AST Analysis Service (`livesync-ai`)

A modern, high-performance AI code intelligence and static AST analysis microservice built with **Python 3.14** operating over pure native **gRPC on port `50051`**.

---

## 🚀 Key Features

- **Hybrid AI Assistant (`ai_assistant.py`)**: Multi-tier local LLM (`llama-server`, Ollama) and Google Gemini integration with zero-cost offline AST fallback for:
  - 💡 **Code Explanations**: Algorithmic overview, core concepts, and line-by-line breakdown.
  - ⚡ **Refactoring**: Clean code improvements, modern patterns, and performance optimizations.
  - 🛠️ **Unit Test Generation**: Automatic `pytest` and `jest` test skeletons with edge-case validation.
  - ✨ **Code Suggestions**: Predictive completion and bug fix snippets.
- **AST Big-O Complexity Analyzer (`complexity_analyzer.py`)**: Automated AST code inspection calculating algorithmic Time ($\mathcal{O}(1)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$) and Space complexity.
- **Pure Native gRPC**: Thread-safe, high-throughput gRPC RPC server running on port `50051`.

---

## 📡 gRPC Interface (Port 50051)

Defined in [`proto/sandbox.proto`](../proto/sandbox.proto):
- `AnalyzeCode` - AST and LLM AI code analysis (Explain, Refactor, Unit Tests, Suggest, Complexity).
- `GetLanguages` - Returns supported runtime descriptors.
- `ExecuteCode` - Isolated headless execution helper.

---

## 🛠️ Local Development

1. Setup virtual environment & dependencies:
   ```powershell
   cd livesync-ai
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
