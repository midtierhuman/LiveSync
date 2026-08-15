# LiveSync Pending Tasks & Issue Tracker

> Last Updated: 2026-08-11
> Status Legend: ⏳ **Pending** | 🔄 **In Progress** | ✅ **Done**

---

## Quick Navigation & Overview

| ID | Category | Summary | Service Scope | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PERF-01** | ⚡ Optimization | O(N²) Line Diff in Time-Travel Timeline Scrubber | `livesync-ui` | Medium | ⏳ Pending |
| **PERF-02** | ⚡ Optimization | Data Loss Prevention on Editor Tab Close / Debounced Save Unmount | `livesync-ui` | High | ⏳ Pending |
| **FEAT-01** | 🚀 Feature | Background Execution Mode (Keep REPL Running on Panel Collapse) | `livesync-ui`, `livesync-gateway` | Low | ⏳ Pending |

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
When navigating away or closing an editor tab in `editor.ts` ([lines 258–261](file:///D:/Projects/LiveSync/livesync-ui/src/app/features/editor/editor.ts#L258-L261)), `onDestroy` cancels the `saveDebounceTimer` with `clearTimeout(this.saveDebounceTimer)`. Any unsaved edits typed within the 2-second debounce window are silently discarded rather than being saved to the backend before destruction.

#### Action Items & Requirements
- [ ] **Synchronous Flush on Destroy (`editor.ts`):** Implement a `flushPendingSave()` helper function. Call `flushPendingSave()` inside `onDestroy` so pending content edits are flushed to `documentService.updateContent()` before CodeMirror instance destruction.

---

### 🚀 FEAT-01: Background Execution Mode (Keep REPL Running on Panel Collapse)

#### Problem Statement
Closing or minimizing the REPL terminal panel currently terminates the execution process. Users should be able to collapse the terminal UI panel while letting long-running scripts continue executing in the background, displaying an active process pill in the editor status bar.

#### Action Items & Requirements
- [ ] **Decouple Panel Visibility from Process Termination (`editor.ts`):** Create an explicit `isTerminalPanelOpen` signal for toggling UI visibility without triggering `streamService.closeTerminal()`.
- [ ] **StatusBar Active Process Badge (`editor.html`):** Add a pulsating "Running..." status badge to the status bar when `streamService.isStreaming()` is true and the terminal panel is collapsed.
