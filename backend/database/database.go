// Package database owns the single *gorm.DB connection pool used by the
// whole application. Feature packages receive this pool via dependency
// injection; they never open their own connection.
package database

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/odiliemmmanuel/campuspot/config"
)

// Connect opens the database described by cfg and verifies it with a ping
// before returning. It fails fast because the API is useless without a
// database. PostgreSQL is the production target; SQLite is supported so the
// demo and tests run with zero external services.
func Connect(cfg *config.Config) *gorm.DB {
	gormLogLevel := resolveLogLevel(cfg.GormLog)

	var (
		db  *gorm.DB
		err error
	)
	if cfg.DBDriver == "sqlite" {
		log.Printf("database: using sqlite at %s", cfg.DBPath)
		db, err = gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
			Logger: logger.Default.LogMode(gormLogLevel),
		})
	} else {
		db, err = gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
			Logger: logger.Default.LogMode(gormLogLevel),
		})
	}
	if err != nil {
		log.Fatalf("database: failed to connect: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("database: failed to get underlying sql.DB: %v", err)
	}
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("database: ping failed: %v", err)
	}

	if cfg.DBDriver != "sqlite" {
		log.Printf("database: connected to %s:%s/%s", cfg.DBHost, cfg.DBPort, cfg.DBName)
	}
	return db
}

// resolveLogLevel maps the GORM_LOG environment value onto a gorm logger
// level. It defaults to Warn so local runs stay quiet; set GORM_LOG=info to
// see every SQL statement while debugging.
func resolveLogLevel(value string) logger.LogLevel {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "silent":
		return logger.Silent
	case "error":
		return logger.Error
	case "info":
		return logger.Info
	default:
		return logger.Warn
	}
}

// Ping is used by the /health endpoint to confirm the pool is still alive.
func Ping(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("database: could not get sql.DB: %w", err)
	}
	return sqlDB.Ping()
}
