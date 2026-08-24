package handlers

import (
	"context"
	"encoding/json"
	"fmt"
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
	"github.com/livesync/livesync-gateway/middleware"
)

const (
	// TerminalBufferSize is the recycled buffer size for PTY I/O pumps (4KB)
	TerminalBufferSize = 4096
)

// Global sync.Pool recycler eliminating repetitive 4KB heap allocations under heavy PTY throughput (PERF-12)
var terminalBufferPool = sync.Pool{
	New: func() interface{} {
		b := make([]byte, TerminalBufferSize)
		return &b
	},
}

func GetTerminalBuffer() *[]byte {
	return terminalBufferPool.Get().(*[]byte)
}

func PutTerminalBuffer(b *[]byte) {
	if b != nil {
		terminalBufferPool.Put(b)
	}
}

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

	tokenStr := middleware.GetUserToken(r.Context())
	accessLevel, accessErr := middleware.VerifyWorkspaceAccess(r.Context(), h.cfg, projectID, tokenStr)
	if accessErr != nil || accessLevel == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Forbidden: Insufficient permissions to access workspace terminal",
			"code":  "FORBIDDEN",
		})
		return
	}

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

	safeID := sanitizeWorkspaceID(projectID)
	workspaceDir := filepath.Join(".", "workspaces", safeID)
	_ = os.MkdirAll(workspaceDir, 0755)
	absWsDir, err := filepath.Abs(workspaceDir)
	if err != nil {
		absWsDir = workspaceDir
	}

	// Locate shared Python virtualenv if present
	aiVenvPath, _ := filepath.Abs("../livesync-ai/.venv")
	if _, statErr := os.Stat(aiVenvPath); statErr != nil {
		aiVenvPath, _ = filepath.Abs("../livesync-ai/venv")
	}
	aiScripts := filepath.Join(aiVenvPath, "Scripts")
	if runtime.GOOS != "windows" {
		aiScripts = filepath.Join(aiVenvPath, "bin")
	}
	aiSitePackages := filepath.Join(aiVenvPath, "Lib", "site-packages")
	if runtime.GOOS != "windows" {
		aiSitePackages = filepath.Join(aiVenvPath, "lib", "python3.14", "site-packages")
	}

	envPath := os.Getenv("PATH")
	if _, statErr := os.Stat(aiScripts); statErr == nil {
		envPath = aiScripts + string(os.PathListSeparator) + envPath
	}

	pythonPath := absWsDir
	if _, statErr := os.Stat(aiSitePackages); statErr == nil {
		pythonPath = pythonPath + string(os.PathListSeparator) + aiSitePackages
	}

	nodePath := filepath.Join(absWsDir, "node_modules")

	projectName := r.URL.Query().Get("projectName")
	if projectName == "" {
		projectName = r.URL.Query().Get("name")
	}
	if projectName == "" {
		projectName = "workspace"
	}

	// Optional subDir parameter for opening terminal in nested folders
	subDir := r.URL.Query().Get("subDir")
	targetDir := absWsDir
	displayPath := projectName
	if subDir != "" {
		cleanedSub := filepath.Clean(filepath.FromSlash(subDir))
		if !strings.HasPrefix(cleanedSub, "..") && cleanedSub != "." {
			candidateDir := filepath.Join(absWsDir, cleanedSub)
			rel, relErr := filepath.Rel(absWsDir, candidateDir)
			if relErr == nil && !strings.HasPrefix(rel, "..") {
				_ = os.MkdirAll(candidateDir, 0755)
				targetDir = candidateDir
				displayPath = filepath.ToSlash(filepath.Join(projectName, rel))
			}
		}
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
		"CURRENT_DIR="+targetDir,
		"PROJECT_NAME="+projectName,
		"PS1=\\[\\033[01;32m\\]developer@livesync\\[\\033[00m\\]:\\[\\033[01;34m\\]~/"+displayPath+"\\[\\033[00m\\]$ ",
	)

	var shellCmd string
	var shellArgs []string
	if runtime.GOOS == "windows" {
		shellCmd = "powershell.exe"
		// Ensure PowerShell strictly sets its location to targetDir upon launch
		initScript := fmt.Sprintf("Set-Location -LiteralPath '%s'; function prompt { 'developer@livesync:~/%s$ ' }", strings.ReplaceAll(targetDir, "'", "''"), displayPath)
		shellArgs = []string{"-NoLogo", "-NoExit", "-Command", initScript}
	} else {
		shellCmd = "/bin/bash"
		rcPath := filepath.Join(workspaceDir, ".livesync_bashrc")
		rcContent := "if [ -f ~/.bashrc ]; then . ~/.bashrc; elif [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi\n" +
			"cd \"" + strings.ReplaceAll(targetDir, "\"", "\\\"") + "\"\n" +
			"export PS1='\\[\\033[01;32m\\]developer@livesync\\[\\033[00m\\]:\\[\\033[01;34m\\]~/" + displayPath + "\\[\\033[00m\\]$ '\n"
		_ = os.WriteFile(rcPath, []byte(rcContent), 0644)
		shellArgs = []string{"--rcfile", rcPath}
	}

	term, err := startPlatformTerminal(shellCmd, shellArgs, targetDir, termEnv, 80, 24)
	if err != nil {
		log.Printf("Terminal spawn error: %v", err)
		welcomeMsg := "\r\n\x1b[31m❌ Failed to start interactive terminal session: " + err.Error() + "\x1b[0m\r\n"
		_ = c.Write(ctx, websocket.MessageText, []byte(welcomeMsg))
		return
	}
	defer term.Close()

	// Initial welcome notification
	welcomeMsg := "\r\n\x1b[36m⚡ LiveSync Interactive Workspace Terminal\x1b[0m\r\n" +
		"\x1b[90mWorkspace: ~/" + displayPath + "\x1b[0m\r\n\r\n"
	_ = c.Write(ctx, websocket.MessageText, []byte(welcomeMsg))

	var wg sync.WaitGroup
	wg.Add(3)

	// Background fsnotify Disk Watcher -> WebSocket JSON stream
	go func() {
		defer wg.Done()
		startWorkspaceWatcher(ctx, absWsDir, c)
	}()

	// Terminal stdout/stderr reader -> WebSocket (Recycled sync.Pool byte slices - PERF-12)
	go func() {
		defer wg.Done()
		defer cancel()
		bufPtr := GetTerminalBuffer()
		defer PutTerminalBuffer(bufPtr)
		buf := *bufPtr
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
					cmdStr := NormalizeTerminalCommand(tMsg.Data)
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

			cleanSlashRel := filepath.ToSlash(relPath)
			if !isDir && (event.Has(fsnotify.Write) || event.Has(fsnotify.Create)) {
				if GetGlobalSuppressionRegistry().IsSuppressed(wsDir, cleanSlashRel) {
					// Suppress self-change: this file was written by our atomic sync engine
					continue
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
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "node_modules", "vendor", ".git", ".venv", "venv", "__pycache__", ".pytest_cache", ".cache", ".tmp", "dist", "build", ".next", ".turbo", ".svn", ".hg", ".idea", ".vscode", ".output", "target", "obj":
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
	ext := strings.ToLower(filepath.Ext(cleaned))
	switch ext {
	case ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm", ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".iso", ".img", ".dmg", ".pkg", ".deb", ".rpm", ".pyc", ".pyd", ".pyo", ".o", ".a", ".lib", ".obj":
		return true
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
	_, _, _ = SyncWorkspaceAtomicWithRegistry(wsDir, files, lockedFiles, GetGlobalSuppressionRegistry())
}

// NormalizeTerminalCommand ensures command strings have a single platform-normalized line termination
// avoiding duplicate PTY carriage-return/newline translation artifacts.
func NormalizeTerminalCommand(cmdStr string) string {
	return normalizeTerminalCommandWithOS(cmdStr, runtime.GOOS)
}

func normalizeTerminalCommandWithOS(cmdStr string, targetOS string) string {
	if strings.HasSuffix(cmdStr, "\r\n") || strings.HasSuffix(cmdStr, "\n") || strings.HasSuffix(cmdStr, "\r") {
		return cmdStr
	}
	if targetOS == "windows" {
		return cmdStr + "\r\n"
	}
	return cmdStr + "\n"
}
