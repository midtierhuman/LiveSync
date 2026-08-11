package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/creack/pty"
	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
)

type TerminalHandler struct {
	cfg        *config.Config
	grpcClient pb.SandboxServiceClient
}

func NewTerminalHandler(cfg *config.Config, grpcClient pb.SandboxServiceClient) *TerminalHandler {
	return &TerminalHandler{cfg: cfg, grpcClient: grpcClient}
}

type StartWSMessage struct {
	Action    string `json:"action"` // "start", "input", "stdin", "resize", "kill"
	Type      string `json:"type"`
	Language  string `json:"language"`
	Code      string `json:"code"`
	TimeoutMS int32  `json:"timeoutMs"`
	Data      string `json:"data"`
	Cols      uint16 `json:"cols"`
	Rows      uint16 `json:"rows"`
	SessionID string `json:"sessionId"`
	Token     string `json:"token"`
}

type StreamEventJSON struct {
	Type                string  `json:"type"` // "status", "stdout", "stderr", "exit", "error"
	Data                string  `json:"data,omitempty"`
	Message             string  `json:"message,omitempty"`
	Status              string  `json:"status,omitempty"`
	ExitCode            int32   `json:"exitCode,omitempty"`
	IsSuccess           bool    `json:"isSuccess,omitempty"`
	SessionID           string  `json:"sessionId,omitempty"`
	ExecutionDurationMS float64 `json:"executionDurationMs,omitempty"`
}

func (h *TerminalHandler) ServeExecutionStream(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("Failed to accept execution stream websocket: %v", err)
		return
	}
	defer c.Close(websocket.StatusNormalClosure, "Execution ended")

	ctx := r.Context()

	// Read initial start message
	_, msgBytes, err := c.Read(ctx)
	if err != nil {
		return
	}

	var initMsg StartWSMessage
	if err := json.Unmarshal(msgBytes, &initMsg); err != nil {
		h.sendEvent(ctx, c, StreamEventJSON{Type: "error", Message: "Invalid start JSON payload"})
		return
	}

	h.sendEvent(ctx, c, StreamEventJSON{Type: "status", Status: "Running", SessionID: initMsg.SessionID})

	// Create temporary directory & file for source code execution
	tempDir, err := os.MkdirTemp("", "livesync_exec_*")
	if err != nil {
		h.sendEvent(ctx, c, StreamEventJSON{Type: "error", Message: "Failed to create temp dir"})
		return
	}
	defer os.RemoveAll(tempDir)

	execCmd, fileName := h.resolveCmd(initMsg.Language)
	scriptPath := filepath.Join(tempDir, fileName)

	if err := os.WriteFile(scriptPath, []byte(initMsg.Code), 0644); err != nil {
		h.sendEvent(ctx, c, StreamEventJSON{Type: "error", Message: "Failed to write source code file"})
		return
	}

	var cmd *exec.Cmd
	switch initMsg.Language {
	case "python", "py":
		cmd = exec.Command(execCmd, "-u", scriptPath)
	case "javascript", "js", "node":
		cmd = exec.Command(execCmd, scriptPath)
	case "java":
		cmd = exec.Command(execCmd, scriptPath)
	case "csharp", "cs":
		cmd = exec.Command(execCmd, "run", "--project", tempDir)
	default:
		cmd = exec.Command(execCmd, "-u", scriptPath)
	}

	cmd.Dir = tempDir
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1", "TERM=xterm-256color")

	startNs := time.Now()

	ptmx, ptyErr := pty.Start(cmd)
	if ptyErr != nil {
		// Fallback to gRPC ExecuteCode if PTY allocation fails
		execResp, execErr := h.grpcClient.ExecuteCode(ctx, &pb.ExecutionRequest{
			Language:      initMsg.Language,
			Code:          initMsg.Code,
			StandardInput: initMsg.Data,
			TimeoutMs:     initMsg.TimeoutMS,
		})
		if execErr != nil {
			h.sendEvent(ctx, c, StreamEventJSON{Type: "error", Message: execErr.Error(), SessionID: initMsg.SessionID})
			return
		}
		if execResp.Stdout != "" {
			h.sendEvent(ctx, c, StreamEventJSON{Type: "stdout", Data: execResp.Stdout, SessionID: initMsg.SessionID})
		}
		if execResp.Stderr != "" {
			h.sendEvent(ctx, c, StreamEventJSON{Type: "stderr", Data: execResp.Stderr, SessionID: initMsg.SessionID})
		}
		h.sendEvent(ctx, c, StreamEventJSON{
			Type:                "exit",
			Status:              "Finished",
			ExitCode:            execResp.ExitCode,
			IsSuccess:           execResp.IsSuccess,
			SessionID:           initMsg.SessionID,
			ExecutionDurationMS: float64(execResp.ExecutionTimeMs),
		})
		return
	}

	defer func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	}()

	var wg sync.WaitGroup
	wg.Add(2)

	// Stream PTY output -> WebSocket stdout
	go func() {
		defer wg.Done()
		buf := make([]byte, 1024)
		for {
			n, readErr := ptmx.Read(buf)
			if n > 0 {
				h.sendEvent(ctx, c, StreamEventJSON{
					Type:      "stdout",
					Data:      string(buf[:n]),
					SessionID: initMsg.SessionID,
				})
			}
			if readErr != nil {
				return
			}
		}
	}()

	// Pipe WebSocket client input -> PTY stdin
	go func() {
		defer wg.Done()
		for {
			_, inBytes, readErr := c.Read(ctx)
			if readErr != nil {
				return
			}

			var inMsg StartWSMessage
			if err := json.Unmarshal(inBytes, &inMsg); err == nil {
				if inMsg.Action == "kill" {
					if cmd.Process != nil {
						_ = cmd.Process.Kill()
					}
					return
				}
				if (inMsg.Action == "stdin" || inMsg.Action == "input" || inMsg.Type == "input") && inMsg.Data != "" {
					_, _ = ptmx.Write([]byte(inMsg.Data))
					continue
				}
			}

			_, _ = ptmx.Write(inBytes)
		}
	}()

	_ = cmd.Wait()
	wg.Wait()

	durationMs := float64(time.Since(startNs).Milliseconds())
	exitCode := int32(0)
	if cmd.ProcessState != nil {
		exitCode = int32(cmd.ProcessState.ExitCode())
	}

	h.sendEvent(ctx, c, StreamEventJSON{
		Type:                "exit",
		Status:              "Finished",
		ExitCode:            exitCode,
		IsSuccess:           exitCode == 0,
		SessionID:           initMsg.SessionID,
		ExecutionDurationMS: durationMs,
	})
}

