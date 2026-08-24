# 🗄️ LiveSync Core REST API & Persistence Service (`livesync-api`)

High-performance, lightweight identity, RBAC authorization, and persistence microservice written in **Go 1.26**.

---

## ⚡ Overview & Architecture

1. **PostgreSQL 17 Storage & `pgxpool`**:
   - Connection pool management with statement preparation caching and automatic transient retry.
   - Recursive CTE manifest engine reconstructing directory hierarchies in a single database roundtrip.

2. **Redis Stream Write-Behind Persistence Consumer**:
   - Asynchronously consumes save events from `livesync:stream:document-saves` (`XREADGROUP`) and persists batches to PostgreSQL without blocking real-time collaborative sockets.

3. **Storage Quota Guard & Dependency Shield (`ARCH-13`)**:
   - Enforces strict project storage boundaries: maximum 30 files per project, 256 KB per file, and a 2 MB total workspace limit.
   - Hard dependency shield rejecting `node_modules`, `.venv`, and binary blobs from entering relational storage.

4. **Multi-Tier Token Bucket Rate Limiting (`SEC-05`)**:
   - Dedicated authentication rate limiter on `/api/auth/*` (5 req/sec, burst: 10) to eliminate brute-force and credential stuffing attacks.
   - Global database route protection (100 req/sec, burst: 200).

5. **Hierarchical Access Control (ACL Overrides)**:
   - Folder-level permission inheritance with granular document-level overrides (`Owner`, `Edit`, `View`).

---

## 📡 Key REST Endpoints (Port `8080`)

### Authentication (`/api/auth`)
- `POST /api/auth/register` - User registration with PBKDF2 hash
- `POST /api/auth/login` - User authentication and JWT issuance
- `GET /api/auth/me` - Validates Bearer token & returns active user claims

### Documents (`/api/documents`)
- `GET /api/documents/my-documents` - Owned document catalog
- `GET /api/documents/shared-with-me` - Shared documents
- `GET /api/documents/{id}` - Document content & metadata
- `GET /api/documents/{id}/access` - Access level check (`View`, `Edit`, `Owner`)
- `POST /api/documents` - Create new document (Quota Guard validated)
- `PUT /api/documents/{id}` - Rename / update document
- `DELETE /api/documents/{id}` - Delete document (Owner only)
- `POST /api/documents/{id}/generate-share-code` - Generate 10-char share code
- `POST /api/documents/add-shared` - Join document via share code

### Folders & Projects (`/api/folders`)
- `GET /api/folders/my-folders` - Root and nested folder tree
- `GET /api/folders/{id}/manifest` - Bulk zero-N+1 project manifest hydration
- `GET /api/folders/{id}/access` - Folder/project access level check
- `POST /api/folders` - Create project/folder
- `DELETE /api/folders/{id}` - Cascading deletion of project hierarchy

---

## 🛠️ Local Development & Testing

```bash
# Run unit & security test suite
go test ./...

# Build binary
go build -v .

# Run service
go run main.go
```
