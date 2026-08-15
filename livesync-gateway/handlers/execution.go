package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/livesync/livesync-gateway/config"
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
