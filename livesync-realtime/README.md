# 🔄 LiveSync Realtime Collaboration Service (`livesync-realtime`)

High-throughput, real-time collaborative editing, presence, and CRDT/OT synchronization engine written in **Node.js 24 + TypeScript** using **Socket.IO 4.8**.

---

## 🚀 Key Architecture & Capabilities

1. **Mathematical Transformation Property 1 ($TP_1$) Conflict Resolution**:
   - `ConflictResolver.ts` implements deterministic, mathematically verified Operational Transformation (OT) and CRDT tie-breaking.
   - Guarantees eventual document convergence for concurrent, unordered multi-user insertions, deletions, and overlapping range replacements.

2. **Scoper Presence & Cursor Tracking**:
   - Translucent multi-user text selection range highlights, floating collaborator name badges, and colored carets.
   - Active user reconciliation via `sweepStaleConnections()` and `io.fetchSockets()`, automatically cleaning up ghost cursors and Redis presence keys when collaborators close tabs.

3. **3-Tiered Multiplexed Socket Rooms**:
   - `doc:{documentId}`: Active collaborative editing session room.
   - `workspace:{folderId}`: Project-wide file tree updates (`WorkspaceChange`) for instant rename/delete/create sync across tabs.
   - `user:{userId}`: Authenticated private room for immediate cross-tab collaborator permission revocation and role updates (`ReceivePermissionUpdated`).

4. **Redis Streams Write-Behind Publisher**:
   - Publishes dirty document save snapshots to `livesync:stream:document-saves` (`XADD`) for non-blocking persistence by `livesync-api`.

5. **Fast-Path Cache-Aside ACL Evaluation (`PERF-05`)**:
   - Sub-millisecond $\mathcal{O}(1)$ Redis permission cache check rejecting unauthorized mutations for Viewers with `PermissionDenied` socket events.

---

## 📡 Socket.IO Protocol Events (Port `5000`)

### Client $\rightarrow$ Server Events
- `JoinDocument({ documentId, token })` - Joins document room, hydrates active content from Redis.
- `LeaveDocument({ documentId })` - Leaves room, triggers write-behind flush on zero users.
- `ApplyOperation({ documentId, operation })` - Submits OT text delta.
- `CursorMove({ documentId, range, cursorPosition })` - Broadcasts cursor position and selection.
- `JoinWorkspace({ folderId })` - Listens for tree file changes.
- `UpdateCollaboratorPermission({ documentId, userId, accessLevel })` - Real-time role push.

### Server $\rightarrow$ Client Events
- `DocumentState({ content, users })` - Initial document state on join.
- `ReceiveOperation({ operation })` - Broadcasts transformed delta to collaborators.
- `ReceiveCursor({ userId, userName, color, range })` - Updates remote collaborator cursor.
- `WorkspaceChange({ folderId, action, targetId })` - Signals file tree invalidation.
- `PermissionDenied({ message })` - Rejection event for view-only attempts.

---

## 🛠️ Local Development & Testing

```bash
# Install dependencies
npm install

# Run automated tests (TP1 mathematical verification & Hub lifecycle)
npm test

# Build TypeScript to JavaScript
npm run build

# Run in development mode
npm run dev
```
