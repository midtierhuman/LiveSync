# Realtime Collaboration Engine (`livesync-realtime`)

The `livesync-realtime` microservice handles low-latency room-based document editing, multi-cursor presence, and Operational Transformation (OT) conflict resolution.

---

## 🛠️ Stack & Mechanics

- **Runtime**: Node.js 24, TypeScript.
- **Engine**: Socket.IO 4.8.
- **Backplane**: Redis Pub/Sub & Redis Streams (`livesync:stream:document-saves`).

---

## 🔄 Event Lifecycle & Persistence

1. **Client Connection**: Authenticates via JWT token on Socket.IO connection.
2. **Room Joining**: `join-document` subscribes client to document room key `doc:{documentId}`.
3. **Operation Broadcast**: Transmits CodeMirror 6 operation changes (`op` payload) and remote cursor positions to all room participants.
4. **Persistence Stream**: Emits `XADD` event to Redis Stream `livesync:stream:document-saves`. Java API (`livesync-api`) consumes stream and saves snapshots into PostgreSQL.
