# LiveSync API Automatic DDL Migration Guide

## Overview

`livesync-api` includes an automatic database schema migrator (`DatabaseSchemaMigrator.java`).

When running in production with `spring.jpa.hibernate.ddl-auto=validate`, Hibernate requires all database tables and columns to exist before application startup.

## Handled Migrations

1. **`Documents.Content` Type Migration:** Automatically migrates `Content` column to `TEXT` type.
2. **`Folders` Table Creation:** Creates `"Folders"` table if not exists.
3. **`SharedFolders` Table Creation:** Creates `"SharedFolders"` table if not exists.
4. **`Documents.FolderId` Column:** Adds `"FolderId"` column to `"Documents"` table if not exists.
