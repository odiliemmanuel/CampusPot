// Package seed builds the PotKeeper demo dataset: a class pot, its executives,
// members, a levy, a spread of payments, and two expense requests (one
// medium-risk, one over-budget). It uses the real treasurer engine, so the
// seeded data behaves exactly like live data.
//
// It is shared by the cmd/seed CLI and the API's optional auto-seed-on-empty
// startup so both build exactly the same dataset.
package seed

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/auth"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

// Password is the shared password for every seeded demo account.
const Password = "password123"

// Result carries the entities a caller (e.g. the CLI) may want to report.
type Result struct {
	Service    *pot.Service
	Group      *models.Group
	Treasurer  *models.User
	Cosigners  []*models.User
	Members    []*models.User
	Levy       *models.Levy
	Expense    *models.ExpenseRequest
	OverBudget *models.ExpenseRequest
}

// IsEmpty reports whether the database still has no users, so the auto-seed
// path can avoid touching a database that already holds data.
func IsEmpty(db *gorm.DB) (bool, error) {
	var count int64
	if err := db.Model(&models.User{}).Count(&count).Error; err != nil {
		return false, err
	}
	return count == 0, nil
}

// Run creates the demo dataset. Call it only on an empty database (see
// IsEmpty); seeding twice would clash on the unique account emails.
func Run(ctx context.Context, db *gorm.DB, cfg *config.Config) (*Result, error) {
	client := bmoni.NewMockClient()
	potSvc := pot.NewService(db, cfg, client)
	authSvc := auth.NewService(db, cfg, client)

	treasurer, err := register(ctx, authSvc, "Ada Okafor", "ada@potkeeper.ng")
	if err != nil {
		return nil, err
	}
	cos1, err := register(ctx, authSvc, "Tunde Bello", "tunde@potkeeper.ng")
	if err != nil {
		return nil, err
	}
	cos2, err := register(ctx, authSvc, "Ngozi Eze", "ngozi@potkeeper.ng")
	if err != nil {
		return nil, err
	}

	memberSpecs := []struct{ name, email string }{
		{"Chidi Nwosu", "chidi@potkeeper.ng"},
		{"Fatima Yusuf", "fatima@potkeeper.ng"},
		{"Emeka Obi", "emeka@potkeeper.ng"},
		{"Blessing Ade", "blessing@potkeeper.ng"},
		{"Seun Ajayi", "seun@potkeeper.ng"},
		{"Halima Sani", "halima@potkeeper.ng"},
	}
	members := make([]*models.User, 0, len(memberSpecs))
	for _, spec := range memberSpecs {
		u, err := register(ctx, authSvc, spec.name, spec.email)
		if err != nil {
			return nil, err
		}
		members = append(members, u)
	}

	group, err := potSvc.CreateGroup(ctx, treasurer.ID, pot.CreateGroupRequest{
		Name:              "200L Mass Comm Dues",
		ApprovalThreshold: 2,
		ApprovalTotal:     3,
	})
	if err != nil {
		return nil, fmt.Errorf("create group: %w", err)
	}

	if err := addMember(ctx, potSvc, group, treasurer.ID, cos1, models.RoleCosigner); err != nil {
		return nil, err
	}
	if err := addMember(ctx, potSvc, group, treasurer.ID, cos2, models.RoleCosigner); err != nil {
		return nil, err
	}
	for _, m := range members {
		if err := addMember(ctx, potSvc, group, treasurer.ID, m, models.RoleMember); err != nil {
			return nil, err
		}
	}

	levy, err := potSvc.CreateLevy(ctx, group.ID, treasurer.ID, pot.CreateLevyRequest{
		Title:      "Excursion levy",
		AmountKobo: int64(money.FromNaira(5_000)),
	})
	if err != nil {
		return nil, fmt.Errorf("create levy: %w", err)
	}

	// References per member let deposits reconcile automatically.
	memberships, err := potSvc.ListMembers(ctx, group.ID, treasurer.ID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
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
		return nil, fmt.Errorf("balance: %w", err)
	}
	group.LargeExpenseKobo = balance
	if err := db.Model(&models.Group{}).Where("id = ?", group.ID).
		Update("large_expense_kobo", balance).Error; err != nil {
		return nil, fmt.Errorf("set large-expense threshold: %w", err)
	}
	mediumAmount := balance/2 + int64(money.FromNaira(5_000))
	overAmount := balance + int64(money.FromNaira(10_000))

	// A medium-risk expense (over half the balance), awaiting approvals.
	// The account passes name enquiry, so its holder name is verified and shown.
	expense, err := potSvc.CreateExpense(ctx, group.ID, treasurer.ID, pot.CreateExpenseRequest{
		AmountKobo:      mediumAmount,
		DestinationType: models.ExpenseBank,
		Recipient:       "0123456789", // sandbox payout account (verified)
		BankName:        "GTBank",
		Category:        "Excursion bus",
		Note:            "Deposit for 18-seater bus",
	})
	if err != nil {
		return nil, fmt.Errorf("create expense: %w", err)
	}
	// An over-budget expense to demonstrate the high-risk flag.
	overBudget, err := potSvc.CreateExpense(ctx, group.ID, treasurer.ID, pot.CreateExpenseRequest{
		AmountKobo:      overAmount,
		DestinationType: models.ExpenseBank,
		Recipient:       "0987654321",
		BankName:        "Zenith Bank",
		Category:        "New speaker",
		Note:            "Sound system upgrade",
	})
	if err != nil {
		return nil, fmt.Errorf("create over-budget expense: %w", err)
	}

	// One co-signer approves; the second is still needed.
	if _, err := potSvc.Approve(ctx, group.ID, expense.ID, cos1.ID, pot.DecisionRequest{
		Decision: models.DecisionApprove, Comment: "Bus quote checks out",
	}); err != nil {
		return nil, fmt.Errorf("approve: %w", err)
	}

	return &Result{
		Service:    potSvc,
		Group:      group,
		Treasurer:  treasurer,
		Cosigners:  []*models.User{cos1, cos2},
		Members:    members,
		Levy:       levy,
		Expense:    expense,
		OverBudget: overBudget,
	}, nil
}

