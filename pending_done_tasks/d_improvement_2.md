# Feature Ticket: Refactor Execution Terminal Architecture to Multiplexed PTY Streams

## Problem Context
The current `ExecutionStreamService` creates ephemeral, standalone WebSocket connections per code execution run. This introduces TCP/TLS handshake latency, lacks full terminal emulation (ANSI colors, interactive CLI prompts, Ctrl+C signals), and creates unnecessary connection churn.

---

## Requirements

### 1. Terminal Stream Multiplexing
- Refactor terminal stdio streaming so it routes over our primary persistent WebSocket session rather than opening standalone WebSockets.
- Assign a unique `sessionId` (or `terminalId`) per document/tab terminal instance.
- Use structured frame payloads for multiplexing:
  ```json
  {
    "channel": "terminal",
    "sessionId": "term-doc-123",
    "action": "input" | "resize" | "kill",
    "data": "python main.py\r"
  }
  ```

### 2. Pseudo-Terminal (PTY) Integration
- Integrate PTY process management on the execution backend to spawn interactive shells/sub-processes.
- On the frontend (`livesync-ui`), ensure `xterm.js` is wired to consume raw PTY output streams (supporting ANSI color codes, cursor manipulation, and terminal resizing events).

### 3. Session Buffering & Process Lifecycle
- Implement a circular output buffer on the backend so if a user switches tabs and returns, the terminal re-attaches and replays recent output without killing the running process.
- Maintain explicit teardown hooks: closing an editor tab or triggering terminal reset must send a `kill` signal frame to terminate the underlying OS PTY process cleanly.

---

## Implementation Roadmap & Tasks

### Tasks Pending to Implement

#### Feature:
- [x] Install and configure `@xterm/xterm` and `@xterm/addon-fit` in `livesync-ui`.
- [x] Add PTY process spawning (`pty.openpty()` / `termios` resize) in `livesync-sandbox`.
- [x] Implement multiplexed `terminalAction` framing & circular output session buffer for tab re-attachment.
- [x] Connect `xterm.js` to `ExecutionStreamService` for dynamic resizing, raw keyboard input, and ANSI color rendering.

#### Bugs:
- [x] Ensure clean OS PTY process tree termination when closing tabs or resetting terminal.
