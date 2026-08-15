# LiveSync Pending Tasks & Issue Tracker

> Last Updated: 2026-08-11
> Status Legend: ⏳ **Pending** | 🔄 **In Progress** | ✅ **Done**

---

## Quick Navigation & Overview

| ID | Category | Summary | Service Scope | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PERF-01** | ⚡ Optimization | O(N²) Line Diff in Time-Travel Timeline Scrubber | `livesync-ui` | Medium | ⏳ Pending |
| **PERF-02** | ⚡ Optimization | Data Loss Prevention on Editor Tab Close / Debounced Save Unmount | `livesync-ui` | High | ⏳ Pending |
| **FEAT-01** | 🚀 Feature | True Workspace Terminal & Background Process Mode | `livesync-ui`, `livesync-gateway` | Low | ✅ Done |
| **FEAT-02** | 🚀 Feature | Smart Project Entrypoints & Auto-Dependency Resolver | `livesync-ui`, `livesync-gateway` | High | ✅ Done |

---

## Detailed Task Breakdown

### ⚡ PERF-01: O(N²) Line Diff Optimization in Time-Travel Timeline Scrubber

#### Problem Statement
`TimeTravelService.computeLineDiff` currently performs array inclusion checks (`prevLines.includes(currLines[j])`) inside a `while` loop during timeline scrubbing ([`time-travel.service.ts:L206`](file:///D:/Projects/LiveSync/livesync-ui/src/app/services/time-travel.service.ts#L206)). For large files (1,000+ lines), this quadratic $O(N^2)$ lookup causes noticeable UI frame drops/freezing when dragging the timeline slider.

#### Action Items & Requirements
- [ ] **O(N) Set Lookup (`time-travel.service.ts`):** Pre-convert `prevLines` into a `Set<string>` before the diff loop to achieve $O(1)$ set lookups per line iteration.
- [ ] **Myers Diff Integration (Optional):** Replace simple line comparison with a lightweight Myers diff algorithm for accurate inline visual diff rendering.

---

### ⚡ PERF-02: Data Loss Prevention on Editor Tab Close / Unmount

#### Problem Statement
When navigating away or closing an editor tab in `editor.ts`, `onDestroy` cancels the `saveDebounceTimer` with `clearTimeout(this.saveDebounceTimer)`. Any unsaved edits typed within the 2-second debounce window are silently discarded rather than being saved to the backend before destruction.

#### Action Items & Requirements
- [ ] **Synchronous Flush on Destroy (`editor.ts`):** Implement a `flushPendingSave()` helper function. Call `flushPendingSave()` inside `onDestroy` so pending content edits are flushed to `documentService.updateContent()` before CodeMirror instance destruction.

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
