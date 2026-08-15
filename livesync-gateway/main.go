package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/livesync/livesync-gateway/client"
	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/handlers"
	"github.com/livesync/livesync-gateway/middleware"
)

func main() {
	cfg := config.LoadConfig()

	// Initialize gRPC Sandbox Client
	sbClient, err := client.NewSandboxClient(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize Sandbox gRPC Client: %v", err)
	}
	defer sbClient.Close()

	mux := http.NewServeMux()

	// Handlers
	execHandler := handlers.NewExecutionHandler(cfg, sbClient.Client)
	aiHandler := handlers.NewAIHandler(cfg, sbClient.Client)
	termHandler := handlers.NewTerminalHandler(cfg)
	pkgHandler := handlers.NewPackagesHandler(cfg, sbClient.Client)

	// Routes
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"UP","service":"livesync-gateway","version":"1.0.0"}`))
	})

	mux.HandleFunc("/api/execution/languages", middleware.JWTAuth(cfg, execHandler.GetLanguages))
	mux.HandleFunc("/api/ai/analyze", middleware.JWTAuth(cfg, aiHandler.AnalyzeCode))
	mux.HandleFunc("/api/ai/models", middleware.JWTAuth(cfg, aiHandler.ListModels))
	mux.HandleFunc("/api/packages/", middleware.JWTAuth(cfg, pkgHandler.SearchPackages))
	mux.HandleFunc("/api/terminal/ws", middleware.JWTAuth(cfg, termHandler.ServeWS))

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
