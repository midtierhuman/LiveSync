package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/livesync/livesync-gateway/config"
)

type contextKey string

const (
	UserContextKey       contextKey = "user"
	UserClaimsContextKey contextKey = "userClaims"
	UserTokenContextKey  contextKey = "userToken"
)

// UserClaims represents cryptographically verified JWT payload fields.
type UserClaims struct {
	UserID   string `json:"sub"`
	UserName string `json:"unique_name"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// GetUserClaims retrieves parsed UserClaims from request context.
func GetUserClaims(ctx context.Context) (*UserClaims, bool) {
	if ctx == nil {
		return nil, false
	}
	claims, ok := ctx.Value(UserClaimsContextKey).(*UserClaims)
	if !ok || claims == nil {
		if raw, okRaw := ctx.Value(UserContextKey).(*UserClaims); okRaw && raw != nil {
			return raw, true
		}
		return nil, false
	}
	return claims, true
}

// GetUserToken retrieves the raw bearer token string from request context.
func GetUserToken(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if token, ok := ctx.Value(UserTokenContextKey).(string); ok {
		return token
	}
	return ""
}

// CORS handles Cross-Origin Resource Sharing headers.
func CORS(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := false
		for _, o := range cfg.CORSAllowedOrigins {
			if o == "*" || o == origin {
				allowed = true
				break
			}
		}

		if allowed && origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else if len(cfg.CORSAllowedOrigins) > 0 {
			w.Header().Set("Access-Control-Allow-Origin", cfg.CORSAllowedOrigins[0])
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-AI-Api-Key, X-Antigravity-Key, Origin, Accept")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// JWTAuth enforces strict cryptographic JWT verification, issuer/audience validation, and identity context injection.
func JWTAuth(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		tokenStr := ""

		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		} else if queryToken := r.URL.Query().Get("token"); queryToken != "" {
			tokenStr = queryToken
		}

		if tokenStr == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"Unauthorized: Missing or empty authentication token","code":"UNAUTHORIZED"}`))
			return
		}

		claims := &UserClaims{}
		parserOpts := []jwt.ParserOption{
			jwt.WithValidMethods([]string{"HS256", "HS384", "HS512"}),
		}
		if cfg != nil && cfg.JWTIssuer != "" {
			parserOpts = append(parserOpts, jwt.WithIssuer(cfg.JWTIssuer))
		}
		if cfg != nil && cfg.JWTAudience != "" {
			parserOpts = append(parserOpts, jwt.WithAudience(cfg.JWTAudience))
		}

		jwtSecret := ""
		if cfg != nil {
			jwtSecret = cfg.JWTSecret
		}
		if jwtSecret == "" {
			jwtSecret = "LiveSync-Development-Only-Secret-Change-Me!"
		}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(jwtSecret), nil
		}, parserOpts...)

		if err != nil || !token.Valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			errMsg := "Invalid or expired token"
			if err != nil {
				errMsg = err.Error()
			}
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"Unauthorized: %s","code":"UNAUTHORIZED"}`, errMsg)))
			return
		}

		ctx := context.WithValue(r.Context(), UserClaimsContextKey, claims)
		ctx = context.WithValue(ctx, UserContextKey, claims)
		ctx = context.WithValue(ctx, UserTokenContextKey, tokenStr)

		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// AccessCacheEntry stores cached access evaluation with TTL.
type AccessCacheEntry struct {
	AccessLevel string
	ExpiresAt   time.Time
}

// WorkspaceAccessEvaluator provides cached access evaluation against livesync-api.
type WorkspaceAccessEvaluator struct {
	mu         sync.RWMutex
	cache      map[string]AccessCacheEntry
	httpClient *http.Client
}

var globalAccessEvaluator = &WorkspaceAccessEvaluator{
	cache: make(map[string]AccessCacheEntry),
	httpClient: &http.Client{
		Timeout: 5 * time.Second,
	},
}

// VerifyWorkspaceAccess verifies whether the authenticated caller has access to the workspace or document.
func VerifyWorkspaceAccess(ctx context.Context, cfg *config.Config, workspaceID, tokenStr string) (string, error) {
	cleanID := strings.TrimSpace(workspaceID)
	if cleanID == "" || cleanID == "default" || cleanID == "workspace_default" || cleanID == "temp" {
		// Scratchpad / anonymous default sessions have local edit permissions
		return "Edit", nil
	}

	claims, ok := GetUserClaims(ctx)
	if !ok || claims == nil {
		if cfg != nil && cfg.APIBaseURL == "" && tokenStr == "" {
			// In standalone test harnesses without auth middleware or APIBaseURL, permit access
			return "Edit", nil
		}
		return "", errors.New("unauthenticated context")
	}

	cacheKey := fmt.Sprintf("%s:%s", cleanID, claims.UserID)
	now := time.Now()

	globalAccessEvaluator.mu.RLock()
	entry, found := globalAccessEvaluator.cache[cacheKey]
	globalAccessEvaluator.mu.RUnlock()

	if found && entry.ExpiresAt.After(now) {
		return entry.AccessLevel, nil
	}

	if cfg == nil || cfg.APIBaseURL == "" {
		// If API Base URL is not configured, grant access by default for standalone testing
		return "Edit", nil
	}

	// 1. Try checking folder access from livesync-api
	folderURL := fmt.Sprintf("%s/api/folders/%s/access", strings.TrimRight(cfg.APIBaseURL, "/"), url.PathEscape(cleanID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, folderURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	req.Header.Set("Accept", "application/json")

	resp, err := globalAccessEvaluator.httpClient.Do(req)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var body struct {
				AccessLevel string `json:"accessLevel"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&body); err == nil && body.AccessLevel != "" {
				globalAccessEvaluator.mu.Lock()
				globalAccessEvaluator.cache[cacheKey] = AccessCacheEntry{
					AccessLevel: body.AccessLevel,
					ExpiresAt:   now.Add(10 * time.Second),
				}
				globalAccessEvaluator.mu.Unlock()
				return body.AccessLevel, nil
			}
		} else if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
			return "", nil
		}
	}

	// 2. Try checking document access from livesync-api
	docURL := fmt.Sprintf("%s/api/documents/%s/access", strings.TrimRight(cfg.APIBaseURL, "/"), url.PathEscape(cleanID))
	docReq, err := http.NewRequestWithContext(ctx, http.MethodGet, docURL, nil)
	if err == nil {
		docReq.Header.Set("Authorization", "Bearer "+tokenStr)
		docReq.Header.Set("Accept", "application/json")

		docResp, docErr := globalAccessEvaluator.httpClient.Do(docReq)
		if docErr == nil {
			defer docResp.Body.Close()
			if docResp.StatusCode == http.StatusOK {
				var body struct {
					AccessLevel string `json:"accessLevel"`
				}
				if err := json.NewDecoder(docResp.Body).Decode(&body); err == nil && body.AccessLevel != "" {
					globalAccessEvaluator.mu.Lock()
					globalAccessEvaluator.cache[cacheKey] = AccessCacheEntry{
						AccessLevel: body.AccessLevel,
						ExpiresAt:   now.Add(10 * time.Second),
					}
					globalAccessEvaluator.mu.Unlock()
					return body.AccessLevel, nil
				}
			} else if docResp.StatusCode == http.StatusForbidden || docResp.StatusCode == http.StatusUnauthorized {
				return "", nil
			}
		}
	}

	return "", nil
}
