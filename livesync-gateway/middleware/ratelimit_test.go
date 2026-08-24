package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTokenBucket_BurstAndRefill(t *testing.T) {
	// 2 tokens per second, burst capacity of 3
	tb := NewTokenBucket(2.0, 3)

	// Consume 3 tokens immediately
	for i := 0; i < 3; i++ {
		allowed, remaining, _ := tb.Allow()
		if !allowed {
			t.Fatalf("expected token %d to be allowed", i+1)
		}
		if remaining != 2-i {
			t.Fatalf("expected remaining %d, got %d", 2-i, remaining)
		}
	}

	// 4th token should be blocked
	allowed, _, retryAfter := tb.Allow()
	if allowed {
		t.Fatalf("expected 4th request to be throttled")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retryAfter duration")
	}

	// Sleep 600ms -> should refill ~1 token
	time.Sleep(600 * time.Millisecond)

	allowedAfterRefill, _, _ := tb.Allow()
	if !allowedAfterRefill {
		t.Fatalf("expected request after refill to be allowed")
	}
}

func TestRateLimiter_MiddlewareThrottle(t *testing.T) {
	// Limit to burst 2, refill 0.1/sec
	limiter := NewRateLimiter(0.1, 2, "TestLimiter")

	handler := limiter.Limit(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	// Request 1: OK
	req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req1.RemoteAddr = "192.168.1.100:1234"
	w1 := httptest.NewRecorder()
	handler(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 for req 1, got %d", w1.Code)
	}
	if w1.Header().Get("X-RateLimit-Limit") != "2" {
		t.Fatalf("expected limit header 2, got %s", w1.Header().Get("X-RateLimit-Limit"))
	}

	// Request 2: OK
	req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req2.RemoteAddr = "192.168.1.100:1234"
	w2 := httptest.NewRecorder()
	handler(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 for req 2, got %d", w2.Code)
	}

	// Request 3: 429 Too Many Requests
	req3 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req3.RemoteAddr = "192.168.1.100:1234"
	w3 := httptest.NewRecorder()
	handler(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for req 3, got %d", w3.Code)
	}

	retryAfter := w3.Header().Get("Retry-After")
	if retryAfter == "" || retryAfter == "0" {
		t.Fatalf("expected non-zero Retry-After header, got %s", retryAfter)
	}

	var errBody map[string]interface{}
	if err := json.Unmarshal(w3.Body.Bytes(), &errBody); err != nil {
		t.Fatalf("failed to decode 429 response body: %v", err)
	}
	if errBody["code"] != "RATE_LIMIT_EXCEEDED" {
		t.Fatalf("expected code RATE_LIMIT_EXCEEDED, got %v", errBody["code"])
	}

	// Different IP: OK
	reqDiffIP := httptest.NewRequest(http.MethodGet, "/test", nil)
	reqDiffIP.RemoteAddr = "192.168.1.200:5678"
	wDiff := httptest.NewRecorder()
	handler(wDiff, reqDiffIP)
	if wDiff.Code != http.StatusOK {
		t.Fatalf("expected 200 for different IP, got %d", wDiff.Code)
	}
}

func TestRateLimiter_UserIsolation(t *testing.T) {
	limiter := NewRateLimiter(0.1, 1, "UserLimiter")

	handler := limiter.Limit(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// User 1 with JWT claims
	claimsUser1 := &UserClaims{UserID: "usr-123"}
	ctx1 := context.WithValue(context.Background(), UserClaimsContextKey, claimsUser1)
	req1 := httptest.NewRequest(http.MethodGet, "/test", nil).WithContext(ctx1)
	req1.RemoteAddr = "127.0.0.1:1111"

	w1 := httptest.NewRecorder()
	handler(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 for user 1 first request, got %d", w1.Code)
	}

	// User 1 second request -> 429
	w1b := httptest.NewRecorder()
	handler(w1b, req1)
	if w1b.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for user 1 second request, got %d", w1b.Code)
	}

	// User 2 from SAME IP -> OK
	claimsUser2 := &UserClaims{UserID: "usr-456"}
	ctx2 := context.WithValue(context.Background(), UserClaimsContextKey, claimsUser2)
	req2 := httptest.NewRequest(http.MethodGet, "/test", nil).WithContext(ctx2)
	req2.RemoteAddr = "127.0.0.1:1111"

	w2 := httptest.NewRecorder()
	handler(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 for user 2, got %d", w2.Code)
	}
}
