package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
)

type AIHandler struct {
	cfg        *config.Config
	grpcClient pb.AIServiceClient
}

func NewAIHandler(cfg *config.Config, grpcClient pb.AIServiceClient) *AIHandler {
	return &AIHandler{cfg: cfg, grpcClient: grpcClient}
}

type AiHTTPRequest struct {
	Action   string `json:"action"`
	Language string `json:"language"`
	Code     string `json:"code"`
	Prompt   string `json:"prompt"`
	Model    string `json:"model"`
}

type AiHTTPResponse struct {
	Action        string   `json:"action"`
	Language      string   `json:"language"`
	Explanation   string   `json:"explanation"`
	Suggestions   []string `json:"suggestions"`
	GeneratedCode *string  `json:"generatedCode,omitempty"`
	Provider      string   `json:"provider"`
}

func (h *AIHandler) AnalyzeCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"Failed to read request body"}`, http.StatusBadRequest)
		return
	}

	var reqPayload AiHTTPRequest
	if err := json.Unmarshal(body, &reqPayload); err != nil {
		http.Error(w, `{"error":"Invalid JSON payload"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	grpcResp, err := h.grpcClient.AnalyzeCode(ctx, &pb.AiAnalysisRequest{
		Action:   reqPayload.Action,
		Language: reqPayload.Language,
		Code:     reqPayload.Code,
		Prompt:   reqPayload.Prompt,
		Model:    reqPayload.Model,
	})
	if err != nil {
		http.Error(w, `{"error":"gRPC AI worker error: `+err.Error()+`"}`, http.StatusBadGateway)
		return
	}

	var genCode *string
	if grpcResp.GeneratedCode != "" {
		genCode = &grpcResp.GeneratedCode
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(AiHTTPResponse{
		Action:        grpcResp.Action,
		Language:      grpcResp.Language,
		Explanation:   grpcResp.Explanation,
		Suggestions:   grpcResp.Suggestions,
		GeneratedCode: genCode,
		Provider:      grpcResp.Provider,
	})
}

func (h *AIHandler) ListModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	models := []string{
		"gemini-3.5-flash",
		"gemini-flash-latest",
		"gemini-3-flash-preview",
		"gemini-3.1-flash-lite",
		"gemini-2.5-flash",
		"Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf",
		"Qwen2.5-Coder-14B-Instruct-Q4_K_M",
		"Qwen2.5-Coder-7B-Instruct-Q4_K_M",
		"deepseek-r1-distill-qwen-14b",
	}

	res := map[string]interface{}{
		"activeModel":     "gemini-3.5-flash",
		"availableModels": models,
	}

	json.NewEncoder(w).Encode(res)
}
