package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/livesync/livesync-gateway/config"
)

func TestMaterializeWorkspaceFromManifest_SingleBatch(t *testing.T) {
	tempWsRoot, err := os.MkdirTemp("", "mat_ws_test_*")
	if err != nil {
		t.Fatalf("failed to create temp ws root: %v", err)
	}
	defer os.RemoveAll(tempWsRoot)

	// Mock LiveSync API server returning a 3-file nested manifest
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/folders/proj-bulk-123/manifest" {
			resp := ProjectManifestResponse{
				ProjectID:   "proj-bulk-123",
				ProjectName: "Bulk Test Project",
				OwnerID:     "user-1",
				AccessLevel: "View",
				TotalFiles:  3,
				Files: []ProjectManifestFile{
					{
						Path:       "src/index.ts",
						DocumentID: "doc-1",
						Title:      "index.ts",
						Content:    "console.log('main entry');",
						IsLocked:   false,
					},
					{
						Path:       "src/utils/math.ts",
						DocumentID: "doc-2",
						Title:      "math.ts",
						Content:    "export const add = (a, b) => a + b;",
						IsLocked:   false,
					},
					{
						Path:       "config/locked.json",
						DocumentID: "doc-3",
						Title:      "locked.json",
						Content:    `{"env":"production"}`,
						IsLocked:   true,
					},
				},
			}
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockServer.Close()

	cfg := &config.Config{
		APIBaseURL: mockServer.URL,
	}

	reg := NewSuppressionRegistry()
	wsDir, count, err := MaterializeWorkspaceFromManifest(context.Background(), cfg, "proj-bulk-123", "test-token", reg)
	if err != nil {
		t.Fatalf("expected nil error on materialization, got: %v", err)
	}
	defer os.RemoveAll(wsDir)

	if count != 3 {
		t.Fatalf("expected 3 files synced, got %d", count)
	}

	// Verify src/index.ts exists on disk
	indexBytes, err := os.ReadFile(filepath.Join(wsDir, "src", "index.ts"))
	if err != nil || string(indexBytes) != "console.log('main entry');" {
		t.Fatalf("src/index.ts mismatch: %v, content: %s", err, string(indexBytes))
	}

	// Verify src/utils/math.ts exists on disk
	mathBytes, err := os.ReadFile(filepath.Join(wsDir, "src", "utils", "math.ts"))
	if err != nil || string(mathBytes) != "export const add = (a, b) => a + b;" {
		t.Fatalf("src/utils/math.ts mismatch: %v, content: %s", err, string(mathBytes))
	}
}
