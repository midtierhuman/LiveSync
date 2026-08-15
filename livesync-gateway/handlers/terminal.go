package handlers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"

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
	Action     string            `json:"action"` // "start", "input", "stdin", "resize", "kill"
	Type       string            `json:"type"`
	Language   string            `json:"language"`
	Code       string            `json:"code"`
	TimeoutMS  int32             `json:"timeoutMs"`
	Data       string            `json:"data"`
	Cols       uint16            `json:"cols"`
	Rows       uint16            `json:"rows"`
	SessionID  string            `json:"sessionId"`
	Token      string            `json:"token"`
	Files      map[string]string `json:"files,omitempty"`
	Entrypoint string            `json:"entrypoint,omitempty"`
}

type StreamEventJSON struct {
	Type                string  `json:"type"` // "status", "stdout", "stderr", "waiting_input", "exit", "error", "clear"
	Data                string  `json:"data,omitempty"`
	Message             string  `json:"message,omitempty"`
	Status              string  `json:"status,omitempty"`
	RequiresInput       bool    `json:"requiresInput,omitempty"`
	Prompt              string  `json:"prompt,omitempty"`
	ExitCode            int32   `json:"exitCode,omitempty"`
	IsSuccess           bool    `json:"isSuccess,omitempty"`
	SessionID           string  `json:"sessionId,omitempty"`
	ExecutionDurationMS float64 `json:"executionDurationMs,omitempty"`
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

func (h *TerminalHandler) ServeExecutionStream(w http.ResponseWriter, r *http.Request) {
	rawConn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("Failed to accept execution stream websocket: %v", err)
		return
	}
	c := NewSafeWSConn(rawConn)
	defer c.Close(websocket.StatusNormalClosure, "Session ended")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	grpcStream, err := h.grpcClient.StreamExecution(ctx)
	if err != nil {
		h.sendEvent(ctx, c, StreamEventJSON{Type: "error", Message: "Failed to connect to execution engine: " + err.Error()})
		return
	}

	var sessionID string = "default"

	// Goroutine to receive chunks from gRPC stream and write to WebSocket
	go func() {
		for {
			chunk, recvErr := grpcStream.Recv()
			if recvErr == io.EOF || recvErr != nil {
				break
			}

			switch chunk.StreamType {
			case "stdout":
				h.sendEvent(ctx, c, StreamEventJSON{Type: "stdout", Data: chunk.Content, SessionID: sessionID})
			case "stderr":
				h.sendEvent(ctx, c, StreamEventJSON{Type: "stderr", Data: chunk.Content, SessionID: sessionID})
			case "waiting_input":
				h.sendEvent(ctx, c, StreamEventJSON{
					Type:          "waiting_input",
					RequiresInput: chunk.RequiresInput,
					Prompt:        chunk.Prompt,
					SessionID:     sessionID,
				})
			case "exit":
				isSuccess := (chunk.ExitCode == 0)
				h.sendEvent(ctx, c, StreamEventJSON{
					Type:      "exit",
					Status:    chunk.Status,
					ExitCode:  chunk.ExitCode,
					IsSuccess: isSuccess,
					SessionID: sessionID,
				})
			}
		}
	}()

	// Loop to read incoming WebSocket messages from Angular UI
	for {
		_, msgBytes, readErr := c.Read(ctx)
		if readErr != nil {
			break
		}

		var msg StartWSMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			h.sendEvent(ctx, c, StreamEventJSON{Type: "error", Message: "Invalid JSON frame"})
			continue
		}

		if msg.SessionID != "" {
			sessionID = msg.SessionID
		}

		switch msg.Action {
		case "start":
			h.sendEvent(ctx, c, StreamEventJSON{Type: "status", Status: "Running", SessionID: sessionID})
			_ = grpcStream.Send(&pb.ExecutionRequest{
				Action:        "start",
				Language:      msg.Language,
				Code:          msg.Code,
				StandardInput: msg.Data,
				TimeoutMs:     msg.TimeoutMS,
				Files:         msg.Files,
				Entrypoint:    msg.Entrypoint,
			})

		case "stdin", "input":
			if msg.Data != "" {
				_ = grpcStream.Send(&pb.ExecutionRequest{
					Action:        "stdin",
					StandardInput: msg.Data,
				})
			}

		case "kill":
			_ = grpcStream.Send(&pb.ExecutionRequest{
				Action: "kill",
			})
			_ = grpcStream.CloseSend()
			return
		}
	}
}

func (h *TerminalHandler) sendEvent(ctx context.Context, c *SafeWSConn, event StreamEventJSON) {
	bytes, err := json.Marshal(event)
	if err == nil {
		_ = c.Write(ctx, websocket.MessageText, bytes)
	}
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

func (h *TerminalHandler) handleStandardPipes(ctx context.Context, c *SafeWSConn, cmd *exec.Cmd) {
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
