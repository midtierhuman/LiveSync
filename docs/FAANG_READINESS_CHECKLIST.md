# LiveSync FAANG Readiness Checklist

Goal: Ensure LiveSync is architected, tested, scalable, and fully documented for Tier-1 / FAANG technical interview screenings across its polyglot stack:
**Angular Frontend**, **Java Auth & Document API**, **Node Realtime Service**, and **Python Sandbox Engine**.

---

## 1. Realtime Scaling & Architecture

- [x] **Keep document presence and content in Redis**: Configured Redis Pub/Sub adapter for real-time room broadcasting.
- [x] **Verify the realtime service can run on multiple instances**: Multi-node horizontal scaling supported via Redis adapter backplane.
- [x] **Confirm reconnect/resync works after a dropped socket**: Frontend real-time service automatically re-establishes connection and syncs latest document state.
- [x] **Document the Socket.IO event flow and access checks**: Documented in `docs/README.md` and `docs/backend/signalr/`.

## 2. Conflict Handling & Merging

- [x] **Keep transform logic isolated**: Positional transformation logic encapsulated in frontend realtime service.
- [x] **Add tests for insert/delete edge cases**: Operational positional transforms tested for concurrent user keystrokes.
- [x] **Validate out-of-order operation replay**: Versioning and revision counters prevent out-of-order state corruption.
- [x] **Write a short explanation of why the chosen merge strategy works**: Detailed explanation in [`docs/CONFLICT_RESOLUTION_DESIGN.md`](./CONFLICT_RESOLUTION_DESIGN.md).

## 3. Persistence and Durability

- [x] **Confirm document snapshots are persisted by the Java API**: `updateContent` endpoint in Java Spring Boot API persists snapshots to PostgreSQL.
- [x] **Verify startup behavior when the database is empty or missing schema**: Handled automatically via Flyway database migration scripts.
- [x] **Make sure production uses explicit schema management**: Versioned SQL migrations in `livesync-api/src/main/resources/db/migration/`.

## 4. Automated Testing & AST Engine

- [x] **Add API tests for auth and document access rules**: Spring Boot integration tests for RBAC, JWT, and document endpoints.
- [x] **Add realtime tests**: Real-time event broadcasting verified via Socket.IO test suite.
- [x] **Add sandbox tests for supported execution languages**: Python, Node.js, and C# execution tests in `livesync-sandbox`.
- [x] **AST Complexity Analysis**: AST parsing engine in `livesync-sandbox` tested for Time ($\mathcal{O}(N)$, $\mathcal{O}(N^2)$) and Space complexity.

## 5. Observability & Telemetry

- [x] **Add health checks for all services**:
  - Java API: `/actuator/health`
  - Realtime Service: `/health`
  - Python Sandbox: `/health`
- [x] **Add structured logs with documentId, userId, and connectionId**: Correlation IDs attached across API requests and socket sessions.
- [x] **Add Prometheus metrics**: CPU time, peak memory usage, and execution counters exposed at `/metrics`.

## 6. Security and Resilience

- [x] **Rate-limit sensitive realtime actions**: Execution limits and request throttling configured.
- [x] **Re-check access on reconnect and before edit operations**: Backend re-validates user permissions before processing edits or starting execution.
- [x] **Keep secrets in environment variables**: Environment variables configured in `.env` and `docker-compose.yml`.
- [x] **Validate payload size and content before broadcasting**: Payload bounds enforced on API & WebSocket input endpoints.

## 7. Deployment Hygiene & Setup

- [x] **Document local execution setup**: Documented in root `README.md` and automated via `run-dev.ps1`.
- [x] **Containerize microservices**: Multi-container `docker-compose.yml` configured with Nginx reverse proxy.
- [x] **Align deployment notes with actual ports**:
  - Frontend: `4200` / `80`
  - Java API: `5038`
  - Node Realtime: `3000`
  - Python Sandbox: `4000`
  - PostgreSQL: `5432`
  - Redis: `6379`

## 8. System Presentation & Interview Readiness

- [x] **Add a current architecture diagram**: Full diagram included in root [`README.md`](../README.md).
- [x] **Summarize why each language/framework was chosen**: Rationale documented in root [`README.md`](../README.md) and design docs.
- [x] **Document current limitations and future work**: Documented in [`docs/PROJECT_ROADMAP.md`](./PROJECT_ROADMAP.md).
