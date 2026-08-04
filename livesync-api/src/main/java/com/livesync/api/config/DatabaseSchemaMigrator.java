package com.livesync.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DatabaseSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public DatabaseSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) {
        log.info("Running automatic database schema migration for Document Content column...");
        try {
            jdbcTemplate.execute("ALTER TABLE \"Documents\" ALTER COLUMN \"Content\" TYPE TEXT;");
            log.info("Successfully migrated 'Documents.Content' column type to TEXT.");
        } catch (Exception e1) {
            try {
                jdbcTemplate.execute("ALTER TABLE documents ALTER COLUMN content TYPE TEXT;");
                log.info("Successfully migrated 'documents.content' column type to TEXT.");
            } catch (Exception e2) {
                log.warn("Schema migration notice: Could not alter Content column automatically: {}", e2.getMessage());
            }
        }

        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "Folders" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "Name" VARCHAR(255) NOT NULL,
                    "OwnerId" VARCHAR(255) NOT NULL,
                    "ParentFolderId" VARCHAR(255),
                    "ShareCode" VARCHAR(255) UNIQUE,
                    "DefaultAccessLevel" VARCHAR(50),
                    "CreatedAt" TIMESTAMP NOT NULL,
                    "UpdatedAt" TIMESTAMP NOT NULL
                );
            """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "SharedFolders" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "FolderId" VARCHAR(255) NOT NULL,
                    "UserId" VARCHAR(255) NOT NULL,
                    "AccessLevel" VARCHAR(50) NOT NULL,
                    "SharedAt" TIMESTAMP NOT NULL
                );
            """);
            jdbcTemplate.execute("ALTER TABLE \"Documents\" ADD COLUMN IF NOT EXISTS \"FolderId\" VARCHAR(255);");
            log.info("Successfully ensured Folders, SharedFolders tables and 'Documents.FolderId' column exist.");
        } catch (Exception e) {
            try {
                jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS folders (
                        id VARCHAR(255) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        owner_id VARCHAR(255) NOT NULL,
                        parent_folder_id VARCHAR(255),
                        share_code VARCHAR(255) UNIQUE,
                        default_access_level VARCHAR(50),
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL
                    );
                """);
                jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS shared_folders (
                        id VARCHAR(255) PRIMARY KEY,
                        folder_id VARCHAR(255) NOT NULL,
                        user_id VARCHAR(255) NOT NULL,
                        access_level VARCHAR(50) NOT NULL,
                        shared_at TIMESTAMP NOT NULL
                    );
                """);
                jdbcTemplate.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id VARCHAR(255);");
                log.info("Successfully ensured lower_case folders, shared_folders tables exist.");
            } catch (Exception e2) {
                log.warn("Schema migration notice for Folders/SharedFolders: {}", e2.getMessage());
            }
        }
    }
}
