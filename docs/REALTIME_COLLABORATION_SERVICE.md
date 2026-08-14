# Realtime Collaboration Engine (`livesync-realtime`)

The `livesync-realtime` microservice handles low-latency room-based document editing, multi-cursor presence, inline code comments, and conflict-free replicated data synchronization.

---

## 🛠️ Stack & Mechanics

- **Runtime**: Node.js 24, TypeScript, Express 5.
- **WebSocket Engine**: Socket.IO 4.8.
- **Cluster Backplane**: `@socket.io/redis-adapter` for multi-instance socket broadcasting across replicas.
- **State Store**: Redis (hashes for document membership, sorted sets for operation history logs, streams for persistence).

---

## 🔌 Socket.IO Event Protocol

### Document Lifecycle & Rooms
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `JoinDocument` (`{ documentId, initialContent }`) | `UserJoined` (`(socketId, count, docId)`), `ReceiveContentUpdate` | Subscribes socket to document room. Seeds initial content if room is new in Redis. |
| `LeaveDocument` (`documentId`) | `UserLeft` (`(socketId, count, docId)`) | Unsubscribes socket from document room. |

### Real-Time Editing & CRDT Operations
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `SendContentUpdate` (`{ documentId, content }`) | `ReceiveContentUpdate` (`{ documentId, content }`) | Full document snapshot sync for major replaces. |
| `SendOperation` (`{ documentId, operation }`) | `ReceiveOperation` (`Operation`) | Atomic transformation against concurrent edits and broadcast to room. |
| `RequestMissedOperations` (`{ documentId, fromRevision }`) | `ReceiveOperation`, `ResyncComplete` | Catch-up sync mechanism for reconnected clients. |
| `GetRevisionHistory` (`documentId`) | `ReceiveRevisionHistory` | Full operation log for time-travel playback and diff calculation. |

### Cursor Tracking & Presence
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `SendCursorPosition` (`{ documentId, position, lineNumber, scrollLine, userName }`) | `ReceiveCursorUpdate` | Broadcasts collaborator cursor position, selection, and color scoped by `documentId`. |

### Inline Threaded Comments
| Client Emit | Server Emit | Description |
| :--- | :--- | :--- |
| `AddComment` (`data`) | `ReceiveComment` (`data`) | Broadcasts new comment thread anchored to a line number. |
| `AddCommentReply` (`data`) | `ReceiveCommentReply` (`data`) | Broadcasts reply to a comment thread. |
| `ResolveComment` (`data`) | `ReceiveCommentResolved` (`data`) | Broadcasts thread resolution / reopening toggle. |
| `DeleteComment` (`data`) | `ReceiveCommentDeleted` (`data`) | Broadcasts deletion of a comment thread. |

---

## ⚡ Background Tasks & Data Persistence

1. **Write-Behind Stream Publisher (`publishSaveEvent`)**:
   - Publishes dirty document snapshots to Redis Stream `livesync:stream:document-saves` for asynchronous persistence into PostgreSQL by `livesync-api`.

2. **Periodic PostgreSQL Flusher**:
   - Runs every 60 seconds to detect unsaved active document modifications in Redis and push them to the Redis stream and PostgreSQL.

3. **Stale Connection Sweeper**:
   - Runs every 30 seconds to clean up orphaned socket connections across server replicas and flush closing rooms.

---

## 🛠️ Running Locally

```powershell
cd livesync-realtime
npm install
npm run dev
```
