package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/middleware"
)

func TestE2E_MultiUserExecutionMatrixAndIsolation(t *testing.T) {
	jwtSecret := "e2e-super-secret-key-32-bytes-long-12345"
	cfg := &config.Config{
		JWTSecret: jwtSecret,
	}

	testWsDir := filepath.Join(".", "workspaces", "e2e-project-alpha")
	_ = os.RemoveAll(testWsDir)
	defer os.RemoveAll(testWsDir)

	execHandler := NewExecutionHandler(cfg, nil)

	ownerToken := createTestJWT(jwtSecret, "user-owner", "owner", "owner@example.com")
	editorToken := createTestJWT(jwtSecret, "user-editor", "editor", "editor@example.com")
	viewerToken := createTestJWT(jwtSecret, "user-viewer", "viewer", "viewer@example.com")
	hybridToken := createTestJWT(jwtSecret, "user-hybrid", "hybrid", "hybrid@example.com")
	unauthorizedToken := createTestJWT(jwtSecret, "user-stranger", "stranger", "stranger@example.com")

	// Mock LiveSync API server with multi-user permissions
	mockAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Manifest endpoint
		if r.URL.Path == "/api/folders/e2e-project-alpha/manifest" {
			manifest := ProjectManifestResponse{
				ProjectID:   "e2e-project-alpha",
				ProjectName: "Alpha Project",
				OwnerID:     "user-owner",
				AccessLevel: "View",
				TotalFiles:  2,
				Files: []ProjectManifestFile{
					{
						Path:       "main.py",
						DocumentID: "doc-1",
						Title:      "main.py",
						Content:    "print('canonical main.py')",
						IsLocked:   false,
					},
					{
						Path:       "settings.json",
						DocumentID: "doc-2",
						Title:      "settings.json",
						Content:    `{"debug":false}`,
						IsLocked:   true,
					},
				},
			}
			_ = json.NewEncoder(w).Encode(manifest)
			return
		}

		// Access evaluation endpoint
		if r.URL.Path == "/api/folders/e2e-project-alpha/access" {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "Bearer "+ownerToken {
				_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "Owner"})
				return
			}
			if authHeader == "Bearer "+editorToken {
				_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "Edit"})
				return
			}
			if authHeader == "Bearer "+viewerToken {
				_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "View"})
				return
			}
			if authHeader == "Bearer "+hybridToken {
				_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "View"})
				return
			}
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden"})
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockAPI.Close()
	cfg.APIBaseURL = mockAPI.URL

	handler := middleware.JWTAuth(cfg, execHandler.RunCode)

	// 1. Owner can execute project
	t.Run("1. Owner Execution Authorized", func(t *testing.T) {
		body, _ := json.Marshal(RunExecutionRequest{
			ProjectID:  "e2e-project-alpha",
			Entrypoint: "main.py",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for owner, got %d. Body: %s", rec.Code, rec.Body.String())
		}
	})

	// 2. Editor can execute project
	t.Run("2. Editor Execution Authorized", func(t *testing.T) {
		body, _ := json.Marshal(RunExecutionRequest{
			ProjectID:  "e2e-project-alpha",
			Entrypoint: "main.py",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+editorToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for editor, got %d", rec.Code)
		}
	})

	// 3. View-Only user can execute project (Decoupled execution model)
	t.Run("3. View-Only User Execution Authorized", func(t *testing.T) {
		body, _ := json.Marshal(RunExecutionRequest{
			ProjectID:  "e2e-project-alpha",
			Entrypoint: "main.py",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+viewerToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for viewer, got %d", rec.Code)
		}
	})

	// 4. View user with single-file dirty overlay can execute project
	t.Run("4. View + Dirty Single-File Overlay Execution Authorized", func(t *testing.T) {
		body, _ := json.Marshal(RunExecutionRequest{
			ProjectID:  "e2e-project-alpha",
			Entrypoint: "main.py",
			Overlay: map[string]string{
				"main.py": "print('modified overlay by viewer in memory')",
			},
		})
		req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+hybridToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for hybrid user, got %d", rec.Code)
		}

		var resp RunExecutionResponse
		_ = json.NewDecoder(rec.Body).Decode(&resp)
		if resp.SandboxDir == "" {
			t.Fatalf("expected sandboxDir to be populated")
		}

		// Verify sandbox has modified overlay
		sbData, _ := os.ReadFile(filepath.Join(resp.SandboxDir, "main.py"))
		if string(sbData) != "print('modified overlay by viewer in memory')" {
			t.Fatalf("expected sandbox to have dirty overlay, got: %s", string(sbData))
		}
		_ = CleanupEphemeralSandbox(resp.SandboxDir)
	})

	// 5. Unauthorized user is rejected with 403 Forbidden
	t.Run("5. Unauthorized Project Access Rejected 403", func(t *testing.T) {
		body, _ := json.Marshal(RunExecutionRequest{
			ProjectID:  "e2e-project-alpha",
			Entrypoint: "main.py",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+unauthorizedToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for unauthorized user, got %d", rec.Code)
		}
	})

	// 6. Missing or Invalid JWT is rejected with 401 Unauthorized
	t.Run("6. Missing/Invalid JWT Rejected 401", func(t *testing.T) {
		body, _ := json.Marshal(RunExecutionRequest{
			ProjectID:  "e2e-project-alpha",
			Entrypoint: "main.py",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", rec.Code)
		}
	})

	// 7. Concurrent Execution Sandbox Isolation
	t.Run("7. Concurrent Execution Sandbox Isolation", func(t *testing.T) {
		var wg sync.WaitGroup
		concurrency := 10
		sandboxDirs := make([]string, concurrency)
		errors := make([]error, concurrency)

		for i := 0; i < concurrency; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				customContent := fmt.Sprintf("print('run concurrent index %d')", idx)
				body, _ := json.Marshal(RunExecutionRequest{
					ProjectID:  "e2e-project-alpha",
					Entrypoint: "main.py",
					Overlay: map[string]string{
						"main.py": customContent,
					},
				})
				req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
				req.Header.Set("Authorization", "Bearer "+editorToken)
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, req)

				if rec.Code != http.StatusOK {
					errors[idx] = fmt.Errorf("expected 200, got %d", rec.Code)
					return
				}

				var resp RunExecutionResponse
				_ = json.NewDecoder(rec.Body).Decode(&resp)
				sandboxDirs[idx] = resp.SandboxDir

				// Verify isolated content
				sbContent, readErr := os.ReadFile(filepath.Join(resp.SandboxDir, "main.py"))
				if readErr != nil || string(sbContent) != customContent {
					errors[idx] = fmt.Errorf("concurrent sandbox isolation violation in %s: %s", resp.SandboxDir, string(sbContent))
				}
			}(i)
		}
		wg.Wait()

		for i, err := range errors {
			if err != nil {
				t.Fatalf("concurrent test %d failed: %v", i, err)
			}
		}

		// Cleanup sandboxes
		for _, dir := range sandboxDirs {
			_ = CleanupEphemeralSandbox(dir)
		}
	})

	// 8. Canonical Workspace Non-Mutation Guarantee
	t.Run("8. Canonical Workspace Non-Mutation Guarantee", func(t *testing.T) {
		canonicalWs := filepath.Join(".", "workspaces", "e2e-project-alpha")
		if info, statErr := os.Stat(canonicalWs); statErr == nil && info.IsDir() {
			data, _ := os.ReadFile(filepath.Join(canonicalWs, "main.py"))
			if string(data) != "print('canonical main.py')" {
				t.Fatalf("Canonical workspace was mutated during execution runs! Content: %s", string(data))
			}
		}
	})
}
