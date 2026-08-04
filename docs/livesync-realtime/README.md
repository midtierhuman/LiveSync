# LiveSync Realtime Service (`livesync-realtime`)

## Overview

`livesync-realtime` is the high-performance realtime collaboration service.
It is built with Node.js 24, TypeScript, Express, Socket.IO 4.8, and Redis 7 (AOF enabled).

## Event-Driven Write-Behind Architecture (Redis Streams)

1. **Sub-millisecond Realtime Sync:** As users type, every operation and cursor position updates **Redis** immediately in RAM and broadcasts to room collaborators via Socket.IO.
2. **Asynchronous Stream Log (`publishSaveEvent`):** On a periodic 60-second timer or room disconnect (`activeCount === 0`), `livesync-realtime` publishes an event (`XADD`) to the Redis Stream `livesync:stream:document-saves`.
3. **Decoupled Database Persistence:** `livesync-api` reads from consumer group `api-save-group` and persists changes to PostgreSQL asynchronously, eliminating database write locks and HTTP latency.
4. **Crash Recovery:** Redis AOF (`--appendonly yes`) ensures un-flushed stream events survive service restarts.

## Responsibilities

- Join and leave document rooms
- Broadcast real-time content updates and cursor positions
- Operational Transform (OT) conflict resolution
- Track document state, presence, and revision logs in Redis
- Validate document & folder access through `livesync-api`

## Events

The service accepts both camelCase and PascalCase event names for compatibility:

- `JoinDocument` / `joinDocument`
- `LeaveDocument` / `leaveDocument`
- `SendContentUpdate` / `sendContentUpdate`
- `SendOperation` / `sendOperation`
- `RequestMissedOperations` / `requestMissedOperations`
- `SendCursorPosition` / `sendCursorPosition`

## Development

### Prerequisites

- Node.js 24+
- Redis 7+
- Running `livesync-api`

### Run Locally

```bash
cd livesync-realtime
npm install
npm run dev
```

The service listens on port `5000` by default.

## Configuration

- `PORT` (default: `5000`)
- `API_BASE_URL` (default: `http://localhost:8080`)
- `REDIS_URL` (default: `redis://localhost:6379`)

## Health Check

- `GET /health`
