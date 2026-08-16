package handlers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEphemeralSandbox_IsolationAndTeardown(t *testing.T) {
	// 1. Create a dummy canonical workspace
	tempWs, err := os.MkdirTemp("", "canonical_ws_*")
	if err != nil {
		t.Fatalf("failed to create canonical temp ws: %v", err)
	}
	defer os.RemoveAll(tempWs)

	_ = os.WriteFile(filepath.Join(tempWs, "app.py"), []byte("print('base app')"), 0644)
	_ = os.WriteFile(filepath.Join(tempWs, "requirements.txt"), []byte("fastapi==0.100.0"), 0644)

	execID := "exec_test_sandbox_123"
	overlays := map[string]string{
		"app.py": "print('overlaid for test run')",
		"new.py": "print('brand new in run')",
	}

	sandboxDir, err := CreateEphemeralSandbox(tempWs, execID, overlays)
	if err != nil {
		t.Fatalf("CreateEphemeralSandbox failed: %v", err)
	}
	defer CleanupEphemeralSandbox(sandboxDir)

	// 2. Verify sandbox received overlaid app.py and new.py
	sbAppData, err := os.ReadFile(filepath.Join(sandboxDir, "app.py"))
	if err != nil || string(sbAppData) != "print('overlaid for test run')" {
		t.Fatalf("sandbox app.py mismatch: %v, content: %s", err, string(sbAppData))
	}

	sbNewData, err := os.ReadFile(filepath.Join(sandboxDir, "new.py"))
	if err != nil || string(sbNewData) != "print('brand new in run')" {
		t.Fatalf("sandbox new.py mismatch: %v, content: %s", err, string(sbNewData))
	}

	// 3. Verify canonical workspace was NOT modified (SEC-06 Non-Mutation Guarantee)
	canonicalAppData, err := os.ReadFile(filepath.Join(tempWs, "app.py"))
	if err != nil || string(canonicalAppData) != "print('base app')" {
		t.Fatalf("canonical app.py was mutated! Expected 'print(\\'base app\\')', got %s", string(canonicalAppData))
	}

	if _, err := os.Stat(filepath.Join(tempWs, "new.py")); !os.IsNotExist(err) {
		t.Fatalf("new.py leaked into canonical workspace!")
	}

	// 4. Test Cleanup
	if err := CleanupEphemeralSandbox(sandboxDir); err != nil {
		t.Fatalf("CleanupEphemeralSandbox failed: %v", err)
	}

	if _, err := os.Stat(sandboxDir); !os.IsNotExist(err) {
		t.Fatalf("sandboxDir still exists after cleanup!")
	}
}
