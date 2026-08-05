# LiveSync Testing Architecture & Guide

This document defines the testing strategy, pattern, and command guide for the **LiveSync** monorepo.

---

## 🏗️ Testing Architecture Pattern (Hybrid Strategy)

LiveSync follows a **Hybrid Testing Pattern** to ensure fast developer feedback while maintaining full end-to-end integration coverage across services:

```text
LiveSync/
├── livesync-ui/                             ───▶ Unit & Component Tests (Co-located)
│   ├── src/app/app.spec.ts
│   ├── src/app/features/editor/editor.spec.ts
│   ├── src/app/services/package-manager.service.spec.ts
│   └── src/app/services/execution-stream.service.spec.ts
│
├── livesync-sandbox/                        ───▶ Service Unit & API Tests (Co-located)
│   └── tests/
│       ├── test_package_manager.py
│       ├── test_streaming_execution.py
│       └── test_number_guessing_execution.py
│
└── test-runner/                             ───▶ Top-Level E2E & Cross-Service Integration Suite
    ├── README.md
    └── run_tests.py
```

---

## 🧪 Test Suites & Execution Commands

### 1. Frontend Unit & Component Tests (`livesync-ui`)

* **Scope**: Isolated Angular component templates, reactive signals, services, HTTP interceptors, and accessibility semantics.
* **Framework**: Angular Testing Utilities, Jasmine, Karma.
* **Execution**:
  ```bash
  cd livesync-ui
  npm test -- --watch=false
  ```

### 2. Backend Sandbox Unit & API Tests (`livesync-sandbox`)

* **Scope**: FastAPI endpoint routing, Bearer token authorization, npm/pip package spec sanitization, AST complexity analysis, and execution safety checks.
* **Framework**: Pytest, FastAPI TestClient, AsyncIO.
* **Execution**:
  ```bash
  cd livesync-sandbox
  py -m pytest
  ```

### 3. End-to-End & Live Integration Suite (`test-runner`)

* **Scope**: End-to-end WebSocket stream execution, multi-turn `stdin` interactive inputs (e.g., number guessing game), unbuffered terminal `stdout`/`stderr` streaming, and live endpoint verification.
* **Script**: `test-runner/run_tests.py`
* **Execution**:
  * **In-process / Standalone**:
    ```bash
    py test-runner/run_tests.py
    ```
  * **Live Endpoint Mode** (when `livesync-sandbox` is running):
    The runner automatically detects the running HTTP (`http://localhost:8080`) and WebSocket (`ws://localhost:8080/api/execution/stream`) endpoints.

---

## 🎯 Summary Guidelines for Adding New Tests

1. **Adding UI component/service logic**? Add a `.spec.ts` file right next to the target file in `livesync-ui/src/app/`.
2. **Adding backend routes or services**? Add a `test_<name>.py` file in `livesync-sandbox/tests/`.
3. **Adding cross-service user workflows or E2E integration scenarios**? Add the scenario to `test-runner/run_tests.py`.
