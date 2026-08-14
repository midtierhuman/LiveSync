package database

import (
	"context"
	"log"
)

func Migrate(ctx context.Context, db *DB) error {
	log.Println("🔄 Running database schema migration for LiveSync tables...")

	queries := []string{
		// 1. AspNetUsers Table
		`CREATE TABLE IF NOT EXISTS "AspNetUsers" (
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
		);`,

		// 2. Folders Table
		`CREATE TABLE IF NOT EXISTS "Folders" (
			"Id" VARCHAR(255) PRIMARY KEY,
			"Name" VARCHAR(255) NOT NULL,
			"OwnerId" VARCHAR(255) NOT NULL,
			"ParentFolderId" VARCHAR(255),
			"ShareCode" VARCHAR(255) UNIQUE,
			"DefaultAccessLevel" VARCHAR(50),
			"CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"UpdatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,

		// 3. Documents Table
		`CREATE TABLE IF NOT EXISTS "Documents" (
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
		);`,

		// 4. SharedDocuments Table
		`CREATE TABLE IF NOT EXISTS "SharedDocuments" (
			"Id" VARCHAR(255) PRIMARY KEY,
			"DocumentId" VARCHAR(255) NOT NULL,
			"UserId" VARCHAR(255) NOT NULL,
			"AccessLevel" VARCHAR(50) NOT NULL,
			"SharedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT "UK_SharedDocuments_Doc_User" UNIQUE ("DocumentId", "UserId")
		);`,

		// 5. SharedFolders Table
		`CREATE TABLE IF NOT EXISTS "SharedFolders" (
			"Id" VARCHAR(255) PRIMARY KEY,
			"FolderId" VARCHAR(255) NOT NULL,
			"UserId" VARCHAR(255) NOT NULL,
			"AccessLevel" VARCHAR(50) NOT NULL,
			"SharedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT "UK_SharedFolders_Folder_User" UNIQUE ("FolderId", "UserId")
		);`,

		// Adjustments / Constraints / Column Alterations
		`ALTER TABLE "Documents" ALTER COLUMN "Content" TYPE TEXT;`,
		`ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "FolderId" VARCHAR(255);`,
	}

	for _, query := range queries {
		if _, err := db.Pool.Exec(ctx, query); err != nil {
			log.Printf("⚠️ Migration statement notice: %v", err)
		}
	}

	log.Println("✅ Database schema migration completed successfully.")
	return nil
}
