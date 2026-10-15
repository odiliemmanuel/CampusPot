// Command api is the CampusPot backend entry point.
//
// It loads config, connects to PostgreSQL, runs auto-migration, wires the
// B Moni client (real or mock), the treasurer engine, the AI treasurer, and
// the webhook receiver, then serves the REST API with graceful shutdown.
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

	"github.com/gin-gonic/gin"

	"github.com/odiliemmmanuel/campuspot/common/response"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/database"
	"github.com/odiliemmmanuel/campuspot/internal/ai"
	"github.com/odiliemmmanuel/campuspot/internal/auth"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
	"github.com/odiliemmmanuel/campuspot/internal/webhook"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg)

	if err := db.AutoMigrate(models.AllModels()...); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	client := buildBMoniClient(cfg)
	potSvc := pot.NewService(db, cfg, client)
	authSvc := auth.NewService(db, cfg, client)
	aiSvc := ai.NewService(db, potSvc, cfg)
	webhookHandler := webhook.NewHandler(db, potSvc, cfg.BMoniWebhookSecret)

	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(corsMiddleware(cfg.CORSOrigins), gin.Logger(), gin.Recovery())

	router.GET("/health", func(c *gin.Context) {
		if err := database.Ping(db); err != nil {
			response.Error(c, http.StatusServiceUnavailable, "DB_UNREACHABLE", err.Error())
			return
		}
		response.OK(c, gin.H{"status": "ok"})
	})

	api := router.Group("/api/v1")

	// Public auth routes + protected /auth/me.
	auth.NewController(authSvc).RegisterRoutes(api)

	// Public webhook endpoint.
	webhookHandler.RegisterRoutes(api)

	// Authenticated feature routes.
	authed := api.Group("")
	authed.Use(authSvc.RequireAuth())
	pot.NewController(potSvc).RegisterRoutes(authed)
	ai.NewController(aiSvc).RegisterRoutes(authed)

	runServer(cfg, router)
}

func buildBMoniClient(cfg *config.Config) bmoni.Client {
	if cfg.UseMockBMoni() {
		log.Printf("bmoni: using in-process MOCK client (sandbox=false or no key)")
		return bmoni.NewMockClient()
	}
	log.Printf("bmoni: using HTTP client against %s", cfg.BMoniBaseURL)
	return bmoni.NewHTTPClient(cfg.BMoniBaseURL, cfg.BMoniAPIKey)
}

// corsMiddleware lets the browser call the API. Localhost origins (the Vite
// dev server) are always allowed; production origins such as the Vercel
// frontend must be listed in CORS_ORIGINS. No origin is reflected unless it
// matches, so the API stays locked down by default.
func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			allowed[o] = true
		}
	}
	return func(c *gin.Context) {
		origin := strings.TrimRight(c.GetHeader("Origin"), "/")
		if origin != "" && (allowed[origin] || isLocalOrigin(origin)) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Webhook-Signature")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func isLocalOrigin(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") ||
		strings.HasPrefix(origin, "https://localhost:")
}

func runServer(cfg *config.Config, router *gin.Engine) {
	srv := &http.Server{Addr: ":" + cfg.Port, Handler: router}

	go func() {
		log.Printf("campuspot: listening on :%s (env=%s)", cfg.Port, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: failed to start: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("campuspot: shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server: forced shutdown: %v", err)
	}
	log.Println("campuspot: stopped cleanly")
}
