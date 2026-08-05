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
        log.info("Running automatic database schema migration for core LiveSync tables...");

        // Ensure AspNetUsers table exists
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "AspNetUsers" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "Email" VARCHAR(255),
                    "UserName" VARCHAR(255),
                    "PasswordHash" VARCHAR(255),
                    "FirstName" VARCHAR(255),
                    "LastName" VARCHAR(255),
                    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "LastLoginAt" TIMESTAMP,
                    "NormalizedEmail" VARCHAR(255),
                    "NormalizedUserName" VARCHAR(255),
                    "EmailConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
                    "SecurityStamp" VARCHAR(255),
                    "ConcurrencyStamp" VARCHAR(255),
                    "PhoneNumberConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
                    "TwoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
                    "LockoutEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
                    "AccessFailedCount" INT NOT NULL DEFAULT 0,
                    "LockoutEnd" TIMESTAMP
                );
            """);
        } catch (Exception e) {
            log.warn("Notice ensuring AspNetUsers table: {}", e.getMessage());
        }

        // Ensure Documents table exists
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "Documents" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "Title" VARCHAR(200) NOT NULL,
                    "Content" TEXT NOT NULL,
                    "OwnerId" VARCHAR(255) NOT NULL,
                    "FolderId" VARCHAR(255),
                    "ShareCode" VARCHAR(50) UNIQUE,
                    "DefaultAccessLevel" VARCHAR(50) NOT NULL DEFAULT 'View',
                    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "UpdatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "LastEditedAt" TIMESTAMP,
                    "LastEditedBy" VARCHAR(255)
                );
            """);
        } catch (Exception e) {
            log.warn("Notice ensuring Documents table: {}", e.getMessage());
        }

        // Ensure SharedDocuments table exists
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "SharedDocuments" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "DocumentId" VARCHAR(255) NOT NULL,
                    "UserId" VARCHAR(255) NOT NULL,
                    "AccessLevel" VARCHAR(50) NOT NULL,
                    "SharedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            """);
        } catch (Exception e) {
            log.warn("Notice ensuring SharedDocuments table: {}", e.getMessage());
        }

        // Ensure Folders table exists
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "Folders" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "Name" VARCHAR(255) NOT NULL,
                    "OwnerId" VARCHAR(255) NOT NULL,
                    "ParentFolderId" VARCHAR(255),
                    "ShareCode" VARCHAR(255) UNIQUE,
                    "DefaultAccessLevel" VARCHAR(50),
                    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "UpdatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            """);
        } catch (Exception e) {
            log.warn("Notice ensuring Folders table: {}", e.getMessage());
        }

        // Ensure SharedFolders table exists
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS "SharedFolders" (
                    "Id" VARCHAR(255) PRIMARY KEY,
                    "FolderId" VARCHAR(255) NOT NULL,
                    "UserId" VARCHAR(255) NOT NULL,
                    "AccessLevel" VARCHAR(50) NOT NULL,
                    "SharedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            """);
        } catch (Exception e) {
            log.warn("Notice ensuring SharedFolders table: {}", e.getMessage());
        }

        // Ensure Content column type is TEXT and FolderId column exists
        try {
            jdbcTemplate.execute("ALTER TABLE \"Documents\" ALTER COLUMN \"Content\" TYPE TEXT;");
        } catch (Exception ignored) {}

        try {
            jdbcTemplate.execute("ALTER TABLE \"Documents\" ADD COLUMN IF NOT EXISTS \"FolderId\" VARCHAR(255);");
        } catch (Exception ignored) {}

        log.info("Database Schema Migrator successfully completed table verification.");
    }
}
