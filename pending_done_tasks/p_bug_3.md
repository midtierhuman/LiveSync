# Bug Ticket: Local LLM API Integration & Server Unreachability in Sandbox

## Bug Summary
**Issue Identified:**
When calling the AI Assistant from the UI (`livesync-ui` -> `livesync-sandbox`), the local LLM integration fails and returns an offline error:
> `⚠️ Local LLM Error: Unable to reach local LLM server at http://127.0.0.1:8080. Cloud and CPU fallbacks are disabled.`

Even when `llama-server` is actively running and responding on `http://127.0.0.1:8080` (e.g. via direct chat interface), the Python FastAPI service fails to parse responses or negotiate payload options for modern `llama-server` Vulkan/CUDA builds.

---

## Detailed Description & Requirements

### Flawed Behavior
1. **API Communication Failure:** Python's `urllib.request` payload dispatch to `llama-server` `/v1/chat/completions` fails under specific Vulkan/multi-model configurations (`--models-dir`).
2. **Hidden Exceptions:** Network or payload serialization exceptions fall back to returning `None`, which triggers the static "Local LLM Error" offline message instead of detailed diagnostics or successful fallback.

---

## Technical Tasks to Implement

### Python Sandbox Service Fixes (`livesync-sandbox`)
- [ ] Inspect raw HTTP payload and response headers between Python `ai_assistant.py` and `llama-server` on Vulkan backends.
- [ ] Implement robust stream parsing (`stream: false`) and non-blocking socket timeouts.
- [ ] Expose real-time error logging to surfaced diagnostics rather than masking connection failures.
- [ ] Ensure seamless model selection fallback when `llama-server` is started in dynamic model directory mode (`--models-dir`).
