package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
)

type PackagesHandler struct {
	cfg        *config.Config
	grpcClient pb.SandboxServiceClient
}

func NewPackagesHandler(cfg *config.Config, grpcClient pb.SandboxServiceClient) *PackagesHandler {
	return &PackagesHandler{cfg: cfg, grpcClient: grpcClient}
}

type PackageHTTPItem struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

type PackageHTTPResponse struct {
	Query    string            `json:"query"`
	Packages []PackageHTTPItem `json:"packages"`
}

func (h *PackagesHandler) SearchPackages(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	if query == "" {
		query = r.URL.Query().Get("text")
	}

	pkgMgr := "pypi"
	if r.URL.Query().Get("mgr") == "npm" || r.URL.Query().Get("manager") == "npm" {
		pkgMgr = "npm"
	}

	grpcResp, err := h.grpcClient.SearchPackages(r.Context(), &pb.PackageSearchRequest{
		PackageManager: pkgMgr,
		Query:          query,
	})
	if err != nil {
		http.Error(w, `{"error":"gRPC package worker error: `+err.Error()+`"}`, http.StatusBadGateway)
		return
	}

	var pkgs []PackageHTTPItem
	for _, p := range grpcResp.Packages {
		pkgs = append(pkgs, PackageHTTPItem{
			Name:        p.Name,
			Version:     p.Version,
			Description: p.Description,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(PackageHTTPResponse{
		Query:    grpcResp.Query,
		Packages: pkgs,
	})
}
