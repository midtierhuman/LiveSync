package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/middleware"
)

// SuppressionEntry holds the expected content hash and expiration for self-change suppression.
type SuppressionEntry struct {
	Hash     string
	ExpireAt time.Time
}

// SuppressionRegistry provides thread-safe transient hash-based fsnotify suppression
// to prevent self-change echo loops when files are written by the sync engine.
type SuppressionRegistry struct {
	mu      sync.RWMutex
	entries map[string]SuppressionEntry
}

var globalSuppressionRegistry = NewSuppressionRegistry()

func GetGlobalSuppressionRegistry() *SuppressionRegistry {
	return globalSuppressionRegistry
}

func NewSuppressionRegistry() *SuppressionRegistry {
	sr := &SuppressionRegistry{
		entries: make(map[string]SuppressionEntry),
	}
	// Start background cleanup ticker to prevent memory leaks
	go sr.startCleanupLoop()
	return sr
}

func (r *SuppressionRegistry) buildKey(wsDir, relPath string) string {
	cleanWs := filepath.Clean(wsDir)
	cleanRel := filepath.ToSlash(filepath.Clean(relPath))
	return cleanWs + "::" + cleanRel
}

// Register registers a content hash suppression for a workspace file with a given TTL.
func (r *SuppressionRegistry) Register(wsDir, relPath, contentHash string, ttl time.Duration) {
	if ttl <= 0 {
		ttl = 5 * time.Second
	}
	key := r.buildKey(wsDir, relPath)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries[key] = SuppressionEntry{
		Hash:     contentHash,
		ExpireAt: time.Now().Add(ttl),
	}
}

// IsSuppressed checks if an fsnotify event for (wsDir, relPath) corresponds to our own write.
// If the file hash on disk matches the transient suppressed hash, it returns true and suppresses the event.
func (r *SuppressionRegistry) IsSuppressed(wsDir, relPath string) bool {
	key := r.buildKey(wsDir, relPath)

	r.mu.RLock()
	entry, exists := r.entries[key]
	r.mu.RUnlock()

	if !exists {
		return false
	}

	// Check if entry expired
	if time.Now().After(entry.ExpireAt) {
		r.mu.Lock()
		delete(r.entries, key)
		r.mu.Unlock()
		return false
	}

	// Read current disk content and verify hash
	fullPath := filepath.Join(wsDir, filepath.FromSlash(relPath))
	contentBytes, err := os.ReadFile(fullPath)
	if err != nil {
		return false
	}

	diskHash := HashContentBytes(contentBytes)
	if diskHash == entry.Hash {
		return true
	}

	// If hash does not match, someone else (e.g. terminal process) modified it
	r.mu.Lock()
	delete(r.entries, key)
	r.mu.Unlock()
	return false
}

func (r *SuppressionRegistry) startCleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		r.mu.Lock()
		now := time.Now()
		for k, v := range r.entries {
			if now.After(v.ExpireAt) {
				delete(r.entries, k)
			}
		}
		r.mu.Unlock()
	}
}

// HashContentBytes computes a hex-encoded SHA-256 hash of byte slice.
func HashContentBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// HashContentString computes a hex-encoded SHA-256 hash of a string.
func HashContentString(s string) string {
	return HashContentBytes([]byte(s))
}

// WorkspaceSyncRequest represents the JSON payload for workspace synchronization.
type WorkspaceSyncRequest struct {
	ProjectID   string            `json:"projectId,omitempty"`
	Files       map[string]string `json:"files"`
	LockedFiles []string          `json:"lockedFiles,omitempty"`
}

// WorkspaceSyncResponse represents the JSON response for workspace synchronization.
type WorkspaceSyncResponse struct {
	Status      string            `json:"status"`
	ProjectID   string            `json:"projectId"`
	SyncedCount int               `json:"syncedCount"`
	Hashes      map[string]string `json:"hashes"`
	Timestamp   int64             `json:"timestamp"`
	Error       string            `json:"error,omitempty"`
}

// WorkspaceSyncHandler provides HTTP endpoints for atomic workspace disk synchronization.
type WorkspaceSyncHandler struct {
	cfg      *config.Config
	registry *SuppressionRegistry
}

func NewWorkspaceSyncHandler(cfg *config.Config) *WorkspaceSyncHandler {
	return &WorkspaceSyncHandler{
		cfg:      cfg,
		registry: GetGlobalSuppressionRegistry(),
	}
}

