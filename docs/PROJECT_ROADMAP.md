# LiveSync Project Roadmap & Issue Tracker

> **Last Updated**: 2026-08-16
> **Status**: 🟢 Milestone 14 Completed & Closed (6/6 Tasks)

---

## 🎯 Active Milestone

### **Milestone 15: Polyglot Codebase Hygiene, Dead Code Elimination & Architecture Streamlining** (ACTIVE 🔄)
- [x] **BUG-11: Integrated Terminal Root Working Directory Anchoring & Top Bar Run Control Consolidation** (`livesync-ui`, `livesync-gateway`)
  - Enforce explicit shell working directory initialization (`Set-Location` in Windows ConPTY and `cd` in Unix bash) anchored to `./workspaces/{projectId}`, ensure reactive VFS re-indexing matches scoped project root, synchronize workspace file snapshots before execution, and remove redundant top-bar execution buttons in favor of the unified Run & Debug sidebar dock.
- [x] **BUG-12: Standardized POSIX Bash Environment Variable Exports & Execution Launcher Hardening** (`livesync-ui`)
  - Standardize all run configuration and environment variable exports to POSIX-compliant Bash syntax (`export KEY="VALUE"; <cmd>`), eliminating PowerShell syntax leakage (`$env:`) in Linux containers and ensuring seamless execution across all shell environments.
- [ ] **BUG-07: Realtime Disconnection Ghost Cursors & Orphan Socket Cleanup** (`livesync-realtime`, `livesync-ui`)
  - Ensure clean collaborator teardown upon socket disconnect, tab closure, or navigation, preventing orphaned selection highlight ranges, stale collaborator counts, and ghost cursor states in Redis and UI.
- [ ] **ARCH-08: Full Polyglot Dead Code Pruning & Deprecated API Cleanup** (`livesync-gateway`, `livesync-api`, `livesync-realtime`, `livesync-ai`, `livesync-ui`)
  - Comprehensive static analysis and removal of unused struct fields, obsolete legacy endpoints, dead helper functions, unused npm/pip/go modules, orphaned component templates, and deprecated CSS rules across all 5 microservices.
- [ ] **BUG-09: Concurrent PTY Stream Race Condition & Terminal Buffer Leak Fix** (`livesync-gateway`, `livesync-ui`)
  - Memory-bounded scrollback buffer management, explicit PTY process kill signal propagation on WebSocket disconnect, and mutex-safe stdout/stderr I/O pumps to prevent dangling shell processes on the host.
- [ ] **PERF-07: High-Concurrency Virtual Scroll & Large Directory Tree Windowing** (`livesync-ui`)
  - DOM virtualization for large project file trees (1,000+ files) and high-throughput xterm.js backpressure control to prevent UI thread lockups during heavy logging output (e.g. `npm install`, `find /`).

---

## 🗺️ Future Milestones & Planned Work

### **Milestone 16: Enterprise Resilience, End-to-End Stress Testing & Chaos Engineering** (PLANNED 📋)
- [ ] **ARCH-09: Universal Error Boundary & Polyglot Microservice Health Telemetry** (`livesync-gateway`, `livesync-api`, `livesync-realtime`, `livesync-ai`, `livesync-ui`)
  - RFC 7807 compliant structured JSON error formats across all microservices, graceful UI error boundaries for crash recovery, and unified `/health/readiness` & `/health/liveness` probes.
- [ ] **TEST-01: Multi-User High-Concurrency Chaos & CRDT Fuzzing Suite** (`livesync-realtime`, `livesync-ui`)
  - Automated simulation of 50+ concurrent typing sessions, network jitter, simulated packet drops, and mathematical convergence validation.
- [ ] **TEST-02: Terminal PTY Load & Memory Stress Test Matrix** (`livesync-gateway`)
  - Automated stress tests allocating 100 concurrent PTY sessions, measuring CPU/RAM boundaries, and testing graceful process reaper under memory limits.
- [ ] **PERF-09: Connection Pool Auto-Scaling & Postgres Read Replicas** (`livesync-api`)
  - Dynamic `pgxpool` configuration with connection health checks, statement preparation caching, and automatic retry on transient connection dropouts.
- [ ] **BUG-10: Rapid File Renaming & VFS Cache Invalidation Race Condition** (`livesync-ui`, `livesync-realtime`, `livesync-api`)
  - Eliminate edge-case race conditions during rapid concurrent file renames and moves across multiple collaborators.
- [ ] **SEC-05: Rate Limiting, Brute-Force Throttling & DDoS Protection** (`livesync-gateway`, `livesync-api`)
  - IP and user-based Token Bucket rate limiting in Go Gateway and API for auth, search, package, and PTY endpoints.

---

