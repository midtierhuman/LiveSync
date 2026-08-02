# LiveSync API

## Overview

`livesync-api` is the Java backend for authentication and document management.
It is built with Java 21, Spring Boot 4, Spring Security, JPA, and PostgreSQL.

## Responsibilities

- User registration and login
- JWT generation and validation
- Password hashing and account security
- Document CRUD
- Share codes and access levels
- Execution language discovery for the sandbox

## Key endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/oauth/{provider}` (planned)

### Documents

- `GET /api/documents/my-documents`
- `GET /api/documents/shared-with-me`
- `GET /api/documents/execution-languages`
- `GET /api/documents/{id}`
- `GET /api/documents/{id}/access`
- `POST /api/documents`
- `PUT /api/documents/{id}`
- `PUT /api/documents/{id}/content`
- `DELETE /api/documents/{id}`
- `POST /api/documents/{id}/generate-share-code`
- `GET /api/documents/share/{code}`
- `POST /api/documents/add-shared`
- `PUT /api/documents/{id}/shared/{sharedUserId}/access-level`
- `PUT /api/documents/{id}/share-code-access-level`
- `POST /api/documents/{id}/execute`

## Development

### Prerequisites

- Java 21
- PostgreSQL

### Run locally

```bash
cd backend/livesync/livesync-api
./gradlew bootRun
```

On Windows:

```powershell
gradlew.bat bootRun
```

The API listens on port `8080` by default.

## Configuration

The main settings are provided through environment variables:

- `LIVESYNC_DATABASE_URL`
- `LIVESYNC_DATABASE_USERNAME`
- `LIVESYNC_DATABASE_PASSWORD`
- `LIVESYNC_JWT_SECRET`
- `LIVESYNC_JWT_ISSUER`
- `LIVESYNC_JWT_AUDIENCE`
- `LIVESYNC_JWT_EXPIRATION_HOURS`
- `LIVESYNC_CORS_ALLOWED_ORIGINS`
- `LIVESYNC_SANDBOX_BASE_URL`

Development defaults live in `src/main/resources/application-development.properties`.
