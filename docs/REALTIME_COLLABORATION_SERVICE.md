# Realtime Collaboration Engine (`livesync-realtime`)

> **Node.js 24 + Socket.IO 4.8 + Redis Adapter + CRDT / OT Conflict Resolution**

The `livesync-realtime` microservice handles low-latency room-based document editing, multi-cursor presence, inline code comments, and mathematically proven conflict-free replicated data synchronization.

---

## 🛠️ Stack & Mechanics

- **Runtime**: Node.js 24, TypeScript, Express 5.
- **WebSocket Engine**: Socket.IO 4.8.
- **Cluster Backplane**: `@socket.io/redis-adapter` for multi-instance socket broadcasting across horizontal replicas.
- **State Store**: Redis (hashes for document membership, sorted sets for revision logs, streams for write-behind persistence).

---

## 🔌 Socket.IO Event Protocol

### 1. Document Lifecycle & Rooms
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `JoinDocument` (`{ documentId, initialContent }`) | `UserJoined` (`(socketId, count, docId)`), `ReceiveContentUpdate` | Subscribes socket to document room. Seeds initial content if room is new in Redis. |
| `LeaveDocument` (`documentId`) | `UserLeft` (`(socketId, count, docId)`) | Unsubscribes socket from document room. |

### 2. Real-Time Editing & CRDT Operations
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `SendContentUpdate` (`{ documentId, content }`) | `ReceiveContentUpdate` (`{ documentId, content }`) | Full document snapshot sync for major replaces. |
| `SendOperation` (`{ documentId, operation }`) | `ReceiveOperation` (`Operation`) | Atomic transformation against concurrent edits and broadcast to room. |
| `RequestMissedOperations` (`{ documentId, fromRevision }`) | `ReceiveOperation`, `ResyncComplete` | Catch-up sync mechanism for reconnected clients. |

### 3. Cursor Tracking & Presence (Updated - `PERF-04`)
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `SendCursorPosition` (`{ documentId, position, selectionStart, selectionEnd, lineNumber, scrollLine, userName }`) | `ReceiveCursorUpdate` | Broadcasts collaborator cursor position, selection range boundaries, username, and assigned color scoped by `documentId` to render multi-user Caret and Selection highlights in CodeMirror 6. |

### 4. Inline Threaded Comments
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `AddComment` (`data`) | `ReceiveComment` (`data`) | Broadcasts new comment thread anchored to a line number. |
| `AddCommentReply` (`data`) | `ReceiveCommentReply` (`data`) | Broadcasts reply to a comment thread. |
| `ResolveComment` (`data`) | `ReceiveCommentResolved` (`data`) | Broadcasts thread resolution / reopening toggle. |
| `DeleteComment` (`data`) | `ReceiveCommentDeleted` (`data`) | Broadcasts deletion of a comment thread. |

### 5. Workspace & Project File Tree Metadata Sync (Implemented - `BUG-03`)
| Client Emit / API Trigger | Server Emit | Description |
| :--- | :--- | :--- |
| `JoinWorkspace` (`workspaceId`) | `WorkspaceJoined` | Subscribes collaborator socket to the project/workspace room (`workspace:<id>`). |
| `LeaveWorkspace` (`workspaceId`) | `WorkspaceLeft` | Unsubscribes collaborator socket from the workspace room. |
| `WorkspaceChange` (`data`) | `ReceiveWorkspaceChange` (`data`) | Broadcasts instant create, rename, move, and delete metadata mutations across all active collaborators' tree views and open tabs. |

### 6. Real-Time Collaborator Permission Updates (Implemented - `FEAT-16`, Hardened - `BUG-06`, Fast-Pathed - `PERF-05`)
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `UpdateCollaboratorPermission` (`{ targetUserId, accessLevel, workspaceId, documentId }`) | `ReceivePermissionUpdated`, `permissionUpdated` | Dispatches targeted real-time permission modifications (`Viewer` vs `Editor` or revocation) to target collaborator private user rooms (`user:<userId>`) and scoped workspace/document channels, writes through to Redis ACL cache (`livesync:acl:doc:*`), and updates in-flight socket connection permissions in real time. |
| `SendOperation` / `SendContentUpdate` (Unauthorized) | `PermissionDenied`, `Error` | Fast-path rejection of unauthorized write operations from `Viewer` sockets, broadcasting an explicit `{ documentId, required: 'Edit', current }` denial event without modifying server document state. |

---

## 🧮 CRDT & Operational Transformation (OT) Design

LiveSync implements **Conflict-free Replicated Data Type (CRDT)** causality with **Operational Transform (OT)** rules for concurrent conflict resolution. This ensures that concurrent edits from multiple users merge deterministically across all replicas without data loss.

### 1. Core Data Structures
- `Operation.Id`: Globally unique (`SiteId + Clock`) for deterministic tie-breaking.
- `Operation.ClientRevision`: Client-side version when operation was created.
- `Operation.ServerRevision`: Monotonic server-assigned version for global ordering.
- `Operation.Position`: Zero-based character offset of the edit.
- `Operation.Text` (Insert) or `Operation.Length` (Delete).

### 2. Transformation Properties ($TP_1$)
Given concurrent operations $A$ and $B$, compute transformed operations $A'$ and $B'$ such that:
$$\text{Apply}(\text{Apply}(\text{doc}, A), \text{Transform}(B, A)) \equiv \text{Apply}(\text{Apply}(\text{doc}, B), \text{Transform}(A, B))$$

### 3. Transformation Rules Matrix (`ConflictResolver.TransformAgainstConcurrent`)

* **Insert vs Insert** (same position):
  - Deterministic tie-breaking using `OperationId.CompareTo(clock, siteId)`.
  - The operation with the lower ID claims the left offset, shifting the other right.
* **Insert vs Delete**:
  - Insert position $\le$ Delete start $\to$ Insert is unaffected.
  - Insert position $>$ Delete end $\to$ Shift insert left by deleted length.
  - Insert position inside deleted span $\to$ Collapse to delete start with empty string.
* **Delete vs Insert**:
  - Insert position $\le$ Delete start $\to$ Shift delete position right by inserted length.
  - Insert position $\ge$ Delete end $\to$ Delete is unaffected.
  - Insert position within delete span $\to$ Extend deletion length to absorb inserted characters.
* **Delete vs Delete**:
  - Disjoint $\to$ Shift position if after concurrent deletion; otherwise unaffected.
  - Overlapping $\to$ Compute exact overlap $\max(0, \min(E_1, E_2) - \max(S_1, S_2))$, adjust remainder length, and shift start position deterministically.

---

## ⚡ Background Tasks & Data Persistence

1. **Write-Behind Stream Publisher (`publishSaveEvent`)**:
   - Publishes dirty document snapshots to Redis Stream `livesync:stream:document-saves` for asynchronous persistence into PostgreSQL by `livesync-api`.
2. **Operation Log Compaction & Snapshot Checkpointing**:
   - Automatically takes a snapshot checkpoint and prunes historical operations older than `serverRevision - 200` every 100 revisions, bounding Redis memory consumption.
3. **Periodic PostgreSQL Flusher**:
   - Runs every 60 seconds to detect unsaved active document modifications in Redis and push them to the Redis stream and PostgreSQL.
4. **Stale Connection Sweeper**:
   - Runs every 30 seconds to clean up orphaned socket connections across server replicas and flush closing rooms.

---

## 🛠️ Running & Testing Locally

```powershell
cd livesync-realtime
npm install
npm test
npm run dev
```
