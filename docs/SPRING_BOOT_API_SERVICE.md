# Spring Boot Core REST API (`livesync-api`)

The `livesync-api` microservice is built with **Java 21** and **Spring Boot 3**. It serves as the primary system of record for user accounts, authentication tokens, document and folder metadata, access control lists (ACLs), and asynchronous document persistence from Redis Streams into PostgreSQL.

---

## 🏗️ Core Responsibilities

1. **Authentication & Identity**:
   - Self-contained PBKDF2 with HMAC-SHA512 password hashing (`IdentityPasswordHasher`).
   - HMAC-SHA256 JWT generation and validation (`JwtService`, `JwtAuthenticationFilter`).
   - Account lockout security with automatic lockout window expiration.

2. **Hierarchical Document & Folder Management**:
   - Deep nested folder hierarchy traversal with cycle detection.
   - Cascading recursive deletion of subfolders, documents, and associated access shares.
   - Multi-tab document metadata retrieval and owner/shared permission evaluation (`Owner`, `Edit`, `View`).

3. **Share Code & Collaboration Access**:
   - Unique 10-character alphanumeric share codes (`generateShareCode`).
   - Case-insensitive, trimmed code joining (`/api/documents/add-shared` and `/api/folders/add-shared`).
   - Per-user granular permission overrides (`View` / `Edit`).

4. **Event-Driven Write-Behind Stream Consumer (`DocumentSaveStreamConsumer`)**:
   - Listens on Redis Stream `livesync:stream:document-saves` via consumer group `api-save-group`.
   - Flushes real-time snapshot content updates asynchronously into PostgreSQL without blocking collaborative socket loops.

---

## 🔌 Key REST API Endpoints

### Authentication (`/api/auth`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | User registration with email, password, and display username |
| `POST` | `/api/auth/login` | Login validating credentials and issuing JWT token |
| `GET` | `/api/auth/me` | Fetches authenticated user identity |

### Documents (`/api/documents`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/documents/my-documents` | Lists all documents owned by the caller |
| `GET` | `/api/documents/shared-with-me` | Lists all documents shared directly or via folder ACLs |
| `GET` | `/api/documents/{id}` | Fetches document details with permission metadata |
| `POST` | `/api/documents` | Creates a new document |
| `PUT` | `/api/documents/{id}` | Updates document title and content |
| `DELETE` | `/api/documents/{id}` | Deletes document and cleans up associated shares |
| `POST` | `/api/documents/{id}/generate-share-code` | Generates a new joinable share code |
| `POST` | `/api/documents/add-shared` | Joins a shared document using its share code |
| `PUT` | `/api/documents/{id}/shared/{userId}/access-level` | Updates access level for a specific collaborator |

### Folders (`/api/folders`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/folders/my-folders` | Returns root folder tree for the current user |
| `GET` | `/api/folders/shared-with-me` | Returns folders shared with the user |
| `GET` | `/api/folders/{id}` | Fetches folder contents (subfolders and files) |
| `POST` | `/api/folders` | Creates a new folder or nested subfolder |
| `PUT` | `/api/folders/{id}` | Renames folder |
| `DELETE` | `/api/folders/{id}` | Recursively deletes folder and all nested documents |
| `PUT` | `/api/folders/move-document/{documentId}` | Moves document between folders or to root |
| `PUT` | `/api/folders/move-folder/{folderId}` | Moves folder into a parent folder (with cycle protection) |
| `POST` | `/api/folders/add-shared` | Joins a shared folder via share code |

---

## ⚙️ Configuration & Environment

| Property | Default Value | Description |
| :--- | :--- | :--- |
| `server.port` | `8080` | Spring Boot HTTP port |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/livesync` | PostgreSQL database connection string |
| `spring.data.redis.host` | `localhost` | Redis host for stream consumer |
| `livesync.jwt.secret` | (Configured) | Shared HMAC-SHA secret for token parsing |

---

## 🛠️ Running Locally

```powershell
cd livesync-api
.\gradlew.bat bootRun
```
