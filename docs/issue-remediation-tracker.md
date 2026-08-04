# LiveSync Issue Remediation Tracker

Last updated: 2026-08-04

## Resolved

| ID | Issue | Resolution |
|---|---|---|
| SEC-001 | Unauthenticated sandbox execution endpoints | Added JWT validation for `POST /api/execution/run`, `WS /api/execution/stream`, and `POST /api/ai/analyze` in `livesync-sandbox` using shared JWT secret/issuer/audience settings. |
| SEC-002 | Sandbox container running as root | Hardened `livesync-sandbox/Dockerfile` to run as non-root user (`sandbox`, uid `10001`). |
| SEC-003 | Realtime CORS allowed any origin with credentials | Replaced permissive CORS with strict allowlist parsing from `CORS_ALLOWED_ORIGINS` for both Express and Socket.IO in `livesync-realtime/src/index.ts`. |
| SEC-004 | JWT in realtime WebSocket query string | Removed query-token usage in realtime client/server; switched to Socket.IO `auth.token` handshake (`realtime.service.ts`, `editorHub.ts`). |
| SEC-005 | Unbounded execution timeout (DoS risk) | Added timeout caps (`max_timeout_ms`) and enforced bounds in request model/service and streaming execution path. |
| SEC-006 | Internal exception leakage over execution WS | Replaced raw exception payloads with generic client error message; server now logs detailed failure internally. |
| SEC-007 | Hardcoded secrets in `docker-compose.yml` | Replaced inline secrets with environment variable references and added required keys to `.env.example`. |
| BUG-001 | Document write-back token keyed only by document | Refactored token tracking to per-document/per-socket mapping with preferred last-editor token selection in `editorHub.ts`. |
| BUG-002 | Misleading fallback execution metrics | Removed fake `1MB` memory fallback and aligned metrics capture flow to avoid hardcoded inaccurate values. |
| OPS-001 | `docker-compose up --build` failing for sandbox | Switched .NET install in `livesync-sandbox/Dockerfile` from Microsoft apt repository to `dotnet-install.sh`, fixing signature verification build failures. |
| QA-001 | Python execution regression report | Verified and covered with a sandbox test using the number guessing program (`livesync-sandbox/tests/test_number_guessing_execution.py`) and confirmed successful execution path. |
| TEST-001 | Missing quick pre-deploy checks per project | Added per-project smoke tests and an aggregate runner script: `run-predeploy-tests.ps1` (API, realtime, sandbox, UI). |

## Unresolved

| ID | Issue | Status | Notes |
|---|---|---|---|
| DEP-001 | Deprecated transitive packages in UI lockfile (`glob@7`, `inflight`, `rimraf@3`) | Pending | These are pulled by `karma@6.4.x`. Full resolution requires upgrading/replacing the test runner dependency chain rather than a safe local patch. |

## Files Changed

- `livesync-sandbox/requirements.txt`
- `livesync-sandbox/app/config.py`
- `livesync-sandbox/app/services/auth_service.py`
- `livesync-sandbox/app/routers/execution.py`
- `livesync-sandbox/app/routers/ai.py`
- `livesync-sandbox/app/models/execution.py`
- `livesync-sandbox/app/services/executor_service.py`
- `livesync-sandbox/app/services/streaming_executor.py`
- `livesync-sandbox/app/services/metrics.py`
- `livesync-sandbox/app/services/executors/python_executor.py`
- `livesync-sandbox/app/services/executors/node_executor.py`
- `livesync-sandbox/app/services/executors/java_executor.py`
- `livesync-sandbox/app/services/executors/csharp_executor.py`
- `livesync-sandbox/Dockerfile`
- `livesync-ui/src/app/services/execution-stream.service.ts`
- `livesync-ui/src/app/services/realtime.service.ts`
- `livesync-realtime/src/index.ts`
- `livesync-realtime/src/hubs/editorHub.ts`
- `livesync-realtime/src/hubs/editorHub.test.ts`
- `docker-compose.yml`
- `.env.example`
- `.env`
- `livesync-sandbox/tests/test_number_guessing_execution.py`
- `livesync-ui/src/app/services/execution-stream.service.spec.ts`
- `livesync-realtime/package.json`
- `run-predeploy-tests.ps1`
