# Bug & Architecture Ticket: LiveSync Sharing Model & Explorer UX Fixes

## Bug Summary
**Issues Addressed & New Requirements:** 
1. **Hierarchical Explorer Sharing:** Shared items are merged into the unified Explorer tree while preserving parent folder path context.
2. **Resizable Explorer Panel:** Draggable vertical splitter handle (`180px` – `600px`).
3. **Visual Indicators for Shared Resources & Permissions:** Since shared folders now look identical to owned folders, add visual badges/icons to distinguish ownership and access levels (Read-Only vs. Edit) without cluttering owned projects.

---

## Detailed Visual Indicator Requirements

### 1. Root/Folder Shared Indicator
* **Owned Projects/Folders:** **NO badges or icons** should be displayed for folders or files owned directly by the user. Keep owned projects clean.
* **Shared Root Folders / Path Context:** Any root folder or path node that is shared with the user (or built as a path skeleton for a shared file) **MUST display a shared indicator icon/badge** (e.g., a "Users / Shared" badge icon `ph-users` or `ph-share-network`) right beside the folder name in the Explorer tree.

### 2. Granular Permission Icons for Shared Files
For files inside shared folders or individually shared files, render permission badges based on the user's explicit access level set during sharing:
* **Read-Only Access:** Display a **Lock / Eye icon** (e.g., `ph-lock-simple` or `ph-eye` with tooltip *"Read Only"*) directly beside the shared file name. Disable inline editing or auto-saving in the CodeMirror editor for this file.
* **Editable / Full Access:** Display a **Pencil / Edit icon** (e.g., `ph-pencil-simple` with tooltip *"Can Edit"*) beside the shared file name.
* **Owned Files:** **NO badges or icons** (default behavior).

---

## Status & Progress Checklist

### Tasks Completed & Verified (Done)

#### 1. Hierarchical In-Tree Sharing Model:
- [x] **Backend Skeleton Metadata (`livesync-api`):** Updated `FolderService.java` and `FolderDto` to compute and return folder path ancestor nodes (`folderPath` metadata) for shared folders and documents.
- [x] **In-Tree Skeleton Reconstruction (`livesync-ui`):** Removed flat breadcrumb list. Shared files and folders project their full parent folder hierarchy in the primary Explorer tree.
- [x] **Structural Folder Scoping:** Implemented container/skeleton folder nodes so ancestor folders display as non-editable context paths without exposing unauthorized sibling files/folders.

#### 2. Resizable Solution Explorer (Draggable Splitter):
- [x] **Resizable Splitter Element:** Added `.explorer-resizer` drag handle between Explorer panel and Editor canvas.
- [x] **Drag Event Handlers:** Integrated `onExplorerResizeStart`, `onExplorerResizeMove`, and `onExplorerResizeEnd` listeners in `dashboard.ts`.

#### 3. Editor Tab Isolation & Service Scoping:
- [x] **Per-Tab Component Providers:** Scoped `RealtimeService`, `ExecutionStreamService`, `TimeTravelService`, and `PackageManagerService` to `<app-editor>`.

---

### New Action Items to Implement

- [x] **Frontend Template Badges (`dashboard.html` / `dashboard.scss`):**
  - Add conditional shared badge icon beside folder tree nodes when `isShared` or `isSharedAncestor` flag is `true`.
  - Add conditional permission badge icons (`lock` for `READ`, `pencil` for `EDIT`) beside file tree nodes when `isShared === true`.
  - Ensure owned items render **zero** badge icons.
- [x] **Backend DTO / Permission Flagging (`livesync-api` / `livesync-ui`):**
  - Ensure `DocumentDto` and `FolderDto` include `isShared` and `permission` (`READ` | `WRITE`/`EDIT`) fields when fetched for workspace rendering.
- [x] **Editor Read-Only Enforcement (`editor.ts`):**
  - Bind CodeMirror's `readOnly` extension or state to the document's permission level when opening shared read-only files.