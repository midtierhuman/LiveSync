package security

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAPITokenBucket_Refill(t *testing.T) {
	tb := NewTokenBucket(2.0, 2)

	// Consume 2 tokens
	a1, _, _ := tb.Allow()
	a2, _, _ := tb.Allow()
	if !a1 || !a2 {
		t.Fatalf("expected first 2 tokens to be allowed")
	}

	// 3rd should be denied
	a3, _, retryAfter := tb.Allow()
	if a3 {
		t.Fatalf("expected 3rd token to be denied")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retryAfter duration")
	}

	time.Sleep(600 * time.Millisecond)

	a4, _, _ := tb.Allow()
	if !a4 {
		t.Fatalf("expected token after refill to be allowed")
	}
}

func TestAPIRateLimiter_MiddlewareThrottle(t *testing.T) {
	limiter := NewAPIRateLimiter(0.1, 2, "TestAuthLimiter")

	handler := limiter.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	}))

	// 1: OK
	req1 := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req1.RemoteAddr = "10.0.0.5:4321"
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 for req 1, got %d", w1.Code)
	}

	// 2: OK
	req2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req2.RemoteAddr = "10.0.0.5:4321"
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 for req 2, got %d", w2.Code)
	}

	// 3: 429 Too Many Requests
	req3 := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req3.RemoteAddr = "10.0.0.5:4321"
	w3 := httptest.NewRecorder()
	handler.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for req 3, got %d", w3.Code)
	}

	var errBody map[string]interface{}
	if err := json.Unmarshal(w3.Body.Bytes(), &errBody); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if errBody["code"] != "RATE_LIMIT_EXCEEDED" {
		t.Fatalf("expected code RATE_LIMIT_EXCEEDED, got %v", errBody["code"])
	}
}

func TestAPIRateLimiter_UserContext(t *testing.T) {
	limiter := NewAPIRateLimiter(0.1, 1, "UserLimiter")

	handler := limiter.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	claims := &UserClaims{UserID: "usr-999"}
	ctx := context.WithValue(context.Background(), UserContextKey, claims)

	req1 := httptest.NewRequest(http.MethodGet, "/api/documents", nil).WithContext(ctx)
	req1.RemoteAddr = "1.2.3.4:5555"

	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w1.Code)
	}

	// Throttled
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req1)
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w2.Code)
	}
}
