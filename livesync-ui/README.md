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

7. **Recursive Virtual Filesystem (VFS) & Canonical Relative Path Disk Sync (`BUG-13`)**:
   - Comprehensive VFS path resolution recursively flattening folder hierarchies across arbitrary depths into `folderById` lookup maps.
   - Computes canonical POSIX relative paths (`docIdToPath`, `pathToDocId`) for subfolder documents, supporting nested module import resolution (e.g. `require('./test/test')`).
   - Real-time disk synchronization capturing unpersisted editor buffers across all open tabs and debounced keystroke edits prior to terminal and compilation execution.

---

## ⌨️ Global IDE Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Open VS Code Command Palette (Actions / Commands) |
| `Ctrl+P` / `Cmd+P` | Quick Open fuzzy file switcher |
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
