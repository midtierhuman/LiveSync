package security

import (
	"testing"
)

func TestPasswordHasher(t *testing.T) {
	hasher := NewPasswordHasher()
	password := "LiveSyncSecret123!"

	hash, err := hasher.Hash(password)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	if !hasher.Matches(password, hash) {
		t.Errorf("Password should match its own hash")
	}

	if hasher.Matches("WrongPassword123!", hash) {
		t.Errorf("Password should not match wrong password")
	}
}

func TestValidatePasswordStrength(t *testing.T) {
	tests := []struct {
		password string
		valid    bool
	}{
		{"Short1", true},
		{"abc", false},
		{"alllowercase1", false},
		{"ALLUPPERCASE1", false},
		{"NoDigitsHere", false},
		{"ValidPass99!", true},
	}

	for _, tt := range tests {
		err := ValidatePasswordStrength(tt.password)
		if tt.valid && err != nil {
			t.Errorf("Expected password %q to be valid, got err: %v", tt.password, err)
		}
		if !tt.valid && err == nil {
			t.Errorf("Expected password %q to be invalid, got nil err", tt.password)
		}
	}
}
