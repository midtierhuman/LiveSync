package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/fsnotify/fsnotify"
	"github.com/livesync/livesync-gateway/config"
)

type TerminalHandler struct {
	cfg *config.Config
}

func NewTerminalHandler(cfg *config.Config) *TerminalHandler {
	return &TerminalHandler{cfg: cfg}
}

type StartWSMessage struct {
	Action      string            `json:"action"` // "run_command", "input", "stdin", "resize", "sync_files"
	Type        string            `json:"type"`
	Language    string            `json:"language,omitempty"`
	Data        string            `json:"data,omitempty"`
	Cols        uint16            `json:"cols,omitempty"`
	Rows        uint16            `json:"rows,omitempty"`
	SessionID   string            `json:"sessionId,omitempty"`
	Token       string            `json:"token,omitempty"`
	Files       map[string]string `json:"files,omitempty"`
	LockedFiles []string          `json:"lockedFiles,omitempty"`
	Entrypoint  string            `json:"entrypoint,omitempty"`
}

type SafeWSConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func NewSafeWSConn(conn *websocket.Conn) *SafeWSConn {
	return &SafeWSConn{conn: conn}
}

func (s *SafeWSConn) Write(ctx context.Context, typ websocket.MessageType, p []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Write(ctx, typ, p)
}

func (s *SafeWSConn) Close(code websocket.StatusCode, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.Close(code, reason)
}

func (s *SafeWSConn) Read(ctx context.Context) (websocket.MessageType, []byte, error) {
	return s.conn.Read(ctx)
}

