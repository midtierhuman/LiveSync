package security

import (
	"testing"
	"time"

	"github.com/livesync/livesync-api/models"
)

func TestJWTService(t *testing.T) {
	secret := "0123456789012345678901234567890123456789"
	jwtService, err := NewJWTService(secret, "LiveSyncAuthAPI", "LiveSyncClient", 24)
	if err != nil {
		t.Fatalf("Failed to create JWT service: %v", err)
	}

	userName := "testuser"
	email := "test@livesync.io"
	user := &models.ApplicationUser{
		ID:        "user-uuid-123",
		UserName:  &userName,
		Email:     &email,
		CreatedAt: time.Now(),
	}

	tokenStr, exp, err := jwtService.Generate(user)
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}
	if tokenStr == "" {
		t.Errorf("Expected non-empty token string")
	}
	if exp.Before(time.Now()) {
		t.Errorf("Expiration should be in the future")
	}

	claims, err := jwtService.Parse(tokenStr)
	if err != nil {
		t.Fatalf("Failed to parse token: %v", err)
	}

	if claims.UserID != user.ID {
		t.Errorf("Expected UserID %s, got %s", user.ID, claims.UserID)
	}
	if claims.UserName != userName {
		t.Errorf("Expected UserName %s, got %s", userName, claims.UserName)
	}
	if claims.Email != email {
		t.Errorf("Expected Email %s, got %s", email, claims.Email)
	}
}
