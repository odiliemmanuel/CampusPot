// Command seed populates a demo dataset: a class group, executives, members,
// a levy, a spread of payments (full, partial, unpaid), and two expense
// requests (one medium-risk, one over-budget). It uses the SAME engine the API
// uses, so the seeded data behaves exactly like live data.
//
// Run with: go run ./cmd/seed  (point DATABASE_URL at your Neon database to
// seed the live demo). The API also seeds an empty database automatically on
// startup when AUTO_SEED is on.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/database"
	"github.com/odiliemmmanuel/campuspot/internal/ai"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/seed"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg)
	if err := db.AutoMigrate(models.AllModels()...); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	ctx := context.Background()
	res, err := seed.Run(ctx, db, cfg)
	if err != nil {
		log.Fatalf("seed: %v", err)
	}

	sum, _ := res.Service.Summary(ctx, res.Group.ID, &res.Levy.ID)
	outstanding, _, _ := res.Service.WhoHasntPaid(ctx, res.Group.ID, &res.Levy.ID)
	aiSvc := ai.NewService(db, res.Service, cfg)

	fmt.Println()
	fmt.Println("================ PotKeeper demo seed ================")
	fmt.Printf("Group            : %s\n", res.Group.Name)
	fmt.Printf("Group ID         : %s\n", res.Group.ID)
	fmt.Printf("Join code        : %s\n", res.Group.JoinCode)
	fmt.Printf("Virtual account  : %s (%s)\n", res.Group.VirtualAccountNumber, res.Group.VirtualAccountBank)
	fmt.Println("--- logins (password: password123) ---")
	fmt.Printf("Treasurer        : %s / %s\n", res.Treasurer.Email, res.Treasurer.Name)
	fmt.Printf("Co-signer 1      : %s\n", res.Cosigners[0].Email)
	fmt.Printf("Co-signer 2      : %s\n", res.Cosigners[1].Email)
	fmt.Printf("Members          : %s ...\n", res.Members[0].Email)
	fmt.Println("--- pot snapshot ---")
	fmt.Printf("Collected        : %s\n", money.Kobo(sum.CollectedKobo).Format())
	fmt.Printf("Balance          : %s\n", money.Kobo(sum.BalanceKobo).Format())
	fmt.Printf("Outstanding      : %d member(s), %s\n", len(outstanding), money.Kobo(sum.OutstandingKobo).Format())
	fmt.Printf("Expense awaiting : %s (risk=%s)\n", money.Kobo(res.Expense.AmountKobo).Format(), res.Expense.RiskLevel)
	fmt.Printf("Over-budget flag : %s (risk=%s)\n", money.Kobo(res.OverBudget.AmountKobo).Format(), res.OverBudget.RiskLevel)
	fmt.Println("--- AI treasurer sample ---")
	ans, _ := aiSvc.Answer(ctx, res.Group.ID, res.Treasurer.ID, "Who hasn't paid the excursion levy?")
	fmt.Println(ans.Answer)
	fmt.Println("=====================================================")
}
