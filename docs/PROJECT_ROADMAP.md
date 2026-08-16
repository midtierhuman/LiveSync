# LiveSync Project Roadmap & Issue Tracker

> **Last Updated**: 2026-08-16
> **Status**: 🟢 Milestone 12 Completed & Closed (6/6 Tasks)

---

## 🎯 Active Milestone

### **Milestone 13: Real-Time Collaboration, Environment Launchers & Workflow Enhancements** (ACTIVE 🔄)
- [x] **FEAT-14: VS Code-Style Explorer Context Menu & "Open in Integrated Terminal"** (`livesync-ui`, `livesync-gateway`)
  - Complete VS Code-style context menu on folders & files with instant terminal opening anchored to subdirectories (`/api/terminal/ws?subDir=...`), tab auto-naming (`term: <folder>`), "Find in Folder" include filter linking, and clipboard relative path copying.
- [x] **FEAT-15: Run & Debug Environment Profiles & Launch Configuration Hub** (`livesync-ui`, `livesync-gateway`)
  - Dedicated Run & Debug panel with preset runtime environments (Node.js, Python, Go, custom launch profiles), environment variable manager, header execution launcher (`▶ Run`), and execution monitor.
- [ ] **FEAT-16: Dynamic Collaborator Access List & Real-Time Permission Synchronization** (`livesync-ui`, `livesync-realtime`, `livesync-api`)
  - Live shared collaborator management list with on-the-fly role toggling (Viewer/Editor) and real-time Socket.IO permission push that instantly locks/unlocks collaborator editors.
- [ ] **PERF-04: Multi-User Remote Selection Range Highlighting & CRDT Delta Sync** (`livesync-ui`, `livesync-realtime`)
  - Visual collaborator selection ranges in CodeMirror 6 with optimized CRDT byte-level delta replication.

---

## 🗺️ Completed Milestones

### **Milestone 12: Advanced Workspace Search, Diagnostics & High-Performance Architecture** (COMPLETED ✅)
- [x] **BUG-05: Collaborative Full Document Deletion Sync (`Ctrl+A` + `Backspace` / Empty Content Sync)** (`livesync-ui`, `livesync-realtime`)
  - Fixed falsy truthy check (`if (newContent)`) in `Editor` and wrapped `contentUpdate` signal in `RealtimeService` as `DocumentContentUpdate` object reference with timestamp so clearing whole documents (`""`) reliably triggers CodeMirror updates for all collaborators.
- [x] **ARCH-01: Persistent In-Memory Terminal Dock & Zero-Teardown PTY Session** (`livesync-ui`)
  - Retain `xterm.js` instance, DOM attachment, and WebSocket stream in memory across panel toggles, ensuring running processes (`npm run dev`, `python -i`), scrollback history, and shell state are 100% preserved with zero re-render delay.
- [x] **ARCH-02: Dedicated REST / gRPC Workspace Atomic Sync Engine & Self-Change Suppression** (`livesync-gateway`, `livesync-ui`)
  - Dedicated `/api/workspaces/:id/sync` atomic disk mirroring with transient hash-based `fsnotify` self-change suppression to decouple filesystem synchronization from raw terminal keystroke WebSocket streams.
- [x] **FEAT-08: Workspace-Wide Multi-File Search & Replace (`Ctrl+Shift+F`)** (`livesync-ui`, `livesync-gateway`)
  - Integrated high-speed disk search and atomic replace endpoints in Go Gateway (`GET /api/workspaces/:id/search`, `POST /api/workspaces/:id/replace`) and dedicated VS Code-style Search & Replace panel in Angular UI with case/whole-word/regex modifiers, file include/exclude patterns, interactive match previews, single/batch replace, and instant match jump navigation.
- [x] **FEAT-09: Code Diagnostics & Linter / Problems Panel Integration** (DEPRECATED / DROPPED ❌)
  - Marked obsolete/dropped: Native terminal PTY already runs developer linters & compilers (`npm test`, `pytest`, `tsc`), CodeMirror handles in-editor syntax diagnostics, and AST Big-O analysis lives in dedicated profiler headers, avoiding bottom dock clutter.
