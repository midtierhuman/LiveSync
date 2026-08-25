# 💻 LiveSync Cloud IDE Frontend (`livesync-ui`)

Modern, ultra-responsive, zero-vertical-waste browser-based IDE built with **Angular 22** featuring Zoneless Signals, CodeMirror 6, and xterm.js.

---

## 🚀 Key Architecture & Components

1. **CodeMirror 6 Collaborative Editor & Remote Caret RAF Batching (`PERF-15` / `PERF-16`)**:
   - Modern CodeMirror 6 editor with custom reactive extensions.
   - Dual-edge 50ms cursor move throttling and delta compression suppressing redundant socket packets when navigating without selection changes.
   - `requestAnimationFrame` (RAF) batching for concurrent remote collaborator carets, eliminating redundant synchronous decoration pipeline dispatches.
   - Dynamic Compartments dynamically toggling read-only states for locked/view-only files.
   - Remote presence `StateField` rendering real-time collaborator carets and translucent multi-line selection ranges.

2. **Persistent In-Memory Terminal Dock (`xterm.js`) & Memory-Bounded Buffer (`PERF-16`)**:
   - Zero-teardown terminal instances retaining PTY WebSocket connections, running processes, and a memory-bounded scrollback buffer (5,000 lines) preventing browser DOM memory leaks during long-running builds.
   - Multi-terminal tab manager with automatic `FitAddon` layout recalculation on drawer resizes.

3. **Streaming AI Pair Assistant Dock & Flexible Multi-Dock Layout (`FEAT-14` / `FEAT-15` / `BUG-14`)**:
   - Connected directly to Go Gateway's `/api/ai/stream` (SSE).
   - Features an agent-agnostic provider switcher (Google Antigravity [Default], OpenAI Codex, Anthropic Claude, Local LLM) with local credential management and whole-project multi-file context injection toggle (`📁 Whole-Project Context ON`).
   - **Flexible Multi-Dock Placement (`FEAT-15`)**: Switch dock positions dynamically to **Right Sidebar** (secondary side-by-side dock), **Left Sidebar** (under explorer), or **Bottom Drawer** (alongside terminal tabs) with persistent `localStorage` preference memory and smooth horizontal col-resizer.
   - Resilient workspace-level reactive dispatch: operates seamlessly across whole-project scope whether file tabs are actively open or empty.
   - Renders live token-by-token Cursor-style synthesis typing animations with syntax-highlighted code blocks, Big-O complexity badges, and 1-click "Apply to Editor" actions.

4. **VS Code Command Palette & Quick Open Fuzzy Finder (`FEAT-16`)**:
   - `Ctrl+Shift+P` / `Cmd+Shift+P` (or typing `>`): Spotlight modal executing 25+ IDE actions (Toggle Terminal, Dock Assistant Right/Left/Bottom, Format Code, Package Hub, Timeline, File creation).
   - `Ctrl+P` / `Cmd+P`: Instant fuzzy file finder with keyboard up/down arrows and Enter to switch active editor tabs.

5. **Unified 48px Activity Bar & Sidebar Dock**:
   - Consolidates Explorer, Search & Replace (`Ctrl+Shift+F`), Package Hub (live NPM/PyPI search), Run & Debug, AI Assistant, and Collaborators into a single sidebar without floating modal clutter.

6. **Interactive Tab Reordering & File Explorer Drag-and-Drop (`FEAT-17`)**:
   - HTML5 drag-and-drop tab bar reordering with real-time insertion indicator and active tab selection stability.
   - Explorer tree drag-and-drop file/folder moves updating VFS state, parent folder relationships, and broadcasting `WorkspaceChange` to active collaborator rooms.

7. **Side-by-Side Markdown Live Rendered Preview & Sub-Toolbar (`FEAT-18`)**:
   - Integrated editor sub-toolbar displaying breadcrumb path navigation (`project > folder > file`) and language mode tags.
   - Dedicated side-by-side split Markdown live preview for `.md` files rendering real-time formatted GFM HTML (code blocks, syntax highlighting, quotes, lists, links) alongside the CodeMirror 6 text editor.

