# LiveSync API (`livesync-api`)

## Overview

`livesync-api` is the Java backend service for authentication, document management, and folder structure management.
It is built with Java 21, Spring Boot 3, Spring Security, Spring Data JPA, and PostgreSQL 18.

## Responsibilities

- User registration, login, and JWT authentication
- Document CRUD, title, content updates, and revision history
- Folder CRUD, nested folder hierarchy, and document organization
- Share code generation, permissions (View / Edit), and RBAC access enforcement
- Execution language discovery for the sandbox
- **Redis Streams Consumer (`DocumentSaveStreamConsumer.java`)**: Asynchronously consumes document save events (`api-save-group`) off `livesync:stream:document-saves` and persists changes into PostgreSQL.

## Key Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Documents

- `GET /api/documents/my-documents`
- `GET /api/documents/shared-with-me`
- `GET /api/documents/execution-languages`
- `GET /api/documents/{id}`
- `POST /api/documents`
- `PUT /api/documents/{id}`
- `PUT /api/documents/{id}/content`
- `DELETE /api/documents/{id}`
- `POST /api/documents/{id}/generate-share-code`
- `GET /api/documents/share/{code}`
- `POST /api/documents/add-shared`

### Folders

- `GET /api/folders/my-folders`
- `GET /api/folders/shared-with-me`
- `GET /api/folders/{id}`
- `POST /api/folders`
- `PUT /api/folders/{id}`
- `DELETE /api/folders/{id}`
- `PUT /api/folders/move-document/{documentId}`
- `POST /api/folders/add-shared`

## Development

### Prerequisites

- Java 21 JDK
- PostgreSQL 18

### Run Locally

```bash
cd livesync-api
./gradlew bootRun
```

On Windows:

```powershell
cd livesync-api
.\gradlew.bat bootRun
```

The API listens on port `8080` internally (and exposed on port `5038` via Nginx load balancer).

## Configuration

Main settings are provided through environment variables:

- `LIVESYNC_DATABASE_URL`
- `LIVESYNC_DATABASE_USERNAME`
- `LIVESYNC_DATABASE_PASSWORD`
- `LIVESYNC_JWT_SECRET`
- `LIVESYNC_CORS_ALLOWED_ORIGINS`
- `LIVESYNC_SANDBOX_BASE_URL`

Development defaults live in `src/main/resources/application-development.properties`.
