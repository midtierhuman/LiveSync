package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/livesync/livesync-gateway/config"
)

func setupTestWorkspaceWithFiles(t *testing.T, projectId string, files map[string]string) string {
	wsDir := filepath.Join(".", "workspaces", projectId)
	absWsDir, err := filepath.Abs(wsDir)
	if err != nil {
		t.Fatalf("Failed to get abs path: %v", err)
	}

	_ = os.RemoveAll(absWsDir)
	if err := os.MkdirAll(absWsDir, 0755); err != nil {
		t.Fatalf("Failed to create test workspace: %v", err)
	}

	for rel, content := range files {
		fullPath := filepath.Join(absWsDir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			t.Fatalf("Failed to create dir: %v", err)
		}
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write file %s: %v", fullPath, err)
		}
	}

	return absWsDir
}

func TestWorkspaceSearch_BasicAndCaseSensitivity(t *testing.T) {
	projectId := "test-search-ws-1"
	absDir := setupTestWorkspaceWithFiles(t, projectId, map[string]string{
		"src/index.ts": "const serverPort = 8080;\nconsole.log(serverPort);\n",
		"src/utils.ts": "export function getPort() {\n  return 8080;\n}\n",
		"README.md":    "# My Server Project\nRuns on port 8080.\n",
	})
	defer os.RemoveAll(absDir)

	cfg := &config.Config{}
	handler := NewWorkspaceSearchHandler(cfg)

	// Case-insensitive search for "serverport"
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+projectId+"/search?query=serverport&matchCase=false", nil)
	rr := httptest.NewRecorder()

	handler.HandleSearch(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", rr.Code)
	}

	var resp WorkspaceSearchResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.TotalMatches != 2 {
		t.Errorf("Expected 2 matches for 'serverport', got %d", resp.TotalMatches)
	}
	if resp.TotalFiles != 1 {
		t.Errorf("Expected 1 file match, got %d", resp.TotalFiles)
	}

	// Case-sensitive search for "serverport" (should yield 0)
	req2 := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+projectId+"/search?query=serverport&matchCase=true", nil)
	rr2 := httptest.NewRecorder()

	handler.HandleSearch(rr2, req2)
	var resp2 WorkspaceSearchResponse
	_ = json.Unmarshal(rr2.Body.Bytes(), &resp2)

	if resp2.TotalMatches != 0 {
		t.Errorf("Expected 0 matches for case-sensitive 'serverport', got %d", resp2.TotalMatches)
	}
}

func TestWorkspaceSearch_RegexAndFileFilter(t *testing.T) {
	projectId := "test-search-ws-2"
	absDir := setupTestWorkspaceWithFiles(t, projectId, map[string]string{
		"src/index.ts": "const port = 8080;\nconst sslPort = 8443;\n",
		"src/app.py":   "PORT = 8080\nSSL_PORT = 8443\n",
	})
	defer os.RemoveAll(absDir)

	cfg := &config.Config{}
	handler := NewWorkspaceSearchHandler(cfg)

	// Regex search for digits: \d{4} with include filter *.ts
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+projectId+"/search?query=\\d{4}&isRegex=true&include=*.ts", nil)
	rr := httptest.NewRecorder()

	handler.HandleSearch(rr, req)

	var resp WorkspaceSearchResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.TotalFiles != 1 {
		t.Errorf("Expected only 1 .ts file, got %d", resp.TotalFiles)
	}
	if resp.TotalMatches != 2 {
		t.Errorf("Expected 2 port number matches in .ts, got %d", resp.TotalMatches)
	}
}

func TestWorkspaceReplace_BatchAndSingle(t *testing.T) {
	projectId := "test-replace-ws-3"
	absDir := setupTestWorkspaceWithFiles(t, projectId, map[string]string{
		"src/config.ts": "export const API_HOST = 'http://localhost:3000';\nexport const AUTH_HOST = 'http://localhost:3000';\n",
		"src/main.ts":   "connectTo('http://localhost:3000');\n",
	})
	defer os.RemoveAll(absDir)

	cfg := &config.Config{}
	handler := NewWorkspaceSearchHandler(cfg)

	// Batch replace localhost:3000 with api.example.com
	payload := WorkspaceReplaceRequest{
		ProjectID:   projectId,
		Query:       "http://localhost:3000",
		Replacement: "https://api.example.com",
	}
	bodyBytes, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+projectId+"/replace", bytes.NewReader(bodyBytes))
	rr := httptest.NewRecorder()

	handler.HandleReplace(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp WorkspaceReplaceResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse replace response: %v", err)
	}

	if resp.ReplacedMatches != 3 {
		t.Errorf("Expected 3 replaced matches, got %d", resp.ReplacedMatches)
	}
	if resp.ReplacedFiles != 2 {
		t.Errorf("Expected 2 replaced files, got %d", resp.ReplacedFiles)
	}

	// Verify disk contents
	newConfigBytes, _ := os.ReadFile(filepath.Join(absDir, "src", "config.ts"))
	if !bytes.Contains(newConfigBytes, []byte("https://api.example.com")) {
		t.Errorf("config.ts was not updated on disk: %s", string(newConfigBytes))
	}
}
