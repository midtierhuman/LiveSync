# Spring Boot Core API (`livesync-api`)

The `livesync-api` microservice is built with **Java 21** and **Spring Boot 3**. It provides RESTful APIs for user management, document CRUD, folder hierarchies, RBAC authorization, and time-travel history.

---

## 🏗️ Core Responsibilities

- **Authentication & RBAC**: JWT token issue/verify, Role-based permissions (Owner, Editor, Viewer).
- **Metadata Management**: User profiles, folders, document hierarchy, and inline code comment threads.
- **Redis Stream Background Consumer**:
  - Runs Spring `StreamMessageListenerContainer` listening on `livesync:stream:document-saves`.
  - Group: `api-save-group`.
  - Consumes realtime document revisions and persists them asynchronously into PostgreSQL.
- **Database**: PostgreSQL 18 with Flyway migrations.
