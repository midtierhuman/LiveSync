# LiveSync: Conflict Resolution Design

## Overview

LiveSync now implements **Conflict-free Replicated Data Type (CRDT)** semantics with **Operational Transform (OT)** for conflict resolution. This ensures that concurrent edits from multiple users are merged deterministically, producing the same final state on all replicas regardless of operation arrival order.

## Problem Statement

**Previous (last-write-wins) approach:** When two users edited the document concurrently, the last update would overwrite all previous edits, causing silent data loss.

**Example of the problem:**
```
User A at time 0: Inserts "hello" at position 0  →  Doc: "hello"
User B at time 1: Inserts "world" at position 0  →  Doc: "world"  (A's edit lost!)
```

## Solution: CRDT with Operational Transform

### Key Concepts

1. **Operation**: Atomic edit unit (insert or delete) with metadata for causality tracking
   - `Operation.Id`: Globally unique (SiteId + Clock) for deterministic ordering
   - `Operation.ClientRevision`: Client-side version when operation was created
   - `Operation.ServerRevision`: Server-assigned version for ordering on replicas
   - `Operation.Position`: Where in document the edit occurs
   - `Operation.Text` (Insert) or `Operation.Length` (Delete)

2. **Operation Transform (OT)**: Given two concurrent operations A and B, compute A' such that:
   ```
   Apply(Apply(doc, A), Transform(A, B)) == Apply(Apply(doc, B), Transform(B, A))
   ```
   This ensures commutativity: the order of application doesn't matter.

3. **Conflict Resolution**: When server receives an operation:
   - It transforms the incoming operation against all concurrent operations (already in the log)
   - The transformed operation is then applied to the document state
   - All clients receive the transformed operation

### Algorithm Details

#### Transformation Rules

The `ConflictResolver.TransformAgainstConcurrent(op1, op2)` method handles all 4 operation combinations:

**Insert vs Insert** (same position):
- Use Operation ID for tie-breaking (lexicographic ordering)
- If concurrent insert has lower ID, it "wins" and shifts our insert right
- Ensures deterministic behavior across all replicas

**Insert vs Delete**:
- If delete removes our insert position, shift insert to delete start
- If delete is before our insert, shift insert left by deletion length
- If delete is after our insert, no change

**Delete vs Insert**:
- If insert is before our deletion, shift deletion right
- If insert is within our deletion, extend deletion length
- If insert is after our deletion, no change

**Delete vs Delete**:
- Calculate overlap between deletions
- Adjust position and length to account for deletions already applied
- Preserve the intent: "delete these N characters starting here"

#### Determinism

To ensure all replicas produce identical results:
- Operations are always transformed in the same order (by `OperationId.CompareTo`)
- Site IDs are used as tie-breakers when clock values are equal
- Every transformation is purely function of the two operations, with no external state

### Operation Flow

```
┌─────────────┐
│   Client    │
│             │
│ Generates   │
│ Insert(3)   │
│ ClientRev=1 │
└──────┬──────┘
	   │ SendOperation(Insert(3), ClientRev=1)
	   │
	   ▼
┌──────────────────────────────┐
│        Hub Server            │
│                              │
│ 1. Get currentRev = 5        │
│ 2. Set operation.ServerRev=6 │
│ 3. Transform against ops     │
│    [4,5] (concurrent)        │
│ 4. Result: Insert(5) ◄───┐   │
│    (position shifted)     │   │
│ 5. Apply to state         │   │
│ 6. Store in log           │   │
│ 7. Broadcast to all       │   │
└──────────────────────────────┘
	   │
	   ├──────────────────────┬──────────────────────┐
	   │                      │                      │
	   ▼                      ▼                      ▼
	Client A             Client B              Client C
  Receives op 6        Receives op 6         Receives op 6
  Apply locally        Apply locally         Apply locally
  All see same state!
```

### Resync Protocol

When a client reconnects or falls behind:

1. Client calls `RequestMissedOperations(documentId, fromRevision)`
   - `fromRevision`: Last operation the client has applied

2. Server retrieves all operations with `ServerRevision > fromRevision`

3. Server sends each operation sequentially to the client

4. Server sends `ResyncComplete` signal to confirm

5. Client applies each operation to its local state

