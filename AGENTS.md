# LiveSync Agent Instructions & Engineering Rules

## 📌 Project Overview
LiveSync is a high-performance, real-time collaborative code editor built on a decoupled polyglot microservices architecture:
- **`livesync-ui`**: Angular 22 (Zoneless signals, CodeMirror 6, xterm.js).
- **`livesync-gateway`**: Go 1.26 (PTY live terminal, WebSocket streaming, JWT auth, direct npm/PyPI package search, gRPC client pool, Token Bucket rate limiting).
- **`livesync-ai`**: Python 3.14 (Pure native gRPC server on port `50051`, continuous token streaming, AST Big-O complexity analyzer, hybrid AI code assistant).
- **`livesync-api`**: Go 1.26 (PostgreSQL storage via pgxpool, identity & RBAC, Redis Stream write-behind persistence consumer, Quota Guard).
- **`livesync-realtime`**: Node.js 24 + Socket.IO 4.8 (CRDT & OT conflict resolution, presence, Redis adapter).

---

## 🚨 MANDATORY RULE: Continuous Documentation & README Synchronization

> **CRITICAL INSTRUCTION**: Whenever you make **ANY** change to the codebase (such as updating endpoints, ports, models, protocols, conflict algorithms, database schemas, dependencies, Docker configurations, or service logic), you **MUST** immediately update the relevant documentation in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`README.md`](./README.md), and corresponding service `README.md` files.

### Documentation Maintenance Checklist
Every code modification must be reflected across corresponding documentation:
1. **Root [`README.md`](./README.md)**: Keep architecture diagrams, port mappings, microservice registry, and quick-start commands accurate.
2. **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)**: Master architecture document covering microservices topography, gRPC/WebSocket/REST protocols, mathematical OT/CRDT conflict resolution ($TP_1$), Quota Guard, dependency shields, and competitive analysis.
3. **Service `README.md` Files**: Keep [`livesync-gateway/README.md`](./livesync-gateway/README.md), [`livesync-ai/README.md`](./livesync-ai/README.md), [`livesync-api/README.md`](./livesync-api/README.md), [`livesync-realtime/README.md`](./livesync-realtime/README.md), and [`livesync-ui/README.md`](./livesync-ui/README.md) synchronized with local route definitions, RPCs, and testing instructions.

---

## 📋 MANDATORY RULE: GitHub-First & User-Approval Agile Workflow

### 1. Single Source of Truth: GitHub Issues & Milestones
- All backlogs, active milestones, and task statuses are tracked **directly in GitHub** ([`github.com/subhadipnayek/LiveSync`](https://github.com/subhadipnayek/LiveSync)) via the GitHub CLI (`gh`).
- Each milestone can contain a maximum of **6 total tasks** (regardless of category: Features `FEAT`, Bug Fixes `BUG`, Performance `PERF`, Security `SEC`, Architecture `ARCH`, or Testing `TEST`).
- When an active milestone reaches 6 tasks, create a new milestone (e.g., `Milestone N+1`).

### 2. Standardized Task Proposal & User Approval
- **Always verify/create the GitHub Issue before writing code**: Whenever you are about to implement a new feature, fix a bug, optimize performance, or make architectural changes, identify or create the GitHub Issue (`gh issue create`).
- **Do NOT start implementing code immediately**: You **MUST** first present the proposed plan to the user using the standardized format:
  - **Issue #, Task ID & Title**: (e.g., `Issue #38: ARCH-09: Universal Error Boundary & Polyglot Microservice Health Telemetry`)
  - **Target Milestone**: (e.g., `Milestone 19: Enterprise Resilience, Security Throttling & Chaos Verification`)
  - **Affected Microservices**: (e.g., `livesync-gateway`, `livesync-api`, `livesync-ui`)
  - **Acceptance Criteria**: Concrete Given-When-Then behavioral expectations.
  - **Execution Plan**: Step-by-step implementation summary.
- Wait for the user's explicit confirmation/agreement before writing or editing any codebase files.

### 3. Definition of Done (DoD) & Milestone Release Gate
- A task is ONLY marked as completed when:
  1. All target service test suites pass cleanly.
  2. Production bundle builds succeed (`npm run build`, `go build`, etc.).
  3. All documentation in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`README.md`](./README.md), and service READMEs is updated.
  4. The GitHub Issue is directly closed via `gh issue close <issue_number>`.
- When an active milestone reaches **6/6 tasks completed**:
  - Run the full verification matrix across all 5 polyglot microservices.
  - Close the milestone in GitHub via `gh api`.

---

## 🧪 Testing & Quality Assurance
- Never consider a task complete without running and verifying test suites across modified services:
  - **Angular (`livesync-ui`)**: `npm test -- --watch=false` and `npm run build`
  - **Python AI (`livesync-ai`)**: `.venv/bin/python -m pytest`
  - **Go Gateway (`livesync-gateway`)**: `go test ./...` and `go build -v .`
  - **Go API (`livesync-api`)**: `cd livesync-api && go test ./...` and `go build -v .`
  - **Node Realtime (`livesync-realtime`)**: `npm test` and `npm run build`
