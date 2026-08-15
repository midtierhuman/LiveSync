# LiveSync Project Roadmap & Issue Tracker

> **Last Updated**: 2026-08-15
> **Status**: 🟢 All Active Features & Critical Optimizations Completed

---

## 📌 Master Issue & Feature Backlog Tracker

| ID | Category | Summary | Service Scope | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PERF-01** | ⚡ Optimization | O(N²) Line Diff in Time-Travel Timeline Scrubber | `livesync-ui` | Medium | 🚫 Deprecated & Removed |
| **PERF-02** | ⚡ Optimization | Data Loss Prevention on Tab Close / Debounced Save Unmount | `livesync-ui` | High | ✅ Done |
| **FEAT-01** | 🚀 Feature | True Workspace Terminal & Background Process Mode | `livesync-ui`, `livesync-gateway` | Low | ✅ Done |
| **FEAT-02** | 🚀 Feature | Smart Project Entrypoints & Auto-Dependency Resolver | `livesync-ui`, `livesync-gateway` | High | ✅ Done |
| **FEAT-03** | 🚀 Feature | VS Code-Style Inline File/Folder Creation with Deep Path Parsing | `livesync-ui` | High | ✅ Done |
| **FEAT-04** | 🚀 Feature | Bi-Directional `fsnotify` Terminal Disk Watcher & Real-time Tree Sync | `livesync-gateway`, `livesync-ui` | High | ✅ Done |
| **FEAT-05** | 🚀 Feature | Path-Aware Virtual Filesystem (VFS) Indexer | `livesync-ui`, `livesync-ai` | Medium | ✅ Done |
| **FEAT-06** | 🚀 Feature | Directory Drag-and-Drop Upload & Project ZIP Export | `livesync-ui`, `livesync-api` | Medium | ✅ Done |

---

## 🗺️ Completed Milestones

### **Milestone 1: Code Execution Profiling, Complexity Analysis & Observability** (COMPLETED ✅)
- [x] Sandbox Resource Measurement (`executionDurationMs`, `peakMemoryBytes`, `cpuTimeMs`)
- [x] Static AST Big-O Complexity Analyzer ($\mathcal{O}(\text{Time})$ & $\mathcal{O}(\text{Space})$)
- [x] Prometheus `/metrics` endpoint & Grafana configurations
- [x] REST API DTO proxying & Angular Frontend UI Diagnostics Bar

---

### **Milestone 2: Interactive Real-Time WebSockets REPL / `stdin` Streaming** (COMPLETED ✅)
- [x] WebSocket Streaming Endpoint (`/api/execution/stream`)
- [x] Bi-directional stdin/stdout/stderr streaming
- [x] Nginx WebSocket Upgrade configuration
- [x] Angular Frontend Interactive Terminal UI

---

### **Milestone 3: Follow Mode & Inline Threaded Code Comments** (COMPLETED ✅)
- [x] Real-Time Follow Mode (Spectator View with auto-scroll)
- [x] Spectator Mode Banner & Collaborator Avatars
- [x] Inline Threaded Code Comments Engine & Drawer

---

### **Milestone 4: Cloud IDE Modernization & Workspace Tooling** (COMPLETED ✅)
- [x] Streamlined IDE toolbar (removed legacy interview-style keystroke scrubber)
- [x] Interactive Multi-Tab Workspace Architecture & PTY Live Terminal
- [x] Package Manager (`pip` / `npm`) & Auto-Syncing Workspace Engine

---

### **Milestone 5: AI-Powered Code Assistant & Suggestions** (COMPLETED ✅)
- [x] AST-driven code explanation, refactoring, unit test generation, and completion suggestions (`livesync-ai`).
- [x] gRPC `AnalyzeCode` client proxy in `livesync-gateway`.
- [x] Angular AI Assistant Sidebar with one-click "Apply to Editor".

---

### **Milestone 6: Multi-File Project IDE & Unified Share/Action Modal Architecture** (COMPLETED ✅)
- [x] Universal sharing modal supporting both Documents and Folders/Projects.
- [x] Enforced "Every file belongs to a folder/project" workspace containment rule.
- [x] Angular Project Explorer Tree with multi-tab file switching.

---

### **Milestone 7: Project Hub & Multi-Root Workspace Navigation Architecture** (COMPLETED ✅)
- [x] Dedicated Project Browser Hub (`/dashboard`).
- [x] IDE Workspace Routing & Complete File/Folder Edit Suite (`/workspace/:projectName`).
- [x] Strict Project-Scoped Creation & Renaming suite.

---

### **Milestone 8: True Interactive Workspace Terminal (`xterm.js` + Native PTY Session)** (COMPLETED ✅)
- [x] Cross-platform native PTY shells (Windows ConPTY + Unix PTY).
- [x] Anchored interactive terminal processes to `./workspaces/{projectId}`.
- [x] Full `xterm.js` Terminal Canvas Integration with `Ctrl+\`` shortcut.

---

### **Milestone 9: Granular RBAC Locked Files Protection** (COMPLETED ✅)
- [x] Frontend CodeMirror Live Read-Only Enforcement via dynamic Compartments.
- [x] Gateway OS-Level File Permissions on Locked Files (`chmod 0444`).

---

### **Milestone 10: VS Code-Style Activity Bar, VFS & Terminal Disk Sync** (COMPLETED ✅)
- [x] **48px Activity Bar & Sidebar Dock**: Unified icon rail toggling Explorer, Package Hub, AI Pair Assistant, and Comments.
- [x] **Zero Vertical Waste Editor**: Code lines connect directly to tab bar without duplicate headers.
- [x] **VS Code Inline Path Creation**: Direct inline `<input>` supporting nested paths (`src/utils/math.ts`) and instant `Escape` dismissal.
- [x] **Bi-Directional `fsnotify` Watcher**: Terminal commands (`mkdir`, `touch`, `git clone`, `npm create vite`) automatically push `fs_change` events over WebSocket to sync the UI tree.
- [x] **Virtual Filesystem (VFS) Indexer**: High-speed mapping between virtual paths (`/src/index.ts`) and document UUIDs with relative import resolution.
- [x] **Bulk Directory Drop & ZIP Export**: 1-click project ZIP downloads and desktop folder drag-and-drop ingestion.
- [x] **Global IDE Keyboard Shortcuts**: `Escape` (dismiss), `Ctrl+S` (save), `Ctrl+B` (sidebar), `Ctrl+\`` (terminal).
