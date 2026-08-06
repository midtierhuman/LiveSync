# Bug & Architecture Ticket: LiveSync Sharing Model & Explorer UX Fixes

## Bug Summary
**Issues Addressed:** 
1. **Broken Hierarchical Explorer Sharing:** Shared files and folders previously rendered as flat breadcrumbs under an isolated `"SHARED WITH ME"` section. The workspace tree now reconstructs the full directory skeleton (`learn-to-code -> python -> main.py`) directly inside the main Explorer tree while keeping unshared sibling items hidden.
2. **Fixed Explorer Panel Width:** Added a draggable vertical splitter handle to allow users to dynamically resize the Solution Explorer panel (stretch right / shrink left).

---

## Status & Progress Checklist

### Tasks Completed & Verified (Done)

#### 1. Hierarchical In-Tree Sharing Model:
- [x] **Backend Skeleton Metadata (`livesync-api`):** Updated `FolderService.java` and `FolderDto` to compute and return folder path ancestor nodes (`folderPath` metadata) for shared folders and documents.
- [x] **In-Tree Skeleton Reconstruction (`livesync-ui`):** Removed the flat `"SHARED WITH ME"` breadcrumb section from `dashboard.html`. Shared files and folders now dynamically project their full parent folder hierarchy in the primary Explorer tree.
- [x] **Structural Folder Scoping:** Implemented container/skeleton folder nodes in `dashboard.ts` so ancestor folders display as non-editable context paths without exposing unauthorized sibling files/folders.
- [x] **Subfolder Permission Expansion:** Configured recursive subfolder expansion—sharing a subfolder unlocks all contained nested files/subfolders while remaining strictly bounded from parent directory siblings.

#### 2. Resizable Solution Explorer (Draggable Splitter):
- [x] **Resizable Splitter Element:** Added the `.explorer-resizer` drag-handle element between the Explorer panel and Editor canvas in `dashboard.html`.
- [x] **Drag Event Handlers:** Integrated `onExplorerResizeStart`, `onExplorerResizeMove`, and `onExplorerResizeEnd` listeners (`mousedown`/`mousemove`/`mouseup` and touch equivalents) in `dashboard.ts`.
- [x] **Width Boundaries & State:** Configured smooth panel width adjustments constrained between `180px` and `600px` with active resizing CSS feedback.

#### 3. Editor Tab Isolation & Service Scoping (Copilot Follow-Up):
- [x] **Per-Tab Component Providers:** Scoped `RealtimeService`, `ExecutionStreamService`, `TimeTravelService`, and `PackageManagerService` directly to `<app-editor>` providers.
- [x] **Multi-Tab Mounting:** Refactored `dashboard.html` so open tabs stay mounted (hidden via CSS) to preserve per-file state, while disabling background WebSocket overhead for inactive tabs.

---

## Remaining / Follow-Up Tasks

- [x] **Folder Drag-and-Drop Parity:** Extended drag-and-drop support so entire folders and subfolders can be dragged/repositioned within the tree view with optimistic nested-tree/cache updates and rollback via workspace reload on failure.
- [ ] **Java Backend Build Verification:** Re-verify `.\gradlew.bat build` in `livesync-api` once `JAVA_HOME` is set on the host environment. Current attempt still fails because no `JAVA_HOME` is configured and `java` is not on `PATH`.