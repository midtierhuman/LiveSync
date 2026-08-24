package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/livesync/livesync-gateway/config"
)

func generateTestToken(secret, issuer, audience, userId, username, email string, exp time.Duration) string {
	claims := UserClaims{
		UserID:   userId,
		UserName: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userId,
			Issuer:    issuer,
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(exp)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString([]byte(secret))
	return tokenStr
}

func TestJWTAuth_MissingToken(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:   "test-secret-at-least-32-bytes-long-key!",
		JWTIssuer:   "LiveSyncAuthAPI",
		JWTAudience: "LiveSyncClient",
	}

	nextCalled := false
	handler := JWTAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for missing token, got %d", rr.Code)
	}
	if nextCalled {
		t.Errorf("Expected handler not to be called on unauthorized request")
	}
}

func TestJWTAuth_InvalidSignature(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:   "test-secret-at-least-32-bytes-long-key!",
		JWTIssuer:   "LiveSyncAuthAPI",
		JWTAudience: "LiveSyncClient",
	}

	forgedToken := generateTestToken("wrong-secret-key-different-signature", cfg.JWTIssuer, cfg.JWTAudience, "user-1", "alice", "alice@example.com", time.Hour)

	nextCalled := false
	handler := JWTAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+forgedToken)
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for invalid signature, got %d", rr.Code)
	}
	if nextCalled {
		t.Errorf("Expected handler not to be called")
	}
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:   "test-secret-at-least-32-bytes-long-key!",
		JWTIssuer:   "LiveSyncAuthAPI",
		JWTAudience: "LiveSyncClient",
	}

	expiredToken := generateTestToken(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAudience, "user-1", "alice", "alice@example.com", -10*time.Minute)

	handler := JWTAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+expiredToken)
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for expired token, got %d", rr.Code)
	}
}

func TestJWTAuth_IssuerAndAudienceMismatch(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:   "test-secret-at-least-32-bytes-long-key!",
		JWTIssuer:   "LiveSyncAuthAPI",
		JWTAudience: "LiveSyncClient",
	}

	wrongIssuerToken := generateTestToken(cfg.JWTSecret, "UntrustedIssuer", cfg.JWTAudience, "user-1", "alice", "alice@example.com", time.Hour)

	handler := JWTAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+wrongIssuerToken)
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for wrong issuer, got %d", rr.Code)
	}
}

func TestJWTAuth_ValidToken_HeaderAndQueryParam(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:   "test-secret-at-least-32-bytes-long-key!",
		JWTIssuer:   "LiveSyncAuthAPI",
		JWTAudience: "LiveSyncClient",
	}

	validToken := generateTestToken(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAudience, "usr-99", "bob", "bob@example.com", time.Hour)

	var extractedClaims *UserClaims
	var extractedToken string

	handler := JWTAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		extractedClaims, _ = GetUserClaims(r.Context())
		extractedToken = GetUserToken(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	// 1. Via Authorization Header
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+validToken)
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for valid bearer token, got %d", rr.Code)
	}
	if extractedClaims == nil || extractedClaims.UserID != "usr-99" || extractedClaims.UserName != "bob" {
		t.Errorf("Claims not properly extracted into context: %+v", extractedClaims)
	}
	if extractedToken != validToken {
		t.Errorf("Token not properly extracted: got %s, expected %s", extractedToken, validToken)
	}

	// 2. Via Query Param ?token=
	queryReq := httptest.NewRequest(http.MethodGet, "/api/terminal/ws?token="+validToken, nil)
	queryRR := httptest.NewRecorder()

	handler(queryRR, queryReq)

	if queryRR.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for query token, got %d", queryRR.Code)
	}
}

func TestVerifyWorkspaceAccess_WithMockAPI(t *testing.T) {
	mockAPIServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer valid-token-123" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		if r.URL.Path == "/api/folders/allowed-folder-1/access" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "Edit"})
			return
		}

		if r.URL.Path == "/api/folders/view-only-folder/access" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"accessLevel": "View"})
			return
		}

		if r.URL.Path == "/api/folders/forbidden-folder/access" {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockAPIServer.Close()

	cfg := &config.Config{
		APIBaseURL: mockAPIServer.URL,
	}

	ctx := context.WithValue(context.Background(), UserClaimsContextKey, &UserClaims{
		UserID: "user-100",
	})

	// 1. Test allowed folder
	access, err := VerifyWorkspaceAccess(ctx, cfg, "allowed-folder-1", "valid-token-123")
	if err != nil || access != "Edit" {
		t.Errorf("Expected 'Edit' access, got '%s', err: %v", access, err)
	}

	// 2. Test view only folder
	access, err = VerifyWorkspaceAccess(ctx, cfg, "view-only-folder", "valid-token-123")
	if err != nil || access != "View" {
		t.Errorf("Expected 'View' access, got '%s', err: %v", access, err)
	}

	// 3. Test forbidden folder
	access, err = VerifyWorkspaceAccess(ctx, cfg, "forbidden-folder", "valid-token-123")
	if err != nil || access != "" {
		t.Errorf("Expected empty access level for forbidden folder, got '%s', err: %v", access, err)
	}
}

func TestCORS_Preflight_WithAIHeaders(t *testing.T) {
	cfg := &config.Config{
		CORSAllowedOrigins: []string{"http://localhost:4000", "http://localhost:4200"},
	}

	handler := CORS(cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/ai/stream", nil)
	req.Header.Set("Origin", "http://localhost:4000")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "x-ai-api-key, authorization, content-type")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("Expected 204 No Content for OPTIONS preflight, got %d", rr.Code)
	}

	allowedHeaders := rr.Header().Get("Access-Control-Allow-Headers")
	if !strings.Contains(allowedHeaders, "X-AI-Api-Key") || !strings.Contains(allowedHeaders, "X-Antigravity-Key") {
		t.Errorf("Expected Access-Control-Allow-Headers to contain X-AI-Api-Key and X-Antigravity-Key, got: %s", allowedHeaders)
	}

	allowOrigin := rr.Header().Get("Access-Control-Allow-Origin")
	if allowOrigin != "http://localhost:4000" {
		t.Errorf("Expected Access-Control-Allow-Origin to be http://localhost:4000, got: %s", allowOrigin)
	}
}