- [x] **FEAT-12: Multi-Terminal Tabs & Resilient `FitAddon` Layout Resize Handling** (`livesync-ui`, `livesync-gateway`)
  - Multi-terminal tab manager in `LiveTerminalService` and bottom dock with concurrent PTY allocation (`/api/terminal/ws?sessionId=...`), persistent in-memory session containers, tab switcher, add/kill tab controls, and debounced `FitAddon` resize observer.

---

### **Milestone 11: Production-Grade Cloud IDE Hardening & Architecture Cleanliness** (COMPLETED ✅)
- [x] **FEAT-13: Clean Terminal Prompt & Streamlined Slug Routing** (`livesync-ui`, `livesync-gateway`)
  - Replaced raw storage UUIDs with friendly project paths in PTY PS1 prompts and welcome banners (`Workspace: ~/projectName`).
  - Eliminated redundant `?id=` query parameters in favor of clean project slug routes (`/workspace/:projectName`).
- [x] **BUG-01: Global Terminal Service Synchronization** (`livesync-ui`)
  - Refactored `LiveTerminalService` and `PackageManagerService` to shared root singletons so terminal `fs_change` events reliably propagate to the workspace file tree across all open tabs.
- [x] **BUG-02: Single Source of Truth for IDE Tooling** (`livesync-ui`)
  - Removed duplicated floating sidebars and package modal overlay in `editor.html`, consolidating AI Assistant, Package Hub, and Code Comments entirely into the unified workspace activity bar dock.
- [x] **BUG-03: Real-Time Project/Workspace Tree Event Propagation** (`livesync-realtime`, `livesync-api`, `livesync-ui`)
  - Introduced project/folder-scoped Socket.IO rooms (`JoinWorkspace`, `LeaveWorkspace`, `WorkspaceChange`) so file/folder renames, creations, deletions, and moves instantly broadcast to all active collaborators' tree views and open tab titles.
- [x] **BUG-04: AI Assistant 502 Bad Gateway Timeout & Token Truncation Fix** (`livesync-ai`, `livesync-gateway`)
  - Extended gateway and Python AI timeouts (45s/30s), increased generation token limits (4096), refined system prompts for pinpoint, concise code solutions without conversational fluff, and hardened Gemini/Local fallback chain.
- [x] **FEAT-14: AI Chat UI Polish** (`livesync-ui`)
  - Added sleek shimmer/pulse loading bar during AI synthesis, moved quick prompt starter cards to empty state, and added a clean popover action menu to eliminate top clutter.
- [x] **FEAT-15: Direct Package Hub Connectivity & Live Public Registry Search** (`livesync-ui`, `livesync-gateway`)
  - Fixed endpoint mismatches between UI and Go Gateway, integrated direct live queries to official NPM (`registry.npmjs.org`) and PyPI (`pypi.org`) registries without static mock blocking.
- [x] **FEAT-07: Command Palette & Quick Open (`Ctrl+P` / `Cmd+P`)** (`livesync-ui`)
  - Implemented instant fuzzy file switcher overlay modal with keyboard navigation (Arrow keys, Enter, Escape) for rapid file switching.
- [x] **FEAT-10 & FEAT-11: IDE Document Save Controls & Telemetry** (`livesync-ui`)
  - Verified instant `Ctrl+S` save trigger, draft state management, and silent real-time workspace tree synchronization.
- [x] **PERF-03: Component Decomposition** (`livesync-ui`)
  - Marked obsolete / completed through modular service extraction (`LiveTerminalService`, `VFSService`, `PackageManagerService`, `RealtimeService`).

---

