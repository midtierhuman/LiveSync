package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/livesync/livesync-gateway/client"
	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/handlers"
	"github.com/livesync/livesync-gateway/middleware"
)

func main() {
	cfg := config.LoadConfig()

	// Initialize gRPC AI Client
	aiClient, err := client.NewAIClient(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize AI gRPC Client: %v", err)
	}
	defer aiClient.Close()

	mux := http.NewServeMux()

	execHandler := handlers.NewExecutionHandler(cfg, aiClient.Client)
	aiHandler := handlers.NewAIHandler(cfg, aiClient.Client)
	termHandler := handlers.NewTerminalHandler(cfg)
	pkgHandler := handlers.NewPackagesHandler(cfg)
	wsSyncHandler := handlers.NewWorkspaceSyncHandler(cfg)
	wsSearchHandler := handlers.NewWorkspaceSearchHandler(cfg)

	workspaceDispatcher := func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/workspaces")
		path = strings.TrimPrefix(path, "/")
		parts := strings.Split(path, "/")

		if len(parts) > 0 {
			lastPart := parts[len(parts)-1]
			if lastPart == "search" || parts[0] == "search" {
				wsSearchHandler.HandleSearch(w, r)
				return
			}
			if lastPart == "replace" || parts[0] == "replace" {
				wsSearchHandler.HandleReplace(w, r)
				return
			}
		}
		wsSyncHandler.HandleWorkspaceSync(w, r)
	}

	// Routes
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"UP","service":"livesync-gateway","version":"1.0.0"}`))
	})

	mux.HandleFunc("/api/execution/languages", middleware.GeneralLimiter.Limit(middleware.JWTAuth(cfg, execHandler.GetLanguages)))
	mux.HandleFunc("/api/execution/run", middleware.ExecutionLimiter.Limit(middleware.JWTAuth(cfg, execHandler.RunCode)))
	mux.HandleFunc("/api/ai/analyze", middleware.AILimiter.Limit(middleware.JWTAuth(cfg, aiHandler.AnalyzeCode)))
	mux.HandleFunc("/api/ai/stream", middleware.AILimiter.Limit(middleware.JWTAuth(cfg, aiHandler.StreamAnalyzeCode)))
	mux.HandleFunc("/api/ai/models", middleware.GeneralLimiter.Limit(middleware.JWTAuth(cfg, aiHandler.ListModels)))
	mux.HandleFunc("/api/packages/", middleware.PackageLimiter.Limit(middleware.JWTAuth(cfg, pkgHandler.SearchPackages)))
	mux.HandleFunc("/api/workspaces/", middleware.GeneralLimiter.Limit(middleware.JWTAuth(cfg, workspaceDispatcher)))
	mux.HandleFunc("/api/terminal/ws", middleware.ExecutionLimiter.Limit(middleware.JWTAuth(cfg, termHandler.ServeWS)))

	handler := middleware.CORS(cfg, mux)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  35 * time.Second,
		WriteTimeout: 35 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("⚡ LiveSync Go API Gateway listening on port %s (gRPC target: %s)", cfg.Port, cfg.SandboxGRPCURL)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server startup error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down Go API Gateway...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Go API Gateway stopped cleanly.")
}
