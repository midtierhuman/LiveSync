# 💻 LiveSync Cloud IDE Frontend (`livesync-ui`)

Modern, ultra-responsive, zero-vertical-waste browser-based IDE built with **Angular 22** featuring Zoneless Signals, CodeMirror 6, and xterm.js.

---

## 🚀 Key Architecture & Components

1. **CodeMirror 6 Collaborative Editor**:
   - Modern CodeMirror 6 editor with custom reactive extensions.
   - Dynamic Compartments dynamically toggling read-only states for locked/view-only files.
   - Remote presence `StateField` rendering real-time collaborator carets and translucent multi-line selection ranges.

2. **Persistent In-Memory Terminal Dock (`xterm.js`)**:
   - Zero-teardown terminal instances retaining PTY WebSocket connections, scrollback history, and running processes across panel toggles.
   - Multi-terminal tab manager with automatic `FitAddon` layout recalculation on drawer resizes.

3. **Streaming AI Pair Assistant Dock & Agent Provider Selector (`FEAT-14`)**:
   - Connected directly to Go Gateway's `/api/ai/stream` (SSE).
   - Features an agent-agnostic provider switcher (Google Antigravity [Default], OpenAI Codex, Anthropic Claude, Local LLM) with local credential management and whole-project multi-file context injection toggle (`📁 Whole-Project Context ON`).
   - Renders live token-by-token Cursor-style synthesis typing animations with syntax-highlighted code blocks, Big-O complexity badges, and 1-click "Apply to Editor" actions.

4. **Unified 48px Activity Bar & Sidebar Dock**:
   - Consolidates Explorer, Search & Replace (`Ctrl+Shift+F`), Package Hub (live NPM/PyPI search), Run & Debug, AI Assistant, and Collaborators into a single sidebar without floating modal clutter.

5. **Recursive Virtual Filesystem (VFS) & Canonical Relative Path Disk Sync (`BUG-13`)**:
   - Comprehensive VFS path resolution recursively flattening folder hierarchies across arbitrary depths into `folderById` lookup maps.
   - Computes canonical POSIX relative paths (`docIdToPath`, `pathToDocId`) for subfolder documents, supporting nested module import resolution (e.g. `require('./test/test')`).
   - Real-time disk synchronization capturing unpersisted editor buffers across all open tabs and debounced keystroke edits prior to terminal and compilation execution.

---

## ⌨️ Global IDE Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+P` / `Cmd+P` | Quick Open fuzzy file switcher |
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
