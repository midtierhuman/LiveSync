# LiveSync Realtime Service

## Overview

`livesync-realtime` is the realtime collaboration service.
It is built with Node.js, TypeScript, Express, Socket.IO, Redis, and KafkaJS.

## Responsibilities

- Join and leave document rooms
- Broadcast content updates
- Broadcast cursor positions
- Track missed operations and document state in Redis
- Validate document access through the auth API

## Events

The service accepts both camelCase and PascalCase event names for compatibility.

- `JoinDocument` / `joinDocument`
- `LeaveDocument` / `leaveDocument`
- `SendContentUpdate` / `sendContentUpdate`
- `SendOperation` / `sendOperation`
- `RequestMissedOperations` / `requestMissedOperations`
- `SendCursorPosition` / `sendCursorPosition`

## Development

### Prerequisites

- Node.js 20 or later
- Redis
- Running `livesync-api`

### Run locally

```bash
cd backend/livesync/livesync-realtime
npm install
npm run dev
```

The service listens on port `5000` by default.

## Configuration

- `PORT`
- `API_BASE_URL`
- `REDIS_URL`

## Health check

- `GET /health`
