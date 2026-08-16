package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/middleware"
	"github.com/livesync/livesync-gateway/pb"
)

type ExecutionHandler struct {
	cfg        *config.Config
	grpcClient pb.AIServiceClient
}

func NewExecutionHandler(cfg *config.Config, grpcClient pb.AIServiceClient) *ExecutionHandler {
	return &ExecutionHandler{cfg: cfg, grpcClient: grpcClient}
}

type LanguageDescriptorHTTP struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type RunExecutionRequest struct {
	ProjectID  string            `json:"projectId"`
	Entrypoint string            `json:"entrypoint"`
	Revision   int64             `json:"revision,omitempty"`
	Overlay    map[string]string `json:"overlay,omitempty"`
	Command    string            `json:"command,omitempty"`
	Language   string            `json:"language,omitempty"`
}

type RunExecutionResponse struct {
	ExecutionID string `json:"executionId"`
	ProjectID   string `json:"projectId"`
	Status      string `json:"status"`
	AccessLevel string `json:"accessLevel"`
	Message     string `json:"message"`
	SandboxDir  string `json:"sandboxDir,omitempty"`
	DurationMs  int64  `json:"durationMs,omitempty"`
}

func (h *ExecutionHandler) GetLanguages(w http.ResponseWriter, r *http.Request) {
	grpcResp, err := h.grpcClient.GetLanguages(r.Context(), &pb.Empty{})
	if err != nil {
		http.Error(w, `{"error":"gRPC languages service unreachable: `+err.Error()+`"}`, http.StatusBadGateway)
		return
	}

	var langs []LanguageDescriptorHTTP
	for _, l := range grpcResp.Languages {
		langs = append(langs, LanguageDescriptorHTTP{
			Name:        l.Name,
			DisplayName: l.DisplayName,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(langs)
}

func (h *ExecutionHandler) RunCode(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed","code":"METHOD_NOT_ALLOWED"}`, http.StatusMethodNotAllowed)
		return
	}

	var req RunExecutionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.ProjectID) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid request: projectId is required",
			"code":  "BAD_REQUEST",
		})
		return
	}

	tokenStr := middleware.GetUserToken(r.Context())
	claims, hasClaims := middleware.GetUserClaims(r.Context())
	userID := "anonymous"
	if hasClaims && claims != nil {
		userID = claims.UserID
	}

	// 1. Verify Project Authorization (ARCH-11: VIEW, EDIT, and OWNER can execute)
	accessLevel, err := middleware.VerifyWorkspaceAccess(r.Context(), h.cfg, req.ProjectID, tokenStr)
	if err != nil || accessLevel == "" {
		log.Printf("🔒 [EXEC_DENIED] user=%s project=%s reason=no_access err=%v", userID, req.ProjectID, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Forbidden: User does not have access to execute this project",
			"code":  "FORBIDDEN",
		})
		return
	}

	// 2. Ensure canonical workspace is materialized from PostgreSQL bulk manifest if not present (PERF-10)
	wsDir, fileCount, matErr := MaterializeWorkspaceFromManifest(r.Context(), h.cfg, req.ProjectID, tokenStr, GetGlobalSuppressionRegistry())
	if matErr != nil {
		log.Printf("⚠️ [EXEC_WARN] Failed to materialize workspace for project %s: %v", req.ProjectID, matErr)
	} else {
		log.Printf("📂 [EXEC_WORKSPACE_READY] project=%s wsDir=%s files=%d", req.ProjectID, wsDir, fileCount)
	}

	// Generate execution ID
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	execID := "exec-" + hex.EncodeToString(b)

	overlayCount := len(req.Overlay)
	log.Printf("🚀 [EXEC_AUTHORIZED] execId=%s user=%s project=%s access=%s entrypoint=%s overlayFiles=%d revision=%d",
		execID, userID, req.ProjectID, accessLevel, req.Entrypoint, overlayCount, req.Revision)

	// 3. Create isolated ephemeral execution sandbox with overlays (SEC-06 & ARCH-12)
	// Guaranteed non-mutation of the canonical workspace wsDir.
	sandboxDir, sbErr := CreateEphemeralSandbox(wsDir, execID, req.Overlay)
	if sbErr != nil {
		log.Printf("⚠️ [EXEC_WARN] Sandbox creation warning: %v", sbErr)
	} else {
		log.Printf("🛡️ [EXEC_SANDBOX_READY] execId=%s sandbox=%s", execID, sandboxDir)
	}

	durationMs := time.Since(startTime).Milliseconds()
	resp := RunExecutionResponse{
		ExecutionID: execID,
		ProjectID:   req.ProjectID,
		Status:      "Authorized",
		AccessLevel: accessLevel,
		Message:     "Execution authorized against isolated disposable sandbox",
		SandboxDir:  sandboxDir,
		DurationMs:  durationMs,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