func (h *TerminalHandler) resolveCmd(language string) (string, string) {
	switch language {
	case "python", "py":
		if path, err := exec.LookPath("python3"); err == nil {
			return path, "script.py"
		}
		if path, err := exec.LookPath("py"); err == nil {
			return path, "script.py"
		}
		if path, err := exec.LookPath("python"); err == nil {
			return path, "script.py"
		}
		return "python", "script.py"
	case "javascript", "js", "node":
		if path, err := exec.LookPath("node"); err == nil {
			return path, "script.js"
		}
		return "node", "script.js"
	case "java":
		if path, err := exec.LookPath("java"); err == nil {
			return path, "Main.java"
		}
		return "java", "Main.java"
	case "csharp", "cs":
		if path, err := exec.LookPath("dotnet"); err == nil {
			return path, "Program.cs"
		}
		return "dotnet", "Program.cs"
	default:
		return "python", "script.py"
	}
}

func (h *TerminalHandler) sendEvent(ctx context.Context, c *websocket.Conn, event StreamEventJSON) {
	bytes, err := json.Marshal(event)
	if err == nil {
		_ = c.Write(ctx, websocket.MessageText, bytes)
	}
}

func (h *TerminalHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("Failed to accept websocket connection: %v", err)
		return
	}
	defer c.Close(websocket.StatusNormalClosure, "Session ended")

	ctx := r.Context()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd.exe")
	} else {
		cmd = exec.Command("/bin/bash")
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("PTY allocation warning: %v. Using standard pipe fallback.", err)
		h.handleStandardPipes(ctx, c, cmd)
		return
	}
	defer func() {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
	}()

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		buf := make([]byte, 4096)
		for {
			n, readErr := ptmx.Read(buf)
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

	go func() {
		defer wg.Done()
		for {
			_, msgBytes, readErr := c.Read(ctx)
			if readErr != nil {
				return
			}

			var tMsg StartWSMessage
			if err := json.Unmarshal(msgBytes, &tMsg); err == nil {
				if (tMsg.Action == "resize" || tMsg.Type == "resize") && tMsg.Cols > 0 && tMsg.Rows > 0 {
					_ = pty.Setsize(ptmx, &pty.Winsize{
						Cols: tMsg.Cols,
						Rows: tMsg.Rows,
					})
					continue
				} else if (tMsg.Action == "input" || tMsg.Action == "stdin" || tMsg.Type == "input") && tMsg.Data != "" {
					_, _ = ptmx.Write([]byte(tMsg.Data))
					continue
				}
			}

			_, _ = ptmx.Write(msgBytes)
		}
	}()

	wg.Wait()
}

func (h *TerminalHandler) handleStandardPipes(ctx context.Context, c *websocket.Conn, cmd *exec.Cmd) {
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return
	}
	defer func() {
		_ = cmd.Process.Kill()
	}()

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		buf := make([]byte, 4096)
		for {
			n, readErr := stdoutPipe.Read(buf)
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

	go func() {
		defer wg.Done()
		for {
			_, msgBytes, err := c.Read(ctx)
			if err != nil {
				return
			}
			_, _ = stdinPipe.Write(msgBytes)
		}
	}()

	wg.Wait()
}
