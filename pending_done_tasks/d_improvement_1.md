# System Architecture & Collaborative Editor Improvements

## Overview
This document outlines the architecture analysis and key engineering improvements for our collaborative online code editor and Web API execution environment.

---

## 1. Collaborative Code Editing Architecture

### WebSockets & Connection Multiplexing
Our real-time collaborative editing relies on WebSocket streaming for bi-directional state synchronization across active editor sessions. 

#### Current Challenge: Single Socket Per File
Opening an independent WebSocket connection for every opened file tab introduces severe resource inefficiencies:
* **Network Overhead:** High frequency of TCP 3-way handshakes, TLS negotiations, and HTTP upgrades on tab switches.
* **Server Resource Drain:** High memory consumption and file descriptor exhaustion on backend nodes.
* **Connection Throttling:** Hitting browser domain concurrent connection limits.
* **Keepalive Noise:** Multiplied ping/pong heartbeat traffic across idling file sockets.

#### Target Architecture: Application-Layer Multiplexing
Transitioning to a single persistent WebSocket per user session that multiplexes document streams via explicit payload metadata (`fileId` / `roomId`).

```json
{
  "fileId": "src/app/features/dashboard/dashboard.ts",
  "action": "edit",
  "version": 104,
  "changes": [...]
}
```

---

## 2. Web API Execution Infrastructure

The environment supports executing full-fledged Web API workloads for live testing:
* **Remote Container Runtimes:** Isolated cloud environments exposing HTTPS-proxied ports for external REST / GraphQL / WebSocket testing.
* **In-Browser Runtimes:** WebAssembly-based execution layers for zero-latency local request interception via Service Workers.

---

## 3. Implementation Roadmap & Tasks

### Tasks Pending to Implement

#### Feature:
- [x] Implement application-layer multiplexing over a single persistent WebSocket connection.
- [x] Add client-side socket manager to handle routing of document updates by `fileId`.
- [x] Implement backend pub/sub room subscriptions (`subscribe` / `unsubscribe` frames) for dynamic tab switching.

#### Bugs:
- [x] Fix string-matching replacement errors causing corruption during multi-block code edits.
- [x] Resolve memory leaks caused by unclosed WebSocket connections when closing editor tabs.
