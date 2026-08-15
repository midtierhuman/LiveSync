# Go Core REST API (`livesync-api`)

The `livesync-api` microservice is built with **Go 1.26** and **chi v5**. It serves as the primary high-performance system of record for user accounts, authentication tokens, document and folder metadata, access control lists (ACLs), and asynchronous write-behind document persistence from Redis Streams into PostgreSQL.

---

## 🏗️ Core Responsibilities

1. **Authentication & Identity**:
   - Self-contained PBKDF2 with HMAC-SHA512 password hashing (`PasswordHasher`).
   - HMAC-SHA256 JWT generation and validation (`JWTService`, `AuthMiddleware`).
   - Account lockout security with automatic lockout window expiration.

2. **Hierarchical Document & Folder Management (Project Containment Rule)**:
   - Enforces "Every file belongs to a folder/project" workspace containment rule across creation and migrations.
   - Automatically provisions an initial user project workspace folder (`Main Project`) if a document is created without an explicit folder ID.
   - Deep nested folder hierarchy traversal with cycle detection.
   - Cascading recursive deletion of subfolders, documents, and associated access shares.
   - Multi-tab document metadata retrieval and owner/shared permission evaluation (`Owner`, `Edit`, `View`).

3. **Share Code & Collaboration Access**:
   - Unique 10-character alphanumeric share codes (`generateShareCode`).
   - Case-insensitive, trimmed code joining (`/api/documents/add-shared` and `/api/folders/add-shared`).
   - Per-user granular permission overrides (`View` / `Edit`).

4. **Event-Driven Write-Behind Stream Consumer (`DocumentSaveStreamConsumer`)**:
   - Listens on Redis Stream `livesync:stream:document-saves` via consumer group `api-save-group`.
   - Flushes real-time snapshot content updates asynchronously into PostgreSQL via `pgxpool` without blocking collaborative socket loops.

5. **Monotonic Read-Through Caching (`DocumentService.toDto`)**:
   - Inspects active Redis document keys (`livesync:doc:{id}:content`) during document fetch queries (`GET /api/documents/{id}`).
   - Guarantees immediate read-after-write consistency even before asynchronous Redis Stream write-behind flushes complete.

---

## 🔌 Key REST API Endpoints

### Authentication (`/api/auth`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | User registration with email, password, and display username |
| `POST` | `/api/auth/login` | Login validating credentials and issuing JWT token |
| `GET` | `/api/auth/me` | Fetches authenticated user identity |
| `POST` | `/api/auth/refresh` | Refresh token handler |

### Documents (`/api/documents`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/documents/my-documents` | Lists all documents owned by the caller |
| `GET` | `/api/documents/shared-with-me` | Lists all documents shared directly or via folder ACLs |
| `GET` | `/api/documents/{id}` | Fetches document details with permission metadata |
| `GET` | `/api/documents/{id}/access` | Returns user access level (`View` / `Edit`) |
| `POST` | `/api/documents` | Creates a new document |
| `PUT` | `/api/documents/{id}` | Updates document title and content |
| `PUT` | `/api/documents/{id}/content` | Updates document content |
| `DELETE` | `/api/documents/{id}` | Deletes document and cleans up associated shares |
| `POST` | `/api/documents/{id}/generate-share-code` | Generates a new joinable share code |
| `GET` | `/api/documents/share/{code}` | Retrieves document by share code |
| `POST` | `/api/documents/add-shared` | Joins a shared document using its share code |
| `DELETE` | `/api/documents/{id}/shared/{userId}` | Revokes share access |
| `PUT` | `/api/documents/{id}/shared/{userId}/access-level` | Updates access level for a specific collaborator |
| `PUT` | `/api/documents/{id}/share-code-access-level` | Updates default share code permission |

### Folders (`/api/folders`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/folders/my-folders` | Returns root folder tree for the current user |
| `GET` | `/api/folders/shared-with-me` | Returns folders shared with the user |
| `GET` | `/api/folders/shared-with-me/details` | Returns folders shared with the user including nested contents |
| `GET` | `/api/folders/{id}` | Fetches folder contents (subfolders and files) |
| `GET` | `/api/folders/share/{code}` | Retrieves folder by share code |
| `POST` | `/api/folders` | Creates a new folder or nested subfolder |
| `PUT` | `/api/folders/{id}` | Renames folder |
| `DELETE` | `/api/folders/{id}` | Recursively deletes folder and all nested documents |
| `PUT` | `/api/folders/move-document/{documentId}` | Moves document between folders or to root |
| `PUT` | `/api/folders/move-folder/{folderId}` | Moves folder into a parent folder (with cycle protection) |
| `POST` | `/api/folders/add-shared` | Joins a shared folder via share code |
| `POST` | `/api/folders/{id}/generate-share-code` | Generates a new share code for the folder |
| `DELETE` | `/api/folders/{id}/shared/{userId}` | Revokes folder share access for a collaborator |
| `PUT` | `/api/folders/{id}/shared/{userId}/access-level` | Updates access level (`View`/`Edit`) for a collaborator |
| `PUT` | `/api/folders/{id}/share-code-access-level` | Updates default join permission for the folder share code |

---

## ⚙️ Configuration & Environment

| Property | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | HTTP listening port |
| `LIVESYNC_DATABASE_URL` | `postgres://devuser:devpassword@localhost:5432/livesync?sslmode=disable` | PostgreSQL database connection string |
| `LIVESYNC_REDIS_URL` | `redis://:LocalDevPassword123!@localhost:6379/0` | Redis connection for stream consumer |
| `LIVESYNC_JWT_SECRET` | (Configured) | Shared HMAC-SHA secret for token parsing |
| `LIVESYNC_JWT_ISSUER` | `LiveSyncAuthAPI` | Expected JWT issuer |
| `LIVESYNC_JWT_AUDIENCE` | `LiveSyncClient` | Expected JWT audience |

---

## 🛠️ Running Locally & Testing

```powershell
cd livesync-api

# Run test suite
go test -v ./...

# Build binary
go build -v .

# Run service
go run main.go
```
