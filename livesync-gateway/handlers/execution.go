package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
)

type ExecutionHandler struct {
	cfg        *config.Config
	grpcClient pb.SandboxServiceClient
}

func NewExecutionHandler(cfg *config.Config, grpcClient pb.SandboxServiceClient) *ExecutionHandler {
	return &ExecutionHandler{cfg: cfg, grpcClient: grpcClient}
}

type ExecutionHTTPRequest struct {
	Language      string `json:"language"`
	Code          string `json:"code"`
	StandardInput string `json:"standardInput"`
	TimeoutMS     int32  `json:"timeoutMs"`
}

type ExecutionHTTPResponse struct {
	Language            string `json:"language"`
	Status              string `json:"status"`
	IsSuccess           bool   `json:"isSuccess"`
	Message             string `json:"message"`
	StandardOutput      string `json:"standardOutput"`
	StandardError       string `json:"standardError"`
	Stdout              string `json:"stdout"`
	Stderr              string `json:"stderr"`
	ExitCode            int32  `json:"exitCode"`
	ExecutionDurationMS int64  `json:"executionDurationMs"`
}

type LanguageDescriptorHTTP struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

func (h *ExecutionHandler) RunCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"Failed to read request body"}`, http.StatusBadRequest)
		return
	}

	var reqPayload ExecutionHTTPRequest
	if err := json.Unmarshal(body, &reqPayload); err != nil {
		http.Error(w, `{"error":"Invalid JSON payload"}`, http.StatusBadRequest)
		return
	}

	grpcResp, err := h.grpcClient.ExecuteCode(r.Context(), &pb.ExecutionRequest{
		Language:      reqPayload.Language,
		Code:          reqPayload.Code,
		StandardInput: reqPayload.StandardInput,
		TimeoutMs:     reqPayload.TimeoutMS,
	})
	if err != nil {
		http.Error(w, `{"error":"gRPC sandbox worker error: `+err.Error()+`"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(ExecutionHTTPResponse{
		Language:            grpcResp.Language,
		Status:              grpcResp.Status,
		IsSuccess:           grpcResp.IsSuccess,
		Message:             grpcResp.Message,
		StandardOutput:      grpcResp.Stdout,
		StandardError:       grpcResp.Stderr,
		Stdout:              grpcResp.Stdout,
		Stderr:              grpcResp.Stderr,
		ExitCode:            grpcResp.ExitCode,
		ExecutionDurationMS: grpcResp.ExecutionTimeMs,
	})
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
	json.NewEncoder(w).Encode(langs)
}
