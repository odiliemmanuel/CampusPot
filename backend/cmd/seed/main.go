// Command seed populates a demo dataset: a class group, executives, members,
// a levy, a spread of payments (full, partial, unpaid), and two expense
// requests (one medium-risk, one over-budget). It uses the SAME engine the API
// uses, so the seeded data behaves exactly like live data.
//
// Run with: go run ./cmd/seed
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/database"
	"github.com/odiliemmmanuel/campuspot/internal/ai"
	"github.com/odiliemmmanuel/campuspot/internal/auth"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg)
	if err := db.AutoMigrate(models.AllModels()...); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	client := bmoni.NewMockClient()
	potSvc := pot.NewService(db, cfg, client)
	authSvc := auth.NewService(db, cfg, client)
	aiSvc := ai.NewService(db, potSvc, cfg)
	ctx := context.Background()

	const password = "password123"

	treasurer := mustRegister(ctx, authSvc, "Ada Okafor", "ada@campuspot.ng", password)
	cos1 := mustRegister(ctx, authSvc, "Tunde Bello", "tunde@campuspot.ng", password)
	cos2 := mustRegister(ctx, authSvc, "Ngozi Eze", "ngozi@campuspot.ng", password)
	members := []*models.User{
		mustRegister(ctx, authSvc, "Chidi Nwosu", "chidi@campuspot.ng", password),
		mustRegister(ctx, authSvc, "Fatima Yusuf", "fatima@campuspot.ng", password),
		mustRegister(ctx, authSvc, "Emeka Obi", "emeka@campuspot.ng", password),
		mustRegister(ctx, authSvc, "Blessing Ade", "blessing@campuspot.ng", password),
		mustRegister(ctx, authSvc, "Seun Ajayi", "seun@campuspot.ng", password),
		mustRegister(ctx, authSvc, "Halima Sani", "halima@campuspot.ng", password),
	}

	group, err := potSvc.CreateGroup(ctx, treasurer.ID, pot.CreateGroupRequest{
		Name:              "200L Mass Comm Dues",
		ApprovalThreshold: 2,
		ApprovalTotal:     3,
	})
	if err != nil {
		log.Fatalf("create group: %v", err)
	}

	addMember(ctx, potSvc, group, treasurer.ID, cos1, models.RoleCosigner)
	addMember(ctx, potSvc, group, treasurer.ID, cos2, models.RoleCosigner)
	for _, m := range members {
		addMember(ctx, potSvc, group, treasurer.ID, m, models.RoleMember)
	}

	levy, err := potSvc.CreateLevy(ctx, group.ID, treasurer.ID, pot.CreateLevyRequest{
		Title:      "Excursion levy",
		AmountKobo: int64(money.FromNaira(5_000)),
	})
	if err != nil {
		log.Fatalf("create levy: %v", err)
	}

	// References per member let deposits reconcile automatically.
	memberships, err := potSvc.ListMembers(ctx, group.ID, treasurer.ID)
	if err != nil {
		log.Fatalf("list members: %v", err)
	}
	refFor := map[uuid.UUID]string{}
	for _, ms := range memberships {
		refFor[ms.UserID] = ms.Reference
	}

	// Three full payments, one partial, one unmatched, two unpaid.
	deposit(ctx, potSvc, group.ID, money.FromNaira(5_000), refFor[members[0].ID], members[0].Name, "seed-dep-1")
	deposit(ctx, potSvc, group.ID, money.FromNaira(5_000), refFor[members[1].ID], members[1].Name, "seed-dep-2")
	deposit(ctx, potSvc, group.ID, money.FromNaira(5_000), refFor[members[2].ID], members[2].Name, "seed-dep-3")
	deposit(ctx, potSvc, group.ID, money.FromNaira(2_000), refFor[members[3].ID], members[3].Name, "seed-dep-4")
	deposit(ctx, potSvc, group.ID, money.FromNaira(1_000), "", "Unknown Payer", "seed-dep-5")

	// Anchor the soft limit to the (randomly seeded) balance so the demo
	// reliably shows every risk level: a spend over half the pot reads medium,
	// one over the whole pot reads high.
	balance, err := potSvc.Balance(ctx, group.ID)
	if err != nil {
		log.Fatalf("balance: %v", err)
	}
	group.LargeExpenseKobo = balance
	if err := db.Model(&models.Group{}).Where("id = ?", group.ID).
		Update("large_expense_kobo", balance).Error; err != nil {
		log.Fatalf("set large-expense threshold: %v", err)
	}
	mediumAmount := balance/2 + int64(money.FromNaira(5_000))
	overAmount := balance + int64(money.FromNaira(10_000))

	// A medium-risk expense (over half the balance), awaiting approvals.
	expense, err := potSvc.CreateExpense(ctx, group.ID, treasurer.ID, pot.CreateExpenseRequest{
		AmountKobo:  mediumAmount,
		Destination: "0123456789", // sandbox payout account id
		Category:    "Excursion bus",
		Note:        "Deposit for 18-seater bus",
	})
	if err != nil {
		log.Fatalf("create expense: %v", err)
	}
	// An over-budget expense to demonstrate the high-risk flag.
	overBudget, err := potSvc.CreateExpense(ctx, group.ID, treasurer.ID, pot.CreateExpenseRequest{
		AmountKobo:  overAmount,
		Destination: "0987654321",
		Category:    "New speaker",
		Note:        "Sound system upgrade",
	})
	if err != nil {
		log.Fatalf("create over-budget expense: %v", err)
	}

	// One co-signer approves; the second is still needed.
	if _, err := potSvc.Approve(ctx, group.ID, expense.ID, cos1.ID, pot.DecisionRequest{
		Decision: models.DecisionApprove, Comment: "Bus quote checks out",
	}); err != nil {
		log.Fatalf("approve: %v", err)
	}

	sum, _ := potSvc.Summary(ctx, group.ID, &levy.ID)
	outstanding, _, _ := potSvc.WhoHasntPaid(ctx, group.ID, &levy.ID)

	fmt.Println()
	fmt.Println("================ CampusPot demo seed ================")
	fmt.Printf("Group            : %s\n", group.Name)
	fmt.Printf("Group ID         : %s\n", group.ID)
	fmt.Printf("Join code        : %s\n", group.JoinCode)
	fmt.Printf("Virtual account  : %s (%s)\n", group.VirtualAccountNumber, group.VirtualAccountBank)
	fmt.Println("--- logins (password: password123) ---")
	fmt.Printf("Treasurer        : %s / %s\n", treasurer.Email, treasurer.Name)
	fmt.Printf("Co-signer 1      : %s\n", cos1.Email)
	fmt.Printf("Co-signer 2      : %s\n", cos2.Email)
	fmt.Printf("Members          : %s ...\n", members[0].Email)
	fmt.Println("--- pot snapshot ---")
	fmt.Printf("Collected        : %s\n", money.Kobo(sum.CollectedKobo).Format())
	fmt.Printf("Balance          : %s\n", money.Kobo(sum.BalanceKobo).Format())
	fmt.Printf("Outstanding      : %d member(s), %s\n", len(outstanding), money.Kobo(sum.OutstandingKobo).Format())
	fmt.Printf("Expense awaiting : %s (risk=%s)\n", money.Kobo(expense.AmountKobo).Format(), expense.RiskLevel)
	fmt.Printf("Over-budget flag : %s (risk=%s)\n", money.Kobo(overBudget.AmountKobo).Format(), overBudget.RiskLevel)
	fmt.Println("--- AI treasurer sample ---")
	ans, _ := aiSvc.Answer(ctx, group.ID, treasurer.ID, "Who hasn't paid the excursion levy?")
	fmt.Println(ans.Answer)
	fmt.Println("=====================================================")
}

