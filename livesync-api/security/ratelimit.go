package security

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

// TokenBucket implements thread-safe token bucket rate limiting.
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

	tb.tokens = math.Min(tb.capacity, tb.tokens+elapsed*tb.refillRate)

	if tb.tokens >= 1.0 {
		tb.tokens -= 1.0
		remaining := int(math.Floor(tb.tokens))
		return true, remaining, 0
	}

	missing := 1.0 - tb.tokens
	retryAfterSec := missing / tb.refillRate
	if retryAfterSec < 1.0 {
		retryAfterSec = 1.0
	}

	return false, 0, time.Duration(math.Ceil(retryAfterSec)) * time.Second
}

// APIRateLimiter manages keyed client buckets by IP or User ID with automatic eviction.
type APIRateLimiter struct {
	mu         sync.RWMutex
	buckets    map[string]*TokenBucket
	lastSeen   map[string]time.Time
	refillRate float64
	burst      int
	name       string
}

func NewAPIRateLimiter(refillRate float64, burst int, name string) *APIRateLimiter {
	rl := &APIRateLimiter{
		buckets:    make(map[string]*TokenBucket),
		lastSeen:   make(map[string]time.Time),
		refillRate: refillRate,
		burst:      burst,
		name:       name,
	}

	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			rl.cleanup(10 * time.Minute)
		}
	}()

	return rl
}

func (rl *APIRateLimiter) cleanup(ttl time.Duration) {
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

func (rl *APIRateLimiter) getBucket(key string) *TokenBucket {
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

	if tb, exists := rl.buckets[key]; exists {
		rl.lastSeen[key] = time.Now()
		return tb
	}

	tb = NewTokenBucket(rl.refillRate, rl.burst)
	rl.buckets[key] = tb
	rl.lastSeen[key] = time.Now()
	return tb
}

func (rl *APIRateLimiter) ExtractClientKey(r *http.Request) string {
	if claims, ok := GetUserClaims(r.Context()); ok && claims != nil && claims.UserID != "" {
		return "user:" + claims.UserID
	}

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

// Handler returns a standard net/http / Chi middleware handler.
func (rl *APIRateLimiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
				"message":    fmt.Sprintf("Rate limit exceeded for %s. Please retry in %d seconds.", rl.name, retrySeconds),
				"code":       "RATE_LIMIT_EXCEEDED",
				"retryAfter": retrySeconds,
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

var (
	// AuthLimiter protects login and registration endpoints against brute-force attacks (5 req/sec, burst: 10)
	AuthLimiter = NewAPIRateLimiter(5.0, 10, "Authentication API")

	// GlobalAPILimiter protects core database routes against denial-of-service spam (100 req/sec, burst: 200)
	GlobalAPILimiter = NewAPIRateLimiter(100.0, 200, "LiveSync Core API")
)