### **Milestone 10: VS Code-Style Activity Bar, VFS & Terminal Disk Sync** (COMPLETED ✅)
- [x] **48px Activity Bar & Sidebar Dock**: Unified icon rail toggling Explorer, Package Hub, AI Pair Assistant, and Comments.
- [x] **Zero Vertical Waste Editor**: Code lines connect directly to tab bar without duplicate headers.
- [x] **VS Code Inline Path Creation**: Direct inline `<input>` supporting nested paths (`src/utils/math.ts`) and instant `Escape` dismissal.
- [x] **Bi-Directional `fsnotify` Watcher**: Terminal commands (`mkdir`, `touch`, `git clone`, `npm create vite`) automatically push `fs_change` events over WebSocket to sync the UI tree.
- [x] **Virtual Filesystem (VFS) Indexer**: High-speed mapping between virtual paths (`/src/index.ts`) and document UUIDs with relative import resolution.
- [x] **Bulk Directory Drop & ZIP Export**: 1-click project ZIP downloads and desktop folder drag-and-drop ingestion.
- [x] **Global IDE Keyboard Shortcuts**: `Escape` (dismiss), `Ctrl+S` (save), `Ctrl+B` (sidebar), `Ctrl+\`` (terminal), `Ctrl+P` (quick open).

---

### **Milestone 9: Granular RBAC Locked Files Protection** (COMPLETED ✅)
- [x] Frontend CodeMirror Live Read-Only Enforcement via dynamic Compartments.
- [x] Gateway OS-Level File Permissions on Locked Files (`chmod 0444`).

---

### **Milestone 8: True Interactive Workspace Terminal (`xterm.js` + Native PTY Session)** (COMPLETED ✅)
- [x] Cross-platform native PTY shells (Windows ConPTY + Unix PTY).
- [x] Anchored interactive terminal processes to `./workspaces/{projectId}`.
- [x] Full `xterm.js` Terminal Canvas Integration with `Ctrl+\`` shortcut.

---

### **Milestone 7: Project Hub & Multi-Root Workspace Navigation Architecture** (COMPLETED ✅)
- [x] Dedicated Project Browser Hub (`/dashboard`).
- [x] IDE Workspace Routing & Complete File/Folder Edit Suite (`/workspace/:projectName`).
- [x] Strict Project-Scoped Creation & Renaming suite.

---

### **Milestone 6: Multi-File Project IDE & Unified Share/Action Modal Architecture** (COMPLETED ✅)
- [x] Universal sharing modal supporting both Documents and Folders/Projects.
- [x] Enforced "Every file belongs to a folder/project" workspace containment rule.
- [x] Angular Project Explorer Tree with multi-tab file switching.

---

### **Milestone 5: AI-Powered Code Assistant & Suggestions** (COMPLETED ✅)
- [x] AST-driven code explanation, refactoring, unit test generation, and completion suggestions (`livesync-ai`).
- [x] gRPC `AnalyzeCode` client proxy in `livesync-gateway`.
- [x] Angular AI Assistant Sidebar with one-click "Apply to Editor".

---

### **Milestone 4: Cloud IDE Modernization & Workspace Tooling** (COMPLETED ✅)
- [x] Streamlined IDE toolbar (removed legacy interview-style keystroke scrubber)
- [x] Interactive Multi-Tab Workspace Architecture & PTY Live Terminal
- [x] Package Manager (`pip` / `npm`) & Auto-Syncing Workspace Engine

---

### **Milestone 3: Follow Mode & Inline Threaded Code Comments** (COMPLETED ✅)
- [x] Real-Time Follow Mode (Spectator View with auto-scroll)
- [x] Spectator Mode Banner & Collaborator Avatars
- [x] Inline Threaded Code Comments Engine & Drawer

---

### **Milestone 2: Interactive Real-Time WebSockets REPL / `stdin` Streaming** (COMPLETED ✅)
- [x] WebSocket Streaming Endpoint (`/api/execution/stream`)
- [x] Bi-directional stdin/stdout/stderr streaming
- [x] Nginx WebSocket Upgrade configuration
- [x] Angular Frontend Interactive Terminal UI

---

### **Milestone 1: Code Execution Profiling, Complexity Analysis & Observability** (COMPLETED ✅)
- [x] Sandbox Resource Measurement (`executionDurationMs`, `peakMemoryBytes`, `cpuTimeMs`)
- [x] Static AST Big-O Complexity Analyzer ($\mathcal{O}(\text{Time})$ & $\mathcal{O}(\text{Space})$)
- [x] Prometheus `/metrics` endpoint & Grafana configurations
- [x] REST API DTO proxying & Angular Frontend UI Diagnostics Bar
