# Schema Setup Notes

The current Java API does not use the old startup-migration flow.
Its datasource settings are defined in `backend/livesync/livesync-api/src/main/resources/application*.properties`.

## What to know

- Development uses PostgreSQL settings from `application-development.properties`
- Production values come from environment variables
- The API validates the schema on startup, so the database must already match the expected tables and columns

## Before running tests

- Make sure the current schema has been applied
- Confirm the `DefaultAccessLevel` column exists for document sharing tests
- Confirm JWT and database environment variables are set