func (h *TerminalHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	rawConn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("Failed to accept websocket connection: %v", err)
		return
	}
	c := NewSafeWSConn(rawConn)
	defer c.Close(websocket.StatusNormalClosure, "Session ended")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Determine workspace folder from query parameters
	projectID := r.URL.Query().Get("projectId")
	if projectID == "" {
		projectID = r.URL.Query().Get("folderId")
	}
	if projectID == "" {
		projectID = r.URL.Query().Get("sessionId")
	}
	if projectID == "" {
		projectID = "workspace_default"
	}

	safeID := sanitizeWorkspaceID(projectID)
	workspaceDir := filepath.Join(".", "workspaces", safeID)
	_ = os.MkdirAll(workspaceDir, 0755)
	absWsDir, err := filepath.Abs(workspaceDir)
	if err != nil {
		absWsDir = workspaceDir
	}

	// Locate shared sandbox virtualenv if present
	sandboxVenvPath, _ := filepath.Abs("../livesync-sandbox/venv")
	sandboxScripts := filepath.Join(sandboxVenvPath, "Scripts")
	if runtime.GOOS != "windows" {
		sandboxScripts = filepath.Join(sandboxVenvPath, "bin")
	}
	sandboxSitePackages := filepath.Join(sandboxVenvPath, "Lib", "site-packages")
	if runtime.GOOS != "windows" {
		sandboxSitePackages = filepath.Join(sandboxVenvPath, "lib", "python3.14", "site-packages")
	}

	envPath := os.Getenv("PATH")
	if _, statErr := os.Stat(sandboxScripts); statErr == nil {
		envPath = sandboxScripts + string(os.PathListSeparator) + envPath
	}

	pythonPath := absWsDir
	if _, statErr := os.Stat(sandboxSitePackages); statErr == nil {
		pythonPath = pythonPath + string(os.PathListSeparator) + sandboxSitePackages
	}

	nodePath := filepath.Join(absWsDir, "node_modules")

	projectName := r.URL.Query().Get("projectName")
	if projectName == "" {
		projectName = r.URL.Query().Get("name")
	}
	if projectName == "" {
		projectName = "workspace"
	}

	termEnv := append(os.Environ(),
		"PATH="+envPath,
		"PYTHONPATH="+pythonPath,
		"NODE_PATH="+nodePath,
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"PYTHONUNBUFFERED=1",
		"NODE_NO_WARNINGS=1",
		"WORKSPACE_DIR="+absWsDir,
		"PROJECT_NAME="+projectName,
		"PS1=\\[\\033[01;32m\\]developer@livesync\\[\\033[00m\\]:\\[\\033[01;34m\\]~/"+projectName+"\\[\\033[00m\\]$ ",
	)

	var shellCmd string
	var shellArgs []string
	if runtime.GOOS == "windows" {
		shellCmd = "powershell.exe"
		shellArgs = []string{"-NoLogo", "-NoExit", "-Command", "function prompt { 'developer@livesync:~/" + projectName + "$ ' }"}
	} else {
		shellCmd = "/bin/bash"
		rcPath := filepath.Join(workspaceDir, ".livesync_bashrc")
		rcContent := "if [ -f ~/.bashrc ]; then . ~/.bashrc; elif [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi\n" +
			"export PS1='\\[\\033[01;32m\\]developer@livesync\\[\\033[00m\\]:\\[\\033[01;34m\\]~/" + projectName + "\\[\\033[00m\\]$ '\n"
		_ = os.WriteFile(rcPath, []byte(rcContent), 0644)
		shellArgs = []string{"--rcfile", rcPath}
	}

	term, err := startPlatformTerminal(shellCmd, shellArgs, absWsDir, termEnv, 80, 24)
	if err != nil {
		log.Printf("Terminal spawn error: %v", err)
		welcomeMsg := "\r\n\x1b[31m❌ Failed to start interactive terminal session: " + err.Error() + "\x1b[0m\r\n"
		_ = c.Write(ctx, websocket.MessageText, []byte(welcomeMsg))
		return
	}
	defer term.Close()

	// Initial welcome notification
	welcomeMsg := "\r\n\x1b[36m⚡ LiveSync Interactive Workspace Terminal\x1b[0m\r\n" +
		"\x1b[90mWorkspace: ~/" + projectName + "\x1b[0m\r\n\r\n"
	_ = c.Write(ctx, websocket.MessageText, []byte(welcomeMsg))

	var wg sync.WaitGroup
	wg.Add(3)

	// Background fsnotify Disk Watcher -> WebSocket JSON stream
	go func() {
		defer wg.Done()
		startWorkspaceWatcher(ctx, absWsDir, c)
	}()

	// Terminal stdout/stderr reader -> WebSocket
	go func() {
		defer wg.Done()
		defer cancel()
		buf := make([]byte, 4096)
		for {
			n, readErr := term.Read(buf)
			if n > 0 {
				writeErr := c.Write(ctx, websocket.MessageText, buf[:n])
				if writeErr != nil {
					return
				}
			}
			if readErr != nil {
				return
			}
		}
	}()

	// WebSocket input -> Terminal
	go func() {
		defer wg.Done()
		defer cancel()
		for {
			_, msgBytes, readErr := c.Read(ctx)
			if readErr != nil {
				return
			}

			// Check if message is a structured JSON command
			var tMsg StartWSMessage
			if jsonErr := json.Unmarshal(msgBytes, &tMsg); jsonErr == nil && (tMsg.Action != "" || tMsg.Type != "") {
				if len(tMsg.Files) > 0 {
					syncWorkspaceFiles(absWsDir, tMsg.Files, tMsg.LockedFiles)
				}

				if (tMsg.Action == "resize" || tMsg.Type == "resize") && tMsg.Cols > 0 && tMsg.Rows > 0 {
					_ = term.Resize(tMsg.Cols, tMsg.Rows)
					continue
				} else if tMsg.Action == "run_command" && tMsg.Data != "" {
					cmdStr := tMsg.Data
					if !strings.HasSuffix(cmdStr, "\n") && !strings.HasSuffix(cmdStr, "\r") {
						cmdStr += "\r\n"
					}
					_, _ = term.Write([]byte(cmdStr))
					continue
				} else if (tMsg.Action == "input" || tMsg.Action == "stdin" || tMsg.Type == "input") && tMsg.Data != "" {
					_, _ = term.Write([]byte(tMsg.Data))
					continue
				} else if tMsg.Action == "sync_files" {
					continue
				}
				// Any other JSON action is handled/ignored safely without leaking into terminal stdin
				continue
			}

			// Raw single/multi keystroke from xterm.js
			_, _ = term.Write(msgBytes)
		}
	}()

	wg.Wait()
}

