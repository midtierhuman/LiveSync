# LiveSync Project Roadmap & Issue Tracker

> **Last Updated**: 2026-08-15
> **Status**: 🟢 All Active Features & Critical Optimizations Completed

---

## 📌 Master Issue & Feature Backlog Tracker

| ID | Category | Summary | Service Scope | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | 🐛 Bug | Terminal-to-Workspace File System Watcher Disconnect (Scoped Service Isolation) | `livesync-ui` | Critical | ✅ Done |
| **BUG-02** | 🐛 Bug | Duplicate "Split-Brain" Panels in Workspace & Editor (AI, Packages, Comments) | `livesync-ui` | High | ✅ Done |
| **BUG-03** | 🐛 Bug | Realtime Workspace Metadata Sync (File/Folder Renames, Creations, Moves & Deletions) | `livesync-realtime`, `livesync-api`, `livesync-ui` | Critical | ✅ Done |
| **BUG-04** | 🐛 Bug | AI Assistant 502 Bad Gateway Timeout, Token Truncation & Focused Pinpoint Prompting | `livesync-ai`, `livesync-gateway` | High | ✅ Done |
| **PERF-01** | ⚡ Optimization | O(N²) Line Diff in Time-Travel Timeline Scrubber | `livesync-ui` | Medium | 🚫 Deprecated & Removed |
| **PERF-02** | ⚡ Optimization | Data Loss Prevention on Tab Close / Debounced Save Unmount | `livesync-ui` | High | ✅ Done |
| **PERF-03** | ⚡ Optimization | Decomposition of 1700+ Line Monolithic God Components (`workspace.ts`, `editor.ts`) | `livesync-ui` | High | 📋 Backlog |
| **PERF-04** | ⚡ Optimization | Multi-User Remote Selection Range Highlighting & CRDT Delta Sync | `livesync-ui`, `livesync-realtime` | Medium | 📋 Backlog |
| **FEAT-01** | 🚀 Feature | True Workspace Terminal & Background Process Mode | `livesync-ui`, `livesync-gateway` | Low | ✅ Done |
| **FEAT-02** | 🚀 Feature | Smart Project Entrypoints & Auto-Dependency Resolver | `livesync-ui`, `livesync-gateway` | High | ✅ Done |
| **FEAT-03** | 🚀 Feature | VS Code-Style Inline File/Folder Creation with Deep Path Parsing | `livesync-ui` | High | ✅ Done |
| **FEAT-04** | 🚀 Feature | Bi-Directional `fsnotify` Terminal Disk Watcher & Real-time Tree Sync | `livesync-gateway`, `livesync-ui` | High | ✅ Done |
| **FEAT-05** | 🚀 Feature | Path-Aware Virtual Filesystem (VFS) Indexer | `livesync-ui`, `livesync-ai` | Medium | ✅ Done |
| **FEAT-06** | 🚀 Feature | Directory Drag-and-Drop Upload & Project ZIP Export | `livesync-ui`, `livesync-api` | Medium | ✅ Done |
| **FEAT-07** | 🚀 Feature | Quick File Switcher & Command Palette (`Ctrl+P` / `Ctrl+Shift+P`) | `livesync-ui` | High | 📋 Backlog |
| **FEAT-08** | 🚀 Feature | Workspace-Wide Multi-File Search & Replace (`Ctrl+Shift+F`) | `livesync-ui`, `livesync-gateway` | High | 📋 Backlog |
| **FEAT-09** | 🚀 Feature | Code Diagnostics & Linter / Problems Panel Integration | `livesync-ui`, `livesync-ai` | Medium | 📋 Backlog |
| **FEAT-10** | 🚀 Feature | Unified IDE Status Bar & Document Metrics (Line/Col, Spaces, Encoding, Sync) | `livesync-ui` | Medium | 📋 Backlog |
| **FEAT-11** | 🚀 Feature | Unsaved Changes Guard & Dirty State Machine for File Tabs | `livesync-ui` | High | 📋 Backlog |
| **FEAT-12** | 🚀 Feature | Multi-Terminal Tabs & Resilient `FitAddon` Layout Resize Handling | `livesync-ui`, `livesync-gateway` | Medium | 📋 Backlog |
| **FEAT-13** | 🎨 UI/UX | Workspace Presentation Polish: Clean Shell Prompt & Streamlined Slug Routing | `livesync-ui`, `livesync-gateway` | High | ✅ Done |
| **FEAT-14** | 🎨 UI/UX | AI Chat UI Polish: Shimmer Loading Bar, Decluttered Starter Prompts & Action Menu | `livesync-ui` | Medium | ✅ Done |

---

## 🎯 Active & Upcoming Milestones

### **Milestone 11: Production-Grade Cloud IDE Hardening & Architecture Cleanliness** (IN PLANNING 📋)
- [x] **FEAT-13: Clean Terminal Prompt & Streamlined Routing**: Replaced raw storage UUIDs with friendly project paths in PTY PS1 prompts and welcome banners (`Workspace: ~/projectName`); eliminated redundant `?id=` query parameters in favor of clean project slug routes.
- [x] **BUG-01: Global Terminal Service Synchronization**: Refactored `LiveTerminalService` and `PackageManagerService` to shared root singletons so terminal `fs_change` events reliably propagate to the workspace file tree across all open tabs.
- [x] **BUG-02: Single Source of Truth for IDE Tooling**: Removed duplicated floating sidebars and package modal overlay in `editor.html`, consolidating AI Assistant, Package Hub, and Code Comments entirely into the unified workspace activity bar dock.
- [x] **BUG-03: Real-Time Project/Workspace Tree Event Propagation**: Introduced project/folder-scoped Socket.IO rooms (`JoinWorkspace`, `LeaveWorkspace`, `WorkspaceChange`) so file/folder renames, creations, deletions, and moves instantly broadcast to all active collaborators' tree views and open tab titles.
- [x] **BUG-04: AI Assistant 502 Bad Gateway Timeout & Token Truncation Fix**: Extended gateway and python AI timeouts (45s/30s), increased generation token limits (4096), refined system prompts for pinpoint, concise code solutions without fluff, and hardened Gemini/Local fallback chain.
- [x] **FEAT-14: AI Chat UI Polish**: Added sleek shimmer/pulse loading bar during AI synthesis, moved quick prompt starter cards to empty state, and added a clean popover action menu to eliminate top clutter.
- [ ] **FEAT-07: Command Palette & Quick Open (`Ctrl+P`)**: Modal overlay with fuzzy search for rapid file navigation and IDE action dispatching without mouse navigation.
- [ ] **FEAT-10 & FEAT-11: IDE Status Bar & Unsaved Changes Guard**: Rich bottom telemetry bar (Line/Col, Spaces, Encoding, Language, Sync status) and dirty tracking with confirmation modal before closing modified files.
- [ ] **PERF-03: Component Decomposition**: Split `workspace.ts` and `editor.ts` into isolated components (`FileTreeComponent`, `StatusBarComponent`, `CommandPaletteComponent`, `TerminalPanelComponent`).

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