### **Milestone 17: Execution Authorization & Materialized Workspace Architecture Refactor** (PLANNED 📋)
- [x] **ARCH-11: Decoupled Execution Authorization Model & Terminal Access Isolation** (`livesync-gateway`, `livesync-api`)
  - Decoupled execution capability from write/edit permissions (`VIEW`, `EDIT`, or `OWNER` can execute target project), while strictly preserving interactive terminal PTY access boundaries (prohibiting unauthenticated or view-only shell escapes).
- [x] **PERF-10: Bulk Project Manifest & Zero-N+1 Workspace Materialization Engine** (`livesync-api`, `livesync-gateway`)
  - High-performance bulk metadata and content retrieval endpoint in `livesync-api` allowing Go Gateway to materialize initial project workspaces (`/workspaces/{projectId}`) in a single optimized query batch without N+1 database roundtrips.
- [ ] **ARCH-12: Redis Hot-State Hydration & Incremental Workspace Synchronization Engine** (`livesync-gateway`, `livesync-realtime`)
  - Server-side incremental workspace synchronization that overlays active Redis collaborative document state (`livesync:doc:{documentId}:content`) onto persistent PostgreSQL file trees, avoiding full disk reconstructions.
- [ ] **SEC-06: Isolated Ephemeral Execution Sandboxing & Disposable Run Environments** (`livesync-gateway`)
  - Isolate code execution runs in ephemeral disposable workspaces (`/run/{executionId}` / copy-on-write sandboxes) to guarantee that build artifacts, dependency installations (`npm install`, `pip install`), and execution output never mutate the canonical collaborative workspace.
- [ ] **FEAT-19: Delta/Overlay Execution Protocol & Frontend Payload Optimization** (`livesync-ui`, `livesync-gateway`)
  - Refactor Angular execution client to send lightweight run requests (`{ projectId, entrypoint, revision, overlay }`) with only active dirty file overlays instead of transmitting full multi-megabyte project source trees on every run.
- [ ] **TEST-03: Multi-User Execution Isolation & Comprehensive End-to-End Authorization Suite** (`livesync-gateway`, `livesync-api`, `livesync-ui`)
  - Comprehensive automated test suite verifying owner execution, edit execution, view-only execution, view + single-file edit execution, 403 rejection on unauthorized projects, isolated run sandbox non-mutation, and concurrent execution isolation.

---

## 🗺️ Completed Milestones

### **Milestone 14: Quality Assurance, Advanced Workspace Analytics & Production Hardening** (COMPLETED ✅)
- [x] **SEC-04: Zero-Trust Gateway JWT Authentication & Universal Infrastructure Access Verification** (`livesync-gateway`, `livesync-api`, `livesync-realtime`)
  - Enforce strict cryptographically verified JWT bearer tokens and active workspace/document authorization checks across all Go Gateway endpoints (Terminal PTY WebSockets `/api/terminal/ws`, Workspace Atomic Sync `/api/workspaces/:id/sync`, Search `/api/workspaces/:id/search`, and Package Manager proxies). No gateway or backend infrastructure route is accessible without verified caller identity.
- [x] **BUG-06: Collaborator Permission Update Infinite Signal Feedback Loop & Memory Leak Fix** (`livesync-ui`, `livesync-realtime`)
  - Fix fatal circular reactive effect feedback loop in `WorkspaceComponent` (`scopedProject.set` triggering the same effect reading `scopedProject()`), wrap side-effects and reads in `untracked()`, deduplicate permission events, and prune duplicate multi-channel socket emission storms in `EditorHub`.
- [x] **PERF-05: Cache-Aside Redis ACL Engine & Fast-Path Permission Evaluation** (`livesync-api`, `livesync-realtime`)
  - Sub-millisecond $\mathcal{O}(1)$ cached access evaluation with write-through invalidation on permission changes, fast-path mutation rejection with `PermissionDenied` socket events, and in-flight socket permission state synchronization.
- [x] **BUG-08: Run & Debug Launch Terminal Blank Output & Asynchronous PTY Command Race Condition** (`livesync-ui`, `livesync-gateway`)
  - Fix xterm.js DOM canvas zero-dimension initialization when spawning run tabs, prevent premature `run_command` and environment variable drops during shell ConPTY startup, automatically sync workspace files to disk before execution, and reuse existing run tabs.
- [x] **FEAT-18: Collaborator Activity Timeline & Document Audit Logs** (`livesync-api`, `livesync-ui`)
  - Detailed historical audit trail of document permissions, collaborators added/removed, and version save snapshots with dedicated activity timeline side-dock panel, filter chips, and reactive log synchronization.
