# LiveSync Go API Service (`livesync-api`)

High-performance, lightweight REST API and persistence microservice for LiveSync, written in Go 1.26.

---

## ⚡ Overview
- **Language & Runtime**: Go 1.26
- **Routing**: `chi` v5 + CORS middleware
- **Database**: PostgreSQL 17-alpine via `pgxpool` connection pool
- **Persistence Consumer**: Redis Stream write-behind event listener (`livesync:stream:document-saves`)
- **Authentication**: JWT HS256 (`unique_name`, `email`, `sub`, `iss`, `aud`) + ASP.NET Identity v3 PBKDF2 HMAC-SHA512 password hashing

---

## 🚀 Key Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Registers a new user account with PBKDF2 hash
- `POST /api/auth/login` - Authenticates user, verifies password & issues JWT
- `GET /api/auth/me` - Validates Bearer token & returns current user claims
- `POST /api/auth/refresh` - Refresh token handler

### Documents (`/api/documents`)
- `GET /api/documents/my-documents` - Retrieves all owned documents
- `GET /api/documents/shared-with-me` - Retrieves documents shared with user
- `GET /api/documents/{id}` - Retrieves a document if user has read permissions
- `GET /api/documents/{id}/access` - Returns access level (`View` / `Edit`)
- `POST /api/documents` - Creates a new document
- `PUT /api/documents/{id}` - Updates document title / content
- `PUT /api/documents/{id}/content` - Updates document content
- `DELETE /api/documents/{id}` - Deletes a document (owner only)
- `POST /api/documents/{id}/generate-share-code` - Generates 10-char share code
- `GET /api/documents/share/{code}` - Retrieves document by share code
- `POST /api/documents/add-shared` - Joins document using share code
- `DELETE /api/documents/{id}/shared/{sharedUserId}` - Revokes share access
- `PUT /api/documents/{id}/shared/{sharedUserId}/access-level` - Updates collaborator permission
- `PUT /api/documents/{id}/share-code-access-level` - Updates default share code permission

### Folders (`/api/folders`)
- `GET /api/folders/my-folders` - Retrieves root folders and nested folder tree
- `GET /api/folders/shared-with-me` - Retrieves shared folder descriptors
- `GET /api/folders/shared-with-me/details` - Retrieves shared folders with contents
- `GET /api/folders/share/{code}` - Retrieves folder by share code
- `POST /api/folders` - Creates a folder or subfolder
- `PUT /api/folders/{id}` - Renames a folder
- `DELETE /api/folders/{id}` - Recursively deletes folder, subfolders, and documents
- `PUT /api/folders/move-document/{documentId}` - Moves document to a folder or root
- `PUT /api/folders/move-folder/{folderId}` - Moves folder with circular hierarchy prevention
- `POST /api/folders/add-shared` - Joins folder by share code

---

## 🛠️ Local Development & Testing

```powershell
# Run tests
go test -v ./...

# Build binary
go build -v .

# Run locally
go run main.go
```
