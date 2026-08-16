package handlers

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// CreateEphemeralSandbox creates an isolated, disposable execution directory
// cloned from the canonical workspace, layered with active dirty overlays.
// This guarantees that execution builds, temp files, and mutations never pollute
// the persistent collaborative workspace.
func CreateEphemeralSandbox(wsDir, execID string, overlays map[string]string) (string, error) {
	cleanExecID := sanitizeWorkspaceID(execID)
	sandboxDir := filepath.Join(".", "run", cleanExecID)
	absSandboxDir, err := filepath.Abs(sandboxDir)
	if err != nil {
		absSandboxDir = sandboxDir
	}

	if err := os.MkdirAll(absSandboxDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create sandbox directory %s: %w", absSandboxDir, err)
	}

	// 1. Copy canonical workspace files to ephemeral sandbox (if base ws exists)
	if wsDir != "" {
		if _, statErr := os.Stat(wsDir); statErr == nil {
			_ = filepath.Walk(wsDir, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return nil
				}
				rel, relErr := filepath.Rel(wsDir, path)
				if relErr != nil || isIgnoredPath(rel) {
					return nil
				}

				destPath := filepath.Join(absSandboxDir, filepath.FromSlash(rel))
				_ = os.MkdirAll(filepath.Dir(destPath), 0755)

				srcFile, openErr := os.Open(path)
				if openErr != nil {
					return nil
				}
				defer srcFile.Close()

				dstFile, createErr := os.Create(destPath)
				if createErr != nil {
					return nil
				}
				defer dstFile.Close()

				_, _ = io.Copy(dstFile, srcFile)
				return nil
			})
		}
	}

	// 2. Layer active dirty file overlays into the ephemeral sandbox
	for relPath, content := range overlays {
		if relPath == "" {
			continue
		}
		cleanRel := filepath.ToSlash(filepath.Clean(relPath))
		if strings.HasPrefix(cleanRel, "..") || strings.HasPrefix(cleanRel, "/") {
			continue
		}

		destPath := filepath.Join(absSandboxDir, filepath.FromSlash(cleanRel))
		_ = os.MkdirAll(filepath.Dir(destPath), 0755)
		_ = os.WriteFile(destPath, []byte(content), 0644)
	}

	log.Printf("🧪 [SANDBOX_CREATED] execId=%s dir=%s", execID, absSandboxDir)
	return absSandboxDir, nil
}

// CleanupEphemeralSandbox safely deletes an ephemeral execution workspace.
func CleanupEphemeralSandbox(sandboxDir string) error {
	if sandboxDir == "" || sandboxDir == "." || sandboxDir == "/" {
		return fmt.Errorf("refusing to delete unsafe directory: %s", sandboxDir)
	}
	cleanDir := filepath.Clean(sandboxDir)
	if !strings.Contains(cleanDir, "run") && !strings.Contains(cleanDir, "livesync_run") {
		return fmt.Errorf("directory %s is not an execution sandbox", sandboxDir)
	}
	err := os.RemoveAll(cleanDir)
	log.Printf("🧹 [SANDBOX_CLEANED] dir=%s", cleanDir)
	return err
}