This ensures eventual consistency: a temporarily disconnected client will catch up and converge to the same state as all others.

## Trade-offs: CRDT vs Operational Transform

### Why CRDT?

✅ **Simpler reasoning**: State-based, clear causality
✅ **No central ordering required**: Works well with distributed systems
✅ **Easier to implement correctly**: Fewer edge cases than full OT
✅ **Good for collaborative editors**: Google Docs (OT), CRDTs like Yjs gaining popularity

### Why not full Operational Transform?

❌ **Complexity**: Requires careful handling of operation history and transformation properties
❌ **Ordering dependency**: Relies on total ordering of all operations globally
❌ **Difficult to verify**: More complex invariants to test

### The Hybrid Approach

LiveSync implements a **practical hybrid**:
- Uses **CRDT semantics** (state-based, position-based operations)
- Implements **OT transform logic** (resolve conflicts without re-applying)
- Maintains a **server-assigned total order** (via `ServerRevision`)

This combines benefits of both: simplicity of CRDTs with efficiency of OT.

## Limitations & Future Improvements

### Current Limitations

1. **Character-level granularity**: Operations are at the character level. Large pastes create many operations.
   - Future: Implement operation compression/batching

2. **Full operation log retention**: All operations stored in Redis indefinitely.
   - Future: Implement snapshotting (periodic document state save) + compaction

3. **Concurrent edit visualization**: Clients don't yet show concurrent editing cursors.
   - Future: Broadcast cursor positions from all active users

4. **Tombstone cleanup**: Deleted characters aren't truly removed, just marked.
   - Current design: This is fine for correctness; can optimize later

### Potential Enhancements

1. **Operation Compression**: Batch consecutive inserts at same position into single ops
2. **Snapshot + Delta**: Periodically snapshot document, discard old ops
3. **Rich Text Support**: Extend ops to handle formatting (bold, color, etc.)
4. **Presence Awareness**: Track which users are editing which parts
5. **Undo/Redo**: Store operation inverses for client-side undo

## Testing Strategy

### Unit Tests (`ConflictResolverTests`)

- ApplyOperation (Insert/Delete edge cases)
- TransformAgainstConcurrent (all 4 combinations)
- Determinism (A then B ≠ B then A, but final state is same)
- Integration scenarios (mixed operations, resync)

### Integration Tests (Future)

- Multi-client scenarios using `socket.io-client`
- Simulated network delays and reordering
- Reconnect and recovery scenarios against the realtime service

### Manual Testing

1. **Two clients, same doc**: One edits at start, other at end → verify no clobbering
2. **Reconnect**: Client disconnects mid-edit, reconnects → verify catch-up
3. **Rapid concurrent edits**: Many users editing rapidly → verify convergence

## Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| CRDT over OT | Easier to reason about; good enough for collaborative editors |
| Position-based ops | Natural fit for text editors; alternative: ID-based (Logoot) adds complexity |
| Server-assigned revision | Ensures total ordering; conflicts resolved deterministically |
| Redis operation log | Scales horizontally; survives Hub instance restarts |
| Transform on server | Reduces client complexity; server is single source of truth |
| Accept-transform model | Standard in collaborative editors; proven approach |

## References

- **Operational Transform**: [Operational Transformation](https://en.wikipedia.org/wiki/Operational_transformation)
- **CRDT**: [A comprehensive study of CRDT](https://arxiv.org/abs/1805.06358)
- **Google Docs approach**: Combines OT with rich features
- **Yjs (JS CRDT library)**: [Yjs GitHub](https://github.com/yjs/yjs)
- **RGA CRDT**: [RGA Reference](https://en.wikipedia.org/wiki/Replicated_data_type)

## Code Structure

```
livesync-realtime/src/
├── models/
│   ├── operation.ts              # Operation shape and IDs
│   └── operationId.ts            # Operation ID helpers
├── services/
│   ├── conflictResolver.ts       # Transform & apply logic
│   ├── operationLog.ts           # Redis-backed operation log
│   └── documentStateService.ts   # Document state and presence storage
└── sockets/
    └── editorSocket.ts           # JoinDocument, SendOperation, RequestMissedOperations
```

---

**Last Updated**: 2026
**Status**: Implemented & Tested ✅
