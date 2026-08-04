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
    }
}