- [x] **PERF-06: Angular Signal Lifecycle Audit & Comprehensive Client Memory Leak Prevention** (`livesync-ui`)
  - Audited all subscriptions, effect loops, interval timers, resize observers, CodeMirror View plugin instances, and xterm.js terminal buffers across `livesync-ui` (`EditorComponent`, `WorkspaceComponent`, `LiveTerminalService`, `RealtimeService`) ensuring automatic teardown via `DestroyRef.onDestroy` / `takeUntilDestroyed` and zero zombie listeners.

---

## 🗺️ Future Milestones & Planned Work

### **Milestone 15: Polyglot Codebase Hygiene, Dead Code Elimination & Architecture Streamlining** (PLANNED 📋)
- [x] **BUG-11: Integrated Terminal Root Working Directory Anchoring & Top Bar Run Control Consolidation** (`livesync-ui`, `livesync-gateway`)
  - Enforce explicit shell working directory initialization (`Set-Location` in Windows ConPTY and `cd` in Unix bash) anchored to `./workspaces/{projectId}`, ensure reactive VFS re-indexing matches scoped project root, synchronize workspace file snapshots before execution, and remove redundant top-bar execution buttons in favor of the unified Run & Debug sidebar dock.
- [x] **BUG-12: Standardized POSIX Bash Environment Variable Exports & Execution Launcher Hardening** (`livesync-ui`)
  - Standardize all run configuration and environment variable exports to POSIX-compliant Bash syntax (`export KEY="VALUE"; <cmd>`), eliminating PowerShell syntax leakage (`$env:`) in Linux containers and ensuring seamless execution across all shell environments.
- [ ] **BUG-07: Realtime Disconnection Ghost Cursors & Orphan Socket Cleanup** (`livesync-realtime`, `livesync-ui`)
  - Ensure clean collaborator teardown upon socket disconnect, tab closure, or navigation, preventing orphaned selection highlight ranges, stale collaborator counts, and ghost cursor states in Redis and UI.
- [ ] **ARCH-08: Full Polyglot Dead Code Pruning & Deprecated API Cleanup** (`livesync-gateway`, `livesync-api`, `livesync-realtime`, `livesync-ai`, `livesync-ui`)
  - Comprehensive static analysis and removal of unused struct fields, obsolete legacy endpoints, dead helper functions, unused npm/pip/go modules, orphaned component templates, and deprecated CSS rules across all 5 microservices.
- [ ] **BUG-09: Concurrent PTY Stream Race Condition & Terminal Buffer Leak Fix** (`livesync-gateway`, `livesync-ui`)
  - Memory-bounded scrollback buffer management, explicit PTY process kill signal propagation on WebSocket disconnect, and mutex-safe stdout/stderr I/O pumps to prevent dangling shell processes on the host.
- [ ] **PERF-07: High-Concurrency Virtual Scroll & Large Directory Tree Windowing** (`livesync-ui`)
  - DOM virtualization for large project file trees (1,000+ files) and high-throughput xterm.js backpressure control to prevent UI thread lockups during heavy logging output (e.g. `npm install`, `find /`).

---

### **Milestone 16: Enterprise Resilience, End-to-End Stress Testing & Chaos Engineering** (PLANNED 📋)
- [ ] **ARCH-09: Universal Error Boundary & Polyglot Microservice Health Telemetry** (`livesync-gateway`, `livesync-api`, `livesync-realtime`, `livesync-ai`, `livesync-ui`)
  - RFC 7807 compliant structured JSON error formats across all microservices, graceful UI error boundaries for crash recovery, and unified `/health/readiness` & `/health/liveness` probes.
- [ ] **TEST-01: Multi-User High-Concurrency Chaos & CRDT Fuzzing Suite** (`livesync-realtime`, `livesync-ui`)
  - Automated simulation of 50+ concurrent typing sessions, network jitter, simulated packet drops, and mathematical convergence validation.
- [ ] **TEST-02: Terminal PTY Load & Memory Stress Test Matrix** (`livesync-gateway`)
  - Automated stress tests allocating 100 concurrent PTY sessions, measuring CPU/RAM boundaries, and testing graceful process reaper under memory limits.
- [ ] **PERF-09: Connection Pool Auto-Scaling & Postgres Read Replicas** (`livesync-api`)
  - Dynamic `pgxpool` configuration with connection health checks, statement preparation caching, and automatic retry on transient connection dropouts.
- [ ] **BUG-10: Rapid File Renaming & VFS Cache Invalidation Race Condition** (`livesync-ui`, `livesync-realtime`, `livesync-api`)
  - Eliminate edge-case race conditions during rapid concurrent file renames and moves across multiple collaborators.
- [ ] **SEC-05: Rate Limiting, Brute-Force Throttling & DDoS Protection** (`livesync-gateway`, `livesync-api`)
  - IP and user-based Token Bucket rate limiting in Go Gateway and API for auth, search, package, and PTY endpoints.

---

