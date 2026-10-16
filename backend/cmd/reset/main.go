// Command reset gives PotKeeper a clean slate. It drops every table and
// recreates the schema, then optionally re-seeds the demo dataset. It never
// runs automatically — you invoke it by hand when a demo or test needs to
// start from zero.
//
// Usage:
//
//	go run ./cmd/reset               # wipe, then re-seed the demo data
//	go run ./cmd/reset -seed=false   # wipe only (blank database)
//
// It talks to the same database the API uses, so set DATABASE_URL (Neon) or
// DB_DRIVER=sqlite as usual.
package main

import (
	"context"
	"flag"
	"log"

	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/database"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/seed"
)

func main() {
	doSeed := flag.Bool("seed", true, "re-seed the demo dataset after wiping")
	flag.Parse()

	cfg := config.Load()
	db := database.Connect(cfg)

	if err := wipe(db); err != nil {
		log.Fatalf("reset: wipe failed: %v", err)
	}
	if err := db.AutoMigrate(models.AllModels()...); err != nil {
		log.Fatalf("reset: migrate failed: %v", err)
	}
	log.Println("reset: all tables dropped and recreated")

	if !*doSeed {
		log.Println("reset: database is now empty (AUTO_SEED/AutoSeed will re-seed on next API boot)")
		return
	}
	if _, err := seed.Run(context.Background(), db, cfg); err != nil {
		log.Fatalf("reset: re-seed failed: %v", err)
	}
	log.Println("reset: demo data ready (login ada@potkeeper.ng / password123)")
}

// wipe drops the whole schema on Postgres (so foreign-key ordering never
// matters) and the tables one by one everywhere else.
func wipe(db *gorm.DB) error {
	if db.Dialector.Name() == "postgres" {
		return db.Exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;").Error
	}
	return db.Migrator().DropTable(models.AllModels()...)
}
