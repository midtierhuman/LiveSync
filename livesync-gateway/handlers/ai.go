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

func (h *AIHandler) StreamAnalyzeCode(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"Streaming unsupported by response writer"}`, http.StatusInternalServerError)
		return
	}

	var reqPayload AiHTTPRequest
	if r.Method == http.MethodPost {
		body, err := io.ReadAll(r.Body)
		if err == nil && len(body) > 0 {
			_ = json.Unmarshal(body, &reqPayload)
		}
	} else if r.Method == http.MethodGet {
		reqPayload.Action = r.URL.Query().Get("action")
		reqPayload.Language = r.URL.Query().Get("language")
		reqPayload.Code = r.URL.Query().Get("code")
		reqPayload.Prompt = r.URL.Query().Get("prompt")
		reqPayload.Model = r.URL.Query().Get("model")
	}

	if reqPayload.Action == "" {
		reqPayload.Action = "explain"
	}
	if reqPayload.Language == "" {
		reqPayload.Language = "python"
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	grpcStream, err := h.grpcClient.StreamAnalyzeCode(ctx, &pb.AiAnalysisRequest{
		Action:   reqPayload.Action,
		Language: reqPayload.Language,
		Code:     reqPayload.Code,
		Prompt:   reqPayload.Prompt,
		Model:    reqPayload.Model,
	})
	if err != nil {
		errChunk := map[string]interface{}{
			"delta":    "⚠️ Failed to connect to AI gRPC stream: " + err.Error(),
			"stage":    "error",
			"isFinal":  true,
			"provider": "LiveSync Gateway",
		}
		jsonBytes, _ := json.Marshal(errChunk)
		w.Write([]byte("data: " + string(jsonBytes) + "\n\n"))
		flusher.Flush()
		return
	}

	for {
		chunk, err := grpcStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			errChunk := map[string]interface{}{
				"delta":    "⚠️ Stream interrupted: " + err.Error(),
				"stage":    "error",
				"isFinal":  true,
				"provider": "LiveSync Gateway",
			}
			jsonBytes, _ := json.Marshal(errChunk)
			w.Write([]byte("data: " + string(jsonBytes) + "\n\n"))
			flusher.Flush()
			break
		}

		var genCode *string
		if chunk.GeneratedCode != "" {
			genCode = &chunk.GeneratedCode
		}

		httpChunk := map[string]interface{}{
			"delta":         chunk.Delta,
			"stage":         chunk.Stage,
			"action":        chunk.Action,
			"language":      chunk.Language,
			"provider":      chunk.Provider,
			"suggestions":   chunk.Suggestions,
			"generatedCode": genCode,
			"isFinal":       chunk.IsFinal,
		}

		jsonBytes, _ := json.Marshal(httpChunk)
		w.Write([]byte("data: " + string(jsonBytes) + "\n\n"))
		flusher.Flush()

		if chunk.IsFinal {
			break
		}
	}
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