func register(ctx context.Context, svc *auth.Service, name, email string) (*models.User, error) {
	u, _, err := svc.Register(ctx, auth.RegisterRequest{
		Name: name, Email: email, Phone: seedPhone(email), Password: Password,
	})
	if err != nil {
		return nil, fmt.Errorf("register %s: %w", email, err)
	}
	return u, nil
}

// seedPhone derives a stable, unique-looking Nigerian phone number from an
// email so seeded accounts satisfy the phone-as-wallet-account rule.
func seedPhone(email string) string {
	var h uint32 = 2166136261
	for _, r := range email {
		h = (h ^ uint32(r)) * 16777619
	}
	return fmt.Sprintf("0803%07d", h%10_000_000)
}

func addMember(ctx context.Context, svc *pot.Service, group *models.Group, treasurerID uuid.UUID, u *models.User, role models.Role) error {
	if _, err := svc.Invite(ctx, group.ID, treasurerID, pot.InviteMemberRequest{
		Email: u.Email, Role: role,
	}); err != nil {
		return fmt.Errorf("invite %s: %w", u.Email, err)
	}
	if _, err := svc.Join(ctx, u.ID, group.JoinCode); err != nil {
		return fmt.Errorf("join %s: %w", u.Email, err)
	}
	return nil
}

func deposit(ctx context.Context, svc *pot.Service, groupID uuid.UUID, amount money.Kobo, ref, payer, eventID string) {
	// Deposits are best-effort: an unmatched payer is still credited by name,
	// and a failure here is non-fatal for building the demo dataset.
	_, _ = svc.ReconcileDeposit(ctx, pot.DepositEvent{
		GroupID:         groupID,
		AmountKobo:      int64(amount),
		QuotedReference: ref,
		PayerName:       payer,
		ProviderEventID: eventID,
	})
}