### **Milestone 17: Execution Authorization & Materialized Workspace Architecture Refactor** (PLANNED 📋)
- [ ] **ARCH-11: Decoupled Execution Authorization Model & Terminal Access Isolation** (`livesync-gateway`, `livesync-api`)
  - Decouple execution capability from write/edit permissions (`VIEW`, `EDIT`, or `OWNER` can execute target project), while strictly preserving interactive terminal PTY access boundaries (prohibiting unauthenticated or view-only shell escapes).
- [ ] **PERF-10: Bulk Project Manifest & Zero-N+1 Workspace Materialization Engine** (`livesync-api`, `livesync-gateway`)
  - High-performance bulk metadata and content retrieval endpoint in `livesync-api` allowing Go Gateway to materialize initial project workspaces (`/workspaces/{projectId}`) in a single optimized query batch without N+1 database roundtrips.
- [ ] **ARCH-12: Redis Hot-State Hydration & Incremental Workspace Synchronization Engine** (`livesync-gateway`, `livesync-realtime`)
  - Server-side incremental workspace synchronization that overlays active Redis collaborative document state (`livesync:doc:{documentId}:content`) onto persistent PostgreSQL file trees, avoiding full disk reconstructions.
- [ ] **SEC-06: Isolated Ephemeral Execution Sandboxing & Disposable Run Environments** (`livesync-gateway`)
  - Isolate code execution runs in ephemeral disposable workspaces (`/run/{executionId}` / copy-on-write sandboxes) to guarantee that build artifacts, dependency installations (`npm install`, `pip install`), and execution output never mutate the canonical collaborative workspace.
- [ ] **FEAT-19: Delta/Overlay Execution Protocol & Frontend Payload Optimization** (`livesync-ui`, `livesync-gateway`)
  - Refactor Angular execution client to send lightweight run requests (`{ projectId, entrypoint, revision, overlay }`) with only active dirty file overlays instead of transmitting full multi-megabyte project source trees on every run.
- [ ] **TEST-03: Multi-User Execution Isolation & Comprehensive End-to-End Authorization Suite** (`livesync-gateway`, `livesync-api`, `livesync-ui`)
  - Comprehensive automated test suite verifying owner execution, edit execution, view-only execution, view + single-file edit execution, 403 rejection on unauthorized projects, isolated run sandbox non-mutation, and concurrent execution isolation.

---

## 🗺️ Completed Milestones

### **Milestone 13: Real-Time Collaboration, Environment Launchers & Workflow Enhancements** (COMPLETED ✅)
- [x] **FEAT-14: VS Code-Style Explorer Context Menu & "Open in Integrated Terminal"** (`livesync-ui`, `livesync-gateway`)
  - Complete VS Code-style context menu on folders & files with instant terminal opening anchored to subdirectories (`/api/terminal/ws?subDir=...`), tab auto-naming (`term: <folder>`), "Find in Folder" include filter linking, and clipboard relative path copying.
- [x] **FEAT-15: Run & Debug Environment Profiles & Launch Configuration Hub** (`livesync-ui`, `livesync-gateway`)
  - Dedicated Run & Debug panel with preset runtime environments (Node.js, Python, Go, custom launch profiles), environment variable manager, header execution launcher (`▶ Run`), and execution monitor.
- [x] **FEAT-16: Dynamic Collaborator Access List & Real-Time Permission Synchronization** (`livesync-ui`, `livesync-realtime`, `livesync-api`)
  - Live shared collaborator management list with on-the-fly role toggling (Viewer/Editor), access revocation, and real-time Socket.IO permission push (`UpdateCollaboratorPermission` -> `ReceivePermissionUpdated`) that instantly locks/unlocks collaborator editors without reloading.
- [x] **PERF-04: Multi-User Remote Selection Range Highlighting & CRDT Delta Sync** (`livesync-ui`, `livesync-realtime`)
  - CodeMirror 6 remote presence StateField with colored remote carets, floating collaborator name tag badges, translucent multi-user text selection range highlights, and real-time range delta broadcasting.
- [x] **FEAT-17: Hierarchical Access Control & Document-Level Permission Overrides** (`livesync-api`, `livesync-ui`, `livesync-realtime`)
  - Multi-level ACL inheritance from folders/projects to child files with automatic collaborator aggregation, fine-grained document-level permission overrides (`Can Edit (Override)` vs `Inherited (View)`), and upsert persistence.
- [x] **ARCH-06: Enterprise User-Level Socket Channel Multiplexing & Codebase Hygiene / Deprecation Cleanup** (`livesync-realtime`, `livesync-api`, `livesync-ui`)
  - Elevate socket connections to authenticated `user:<userId>` private rooms for instant cross-tab/cross-workspace permission delivery, implement SQL upserts with hierarchical ownership verification in Go API, and clean up obsolete/deprecated code patterns.

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
