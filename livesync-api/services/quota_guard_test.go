package services

import (
	"strings"
	"testing"
)

func TestIsBlockedDirectoryName(t *testing.T) {
	blocked := []string{"node_modules", "vendor", ".venv", "venv", "__pycache__", "dist", "build", ".git", "NODE_MODULES", "  .cache  "}
	for _, dir := range blocked {
		if !IsBlockedDirectoryName(dir) {
			t.Errorf("expected '%s' to be blocked", dir)
		}
	}

	allowed := []string{"src", "app", "components", "utils", "public", "assets", "models", "handlers"}
	for _, dir := range allowed {
		if IsBlockedDirectoryName(dir) {
			t.Errorf("expected '%s' to be allowed", dir)
		}
	}
}

func TestIsBlockedFileExtension(t *testing.T) {
	blocked := []string{"main.exe", "lib.so", "test.dll", "bundle.zip", "archive.tar.gz", "app.bin", "model.pyc", "program.wasm"}
	for _, file := range blocked {
		if !IsBlockedFileExtension(file) {
			t.Errorf("expected '%s' to be blocked", file)
		}
	}

	allowed := []string{"index.html", "style.css", "main.js", "app.ts", "server.go", "script.py", "package.json", "README.md", "data.json"}
	for _, file := range allowed {
		if IsBlockedFileExtension(file) {
			t.Errorf("expected '%s' to be allowed", file)
		}
	}
}

func TestValidatePathAndName(t *testing.T) {
	// Rejection test cases
	invalidCases := []string{
		"",
		"   ",
		"node_modules/express/index.js",
		"src/vendor/lib.js",
		"dist/bundle.js",
		".git/config",
		"app/binary.exe",
		"../secret.txt",
		"src/../../etc/passwd",
	}

	for _, tc := range invalidCases {
		err := ValidatePathAndName(tc)
		if err == nil {
			t.Errorf("expected error for invalid path '%s', got nil", tc)
		}
	}

	// Allowed test cases
	validCases := []string{
		"index.html",
		"src/main.ts",
		"app/components/header.component.ts",
		"styles/main.css",
		"package.json",
		"README.md",
		"api/routes.go",
	}

	for _, tc := range validCases {
		err := ValidatePathAndName(tc)
		if err != nil {
			t.Errorf("expected valid path '%s' to pass, got error: %v", tc, err)
		}
	}
}

func TestValidateContentSize(t *testing.T) {
	smallContent := "console.log('Hello LiveSync');"
	if err := ValidateContentSize(smallContent); err != nil {
		t.Errorf("expected small content to pass: %v", err)
	}

	// 300 KB content
	hugeContent := strings.Repeat("A", 300*1024)
	if err := ValidateContentSize(hugeContent); err == nil {
		t.Errorf("expected 300 KB content to be rejected, but got nil")
	}
}