// HandleWorkspaceSync dispatches /api/workspaces/{id}/sync requests.
func (h *WorkspaceSyncHandler) HandleWorkspaceSync(w http.ResponseWriter, r *http.Request) {
	// Extract project / workspace ID from path, query, or body
	// Example paths: /api/workspaces/proj123/sync or /api/workspaces/sync?projectId=proj123
	path := strings.TrimPrefix(r.URL.Path, "/api/workspaces")
	path = strings.TrimPrefix(path, "/")
	parts := strings.Split(path, "/")

	var projectID string
	if len(parts) > 0 && parts[0] != "" && parts[0] != "sync" {
		projectID = parts[0]
	}
	if projectID == "" {
		projectID = r.URL.Query().Get("projectId")
	}
	if projectID == "" {
		projectID = r.URL.Query().Get("id")
	}

	switch r.Method {
	case http.MethodPost:
		var req WorkspaceSyncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}

		if req.ProjectID != "" {
			projectID = req.ProjectID
		}
		if projectID == "" {
			projectID = "default"
		}

		tokenStr := middleware.GetUserToken(r.Context())
		accessLevel, accessErr := middleware.VerifyWorkspaceAccess(r.Context(), h.cfg, projectID, tokenStr)
		if accessErr != nil || accessLevel == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Forbidden: Insufficient permissions to sync workspace",
				"code":  "FORBIDDEN",
			})
			return
		}

		safeID := sanitizeWorkspaceID(projectID)
		workspaceDir := filepath.Join(".", "workspaces", safeID)
		absWsDir, err := filepath.Abs(workspaceDir)
		if err != nil {
			absWsDir = workspaceDir
		}
		_ = os.MkdirAll(absWsDir, 0755)

		filesToSync := make(map[string]string)
		lockedFilesMap := make(map[string]bool)

		// Authoritative Source of Truth Enforcement (SEC-08):
		// If connected to livesync-api, reconcile client-provided files against the true backend manifest
		manifest, manifestErr := FetchProjectManifest(r.Context(), h.cfg, projectID, tokenStr)
		if manifestErr == nil && manifest != nil {
			for _, mf := range manifest.Files {
				if mf.Path == "" {
					continue
				}
				cleanPath := filepath.ToSlash(filepath.Clean(mf.Path))
				if mf.IsLocked || mf.AccessLevel == "View" {
					// STRICT TAMPER SHIELD: Override client-provided data with backend authoritative content
					filesToSync[cleanPath] = mf.Content
					lockedFilesMap[cleanPath] = true
				} else {
					// Verified Edit / Owner permissions: allow live unpersisted editor buffer overlay
					if clientContent, ok := req.Files[cleanPath]; ok {
						filesToSync[cleanPath] = clientContent
					} else if clientContent, ok := req.Files[mf.Path]; ok {
						filesToSync[cleanPath] = clientContent
					} else {
						filesToSync[cleanPath] = mf.Content
					}
				}
			}

			// If caller has Edit/Owner on the project, permit new unpersisted files not yet in manifest
			if manifest.AccessLevel == "Edit" || manifest.AccessLevel == "Owner" || accessLevel == "Edit" || accessLevel == "Owner" {
				for relPath, content := range req.Files {
					cleanPath := filepath.ToSlash(filepath.Clean(relPath))
					if _, exists := filesToSync[cleanPath]; !exists {
						filesToSync[cleanPath] = content
					}
				}
			}
		} else {
			// Standalone / offline harness fallback
			filesToSync = req.Files
			for _, lf := range req.LockedFiles {
				if lf != "" {
					lockedFilesMap[filepath.ToSlash(filepath.Clean(lf))] = true
				}
			}
		}

		var lockedFiles []string
		for lf := range lockedFilesMap {
			lockedFiles = append(lockedFiles, lf)
		}

		hashes, syncedCount, syncErr := SyncWorkspaceAtomicWithRegistry(absWsDir, filesToSync, lockedFiles, h.registry)
		if syncErr != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(WorkspaceSyncResponse{
				Status:      "error",
				ProjectID:   projectID,
				SyncedCount: syncedCount,
				Hashes:      hashes,
				Timestamp:   time.Now().UnixMilli(),
				Error:       syncErr.Error(),
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(WorkspaceSyncResponse{
			Status:      "ok",
			ProjectID:   projectID,
			SyncedCount: syncedCount,
			Hashes:      hashes,
			Timestamp:   time.Now().UnixMilli(),
		})

	case http.MethodGet:
		if projectID == "" {
			projectID = "default"
		}

		tokenStr := middleware.GetUserToken(r.Context())
		accessLevel, accessErr := middleware.VerifyWorkspaceAccess(r.Context(), h.cfg, projectID, tokenStr)
		if accessErr != nil || accessLevel == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Forbidden: Insufficient permissions to read workspace",
				"code":  "FORBIDDEN",
			})
			return
		}

		safeID := sanitizeWorkspaceID(projectID)
		workspaceDir := filepath.Join(".", "workspaces", safeID)
		absWsDir, _ := filepath.Abs(workspaceDir)

		filesMap := make(map[string]string)
		_ = filepath.Walk(absWsDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, relErr := filepath.Rel(absWsDir, path)
			if relErr != nil || isIgnoredPath(rel) {
				return nil
			}
			content, readErr := os.ReadFile(path)
			if readErr == nil {
				filesMap[filepath.ToSlash(rel)] = HashContentBytes(content)
			}
			return nil
		})

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"projectId": projectID,
			"files":     filesMap,
			"timestamp": time.Now().UnixMilli(),
		})

	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// SyncWorkspaceAtomicWithRegistry atomically writes files to the target workspace directory
