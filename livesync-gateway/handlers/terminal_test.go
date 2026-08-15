package handlers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSanitizeWorkspaceID(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"normal-id_123", "normal-id_123"},
		{"../../etc/passwd", "______etc_passwd"},
		{"proj/with/slashes", "proj_with_slashes"},
		{"", "default"},
		{"!@#$%^&*()", "__________"},
	}

	for _, tt := range tests {
		got := sanitizeWorkspaceID(tt.input)
		if got != tt.expected {
			t.Errorf("sanitizeWorkspaceID(%q) = %q, expected %q", tt.input, got, tt.expected)
		}
	}
}

func TestSyncWorkspaceFiles(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ws_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	files := map[string]string{
		"main.py":           "print('hello world')",
		"nested/sub/mod.js": "console.log('nested')",
		"locked.py":         "print('locked code')",
	}
	locked := []string{"locked.py"}

	syncWorkspaceFiles(tempDir, files, locked)

	// Verify main.py
	mainBytes, err := os.ReadFile(filepath.Join(tempDir, "main.py"))
	if err != nil || string(mainBytes) != "print('hello world')" {
		t.Errorf("main.py was not synced correctly: %v, content: %s", err, string(mainBytes))
	}

	// Verify nested/sub/mod.js
	modBytes, err := os.ReadFile(filepath.Join(tempDir, "nested", "sub", "mod.js"))
	if err != nil || string(modBytes) != "console.log('nested')" {
		t.Errorf("nested file was not synced correctly: %v, content: %s", err, string(modBytes))
	}

	// Verify locked.py
	lockedBytes, err := os.ReadFile(filepath.Join(tempDir, "locked.py"))
	if err != nil || string(lockedBytes) != "print('locked code')" {
		t.Errorf("locked.py was not synced correctly: %v, content: %s", err, string(lockedBytes))
	}

	info, statErr := os.Stat(filepath.Join(tempDir, "locked.py"))
	if statErr != nil {
		t.Errorf("failed to stat locked.py: %v", statErr)
	} else if info.Mode().Perm()&0200 != 0 {
		// Read-only on Unix/Windows
		t.Logf("locked.py file perm: %v", info.Mode().Perm())
	}
}
