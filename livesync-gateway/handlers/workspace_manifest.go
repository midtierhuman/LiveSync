package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/livesync/livesync-gateway/config"
)

type ProjectManifestFile struct {
	Path        string `json:"path"`
	DocumentID  string `json:"documentId"`
	Title       string `json:"title"`
	Content     string `json:"content"`
	IsLocked    bool   `json:"isLocked"`
	AccessLevel string `json:"accessLevel,omitempty"`
}

type ProjectManifestResponse struct {
	ProjectID   string                `json:"projectId"`
	ProjectName string                `json:"projectName"`
	OwnerID     string                `json:"ownerId"`
	AccessLevel string                `json:"accessLevel"`
	TotalFiles  int                   `json:"totalFiles"`
	Files       []ProjectManifestFile `json:"files"`
}

// MaterializeWorkspaceFromManifest ensures that ./workspaces/{projectId} exists on disk.
// If the workspace does not exist or is empty, it fetches the full recursive project tree
// in a single batch query from livesync-api (/api/folders/:id/manifest) and materializes it on disk.
func MaterializeWorkspaceFromManifest(ctx context.Context, cfg *config.Config, projectID, tokenStr string, reg *SuppressionRegistry) (string, int, error) {
	cleanID := strings.TrimSpace(projectID)
	if cleanID == "" || cleanID == "default" || cleanID == "workspace_default" || cleanID == "temp" {
		safeID := sanitizeWorkspaceID(cleanID)
		wsDir := filepath.Join(".", "workspaces", safeID)
		absWsDir, _ := filepath.Abs(wsDir)
		_ = os.MkdirAll(absWsDir, 0755)
		return absWsDir, 0, nil
	}

	safeID := sanitizeWorkspaceID(cleanID)
	workspaceDir := filepath.Join(".", "workspaces", safeID)
	absWsDir, err := filepath.Abs(workspaceDir)
	if err != nil {
		absWsDir = workspaceDir
	}

	// 1. Check if workspace already exists on disk and is non-empty
	if info, statErr := os.Stat(absWsDir); statErr == nil && info.IsDir() {
		entries, readErr := os.ReadDir(absWsDir)
		if readErr == nil && len(entries) > 0 {
			// Already materialized
			return absWsDir, len(entries), nil
		}
	}

	// 2. Need initial materialization from livesync-api bulk manifest
	if cfg == nil || cfg.APIBaseURL == "" {
		_ = os.MkdirAll(absWsDir, 0755)
		return absWsDir, 0, nil
	}

	manifestURL := fmt.Sprintf("%s/api/folders/%s/manifest", strings.TrimRight(cfg.APIBaseURL, "/"), url.PathEscape(cleanID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, manifestURL, nil)
	if err != nil {
		return "", 0, fmt.Errorf("failed to create manifest request: %w", err)
	}

	if tokenStr != "" {
		req.Header.Set("Authorization", "Bearer "+tokenStr)
	}
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("failed to fetch project manifest: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
		return "", 0, errors.New("forbidden: unauthorized to access project manifest")
	}
	if resp.StatusCode == http.StatusNotFound {
		return "", 0, errors.New("project not found")
	}
	if resp.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("manifest request failed with status: %d", resp.StatusCode)
	}

	var manifest ProjectManifestResponse
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return "", 0, fmt.Errorf("failed to parse project manifest: %w", err)
	}

	_ = os.MkdirAll(absWsDir, 0755)
	filesMap := make(map[string]string)
	var lockedFiles []string

	for _, file := range manifest.Files {
		if file.Path == "" {
			continue
		}
		filesMap[file.Path] = file.Content
		if file.IsLocked {
			lockedFiles = append(lockedFiles, file.Path)
		}
	}

	// Atomically write all files with transient hash suppression
	_, syncedCount, syncErr := SyncWorkspaceAtomicWithRegistry(absWsDir, filesMap, lockedFiles, reg)
	if syncErr != nil {
		log.Printf("⚠️ [WorkspaceMaterializer] Notice during file synchronization: %v", syncErr)
	}

	log.Printf("📦 [WorkspaceMaterialized] project=%s path=%s totalFiles=%d synced=%d",
		manifest.ProjectID, absWsDir, manifest.TotalFiles, syncedCount)

	return absWsDir, syncedCount, nil
}
