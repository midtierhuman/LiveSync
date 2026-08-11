package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
)

type AIHandler struct {
	cfg        *config.Config
	grpcClient pb.SandboxServiceClient
}

func NewAIHandler(cfg *config.Config, grpcClient pb.SandboxServiceClient) *AIHandler {
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

	grpcResp, err := h.grpcClient.AnalyzeCode(r.Context(), &pb.AiAnalysisRequest{
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
		"Qwen2.5-Coder-14B-Instruct-Q4_K_M",
		"Qwen2.5-Coder-7B-Instruct-Q4_K_M",
		"Qwen2.5-Coder-32B-Instruct-Q4_K_M",
		"llama-3.2-3b-instruct",
		"deepseek-r1-distill-qwen-14b",
	}

	res := map[string]interface{}{
		"activeModel":     h.cfg.LocalLLMModel,
		"availableModels": models,
	}

	json.NewEncoder(w).Encode(res)
}
