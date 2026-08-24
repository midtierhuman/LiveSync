package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/middleware"
	"github.com/livesync/livesync-gateway/pb"
)

type AIHandler struct {
	cfg        *config.Config
	grpcClient pb.AIServiceClient
}

func NewAIHandler(cfg *config.Config, grpcClient pb.AIServiceClient) *AIHandler {
	return &AIHandler{cfg: cfg, grpcClient: grpcClient}
}

type ProjectFilePayload struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type AiHTTPRequest struct {
	Action       string               `json:"action"`
	Language     string               `json:"language"`
	Code         string               `json:"code"`
	Prompt       string               `json:"prompt"`
	Model        string               `json:"model"`
	ApiKey       string               `json:"apiKey,omitempty"`
	ProjectID    string               `json:"projectId,omitempty"`
	ProjectFiles []ProjectFilePayload `json:"projectFiles,omitempty"`
	Provider     string               `json:"provider,omitempty"`
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

	apiKey := reqPayload.ApiKey
	if apiKey == "" {
		apiKey = r.Header.Get("X-AI-Api-Key")
	}
	if apiKey == "" {
		apiKey = r.Header.Get("X-Antigravity-Key")
	}

	userToken := middleware.GetUserToken(r.Context())
	if userToken == "" {
		if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
			userToken = strings.TrimPrefix(authHeader, "Bearer ")
		} else if queryToken := r.URL.Query().Get("token"); queryToken != "" {
			userToken = queryToken
		}
	}

	var pbFiles []*pb.ProjectFile
	for _, pf := range reqPayload.ProjectFiles {
		if pf.Path != "" {
			pbFiles = append(pbFiles, &pb.ProjectFile{
				Path:    pf.Path,
				Content: pf.Content,
			})
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	grpcResp, err := h.grpcClient.AnalyzeCode(ctx, &pb.AiAnalysisRequest{
		Action:       reqPayload.Action,
		Language:     reqPayload.Language,
		Code:         reqPayload.Code,
		Prompt:       reqPayload.Prompt,
		Model:        reqPayload.Model,
		UserApiKey:   apiKey,
		ProjectId:    reqPayload.ProjectID,
		ProjectFiles: pbFiles,
		Provider:     reqPayload.Provider,
		UserToken:    userToken,
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "gRPC AI worker error: " + err.Error(),
			"code":  "BAD_GATEWAY",
		})
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
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Streaming unsupported by response writer",
		})
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
		reqPayload.ApiKey = r.URL.Query().Get("apiKey")
		reqPayload.Provider = r.URL.Query().Get("provider")
		reqPayload.ProjectID = r.URL.Query().Get("projectId")
	}

	apiKey := reqPayload.ApiKey
	if apiKey == "" {
		apiKey = r.Header.Get("X-AI-Api-Key")
	}
	if apiKey == "" {
		apiKey = r.Header.Get("X-Antigravity-Key")
	}

	userToken := middleware.GetUserToken(r.Context())
	if userToken == "" {
		if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
			userToken = strings.TrimPrefix(authHeader, "Bearer ")
		} else if queryToken := r.URL.Query().Get("token"); queryToken != "" {
			userToken = queryToken
		}
	}

	if reqPayload.Action == "" {
		reqPayload.Action = "explain"
	}
	if reqPayload.Language == "" {
		reqPayload.Language = "python"
	}

	var pbFiles []*pb.ProjectFile
	for _, pf := range reqPayload.ProjectFiles {
		if pf.Path != "" {
			pbFiles = append(pbFiles, &pb.ProjectFile{
				Path:    pf.Path,
				Content: pf.Content,
			})
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	grpcStream, err := h.grpcClient.StreamAnalyzeCode(ctx, &pb.AiAnalysisRequest{
		Action:       reqPayload.Action,
		Language:     reqPayload.Language,
		Code:         reqPayload.Code,
		Prompt:       reqPayload.Prompt,
		Model:        reqPayload.Model,
		UserApiKey:   apiKey,
		ProjectId:    reqPayload.ProjectID,
		ProjectFiles: pbFiles,
		Provider:     reqPayload.Provider,
		UserToken:    userToken,
	})
	if err != nil {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
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

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

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

	providers := []map[string]interface{}{
		{
			"id":          "antigravity",
			"name":        "Google Antigravity",
			"description": "Native Google AI coding assistant with 1M+ whole-project context window",
			"status":      "active",
		},
		{
			"id":          "codex",
			"name":        "OpenAI Codex",
			"description": "OpenAI code generation model",
			"status":      "available",
		},
		{
			"id":          "claude",
			"name":        "Anthropic Claude",
			"description": "Claude 3.7 Sonnet code reasoning engine",
			"status":      "available",
		},
		{
			"id":          "local",
			"name":        "Local LLM",
			"description": "Offline Qwen 2.5 Coder / Ollama server",
			"status":      "active",
		},
	}

	res := map[string]interface{}{
		"activeProvider":     "antigravity",
		"availableProviders": providers,
		"activeModel":        "gemini-3.5-flash",
		"availableModels":    models,
	}

	json.NewEncoder(w).Encode(res)
}

