// Package config centralises every environment-driven setting for the
// CampusPot backend. No package outside this one calls os.Getenv directly;
// everything receives a *Config instead.
package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds every setting the application needs at startup.
type Config struct {
	// Server
	AppEnv string // "development" | "staging" | "production"
	Port   string

	// CORSOrigins is an explicit allowlist of browser origins (e.g. the
	// Vercel frontend). Localhost origins are always allowed in addition to
	// these, so the Vite dev server keeps working without configuration.
	CORSOrigins []string

	// Database (PostgreSQL by default; SQLite is available for local demos
	// and tests so the app runs with zero external services).
	DBDriver   string // "postgres" | "sqlite"
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	DBPath     string // sqlite file path
	GormLog    string // silent | error | warn | info

	// DatabaseURL, when set, overrides the discrete DB_* fields. Managed
	// providers (Neon, Render, Railway, Heroku) hand out a single
	// postgres:// connection string, so we accept one directly.
	DatabaseURL string

	// DemoOpeningBalance seeds every newly created pot with a random opening
	// float (₦80k/100k/200k) so a fresh demo is not empty. It is off on a
	// zero-value Config (used by unit tests) and on via Load(); set
	// DEMO_OPENING_BALANCE=false to turn it off.
	DemoOpeningBalance bool

	// AutoSeed populates a brand-new (empty) database with the demo dataset on
	// startup, so a fresh deploy is instantly testable without running the seed
	// CLI. It never touches a database that already holds data. Default on;
	// set AUTO_SEED=false to disable.
	AutoSeed bool

	// Auth
	JWTSecret          string
	JWTAccessTokenTTL  time.Duration
	JWTRefreshTokenTTL time.Duration

	// B Moni Embedded API (sandbox only). When Sandbox is false, the
	// application runs against the in-process mock so the demo never
	// depends on live availability.
	BMoniBaseURL       string
	BMoniAPIKey        string
	BMoniPartnerID     string
	BMoniWebhookSecret string
	BMoniSandbox       bool

	// AI (LLM). When AIAPIKey is empty the deterministic rule-based
	// treasurer is used instead, so the demo always works offline.
	AIBaseURL string
	AIAPIKey  string
	AIModel   string
}

// Load reads a .env file if present (local dev), then builds a Config from
// the process environment. In production real env vars are injected by the
// platform and no .env file will exist — godotenv.Load() simply no-ops.
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("config: no .env file found, relying on real environment variables")
	}

	cfg := &Config{
		AppEnv: getEnv("APP_ENV", "development"),
		Port:   getEnv("PORT", "8080"),

		CORSOrigins: getEnvList("CORS_ORIGINS"),

		DBDriver:   getEnv("DB_DRIVER", "postgres"),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "campuspot"),
		DBPassword: getEnv("DB_PASSWORD", "campuspot"),
		DBName:     getEnv("DB_NAME", "campuspot_dev"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		DBPath:     getEnv("DB_PATH", "campuspot.db"),
		GormLog:    getEnv("GORM_LOG", "warn"),

		DatabaseURL: getEnv("DATABASE_URL", ""),

		DemoOpeningBalance: getEnvBool("DEMO_OPENING_BALANCE", true),

		AutoSeed: getEnvBool("AUTO_SEED", true),

		JWTSecret:          getEnv("JWT_SECRET", "dev-only-change-me"),
		JWTAccessTokenTTL:  getEnvDuration("JWT_ACCESS_TTL", 24*time.Hour),
		JWTRefreshTokenTTL: getEnvDuration("JWT_REFRESH_TTL", 7*24*time.Hour),

		BMoniBaseURL:       getEnv("BMONI_BASE_URL", "https://embedded-dev.bmoni.com"),
		BMoniAPIKey:        getEnv("BMONI_API_KEY", ""),
		BMoniPartnerID:     getEnv("BMONI_PARTNER_ID", ""),
		BMoniWebhookSecret: getEnv("BMONI_WEBHOOK_SECRET", ""),
		BMoniSandbox:       getEnvBool("BMONI_SANDBOX", true),

		AIBaseURL: getEnv("AI_BASE_URL", "https://api.openai.com/v1"),
		AIAPIKey:  getEnv("AI_API_KEY", ""),
		AIModel:   getEnv("AI_MODEL", "gpt-4o-mini"),
	}

	if cfg.AppEnv == "production" && cfg.JWTSecret == "dev-only-change-me" {
		log.Fatal("config: JWT_SECRET must be set in production")
	}

	return cfg
}

// DSN builds the PostgreSQL connection string GORM expects. When a full
// DATABASE_URL is supplied (Neon, Render, ...) it is used verbatim.
func (c *Config) DSN() string {
	if c.DatabaseURL != "" {
		return c.DatabaseURL
	}
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode,
	)
}

// IsProduction reports whether the app is running in production mode.
func (c *Config) IsProduction() bool { return c.AppEnv == "production" }

// UseMockBMoni reports whether the in-process mock should stand in for the
// real B Moni API. The mock is used when explicitly disabled or when no API
// key has been supplied.
func (c *Config) UseMockBMoni() bool { return !c.BMoniSandbox || c.BMoniAPIKey == "" }

// UseRuleBasedAI reports whether the deterministic treasurer should be used
// instead of an LLM call.
func (c *Config) UseRuleBasedAI() bool { return c.AIAPIKey == "" }

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

// getEnvList parses a comma-separated env var into a trimmed, non-empty slice.
func getEnvList(key string) []string {
	raw := os.Getenv(key)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
