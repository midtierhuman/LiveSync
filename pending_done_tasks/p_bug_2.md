# Bug Ticket: Explorer Resizer Layout Collision & Universal Badge Misalignment

## Bug Summary
**Issues Identified:**
1. **Action Bar / Header Icon Collision:** As the Explorer panel is shrunk to the left, top header action icons (`New File`, `New Folder`, `Add Shared Resource`, `Collapse All`, etc.) collapse into panel content and bleed past the resizer border rather than clipping cleanly.
2. **Universal Badge & Icon Displacement:** ALL badges and status icons in the Solution Explorer (including shared badges `ph-users`, document count indicators, git status indicators, read-only locks, and file action buttons) are styled with `position: absolute` or `float: right`. Shrinking the Explorer panel pushes the resizer line straight over these elements instead of clipping or reflowing them inline.

---

## Detailed Description & Requirements

### Root Cause Analysis
* **Header Action Bar:** The `.explorer-header` / `.tree-actions` container lacks `overflow: hidden` and `flex-shrink` bounds. When `.explorer-sidebar` shrinks, right-aligned action icons overflow the container boundary.
* **Global Explorer Badges:** Badges are positioned absolutely (`right: 8px` / `right: 12px`) relative to the viewport or unconstrained tree rows. Shrinking the panel moves the right resizer boundary over these static offsets.

---

## Technical Tasks & CSS Fixes to Implement

### 1. Fix Top Header Action Bar (`dashboard.scss`)
- [ ] Set `overflow: hidden` on `.explorer-header` / `.explorer-toolbar`.
- [ ] Group right-side header icons inside a flex container with `margin-left: auto`, `flex-shrink: 0`, and `overflow: hidden`.
- [ ] Apply `text-overflow: ellipsis` to the section label (`EXPLORER`) so it shrinks gracefully when the panel is narrow without pushing action icons out of bounds.

### 2. Universal Inline Flex Refactoring for ALL Explorer Badges (`dashboard.scss` / `dashboard.html`)
Refactor **ALL** tree row structures (`.tree-row`, `.folder-row`, `.file-row`, `.workspace-header-row`) to rely strictly on Flexbox alignment instead of absolute positioning:

```scss
/* Universal Tree Row Flex Layout */
.tree-row, .folder-row, .file-row {
  display: flex;
  align-items: center;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding-right: 8px; /* Safe gutter before resizer handle */

  /* Icon / Arrow on the left */
  .tree-icon, .toggle-arrow {
    flex-shrink: 0;
  }

  /* Truncatable Label in the middle */
  .item-label, .file-name, .folder-name {
    flex: 1 1 auto;
    min-width: 0; /* Critical for flex child text truncation */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Universal Badge Container (Shared, Count, Git, Permissions, Hover Actions) */
  .row-badges, .badge-group, .item-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0; /* Prevents badges from squishing */
    margin-left: auto;
    
    /* REMOVE ALL absolute positioning! */
    position: static !important;
    right: auto !important;
  }

  /* Target all badge variants globally */
  .shared-badge, 
  .doc-count-badge, 
  .permission-badge, 
  .git-status-badge, 
  .hover-action-btn {
    position: static !important;
    flex-shrink: 0;
  }
}