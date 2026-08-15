# LiveSync Pending Tasks & Issue Tracker

> Last Updated: 2026-08-11
> Status Legend: ⏳ **Pending** | 🔄 **In Progress** | ✅ **Done**

---

## Quick Navigation & Overview

| ID | Category | Summary | Service Scope | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PERF-01** | ⚡ Optimization | O(N²) Line Diff in Time-Travel Timeline Scrubber | `livesync-ui` | Medium | 🚫 Deprecated / Removed |
| **PERF-02** | ⚡ Optimization | Data Loss Prevention on Editor Tab Close / Debounced Save Unmount | `livesync-ui` | High | ✅ Done |
| **FEAT-01** | 🚀 Feature | True Workspace Terminal & Background Process Mode | `livesync-ui`, `livesync-gateway` | Low | ✅ Done |
| **FEAT-02** | 🚀 Feature | Smart Project Entrypoints & Auto-Dependency Resolver | `livesync-ui`, `livesync-gateway` | High | ✅ Done |
| **FEAT-03** | 🚀 Feature | VS Code-Style Inline File/Folder Creation with Deep Path Parsing | `livesync-ui` | High | 🔄 In Progress |
| **FEAT-04** | 🚀 Feature | Bi-Directional `fsnotify` Terminal Disk Watcher & Real-time Tree Sync | `livesync-gateway`, `livesync-api` | High | ⏳ Pending |
| **FEAT-05** | 🚀 Feature | Path-Aware Virtual Filesystem (VFS) Indexer | `livesync-ui`, `livesync-ai` | Medium | ⏳ Pending |
| **FEAT-06** | 🚀 Feature | Directory Drag-and-Drop Upload & Project ZIP Export | `livesync-ui`, `livesync-api` | Medium | ⏳ Pending |

---

## Detailed Task Breakdown

### ⚡ PERF-01: Time-Travel Timeline Scrubber (DEPRECATED & REMOVED 🚫)

#### Status
Removed in favor of full collaborative cloud IDE workflow with PTY terminal, package management, and undo/redo stacks.

---

### ⚡ PERF-02: Data Loss Prevention on Editor Tab Close / Unmount (COMPLETED ✅)

#### Implemented Fixes
- [x] **Flush on Destroy (`editor.ts`):** `onDestroy` immediately flushes any pending debounced edits to `documentService.updateContent()` before CodeMirror instance destruction.

---

### 🚀 FEAT-01: True Workspace Terminal & Background Process Execution (COMPLETED ✅)

#### Implemented Features
- [x] **Decoupled Panel Visibility from Process Lifetime (`editor.ts`):** Explicit `isTerminalOpen` signal for toggling UI panel visibility (`Ctrl+\``) without terminating the background PTY shell.
- [x] **Native Workspace Directory Anchoring (`livesync-gateway`):** Terminal process is anchored directly in `./workspaces/{projectId}` with bi-directional streaming via `xterm.js`.
- [x] **Shared Dependencies Pool:** Injected `PYTHONPATH` and `NODE_PATH` for instant access to common packages.

---

### 🚀 FEAT-02: Smart Project Entrypoints & Auto-Dependency Resolver (COMPLETED ✅)

#### Implemented Features
- [x] **Intelligent Entrypoint Detection:** Auto-detects root entrypoints (`main.py`, `app.py`, `server.py`, `index.js`, `package.json`).
- [x] **Right-Click ⭐ Set as Entrypoint:** Set and persist entrypoints in Project Explorer Tree.
- [x] **Dual Run Actions:** **▶ Run Project** vs **▷ Run File**.
- [x] **Automated Package Resolution:** Pre-execution check for `requirements.txt` (`pip install -r requirements.txt`) and `package.json` (`npm install`).
