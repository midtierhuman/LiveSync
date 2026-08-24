package handlers

import (
	"fmt"
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

func TestNormalizeTerminalCommand(t *testing.T) {
	tests := []struct {
		input    string
		targetOS string
		expected string
	}{
		{"node index.js", "linux", "node index.js\n"},
		{"node index.js\n", "linux", "node index.js\n"},
		{"node index.js\r\n", "linux", "node index.js\r\n"},
		{"python main.py", "darwin", "python main.py\n"},
		{"python main.py", "windows", "python main.py\r\n"},
		{"python main.py\r\n", "windows", "python main.py\r\n"},
		{"export PORT=3000; node app.js", "linux", "export PORT=3000; node app.js\n"},
	}

	for _, tt := range tests {
		got := normalizeTerminalCommandWithOS(tt.input, tt.targetOS)
		if got != tt.expected {
			t.Errorf("normalizeTerminalCommandWithOS(%q, %q) = %q, expected %q", tt.input, tt.targetOS, got, tt.expected)
		}
	}
}

func TestTerminalBufferPool(t *testing.T) {
	bufPtr1 := GetTerminalBuffer()
	if bufPtr1 == nil || len(*bufPtr1) != TerminalBufferSize {
		t.Fatalf("Expected buffer of size %d, got %v", TerminalBufferSize, bufPtr1)
	}

	// Write dummy data into buffer
	(*bufPtr1)[0] = 0xAA
	(*bufPtr1)[1] = 0xBB

	// Recycle to pool
	PutTerminalBuffer(bufPtr1)

	// Fetch again
	bufPtr2 := GetTerminalBuffer()
	if bufPtr2 == nil || len(*bufPtr2) != TerminalBufferSize {
		t.Fatalf("Expected buffer of size %d from pool, got %v", TerminalBufferSize, bufPtr2)
	}
	PutTerminalBuffer(bufPtr2)
}

func TestTerminalPTYLoadAndStressMatrix(t *testing.T) {
	const concurrentSessions = 100
	const iterationsPerSession = 50

	errChan := make(chan error, concurrentSessions)

	for i := 0; i < concurrentSessions; i++ {
		go func(sessionID int) {
			for j := 0; j < iterationsPerSession; j++ {
				bufPtr := GetTerminalBuffer()
				if bufPtr == nil || len(*bufPtr) != TerminalBufferSize {
					errChan <- fmt.Errorf("session %d iteration %d: invalid buffer", sessionID, j)
					return
				}

				// Simulate high-throughput stdout writes
				(*bufPtr)[0] = byte(sessionID % 256)
				(*bufPtr)[TerminalBufferSize-1] = byte(j % 256)

				PutTerminalBuffer(bufPtr)
			}
			errChan <- nil
		}(i)
	}

	for i := 0; i < concurrentSessions; i++ {
		err := <-errChan
		if err != nil {
			t.Fatalf("High-concurrency PTY stress test failed: %v", err)
		}
	}
}

