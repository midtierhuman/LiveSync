# LiveSync Realtime Service (`livesync-realtime`)

## Overview

`livesync-realtime` is the high-performance realtime collaboration service.
It is built with Node.js 24, TypeScript, Express, Socket.IO 4.8, and Redis 7 (AOF enabled).

## Hybrid Write-Back Caching Architecture

1. **Sub-millisecond Realtime Sync:** As users type, every operation and cursor position updates **Redis** immediately and broadcasts to room collaborators via Socket.IO.
2. **Periodic & Disconnect Flushing:** Content is flushed to PostgreSQL periodically (every 30–60 seconds) or when the last active user leaves a document (`getUserCount === 0`).
3. **Crash Recovery:** Redis AOF (`--appendonly yes`) ensures un-flushed in-memory operations survive service restarts.

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