func mustRegister(ctx context.Context, svc *auth.Service, name, email, password string) *models.User {
	u, _, err := svc.Register(ctx, auth.RegisterRequest{Name: name, Email: email, Password: password})
	if err != nil {
		log.Fatalf("register %s: %v", email, err)
	}
	return u
}

func addMember(ctx context.Context, svc *pot.Service, group *models.Group, treasurerID uuid.UUID, u *models.User, role models.Role) {
	if _, err := svc.Invite(ctx, group.ID, treasurerID, pot.InviteMemberRequest{
		Email: u.Email, Role: role,
	}); err != nil {
		log.Printf("invite %s: %v", u.Email, err)
	}
	if _, err := svc.Join(ctx, u.ID, group.JoinCode); err != nil {
		log.Fatalf("join %s: %v", u.Email, err)
	}
}

func deposit(ctx context.Context, svc *pot.Service, groupID uuid.UUID, amount money.Kobo, ref, payer, eventID string) {
	if _, err := svc.ReconcileDeposit(ctx, pot.DepositEvent{
		GroupID:         groupID,
		AmountKobo:      int64(amount),
		QuotedReference: ref,
		PayerName:       payer,
		ProviderEventID: eventID,
	}); err != nil {
		log.Fatalf("deposit %s: %v", eventID, err)
	}
}
