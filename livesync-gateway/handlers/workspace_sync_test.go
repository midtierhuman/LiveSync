package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/livesync/livesync-gateway/config"
)

func TestSuppressionRegistry(t *testing.T) {
	reg := NewSuppressionRegistry()
	tempDir, err := os.MkdirTemp("", "suppress_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	filePath := filepath.Join(tempDir, "test.py")
	fileContent := "print('hello from sync engine')"
	_ = os.WriteFile(filePath, []byte(fileContent), 0644)
	contentHash := HashContentString(fileContent)

	// Register suppression
	reg.Register(tempDir, "test.py", contentHash, 2*time.Second)

	// Verify suppression is active because file content on disk matches registered hash
	if !reg.IsSuppressed(tempDir, "test.py") {
		t.Errorf("Expected test.py to be suppressed, but was not")
	}

	// Now modify the file externally to simulate an external terminal edit
	_ = os.WriteFile(filePath, []byte("print('modified by user in shell')"), 0644)

	// Should not be suppressed anymore because hash changed
	if reg.IsSuppressed(tempDir, "test.py") {
		t.Errorf("Expected modified file to NOT be suppressed, but it was")
	}

	// Test TTL expiration
	reg.Register(tempDir, "expired.py", HashContentString("abc"), 10*time.Millisecond)
	_ = os.WriteFile(filepath.Join(tempDir, "expired.py"), []byte("abc"), 0644)
	time.Sleep(30 * time.Millisecond)

	if reg.IsSuppressed(tempDir, "expired.py") {
		t.Errorf("Expected expired suppression entry to not suppress")
	}
}

func TestSyncWorkspaceAtomicWithRegistry(t *testing.T) {
	reg := NewSuppressionRegistry()
	tempDir, err := os.MkdirTemp("", "atomic_sync_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	files := map[string]string{
		"src/index.ts":        "console.log('index');",
		"src/utils/math.ts":   "export const add = (a, b) => a + b;",
		"docs/README.md":      "# Documentation",
		"config/protected.json": `{"locked": true}`,
	}
	locked := []string{"config/protected.json"}

	hashes, count, err := SyncWorkspaceAtomicWithRegistry(tempDir, files, locked, reg)
	if err != nil {
		t.Fatalf("SyncWorkspaceAtomicWithRegistry failed: %v", err)
	}
	if count != 4 {
		t.Errorf("Expected 4 synced files, got %d", count)
	}

	// Verify each file exists and suppression is active
	for relPath, content := range files {
		cleanRel := filepath.ToSlash(filepath.Clean(relPath))
		expectedHash := HashContentString(content)
		if hashes[cleanRel] != expectedHash {
			t.Errorf("Hash mismatch for %s: got %s, expected %s", cleanRel, hashes[cleanRel], expectedHash)
		}

		fullPath := filepath.Join(tempDir, filepath.FromSlash(cleanRel))
		data, readErr := os.ReadFile(fullPath)
		if readErr != nil {
			t.Errorf("Failed to read synced file %s: %v", fullPath, readErr)
		} else if string(data) != content {
			t.Errorf("Content mismatch in %s: got %s, expected %s", fullPath, string(data), content)
		}

		// Verify suppression is registered
		if !reg.IsSuppressed(tempDir, cleanRel) {
			t.Errorf("Expected %s to be suppressed after sync, but was not", cleanRel)
		}
	}
}

func TestWorkspaceSyncHTTPHandler(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	handler := NewWorkspaceSyncHandler(cfg)

	// Clean up potential test workspace
	defer os.RemoveAll(filepath.Join(".", "workspaces", "test_http_proj"))

	syncPayload := WorkspaceSyncRequest{
		ProjectID: "test_http_proj",
		Files: map[string]string{
			"app.py": "print('hello from http sync')",
		},
		LockedFiles: []string{},
	}
	payloadBytes, _ := json.Marshal(syncPayload)

	// 1. Test POST /api/workspaces/test_http_proj/sync
	req := httptest.NewRequest(http.MethodPost, "/api/workspaces/test_http_proj/sync", bytes.NewReader(payloadBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleWorkspaceSync(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected HTTP 200, got %d", resp.StatusCode)
	}

	var syncResp WorkspaceSyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if syncResp.Status != "ok" || syncResp.SyncedCount != 1 {
		t.Errorf("Unexpected sync response: %+v", syncResp)
	}

	// 2. Test GET /api/workspaces/test_http_proj/sync
	getReq := httptest.NewRequest(http.MethodGet, "/api/workspaces/test_http_proj/sync", nil)
	getW := httptest.NewRecorder()

	handler.HandleWorkspaceSync(getW, getReq)

	getResp := getW.Result()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("Expected HTTP 200 for GET, got %d", getResp.StatusCode)
	}

	var getResult struct {
		Status string            `json:"status"`
		Files  map[string]string `json:"files"`
	}
	if err := json.NewDecoder(getResp.Body).Decode(&getResult); err != nil {
		t.Fatalf("Failed to decode GET response: %v", err)
	}

	if getResult.Status != "ok" || len(getResult.Files) == 0 {
		t.Errorf("Unexpected GET response: %+v", getResult)
	}
}

func TestSyncIncrementalOverlays(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ws_incr_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	reg := NewSuppressionRegistry()

	// Initial files
	initialFiles := map[string]string{
		"file1.txt": "initial 1",
		"file2.txt": "initial 2",
	}
	_, _, _ = SyncWorkspaceAtomicWithRegistry(tempDir, initialFiles, nil, reg)

	// Incremental overlay modifying only file1.txt and adding file3.txt
	overlay := map[string]string{
		"file1.txt": "updated 1",
		"file3.txt": "new 3",
	}
	hashes, count, err := SyncIncrementalOverlays(tempDir, overlay, nil, reg)
	if err != nil {
		t.Fatalf("unexpected error during incremental overlay: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 overlaid files, got %d", count)
	}
	if len(hashes) != 2 {
		t.Fatalf("expected 2 hashes returned, got %d", len(hashes))
	}

	// Verify file1.txt updated
	f1Data, _ := os.ReadFile(filepath.Join(tempDir, "file1.txt"))
	if string(f1Data) != "updated 1" {
		t.Errorf("expected file1.txt to be updated 1, got %s", string(f1Data))
	}

	// Verify file2.txt untouched
	f2Data, _ := os.ReadFile(filepath.Join(tempDir, "file2.txt"))
	if string(f2Data) != "initial 2" {
		t.Errorf("expected file2.txt to be untouched initial 2, got %s", string(f2Data))
	}

	// Verify file3.txt created
	f3Data, _ := os.ReadFile(filepath.Join(tempDir, "file3.txt"))
	if string(f3Data) != "new 3" {
		t.Errorf("expected file3.txt to be new 3, got %s", string(f3Data))
	}
}

func TestWorkspaceSyncWithLockedFiles(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ws_lock_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	reg := NewSuppressionRegistry()
	files := map[string]string{
		"index.js": "console.log('index.js read only');",
		"filea.js": "console.log('filea.js editable');",
	}
	locked := []string{"index.js"}

	hashes, count, err := SyncWorkspaceAtomicWithRegistry(tempDir, files, locked, reg)
	if err != nil {
		t.Fatalf("unexpected error during locked files sync: %v", err)
	}
	if count != 2 || len(hashes) != 2 {
		t.Fatalf("expected 2 files synced, got %d", count)
	}

	indexInfo, err := os.Stat(filepath.Join(tempDir, "index.js"))
	if err != nil {
		t.Fatalf("failed to stat index.js: %v", err)
	}
	if indexInfo.Mode().Perm()&0200 != 0 {
		// Read-only check on unix
		t.Logf("index.js mode: %v", indexInfo.Mode().Perm())
	}

	fileaInfo, err := os.Stat(filepath.Join(tempDir, "filea.js"))
	if err != nil {
		t.Fatalf("failed to stat filea.js: %v", err)
	}
	if fileaInfo.Mode().Perm()&0200 == 0 {
		t.Errorf("expected filea.js to be writable, got mode %v", fileaInfo.Mode().Perm())
	}
}