// and registers transient suppression entries with the suppression registry.
func SyncWorkspaceAtomicWithRegistry(wsDir string, files map[string]string, lockedFiles []string, reg *SuppressionRegistry) (map[string]string, int, error) {
	if reg == nil {
		reg = GetGlobalSuppressionRegistry()
	}

	lockedMap := make(map[string]bool)
	for _, f := range lockedFiles {
		if f != "" {
			lockedMap[filepath.ToSlash(filepath.Clean(f))] = true
		}
	}

	hashes := make(map[string]string)
	syncedCount := 0
	var firstErr error

	for relPath, content := range files {
		if relPath == "" {
			continue
		}
		cleanedRel := filepath.ToSlash(filepath.Clean(relPath))
		if strings.HasPrefix(cleanedRel, "..") || strings.HasPrefix(cleanedRel, "/") || isIgnoredPath(cleanedRel) {
			continue
		}

		contentBytes := []byte(content)
		if len(contentBytes) > 256*1024 {
			continue
		}
		contentHash := HashContentBytes(contentBytes)
		hashes[cleanedRel] = contentHash

		// Register transient suppression (TTL = 5 seconds) before writing to disk
		reg.Register(wsDir, cleanedRel, contentHash, 5*time.Second)

		targetPath := filepath.Join(wsDir, filepath.FromSlash(cleanedRel))
		targetDir := filepath.Dir(targetPath)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			log.Printf("[WorkspaceSync] Failed to create parent directory for %s: %v", targetPath, err)
			if firstErr == nil {
				firstErr = fmt.Errorf("failed to create directory %s: %w", targetDir, err)
			}
			continue
		}

		// Perform atomic write using temporary file + atomic rename
		tmpFile, err := os.CreateTemp(targetDir, ".tmp_sync_*")
		if err != nil {
			// Fallback to direct write if temp file creation fails
			_ = os.Chmod(targetPath, 0644)
			if writeErr := os.WriteFile(targetPath, contentBytes, 0644); writeErr != nil {
				log.Printf("[WorkspaceSync] Failed to write file %s: %v", targetPath, writeErr)
				if firstErr == nil {
					firstErr = fmt.Errorf("failed to write file %s: %w", targetPath, writeErr)
				}
				continue
			}
		} else {
			tmpPath := tmpFile.Name()
			_, writeErr := tmpFile.Write(contentBytes)
			_ = tmpFile.Sync()
			_ = tmpFile.Close()

			if writeErr != nil {
				_ = os.Remove(tmpPath)
				if firstErr == nil {
					firstErr = fmt.Errorf("failed to write temp file for %s: %w", targetPath, writeErr)
				}
				continue
			}

			// Ensure target file is writable before replacing (required on Windows when overwriting read-only files)
			_ = os.Chmod(targetPath, 0644)

			// Atomic replace
			if renameErr := os.Rename(tmpPath, targetPath); renameErr != nil {
				// On Windows, rename fails if destination exists and is open/locked, fallback to direct copy/write
				_ = os.Remove(targetPath)
				if renameErr2 := os.Rename(tmpPath, targetPath); renameErr2 != nil {
					_ = os.WriteFile(targetPath, contentBytes, 0644)
					_ = os.Remove(tmpPath)
				}
			}
		}

		// Enforce OS read-only permissions if file is locked
		if lockedMap[cleanedRel] {
			_ = os.Chmod(targetPath, 0444)
		} else {
			_ = os.Chmod(targetPath, 0644)
		}

		syncedCount++
	}

	return hashes, syncedCount, firstErr
}

// SyncIncrementalOverlays selectively applies dirty file overlays to an existing workspace
// without rebuilding or touching unchanged files in the directory tree (ARCH-12).
func SyncIncrementalOverlays(wsDir string, overlay map[string]string, lockedFiles []string, reg *SuppressionRegistry) (map[string]string, int, error) {
	if len(overlay) == 0 {
		return make(map[string]string), 0, nil
	}
	return SyncWorkspaceAtomicWithRegistry(wsDir, overlay, lockedFiles, reg)
}
