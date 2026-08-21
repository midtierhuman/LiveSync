package services

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// MaxFilesPerProject limits total source files per workspace project
	MaxFilesPerProject = 30
	// MaxFileSizeBytes limits individual file content size (256 KB)
	MaxFileSizeBytes = 256 * 1024
	// MaxProjectSizeBytes limits cumulative storage across all project files (2 MB)
	MaxProjectSizeBytes = 2 * 1024 * 1024
	// MaxFolderDepth limits folder nesting hierarchy
	MaxFolderDepth = 4
)

// Blocked directory names that must never be created or stored in the database
var blockedDirectories = map[string]bool{
	"node_modules":   true,
	"vendor":         true,
	".venv":          true,
	"venv":           true,
	"__pycache__":    true,
	".pytest_cache":  true,
	".cache":         true,
	".tmp":           true,
	"dist":           true,
	"build":          true,
	".next":          true,
	".git":           true,
	".turbo":         true,
	".svn":           true,
	".hg":            true,
	".idea":          true,
	".vscode":        true,
	".output":        true,
	"target":         true,
	"obj":            true,
}

// Blocked file extensions (compiled binaries, native libraries, archives, media blobs)
var blockedFileExtensions = map[string]bool{
	".exe":   true,
	".dll":   true,
	".so":    true,
	".dylib": true,
	".bin":   true,
	".wasm":  true,
	".zip":   true,
	".tar":   true,
	".gz":    true,
	".tgz":   true,
	".7z":    true,
	".rar":   true,
	".iso":   true,
	".img":   true,
	".dmg":   true,
	".pkg":   true,
	".deb":   true,
	".rpm":   true,
	".jar":   true,
	".war":   true,
	".ear":   true,
	".class": true,
	".pyc":   true,
	".pyd":   true,
	".pyo":   true,
	".o":     true,
	".a":     true,
	".lib":   true,
	".obj":   true,
	".mp4":   true,
	".mp3":   true,
	".wav":   true,
	".avi":   true,
	".mov":   true,
	".mkv":   true,
	".flac":  true,
}

// IsBlockedDirectoryName checks if a directory name is restricted
func IsBlockedDirectoryName(name string) bool {
	clean := strings.ToLower(strings.TrimSpace(name))
	if clean == "" {
		return false
	}
	return blockedDirectories[clean]
}

// IsBlockedFileExtension checks if a file extension represents a binary or disallowed file format
func IsBlockedFileExtension(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return false
	}
	return blockedFileExtensions[ext]
}

// ValidatePathAndName checks that path segments do not contain restricted dependency directories or binary extensions
func ValidatePathAndName(pathOrTitle string) error {
	trimmed := strings.TrimSpace(pathOrTitle)
	if trimmed == "" {
		return errors.New("file or folder name cannot be empty")
	}

	normalized := filepath.ToSlash(trimmed)
	parts := strings.Split(normalized, "/")
	for _, part := range parts {
		p := strings.TrimSpace(part)
		if p == "" || p == "." {
			continue
		}
		if p == ".." {
			return errors.New("invalid path traversal segment '..'")
		}
		if IsBlockedDirectoryName(p) {
			return fmt.Errorf("restricted path segment: '%s' is a dependency/build directory and cannot be stored", p)
		}
	}

	if IsBlockedFileExtension(trimmed) {
		return fmt.Errorf("restricted file type: '%s' extension is not permitted (only text/source files allowed)", filepath.Ext(trimmed))
	}

	return nil
}

// ValidateContentSize ensures individual file content does not exceed the maximum allowed size (256 KB)
func ValidateContentSize(content string) error {
	size := len([]byte(content))
	if size > MaxFileSizeBytes {
		return fmt.Errorf("file size %d bytes exceeds maximum allowable limit of %d bytes (256 KB)", size, MaxFileSizeBytes)
	}
	return nil
}

