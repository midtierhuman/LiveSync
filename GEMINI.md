# LiveSync Agent & Gemini Engineering Instructions

## 📌 Project Overview
LiveSync is a high-performance, real-time collaborative code editor built on a decoupled polyglot microservices architecture:
- **`livesync-ui`**: Angular 22 (Zoneless signals, CodeMirror 6, xterm.js).
- **`livesync-gateway`**: Go 1.26 (PTY live terminal, WebSocket streaming, JWT auth, direct npm/PyPI package search, gRPC client pool).
- **`livesync-ai`**: Python 3.14 (Pure native gRPC server on port `50051`, AST Big-O complexity analyzer, hybrid AI code assistant).
- **`livesync-api`**: Go 1.26 (PostgreSQL storage via pgxpool, identity & RBAC, Redis Stream write-behind persistence consumer).
- **`livesync-realtime`**: Node.js 24 + Socket.IO 4.8 (CRDT & OT conflict resolution, presence, Redis adapter).

---

## 🚨 MANDATORY RULE: Continuous Documentation & README Synchronization

> **CRITICAL INSTRUCTION**: Whenever you make **ANY** change to the codebase (such as updating endpoints, ports, models, protocols, conflict algorithms, database schemas, dependencies, Docker configurations, or service logic), you **MUST** immediately update the relevant documentation in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/PROJECT_ROADMAP.md`](./docs/PROJECT_ROADMAP.md), and [`README.md`](./README.md).

### Documentation Maintenance Checklist
Every code modification must be reflected across corresponding documentation:
1. **Root [`README.md`](./README.md)**: Keep architecture diagrams, port mappings, microservice registry, and quick-start commands accurate.
2. **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)**: Master architecture document covering microservices topography, gRPC/WebSocket/REST protocols, mathematical OT/CRDT conflict resolution ($TP_1$), Quota Guard, dependency shields, and competitive analysis.
3. **[`docs/PROJECT_ROADMAP.md`](./docs/PROJECT_ROADMAP.md)**: Keep backlog, active milestones, completed task history, and DoD test verification matrix synchronized.

---

## 📋 MANDATORY RULE: Roadmap-First & User-Approval Agile Workflow

### 1. Milestone Capacity & Structure Limits
- Each milestone can contain a maximum of **6 total tasks** (regardless of task category: Features `FEAT`, Bug Fixes `BUG`, Performance Optimizations `PERF`, or Architecture `ARCH`).
- Once the active milestone reaches 6 total tasks, you **MUST** create a new milestone (e.g., `Milestone N+1`) and place subsequent tasks there.

### 2. Standardized Task Proposal & User Approval
- **Always update the Roadmap before writing code**: Whenever you are about to implement a new feature, fix a bug, optimize performance, or make architectural changes, you **MUST** first add the task to [`docs/PROJECT_ROADMAP.md`](./docs/PROJECT_ROADMAP.md) (in the backlog tracker and active milestone).
- **Do NOT start implementing code immediately after adding the task**: You **MUST** first present the proposed plan to the user using the standardized format:
  - **Task ID & Title**: (e.g., `FEAT-08: Workspace-Wide Multi-File Search`)
  - **Target Milestone**: (e.g., `Milestone 12`)
  - **Affected Microservices**: (e.g., `livesync-ui`, `livesync-gateway`)
  - **Acceptance Criteria**: Concrete Given-When-Then behavioral expectations.
  - **Execution Plan**: Step-by-step implementation summary.
- Wait for the user's explicit confirmation/agreement before writing or editing any codebase files.

### 3. Definition of Done (DoD) & Milestone Release Gate
- A task is ONLY marked as completed (`✅ Done`) in [`docs/PROJECT_ROADMAP.md`](./docs/PROJECT_ROADMAP.md) when:
  1. All target service test suites pass cleanly.
  2. Production bundle builds succeed (`npm run build`, `go build`, etc.).
  3. All documentation in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/PROJECT_ROADMAP.md`](./docs/PROJECT_ROADMAP.md), and [`README.md`](./README.md) is synchronized.
- When an active milestone reaches **6/6 tasks completed (`✅ Done`)**:
  - Run the full verification matrix across all 5 polyglot microservices.
  - Mark the milestone as `COMPLETED ✅` and transition the next milestone to `ACTIVE 🔄`.

---

## 🧪 Testing & Quality Assurance
- Never consider a task complete without running and verifying test suites across modified services:
  - **Angular**: `npm test -- --watch=false` and `npm run build`
  - **Python AI (`livesync-ai`)**: `.\venv\Scripts\python -m pytest`
  - **Go Gateway**: `go test ./...` and `go build -v .`
  - **Go API (`livesync-api`)**: `cd livesync-api && go test ./...` and `go build -v .`
  - **Node Realtime**: `npm test` and `npm run build`
