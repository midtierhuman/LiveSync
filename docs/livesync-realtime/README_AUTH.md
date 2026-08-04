# Realtime Authentication & Access Control (`livesync-realtime`)

## Overview

`livesync-realtime` validates user identity and authorization against `livesync-api` before allowing users to join document rooms or broadcast edits.

## Authentication Flow

1. Client acquires a JWT token from `livesync-api` via `/api/auth/login`.
2. Client connects to `livesync-realtime` over Socket.IO, supplying the JWT token in `auth.token` or `query.access_token`.
3. `livesync-realtime` calls `livesync-api` (`/api/documents/{id}`) to verify that the user has `View` or `Edit` permissions (including inherited folder permissions) before joining the Socket.IO room.
