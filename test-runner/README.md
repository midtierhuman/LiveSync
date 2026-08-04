# LiveSync Component Test Runner

This test project verifies the polyglot code execution sandbox components, focusing on stateful interactive terminal executions over WebSockets as well as non-interactive REST requests.

## How to Run

1. **Direct / In-Process Mode (Standalone)**:
   You can run the test runner directly without starting the server. It will automatically test the execution pipeline in-process:
   ```bash
   py test-runner/run_tests.py
   ```

2. **Live Endpoint Mode**:
   If the `livesync-sandbox` service is running (e.g., via Docker Compose or `py -m uvicorn app.main:app --port 8080` inside `livesync-sandbox`), running the script will automatically test against the live HTTP (`http://localhost:8080/api/execution/run`) and WebSocket (`ws://localhost:8080/api/execution/stream`) endpoints.

## Features Tested
- Multi-turn stateful `stdin` interactive input streaming
- Unbuffered `stdout` and `stderr` terminal stream rendering
- Unicode emoji encoding (`📉`, `📈`, `🎉`) on Windows terminals
- Complexity analysis and exit status payload verification
