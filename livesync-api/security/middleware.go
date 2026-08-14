package security

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey string

const (
	UserContextKey     contextKey = "userClaims"
	UserIDContextKey   contextKey = "userId"
	UserNameContextKey contextKey = "userName"
	EmailContextKey    contextKey = "email"
)

type AuthMiddleware struct {
	jwtService *JWTService
}

func NewAuthMiddleware(jwtService *JWTService) *AuthMiddleware {
	return &AuthMiddleware{jwtService: jwtService}
}

func (m *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "Authorization token is missing or malformed."})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := m.jwtService.Parse(tokenStr)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "Invalid or expired token."})
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		ctx = context.WithValue(ctx, UserIDContextKey, claims.UserID)
		ctx = context.WithValue(ctx, UserNameContextKey, claims.UserName)
		ctx = context.WithValue(ctx, EmailContextKey, claims.Email)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserID(ctx context.Context) (string, bool) {
	val, ok := ctx.Value(UserIDContextKey).(string)
	return val, ok && val != ""
}

func GetUserClaims(ctx context.Context) (*UserClaims, bool) {
	val, ok := ctx.Value(UserContextKey).(*UserClaims)
	return val, ok && val != nil
}
