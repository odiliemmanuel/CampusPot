package pot

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// dueSoon is a valid contribution deadline for test pots (today or later).
func dueSoon() *FlexTime {
	ft := FlexTime(time.Now().Add(7 * 24 * time.Hour))
	return &ft
}

// newTestService builds an in-process engine backed by a throwaway SQLite file
// and the mock B Moni client. This exercises the real money logic end to end.
func newTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(models.AllModels()...); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	cfg := &config.Config{}
	svc := NewService(db, cfg, bmoni.NewMockClient())
	return svc, db
}

func newUser(t *testing.T, db *gorm.DB, name, email string) *models.User {
	t.Helper()
	// A real bcrypt hash so password-confirmed flows (first-time PIN setup)
	// work against the literal password "x" used throughout the tests.
	hash, err := bcrypt.GenerateFromPassword([]byte("x"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	// EmailVerified: the engine refuses wallet movements from unverified
	// accounts, and test accounts are created directly (they skip the OTP
	// flow that real sign-ups go through).
	u := &models.User{Name: name, Email: email, PasswordHash: string(hash), BMoniUserID: "bmoni_" + email[:3], EmailVerified: true}
	if err := db.Create(u).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return u
}

// testPin is the transaction PIN used by wallet tests.
const testPin = "1234"

// setTestPin gives a user a transaction PIN so their wallet can spend.
func setTestPin(t *testing.T, svc *Service, userID uuid.UUID) {
	t.Helper()
	if err := svc.SetTransactionPin(context.Background(), userID, SetPinRequest{Pin: testPin, Password: "x"}); err != nil {
		t.Fatalf("SetTransactionPin: %v", err)
	}
}

func addTestMember(t *testing.T, svc *Service, group *models.Group, treasurerID uuid.UUID, u *models.User, role models.Role) {
	t.Helper()
	if _, err := svc.Invite(context.Background(), group.ID, treasurerID, InviteMemberRequest{Email: u.Email, Role: role}); err != nil {
		t.Fatalf("invite %s: %v", u.Email, err)
	}
	if _, err := svc.Join(context.Background(), u.ID, group.JoinCode); err != nil {
		t.Fatalf("join %s: %v", u.Email, err)
	}
}

func TestPotLifecycle(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)

	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	cos1 := newUser(t, db, "Tunde", "tunde@x.ng")
	cos2 := newUser(t, db, "Ngozi", "ngozi@x.ng")
	m1 := newUser(t, db, "Chidi", "chidi@x.ng")
	m2 := newUser(t, db, "Fatima", "fatima@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, CreateGroupRequest{
		Name: "200L Dues", ApprovalThreshold: 2, ApprovalTotal: 3,
		LargeExpenseKobo: int64(money.FromNaira(20_000)),
		PerMemberKobo:    int64(money.FromNaira(5_000)), ContributionDueDate: dueSoon(),
	})
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	if group.VirtualAccountNumber == "" {
		t.Fatal("expected a virtual account to be provisioned")
	}
	if group.JoinCode == "" {
		t.Fatal("expected a join code")
	}

	addTestMember(t, svc, group, treasurer.ID, cos1, models.RoleCosigner)
	addTestMember(t, svc, group, treasurer.ID, cos2, models.RoleCosigner)
	addTestMember(t, svc, group, treasurer.ID, m1, models.RoleMember)
	addTestMember(t, svc, group, treasurer.ID, m2, models.RoleMember)

	levy, err := svc.CreateLevy(ctx, group.ID, treasurer.ID, CreateLevyRequest{
		Title: "Excursion", AmountKobo: int64(money.FromNaira(5_000)),
	})
	if err != nil {
		t.Fatalf("CreateLevy: %v", err)
	}

	memberships, err := svc.ListMembers(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ListMembers: %v", err)
	}
	ref := map[uuid.UUID]string{}
	for _, ms := range memberships {
		ref[ms.UserID] = ms.Reference
	}

	// m1 pays in full by quoting their reference.
	p, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(5_000)),
		QuotedReference: ref[m1.ID], PayerName: m1.Name, ProviderEventID: "dep1",
	})
	if err != nil {
		t.Fatalf("ReconcileDeposit: %v", err)
	}
	if p.Status != models.PaymentMatched {
		t.Fatalf("expected matched, got %s", p.Status)
	}

	// Idempotency: same provider event must not double-credit.
	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(5_000)),
		QuotedReference: ref[m1.ID], PayerName: m1.Name, ProviderEventID: "dep1",
	}); err != nil {
		t.Fatalf("idempotent replay: %v", err)
	}
	bal, _ := svc.Balance(ctx, group.ID)
	if bal != int64(money.FromNaira(5_000)) {
		t.Fatalf("balance after replay = %d, want %d", bal, int64(money.FromNaira(5_000)))
	}

	// m2 pays only part.
	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(2_000)),
		QuotedReference: ref[m2.ID], PayerName: m2.Name, ProviderEventID: "dep2",
	}); err != nil {
		t.Fatalf("partial deposit: %v", err)
	}

	// Matching by payer name when no reference is quoted.
	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(5_000)),
		PayerName: m2.Name, ProviderEventID: "dep3",
	}); err != nil {
		t.Fatalf("name-matched deposit: %v", err)
	}

	// m2 should now be fully paid; the treasurer, cos1 and cos2 have not paid.
	outstanding, _, err := svc.WhoHasntPaid(ctx, group.ID, &levy.ID)
	if err != nil {
		t.Fatalf("WhoHasntPaid: %v", err)
	}
	if len(outstanding) != 3 {
		t.Fatalf("expected 3 outstanding (treasurer + 2 cosigners), got %d: %+v", len(outstanding), outstanding)
	}

	sum, err := svc.Summary(ctx, group.ID, &levy.ID)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if sum.CollectedKobo != int64(money.FromNaira(12_000)) {
		t.Fatalf("collected = %d, want 12000 NGN", sum.CollectedKobo)
	}

	// Expense requires 2 of 3 approvals and cannot be self-approved.
	exp, err := svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{
		AmountKobo: int64(money.FromNaira(6_000)), DestinationType: models.ExpenseBank,
		Recipient: "0123456789", BankName: "GTBank", Category: "Bus",
	})
	if err != nil {
		t.Fatalf("CreateExpense: %v", err)
	}
	if exp.AccountName == "" {
		t.Fatal("expected the verified account holder name to be stored on the expense")
	}
	if exp.Status != models.ExpensePendingApproval {
		t.Fatalf("expected pending_approval, got %s", exp.Status)
	}

	if _, err := svc.Approve(ctx, group.ID, exp.ID, treasurer.ID, DecisionRequest{Decision: models.DecisionApprove}); err == nil {
		t.Fatal("treasurer must not be able to approve their own request")
	}
	if _, err := svc.Approve(ctx, group.ID, exp.ID, cos1.ID, DecisionRequest{Decision: models.DecisionApprove}); err != nil {
		t.Fatalf("cos1 approve: %v", err)
	}
	got, err := svc.Approve(ctx, group.ID, exp.ID, cos2.ID, DecisionRequest{Decision: models.DecisionApprove})
	if err != nil {
		t.Fatalf("cos2 approve: %v", err)
	}
	if got.Status != models.ExpenseApproved {
		t.Fatalf("expected approved after 2 approvals, got %s", got.Status)
	}

	// Execute the approved withdrawal; mock reports the payout completed.
	executed, err := svc.Execute(ctx, group.ID, exp.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if executed.Status != models.ExpenseCompleted {
		t.Fatalf("expected completed, got %s", executed.Status)
	}
	bal, _ = svc.Balance(ctx, group.ID)
	if bal != int64(money.FromNaira(6_000)) {
		t.Fatalf("balance after payout = %d, want 6000 NGN", bal)
	}
}

func TestRiskFlags(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	treasurer := newUser(t, db, "Ada", "ada2@x.ng")
	group, err := svc.CreateGroup(ctx, treasurer.ID, CreateGroupRequest{Name: "G", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon()})
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}

	// Over-balance spend must be flagged high risk.
	exp, err := svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{
		AmountKobo: int64(money.FromNaira(10_000)), DestinationType: models.ExpenseBank,
		Recipient: "0123456789", BankName: "GTBank",
	})
	if err != nil {
		t.Fatalf("CreateExpense: %v", err)
	}
	if exp.RiskLevel != models.RiskHigh {
		t.Fatalf("expected high risk over balance, got %s", exp.RiskLevel)
	}
	if exp.RiskReasons == "" || exp.RiskReasons == "[]" {
		t.Fatal("expected risk reasons to be recorded")
	}
}
