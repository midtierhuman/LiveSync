# LiveSync Readiness Checklist

Goal: make LiveSync easier to scale, test, and explain in interviews across its current stack:
Angular frontend, Java auth/document API, Node realtime service, and Python sandbox.

## 1. Realtime scaling

- [ ] Keep document presence and content in Redis
- [ ] Verify the realtime service can run on multiple instances
- [ ] Confirm reconnect/resync works after a dropped socket
- [ ] Document the Socket.IO event flow and access checks

## 2. Conflict handling

- [ ] Keep transform logic isolated in `conflictResolver.ts`
- [ ] Add tests for insert/delete edge cases
- [ ] Validate out-of-order operation replay
- [ ] Write a short explanation of why the chosen merge strategy works

## 3. Persistence and durability

- [ ] Confirm document snapshots are persisted by the Java API
- [ ] Verify startup behavior when the database is empty or missing schema
- [ ] Make sure production uses explicit schema management, not hidden startup magic

## 4. Automated testing

- [ ] Add API tests for auth and document access rules
- [ ] Add realtime tests with `socket.io-client`
- [ ] Add sandbox tests for supported execution languages
- [ ] Wire the build/test steps into CI

## 5. Observability

- [ ] Add health checks for the API, realtime service, and sandbox
- [ ] Add structured logs with documentId, userId, and connectionId
- [ ] Add metrics for active users, active documents, and message latency

## 6. Security and resilience

- [ ] Rate-limit sensitive realtime actions
- [ ] Re-check access on reconnect and before edit operations
- [ ] Keep secrets in environment variables or secret managers
- [ ] Validate payload size and content before broadcasting

## 7. Deployment hygiene

- [ ] Document how to run the Java API, Node realtime service, and Python sandbox locally
- [ ] Add CI steps for each service
- [ ] Keep deployment notes aligned with the actual ports and environment variables

## 8. Presentation

- [ ] Add a current architecture diagram
- [ ] Summarize why each language/framework was chosen
- [ ] Document current limitations and future work
