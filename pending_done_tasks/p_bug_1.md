# Bug Ticket: Folder Sharing Failure & Misleading Sharing UI Terminology

## Bug Summary
**Issues Identified:**
1. **Folder Direct Share Failure:** Directly sharing a folder triggers an error code/failure on the backend. Sharing currently only works when sharing an individual file (which indirectly pulls its parent folder structure as path context).
2. **Misleading UX Terminology:** UI labels in the sharing workflow are inconsistent and confusing—specifically, the button titled "Join shared room" contains an internal action called "Add shared file" rather than unified item/folder terminology.

---

## Detailed Description & Requirements

### Bug 1: Direct Folder Sharing Endpoint Failure
* **Current Flawed Behavior:** Attempting to directly share a folder (e.g., via folder context menu or share modal) fails with an error code response from `livesync-api`.
* **Root Cause Area:** `FolderService.java` / `SharedFolderRepository` endpoints fail to validate or process folder-level ACL creation when no file ID is explicitly passed.
* **Expected Behavior:** 
  * Sharing a folder directly must grant the recipient access to the folder and recursively unlock all contained subfolders and files.
  * The recipient's Explorer tree should immediately render the shared folder root and all child contents.

---

### Bug 2: Inconsistent & Misleading Sharing UX Terminology
* **Current Flawed Behavior:**
  * Action button label: `"Join shared room"`
  * Modal header/internal button label: `"Add shared file"`
  * **Inconsistency:** The feature now supports sharing both **files** and **folders**, but the UI specifically says `"Add shared file"`. Furthermore, `"Join shared room"` sounds like a temporary multi-user editing session rather than accepting a shared project resource/folder.
* **Expected Behavior & UI Copy Fixes:**
  * **Main Action Button:** Rename `"Join shared room"` → **`"Add Shared Resource"`** (or **`"Join Shared Workspace"`**).
  * **Modal Title & Buttons:** Rename `"Add shared file"` → **`"Add Shared Item"`** (or **`"Accept Shared Link"`**).
  * Update input placeholders to indicate support for both file and folder share tokens/keys (e.g., *"Enter shared file or folder link/key..."*).

---

## Technical Tasks to Implement

### Backend Service Fixes (`livesync-api`)
- [ ] Investigate and resolve error code thrown when calling folder share endpoint in `FolderService.java`.
- [ ] Ensure folder ACL permissions properly grant recursive access to underlying document entities without requiring individual document share records.

### Frontend UI & Copy Fixes (`livesync-ui`)
- [ ] Update button label in `dashboard.html` from `"Join shared room"` to `"Add Shared Resource"`.
- [ ] Update modal copy and internal submit button in `dashboard.html` from `"Add shared file"` to `"Add Shared Item"`.
- [ ] Verify share modal accepts both folder share keys and file share keys seamlessly.