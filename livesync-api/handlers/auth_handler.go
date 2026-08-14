package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/livesync/livesync-api/models"
	"github.com/livesync/livesync-api/security"
	"github.com/livesync/livesync-api/services"
)

type AuthHandler struct {
	authService *services.AuthService
	jwtService  *security.JWTService
}

func NewAuthHandler(authService *services.AuthService, jwtService *security.JWTService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		jwtService:  jwtService,
	}
}

func (h *AuthHandler) RegisterRoutes(r chi.Router) {
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", h.Register)
		r.Post("/login", h.Login)
		r.Post("/refresh", h.Refresh)
		r.Get("/me", h.Me)
		r.Post("/oauth/{provider}", h.OAuth)
	})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.AuthResponse{Success: false, Message: "Invalid request payload."})
		return
	}

	resp, err := h.authService.Register(r.Context(), &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.AuthResponse{Success: false, Message: err.Error()})
		return
	}

	status := http.StatusOK
	if !resp.Success {
		status = http.StatusBadRequest
	}
	writeJSON(w, status, resp)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.AuthResponse{Success: false, Message: "Invalid request payload."})
		return
	}

	resp, err := h.authService.Login(r.Context(), &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.AuthResponse{Success: false, Message: err.Error()})
		return
	}

	status := http.StatusOK
	if !resp.Success {
		status = http.StatusUnauthorized
	}
	writeJSON(w, status, resp)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusUnauthorized, models.AuthResponse{
		Success: false,
		Message: "Refresh token functionality not yet implemented.",
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Authorization token is missing or malformed."})
		return
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := h.jwtService.Parse(tokenStr)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Invalid or expired token."})
		return
	}

	writeJSON(w, http.StatusOK, models.UserInfo{
		ID:        claims.UserID,
		Email:     &claims.Email,
		UserName:  &claims.UserName,
		FirstName: nil,
		LastName:  nil,
	})
}

func (h *AuthHandler) OAuth(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if provider != "" {
		provider = strings.ToUpper(provider[:1]) + strings.ToLower(provider[1:])
	}
	writeJSON(w, http.StatusNotImplemented, models.AuthResponse{
		Success: false,
		Message: fmt.Sprintf("%s OAuth login not yet implemented.", provider),
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