8. **Status Bar Quick-Action Controls & Go-To-Line Modal (`FEAT-19`)**:
   - `Ctrl+G` / `Cmd+G` (or clicking cursor position): Go-To-Line spotlight modal navigating directly to `line:column` across arbitrary document sizes.
   - Interactive syntax mode picker switching CodeMirror 6 language compartments on the fly across streamlined Python and Node.js/JavaScript/TypeScript modes (with web companion support for Markdown, JSON, HTML, CSS).
   - Real-time line, character metrics, and indentation mode toggling (`Spaces: 2` / `Spaces: 4`).

9. **Code Folding Gutter & Interactive Breadcrumb Navigation (`FEAT-20`)**:
   - CodeMirror 6 `foldGutter()` with hover chevrons and block collapse/expansion across all language scopes.
   - Interactive breadcrumb navigation trail displaying canonical relative file paths with 1-click clipboard copying and active language badge.

10. **Polyglot System Resilience & Comprehensive Error Boundary (`RES-01` - `RES-05`)**:
    - **Live Terminal Disconnect Overlay (`RES-01`)**: Visual failure card with auto-reconnection exponential backoff timer and 1-click manual reconnect action.
    - **AI Assistant Stream Error Boundary (`RES-02`)**: Inline error diagnostic cards inside chat streams with explicit failure details, retry triggers, and provider configuration shortcuts.
    - **Realtime Socket Recovery Banner (`RES-03`)**: Non-blocking top reconnection banner and status bar indicators with automated state recovery upon Socket.IO reconnection.
    - **Universal Toast Notifications (`RES-04`)**: Centralized HTTP interceptor catching 401, 403, 429, 500/503, and network dropouts with auto-dismissing deduplicated floating toasts.
    - **Microservice Health Telemetry Matrix (`RES-05`)**: Live system status modal accessible from Command Palette and status bar actively probing Core API (:5038), Gateway (:8081), Realtime (:5000), and AI (:50051) with round-trip latency metrics.

11. **Stale Folder ID Session Pruning & Safe VFS In-Memory Resolution (`BUG-15`)**:
    - Validates and filters `expandedFolderIds` against active known folders before issuing HTTP requests, instantly pruning stale or deleted folder UUIDs from `sessionStorage`.
    - In-memory `FolderService` caching with negative-cache guards suppressing redundant 404 network errors for orphaned or unassigned project folders.

12. **Recursive Virtual Filesystem (VFS) & Canonical Relative Path Disk Sync (`BUG-13` / `BUG-16`)**:
    - Comprehensive VFS path resolution recursively flattening folder hierarchies across arbitrary depths into `folderById` lookup maps.
    - Computes canonical POSIX relative paths (`docIdToPath`, `pathToDocId`) for subfolder documents, supporting nested module import resolution (e.g. `require('./test/test')`).
    - Decoupled project execution disk synchronization capturing unpersisted editor buffers across all open tabs while transmitting granular `lockedFiles` arrays to enforce OS read-only protections (`0444`) on restricted files.

13. **Native FastAPI & Node.js WebAPI Execution (`FEAT-21`)**:
    - Dedicated out-of-the-box Launch Configurations for Python FastAPI (`uvicorn main:app --reload --port 8000`, `fastapi dev main.py`) and Node.js Web APIs (`node server.js`, `npm run dev`, `npx ts-node server.ts`).
    - One-click Dashboard Quick Starters generating full-featured FastAPI REST services with Swagger docs and Node.js WebAPI servers with CORS support.
    - Streamlined language ecosystem focusing purely on Python and Node.js/JavaScript/TypeScript.

---

## ⌨️ Global IDE Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Open VS Code Command Palette (Actions / Commands) |
| `Ctrl+P` / `Cmd+P` | Quick Open fuzzy file switcher |
| `Ctrl+G` / `Cmd+G` | Go to Line / Column Modal |
| `Ctrl+Alt+A` | Toggle LiveSync AI Pair Assistant Dock |
| `Ctrl+Shift+F` | Workspace-Wide Multi-File Search & Replace |
| `Ctrl+\`` | Toggle Live Terminal Bottom Dock |
| `Ctrl+B` | Toggle Sidebar Activity Dock |
| `Ctrl+S` | Save active document draft |
| `Escape` | Dismiss modal / inline create inputs |

---

## 🛠️ Local Development & Testing

```bash
# Install dependencies
npm install

# Run unit test suite (Karma + Chrome headless)
npm test -- --watch=false

# Build production bundle
npm run build

# Run development dev server (Port 4200)
npm start
```
