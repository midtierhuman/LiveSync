package middleware

import (
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// TokenBucket implements a thread-safe token bucket algorithm with rate and burst.
type TokenBucket struct {
	mu         sync.Mutex
	capacity   float64
	refillRate float64 // tokens per second
	tokens     float64
	lastRefill time.Time
}

func NewTokenBucket(refillRate float64, capacity int) *TokenBucket {
	return &TokenBucket{
		capacity:   float64(capacity),
		refillRate: refillRate,
		tokens:     float64(capacity),
		lastRefill: time.Now(),
	}
}

func (tb *TokenBucket) Allow() (bool, int, time.Duration) {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	tb.lastRefill = now

	// Refill tokens based on elapsed time
	tb.tokens = math.Min(tb.capacity, tb.tokens+elapsed*tb.refillRate)

	if tb.tokens >= 1.0 {
		tb.tokens -= 1.0
		remaining := int(math.Floor(tb.tokens))
		return true, remaining, 0
	}

	// Calculate wait time until at least 1 token is available
	missing := 1.0 - tb.tokens
	retryAfterSec := missing / tb.refillRate
	if retryAfterSec < 1.0 {
		retryAfterSec = 1.0
	}

	return false, 0, time.Duration(math.Ceil(retryAfterSec)) * time.Second
}

// RateLimiter manages keyed token buckets per IP or User ID with automatic eviction.
type RateLimiter struct {
	mu         sync.RWMutex
	buckets    map[string]*TokenBucket
	lastSeen   map[string]time.Time
	refillRate float64
	burst      int
	name       string
}

func NewRateLimiter(refillRate float64, burst int, name string) *RateLimiter {
	rl := &RateLimiter{
		buckets:    make(map[string]*TokenBucket),
		lastSeen:   make(map[string]time.Time),
		refillRate: refillRate,
		burst:      burst,
		name:       name,
	}

	// Periodic background cleanup of stale client buckets (inactive > 10m)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			rl.cleanup(10 * time.Minute)
		}
	}()

	return rl
}

func (rl *RateLimiter) cleanup(ttl time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for key, seen := range rl.lastSeen {
		if now.Sub(seen) > ttl {
			delete(rl.buckets, key)
			delete(rl.lastSeen, key)
		}
	}
}

func (rl *RateLimiter) getBucket(key string) *TokenBucket {
	rl.mu.RLock()
	tb, exists := rl.buckets[key]
	rl.mu.RUnlock()

	if exists {
		rl.mu.Lock()
		rl.lastSeen[key] = time.Now()
		rl.mu.Unlock()
		return tb
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Double check
	if tb, exists := rl.buckets[key]; exists {
		rl.lastSeen[key] = time.Now()
		return tb
	}

	tb = NewTokenBucket(rl.refillRate, rl.burst)
	rl.buckets[key] = tb
	rl.lastSeen[key] = time.Now()
	return tb
}

func (rl *RateLimiter) ExtractClientKey(r *http.Request) string {
	// 1. Prefer authenticated UserID from JWT context
	if claims, ok := GetUserClaims(r.Context()); ok && claims != nil && claims.UserID != "" {
		return "user:" + claims.UserID
	}

	// 2. Fallback to client IP
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		clientIP := strings.TrimSpace(parts[0])
		if clientIP != "" {
			return "ip:" + clientIP
		}
	}

	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return "ip:" + strings.TrimSpace(xri)
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return "ip:" + host
	}

	return "ip:" + r.RemoteAddr
}

// Limit wraps an http.HandlerFunc with Token Bucket rate limiting.
func (rl *RateLimiter) Limit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := rl.ExtractClientKey(r)
		bucket := rl.getBucket(key)

		allowed, remaining, retryAfter := bucket.Allow()

		w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", rl.burst))
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))

		if !allowed {
			retrySeconds := int(math.Ceil(retryAfter.Seconds()))
			if retrySeconds < 1 {
				retrySeconds = 1
			}

			w.Header().Set("Retry-After", fmt.Sprintf("%d", retrySeconds))
			w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", retrySeconds))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)

			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error":      "Too Many Requests",
				"code":       "RATE_LIMIT_EXCEEDED",
				"message":    fmt.Sprintf("Rate limit exceeded for %s. Please retry in %d seconds.", rl.name, retrySeconds),
				"retryAfter": retrySeconds,
			})
			return
		}

		next.ServeHTTP(w, r)
	}
}

// Global default tiered rate limiters for livesync-gateway
var (
	// Execution & Terminal PTY: 15 req burst, 0.5 req/sec (30 req/min)
	ExecutionLimiter = NewRateLimiter(0.5, 15, "Code Execution & Live Terminal")

	// AI Assistant Stream & Analysis: 10 req burst, 0.5 req/sec (30 req/min)
	AILimiter = NewRateLimiter(0.5, 10, "AI Pair Assistant")

	// Package Registry Search: 20 req burst, 1.0 req/sec (60 req/min)
	PackageLimiter = NewRateLimiter(1.0, 20, "Package Manager Search")

	// General API & Workspaces: 60 req burst, 5.0 req/sec (300 req/min)
	GeneralLimiter = NewRateLimiter(5.0, 60, "Gateway Workspace API")
)