// GetProjectRootFolderId finds the top-level parent folder for a given folder ID
func GetProjectRootFolderId(ctx context.Context, pool *pgxpool.Pool, folderID string) (string, error) {
	if pool == nil || folderID == "" {
		return folderID, nil
	}

	query := `
		WITH RECURSIVE folder_ancestry AS (
			SELECT "Id", "ParentFolderId", 1 AS depth
			FROM "Folders"
			WHERE "Id" = $1
			UNION ALL
			SELECT f."Id", f."ParentFolderId", fa.depth + 1
			FROM "Folders" f
			INNER JOIN folder_ancestry fa ON f."Id" = fa."ParentFolderId"
			WHERE fa.depth < 10
		)
		SELECT "Id" FROM folder_ancestry
		WHERE "ParentFolderId" IS NULL
		LIMIT 1;
	`
	var rootID string
	err := pool.QueryRow(ctx, query, folderID).Scan(&rootID)
	if err != nil {
		return folderID, nil
	}
	return rootID, nil
}

// GetFolderDepth calculates current folder nesting depth from project root
func GetFolderDepth(ctx context.Context, pool *pgxpool.Pool, folderID string) (int, error) {
	if pool == nil || folderID == "" {
		return 0, nil
	}

	query := `
		WITH RECURSIVE folder_ancestry AS (
			SELECT "Id", "ParentFolderId", 1 AS depth
			FROM "Folders"
			WHERE "Id" = $1
			UNION ALL
			SELECT f."Id", f."ParentFolderId", fa.depth + 1
			FROM "Folders" f
			INNER JOIN folder_ancestry fa ON f."Id" = fa."ParentFolderId"
			WHERE fa.depth < 20
		)
		SELECT COALESCE(MAX(depth), 0) FROM folder_ancestry;
	`
	var depth int
	err := pool.QueryRow(ctx, query, folderID).Scan(&depth)
	if err != nil {
		return 0, nil
	}
	return depth, nil
}

// ValidateProjectQuotas verifies that adding or updating a file won't exceed project file count (30) or storage limits (2 MB)
func ValidateProjectQuotas(ctx context.Context, pool *pgxpool.Pool, folderID string, additionalBytes int, isNewFile bool) error {
	if pool == nil || folderID == "" {
		return nil
	}

	rootFolderID, err := GetProjectRootFolderId(ctx, pool, folderID)
	if err != nil || rootFolderID == "" {
		rootFolderID = folderID
	}

	query := `
		WITH RECURSIVE folder_tree AS (
			SELECT "Id"
			FROM "Folders"
			WHERE "Id" = $1
			UNION ALL
			SELECT f."Id"
			FROM "Folders" f
			INNER JOIN folder_tree ft ON f."ParentFolderId" = ft."Id"
		)
		SELECT 
			COUNT(d."Id") AS total_files,
			COALESCE(SUM(OCTET_LENGTH(d."Content")), 0) AS total_bytes
		FROM folder_tree ft
		INNER JOIN "Documents" d ON d."FolderId" = ft."Id";
	`

	var currentFileCount int
	var currentTotalBytes int64
	err = pool.QueryRow(ctx, query, rootFolderID).Scan(&currentFileCount, &currentTotalBytes)
	if err != nil {
		return nil // Non-fatal if query fails, proceed gracefully
	}

	if isNewFile && (currentFileCount+1) > MaxFilesPerProject {
		return fmt.Errorf("project file limit exceeded: project has %d files (maximum allowed is %d files)", currentFileCount, MaxFilesPerProject)
	}

	projectSizeAfter := currentTotalBytes + int64(additionalBytes)
	if projectSizeAfter > MaxProjectSizeBytes {
		return fmt.Errorf("project storage quota exceeded: total project size would reach %d bytes (maximum allowed is %d bytes / 2 MB)", projectSizeAfter, MaxProjectSizeBytes)
	}

	return nil
}
