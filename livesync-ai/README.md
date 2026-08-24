# 🤖 LiveSync AI Intelligence & Streaming Worker (`livesync-ai`)

High-performance AI code intelligence and static AST complexity analysis microservice built with **Python 3.14** operating exclusively over native **gRPC on port `50051`**.

---

## 🚀 Key Architecture & Capabilities

1. **Continuous gRPC Server-Side Token Streaming (`StreamAnalyzeCode`)**:
   - Streams live token deltas (`AiAnalysisChunk`) directly to the Go Gateway over HTTP/2 gRPC.
   - Powers real-time, Cursor-style typing animations in the Angular IDE Assistant dock without multi-second blank delays.

2. **Multi-Tenant BYO-Key & Whole-Project Context Injection (`FEAT-14`)**:
   - Accepts per-user Google Antigravity / Gemini credentials (`user_api_key`), isolating quota enforcement to individual accounts.
   - Accepts snapshots of all workspace files (`project_files`), formatting complete multi-file repository contexts into system prompts with cross-file symbol and dependency awareness.

3. **Multi-Model Hybrid Inference Chain**:
   - **Google Antigravity / Gemini API (`streamGenerateContent`)**: Real-time SSE token generation with automatic model fallback (`gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.1-flash-lite`).
   - **Local OpenAI-Compatible Server (`llama.cpp` / `Ollama` / `LM Studio`)**: Direct SSE chunked generation with `stream: true`.
   - **AST Big-O Complexity Engine (`complexity_analyzer.py`)**: Sub-millisecond static AST parser calculating algorithmic Time ($\mathcal{O}(1)$, $\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$) and Space complexity.
   - **Zero-Cost Offline AST Fallback**: Automated structural analysis, PEP 8 / ES6 refactoring, and unit test generation fixtures when offline.

4. **Air-Gapped Polyglot Mesh**:
   - Pure gRPC server with zero public web routes; accessible only by internal mesh services (`livesync-gateway`, `livesync-api`).

---

## 📡 gRPC Interface (Port `50051`)

Defined in [`proto/ai.proto`](../proto/ai.proto):

```protobuf
service AIService {
  rpc GetLanguages (Empty) returns (LanguagesResponse);
  rpc AnalyzeCode (AiAnalysisRequest) returns (AiAnalysisResponse);
  rpc StreamAnalyzeCode (AiAnalysisRequest) returns (stream AiAnalysisChunk);
}
```

---

## 🛠️ Local Development & Testing

```bash
# Activate virtual environment
source .venv/bin/activate  # Linux/macOS
# .\venv\Scripts\Activate.ps1  # Windows

# Install dependencies
pip install -r requirements.txt

# Run test suite
.venv/bin/python -m pytest

# Run native gRPC server
.venv/bin/python -m app.main
```
