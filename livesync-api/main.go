package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/livesync/livesync-api/config"
	"github.com/livesync/livesync-api/database"
	"github.com/livesync/livesync-api/handlers"
	"github.com/livesync/livesync-api/security"
	"github.com/livesync/livesync-api/services"
)

func main() {
	log.Println("🚀 Initializing LiveSync Go API Service...")

	cfg := config.LoadConfig()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Database Connection & Schema Migration
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("❌ Fatal: Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := database.Migrate(ctx, db); err != nil {
		log.Fatalf("❌ Fatal: Database migration failed: %v", err)
	}

	// 2. Security Services
	jwtService, err := security.NewJWTService(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAudience, cfg.JWTExpirationHours)
	if err != nil {
		log.Fatalf("❌ Fatal: Failed to initialize JWT service: %v", err)
	}
	passwordHasher := security.NewPasswordHasher()
	authMiddleware := security.NewAuthMiddleware(jwtService)

	// 3. Application Services
	authService := services.NewAuthService(db, jwtService, passwordHasher)
	auditService := services.NewAuditService(db)
	docService := services.NewDocumentService(db)
	docService.SetAuditService(auditService)
	folderService := services.NewFolderService(db, docService)
	folderService.SetAuditService(auditService)

	// 4. Redis Stream Write-Behind Consumer & Cache-Aside ACL Engine (PERF-05)
	streamConsumer := services.NewDocumentSaveStreamConsumer(cfg.RedisURL, docService)
	redisClient := streamConsumer.GetRedisClient()
	docService.SetRedisClient(redisClient)

	aclCacheService := services.NewRedisACLCacheService(redisClient)
	docService.SetACLCache(aclCacheService)
	folderService.SetACLCache(aclCacheService)

	go streamConsumer.Start(ctx)

	// 5. HTTP Handlers
	authHandler := handlers.NewAuthHandler(authService, jwtService)
	docHandler := handlers.NewDocumentHandler(docService, authMiddleware, auditService)
	folderHandler := handlers.NewFolderHandler(folderService, authMiddleware, auditService)

	// 6. Router & Middleware
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(security.GlobalAPILimiter.Handler)

	// CORS Configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CorsAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "Origin", "X-Requested-With", "X-AI-Api-Key", "X-Antigravity-Key"},
		ExposedHeaders:   []string{"Link", "Location", "Content-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health & Telemetry Probes (ARCH-09)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"UP","service":"livesync-api","engine":"Go 1.26"}`))
	})

	r.Get("/health/liveness", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"UP","probe":"liveness","service":"livesync-api"}`))
	})

	r.Get("/health/readiness", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		dbErr := db.Pool.Ping(r.Context())
		rdbErr := redisClient.Ping(r.Context()).Err()

		if dbErr != nil || rdbErr != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status":   "DOWN",
				"probe":    "readiness",
				"database": dbErr == nil,
				"redis":    rdbErr == nil,
			})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "UP",
			"probe":    "readiness",
			"database": "connected",
			"redis":    "connected",
		})
	})

	// Mount Routes
	authHandler.RegisterRoutes(r)
	docHandler.RegisterRoutes(r)
	folderHandler.RegisterRoutes(r)

	// 7. Server Lifecycle & Graceful Shutdown
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("⚡ LiveSync Go API Server listening on port :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ HTTP Server error: %v", err)
		}
	}()

	<-stopChan
	log.Println("🛑 Shutting down LiveSync Go API Server...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("⚠️ Server shutdown notice: %v", err)
	}

	log.Println("👋 LiveSync Go API exited cleanly.")
}
