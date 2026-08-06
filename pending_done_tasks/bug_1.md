# Bug & Architecture Ticket: LiveSync Sharing Model Overhaul

## Bug Summary
**Issue:** Current file sharing feature is obsolete following recent UI updates allowing hierarchical directory structures (folders and subfolders).

---

## Detailed Description & Requirements

### Context
The original sharing model operated strictly on flat, individual file-level permissions. With the latest UI update (e.g., LiveSync Workspace directory navigation containing nested folders like `learn-to-code/python/main.py`), sharing needs to support hierarchical scoping (files, subfolders, and root folders) while maintaining strict permission boundaries.

### Expected Sharing & Granular Scoped Access Behavior

1. **File-Level Sharing with Path Context:**
   * If **File 1** located in `Folder A / Subfolder B / File 1` is shared with a recipient:
     * The recipient **must see the full parent folder structure** (`Folder A/Subfolder B/File 1`) to preserve project hierarchy context.
     * The recipient **must NOT gain access to or view any other files** existing in `Folder A` or `Subfolder B`. For example, if `Subfolder B` contains 5 other files, those 5 files remain hidden and inaccessible.

2. **Subfolder-Level Sharing (Permission Upgrade):**
   * If the owner subsequently shares **Subfolder B** with the same user:
     * The recipient's access expands to include **all files and subfolders contained inside `Subfolder B`**.
     * Access remains **restricted at the `Subfolder B` boundary**; the recipient does NOT gain access to sibling files or sibling subfolders located directly under parent `Folder A`.

3. **Parent Folder-Level Sharing:**
   * If the owner shares the parent **Folder A**:
     * The recipient gains full recursive access to `Folder A`, including `Subfolder B` and all files/subfolders beneath it.

---

## Technical Tasks to Implement

### Backend Service Updates (`livesync-api`)
- [ ] Update folder/file permissions engine in `FolderService.java` to evaluate scoped permissions recursively by node path rather than single file ID.
- [ ] Implement path-building metadata for shared single files so the UI can reconstruct the directory tree skeleton without leaking unshared sibling metadata.
- [ ] Add explicit checks during directory tree fetches to filter out unauthorized sibling nodes inside shared subfolders.

### Frontend UI Updates (`livesync-ui`)
- [ ] Refactor dashboard explorer tree (`dashboard.ts`) to display parent folder skeletons for selectively shared deeply nested files.
- [ ] Update sharing modals and context menus to support sharing actions at both File, Subfolder, and Root Folder nodes.
- [ ] Ensure dynamically updated permissions trigger real-time UI directory expansion/refresh without requiring a page reload.