type FSChangeEvent struct {
	Type      string `json:"type"`   // "fs_change"
	Action    string `json:"action"` // "fs_change"
	Event     string `json:"event"`  // "create", "write", "remove", "rename"
	Path      string `json:"path"`
	IsDir     bool   `json:"isDir"`
	Timestamp int64  `json:"timestamp"`
}

func startWorkspaceWatcher(ctx context.Context, wsDir string, c *SafeWSConn) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("[FSWatcher] Failed to initialize watcher for %s: %v", wsDir, err)
		return
	}
	defer watcher.Close()

	// Initial recursive directory discovery
	watchRecursive(watcher, wsDir)

	var debounceMu sync.Mutex
	var debounceTimer *time.Timer
	pendingEvents := make(map[string]FSChangeEvent)

	flushEvents := func() {
		debounceMu.Lock()
		defer debounceMu.Unlock()
		if len(pendingEvents) == 0 {
			return
		}
		for _, ev := range pendingEvents {
			jsonBytes, err := json.Marshal(ev)
			if err == nil {
				_ = c.Write(ctx, websocket.MessageText, jsonBytes)
			}
		}
		pendingEvents = make(map[string]FSChangeEvent)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[FSWatcher] Watcher error: %v", err)
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			relPath, err := filepath.Rel(wsDir, event.Name)
			if err != nil || isIgnoredPath(relPath) {
				continue
			}

			isDir := false
			if info, statErr := os.Stat(event.Name); statErr == nil {
				isDir = info.IsDir()
				if isDir && event.Has(fsnotify.Create) {
					watchRecursive(watcher, event.Name)
				}
			}

			eventKind := "write"
			if event.Has(fsnotify.Create) {
				eventKind = "create"
			} else if event.Has(fsnotify.Remove) {
				eventKind = "remove"
			} else if event.Has(fsnotify.Rename) {
				eventKind = "rename"
			}

			changeEv := FSChangeEvent{
				Type:      "fs_change",
				Action:    "fs_change",
				Event:     eventKind,
				Path:      filepath.ToSlash(relPath),
				IsDir:     isDir,
				Timestamp: time.Now().UnixMilli(),
			}

			debounceMu.Lock()
			pendingEvents[changeEv.Path] = changeEv
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(150*time.Millisecond, flushEvents)
			debounceMu.Unlock()
		}
	}
}

func watchRecursive(watcher *fsnotify.Watcher, rootDir string) {
	_ = filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			base := filepath.Base(path)
			if isIgnoredDirName(base) {
				return filepath.SkipDir
			}
			_ = watcher.Add(path)
		}
		return nil
	})
}

func isIgnoredDirName(name string) bool {
	switch strings.ToLower(name) {
	case "node_modules", ".git", ".venv", "venv", "__pycache__", ".pytest_cache", ".cache", ".tmp", "dist", "build":
		return true
	default:
		return false
	}
}

func isIgnoredPath(relPath string) bool {
	cleaned := filepath.ToSlash(relPath)
	parts := strings.Split(cleaned, "/")
	for _, p := range parts {
		if isIgnoredDirName(p) || (strings.HasPrefix(p, ".") && p != ".") {
			return true
		}
	}
	return false
}

func sanitizeWorkspaceID(raw string) string {
	cleaned := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, raw)
	if cleaned == "" {
		return "default"
	}
	return cleaned
}

func syncWorkspaceFiles(wsDir string, files map[string]string, lockedFiles []string) {
	lockedMap := make(map[string]bool)
	for _, f := range lockedFiles {
		if f != "" {
			lockedMap[filepath.Clean(f)] = true
		}
	}

	for relPath, content := range files {
		if relPath == "" {
			continue
		}
		cleanedRel := filepath.Clean(relPath)
		if strings.HasPrefix(cleanedRel, "..") {
			continue
		}
		targetPath := filepath.Join(wsDir, cleanedRel)
		_ = os.MkdirAll(filepath.Dir(targetPath), 0755)

		// If the file was previously read-only, temporarily allow write to sync canonical content
		_ = os.Chmod(targetPath, 0644)
		_ = os.WriteFile(targetPath, []byte(content), 0644)

		// Enforce OS read-only permissions if file is locked
		if lockedMap[cleanedRel] {
			_ = os.Chmod(targetPath, 0444)
		}
	}
}

