package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/middleware"
)

func createTestJWT(secret, userId, username, email string) string {
	claims := middleware.UserClaims{
		UserID:   userId,
		UserName: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString([]byte(secret))
	return tokenStr
}

func TestExecutionAuthorization_DecoupledModel(t *testing.T) {
	jwtSecret := "test-secret-for-exec-auth-testing-12345"
	cfg := &config.Config{
		JWTSecret: jwtSecret,
	}

	execHandler := NewExecutionHandler(cfg, nil)

	// Mock LiveSync API server that returns access levels
	mockAPIServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/folders/proj-view-only/access" {
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "View"})
			return
		}
		if r.URL.Path == "/api/folders/proj-edit/access" {
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "Edit"})
			return
		}
		if r.URL.Path == "/api/folders/proj-owner/access" {
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "Owner"})
			return
		}
		if r.URL.Path == "/api/folders/proj-no-access/access" {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockAPIServer.Close()
	cfg.APIBaseURL = mockAPIServer.URL

	handler := middleware.JWTAuth(cfg, execHandler.RunCode)
	validToken := createTestJWT(jwtSecret, "user-viewer-1", "viewer1", "viewer1@example.com")

	tests := []struct {
		name           string
		token          string
		projectID      string
		expectedStatus int
		expectedLevel  string
	}{
		{
			name:           "View access can execute project (ARCH-11)",
			token:          validToken,
			projectID:      "proj-view-only",
			expectedStatus: http.StatusOK,
			expectedLevel:  "View",
		},
		{
			name:           "Edit access can execute project",
			token:          validToken,
			projectID:      "proj-edit",
			expectedStatus: http.StatusOK,
			expectedLevel:  "Edit",
		},
		{
			name:           "Owner access can execute project",
			token:          validToken,
			projectID:      "proj-owner",
			expectedStatus: http.StatusOK,
			expectedLevel:  "Owner",
		},
		{
			name:           "No project access is rejected with 403 Forbidden",
			token:          validToken,
			projectID:      "proj-no-access",
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "Missing or invalid JWT returns 401 Unauthorized",
			token:          "invalid-garbage-token",
			projectID:      "proj-view-only",
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(RunExecutionRequest{
				ProjectID:  tt.projectID,
				Entrypoint: "src/main.ts",
				Revision:   10,
				Overlay:    map[string]string{"src/main.ts": "console.log('test');"},
			})

			req := httptest.NewRequest(http.MethodPost, "/api/execution/run", bytes.NewReader(body))
			if tt.token != "" {
				req.Header.Set("Authorization", "Bearer "+tt.token)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Fatalf("expected status %d, got %d. Body: %s", tt.expectedStatus, rec.Code, rec.Body.String())
			}

			if tt.expectedStatus == http.StatusOK {
				var resp RunExecutionResponse
				if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
					t.Fatalf("failed to decode response: %v", err)
				}
				if resp.AccessLevel != tt.expectedLevel {
					t.Fatalf("expected accessLevel %s, got %s", tt.expectedLevel, resp.AccessLevel)
				}
				if resp.Status != "Authorized" {
					t.Fatalf("expected status Authorized, got %s", resp.Status)
				}
			}
		})
	}
}

func TestTerminalAuthorization_IsolationFromViewExecution(t *testing.T) {
	jwtSecret := "test-secret-for-terminal-isolation-12345"
	cfg := &config.Config{
		JWTSecret: jwtSecret,
	}
	termHandler := NewTerminalHandler(cfg)

	// Mock LiveSync API server
	mockAPIServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/folders/proj-view-only/access" {
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "View"})
			return
		}
		if r.URL.Path == "/api/folders/proj-edit/access" {
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "Edit"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockAPIServer.Close()
	cfg.APIBaseURL = mockAPIServer.URL

	handler := middleware.JWTAuth(cfg, termHandler.ServeWS)
	validToken := createTestJWT(jwtSecret, "user-viewer-2", "viewer2", "viewer2@example.com")

	// View-only user attempting to access interactive terminal PTY
	req := httptest.NewRequest(http.MethodGet, "/api/terminal/ws?projectId=proj-view-only", nil)
	req.Header.Set("Authorization", "Bearer "+validToken)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Must be rejected with 403 Forbidden because View-only cannot access terminal
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for View-only user on terminal, got %d. Body: %s", rec.Code, rec.Body.String())
	}
}
