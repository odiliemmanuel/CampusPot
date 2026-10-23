package pot

// Tests for the upgrade features: scheduled/recurring transfers, send limits,
// discoverable public pots with goals, refunds, dispute escalation, and the
// per-cycle contribution journals.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// setupGroup builds a pot with the given request and joins n extra members.
func setupGroup(t *testing.T, svc *Service, req CreateGroupRequest, extra int) (*models.Group, []*models.User, *models.User) {
	t.Helper()
	ctx := context.Background()
	treasurer := newUser(t, svc.db, "Ada Ada", "ada-"+uuid.NewString()[:8]+"@x.ng")
	group, err := svc.CreateGroup(ctx, treasurer.ID, req)
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	members := make([]*models.User, 0, extra)
	for i := 0; i < extra; i++ {
		u := newUser(t, svc.db, "Member"+string(rune('A'+i)), "m-"+uuid.NewString()[:8]+"@x.ng")
		addTestMember(t, svc, group, treasurer.ID, u, models.RoleMember)
		members = append(members, u)
	}
	return group, members, treasurer
}

// A scheduled transfer does not run before its moment, runs when it is due,
// moves real money, and reports itself completed.
func TestScheduledTransferRunsWhenDue(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	_, _, treasurer := setupGroup(t, svc, CreateGroupRequest{
		Name: "Sched Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 0)

	sender := newUser(t, svc.db, "Seyi", "seyi-x@x.ng")
	if _, err := svc.WalletDeposit(ctx, sender.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(5_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}
	setTestPin(t, svc, sender.ID)

	t0 := time.Now()
	row, err := svc.ScheduleTransfer(ctx, sender.ID, ScheduleTransferRequest{
		AmountKobo: int64(money.FromNaira(500)),
		Recipient:  treasurer.Email,
		ExecuteAt:  flexAt(t0.Add(time.Hour)),
		Cadence:    "once",
		Pin:        testPin,
	})
	if err != nil {
		t.Fatalf("ScheduleTransfer: %v", err)
	}
	if row.Status != models.ScheduleScheduled {
		t.Fatalf("expected scheduled, got %s", row.Status)
	}

	// Not due yet: nothing runs.
	n, err := svc.RunDueSchedules(ctx)
	if err != nil {
		t.Fatalf("RunDueSchedules: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected nothing to run before the moment, got %d", n)
	}

	// Two hours later it is due: money moves and the row completes.
	svc.now = func() time.Time { return t0.Add(2 * time.Hour) }
	n, err = svc.RunDueSchedules(ctx)
	if err != nil {
		t.Fatalf("RunDueSchedules (due): %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 transfer to run, got %d", n)
	}
	assertWallet(t, svc, treasurer.ID, demoFundedKobo()+int64(money.FromNaira(500)))

	var done models.ScheduledTransfer
	if err := svc.db.First(&done, "id = ?", row.ID).Error; err != nil {
		t.Fatalf("reload schedule: %v", err)
	}
	if done.Status != models.ScheduleCompleted || done.CompletedAt == nil {
		t.Fatalf("expected completed with timestamp, got %s", done.Status)
	}
}

// A recurring schedule advances to its next period and keeps running.
func TestRecurringScheduleAdvancesWeekly(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	_, _, treasurer := setupGroup(t, svc, CreateGroupRequest{
		Name: "Weekly Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 0)

	sender := newUser(t, svc.db, "Kola", "kola-x@x.ng")
	if _, err := svc.WalletDeposit(ctx, sender.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(5_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}
	setTestPin(t, svc, sender.ID)

	t0 := time.Now()
	firstRun := t0.Add(time.Hour)
	row, err := svc.ScheduleTransfer(ctx, sender.ID, ScheduleTransferRequest{
		AmountKobo: int64(money.FromNaira(100)),
		Recipient:  treasurer.Email,
		ExecuteAt:  flexAt(firstRun),
		Cadence:    "weekly",
		Pin:        testPin,
	})
	if err != nil {
		t.Fatalf("ScheduleTransfer: %v", err)
	}

	svc.now = func() time.Time { return firstRun.Add(time.Minute) }
	if n, err := svc.RunDueSchedules(ctx); err != nil || n != 1 {
		t.Fatalf("first run: n=%d err=%v", n, err)
	}

	var live models.ScheduledTransfer
	if err := svc.db.First(&live, "id = ?", row.ID).Error; err != nil {
		t.Fatalf("reload: %v", err)
	}
	if live.Status != models.ScheduleScheduled {
		t.Fatalf("recurring schedule must stay scheduled, got %s", live.Status)
	}
	if !live.ExecuteAt.After(firstRun) {
		t.Fatalf("expected the next run to be a week later, got %v", live.ExecuteAt)
	}

	// The second period runs the following week.
	svc.now = func() time.Time { return live.ExecuteAt.Add(time.Minute) }
	if n, err := svc.RunDueSchedules(ctx); err != nil || n != 1 {
		t.Fatalf("second run: n=%d err=%v", n, err)
	}
	assertWallet(t, svc, sender.ID, int64(money.FromNaira(5_000))-2*int64(money.FromNaira(100)))
}

// Cancelling stops the money from ever moving.
func TestCancelSchedulePreventsSend(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	_, _, treasurer := setupGroup(t, svc, CreateGroupRequest{
		Name: "Cancel Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 0)

	sender := newUser(t, svc.db, "Tolu", "tolu-x@x.ng")
	if _, err := svc.WalletDeposit(ctx, sender.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(2_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}
	setTestPin(t, svc, sender.ID)

	t0 := time.Now()
	row, err := svc.ScheduleTransfer(ctx, sender.ID, ScheduleTransferRequest{
		AmountKobo: int64(money.FromNaira(200)), Recipient: treasurer.Email,
		ExecuteAt: flexAt(t0.Add(time.Hour)), Cadence: "once", Pin: testPin,
	})
	if err != nil {
		t.Fatalf("ScheduleTransfer: %v", err)
	}
	if _, err := svc.CancelSchedule(ctx, sender.ID, row.ID); err != nil {
		t.Fatalf("CancelSchedule: %v", err)
	}

	svc.now = func() time.Time { return t0.Add(2 * time.Hour) }
	if n, err := svc.RunDueSchedules(ctx); err != nil || n != 0 {
		t.Fatalf("a cancelled schedule must not run: n=%d err=%v", n, err)
	}
	assertWallet(t, svc, sender.ID, int64(money.FromNaira(2_000)))
}

// Unverified-email accounts cannot move money; verified accounts can transfer without the retired daily caps.
func TestTransferLimitsRequireVerifiedEmail(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	_, _, treasurer := setupGroup(t, CreateGroupRequest{
		Name: "Email Gate Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 0)
	sender := newUser(t, svc.db, "Nkechi", "nkechi-x@x.ng")
	if _, err := svc.WalletDeposit(ctx, sender.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(200_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}
	setTestPin(t, svc, sender.ID)
	if err := svc.db.Model(&models.User{}).Where("id = ?", sender.ID).Update("email_verified", false).Error; err != nil {
		t.Fatalf("unverify: %v", err)
	}
	_, err := svc.WalletTransfer(ctx, sender.ID, WalletTransferRequest{AmountKobo: int64(money.FromNaira(100)), Recipient: treasurer.Email, Pin: testPin})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected ErrForbidden for unverified email, got %v", err)
	}
	if err := svc.db.Model(&models.User{}).Where("id = ?", sender.ID).Update("email_verified", true).Error; err != nil {
		t.Fatalf("verify: %v", err)
	}
	if _, err := svc.WalletTransfer(ctx, sender.ID, WalletTransferRequest{AmountKobo: int64(money.FromNaira(100_000)), Recipient: treasurer.Email, Pin: testPin}); err != nil {
		t.Fatalf("verified account transfer: %v", err)
	}
}

// Public pots are discoverable and joinable; private ones stay invisible.
func TestDiscoverAndJoinPublicPots(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)

	publicPot, _, _ := setupGroup(t, svc, CreateGroupRequest{
		Name: "Campus Shuttle Fund", PerMemberKobo: int64(money.FromNaira(2_000)),
		ContributionDueDate: dueSoon(), Visibility: models.VisibilityPublic,
		Category: "Transport", Description: "Weekly shuttle to town",
		TargetKobo: int64(money.FromNaira(100_000)),
	}, 0)
	privatePot, _, _ := setupGroup(t, svc, CreateGroupRequest{
		Name: "Secret Dues", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 0)

	stranger := newUser(t, svc.db, "Zoe", "zoe-x@x.ng")
	found, err := svc.DiscoverPots(ctx, stranger.ID, "", "")
	if err != nil {
		t.Fatalf("DiscoverPots: %v", err)
	}
	if len(found) != 1 || found[0].ID != publicPot.ID {
		t.Fatalf("expected only the public pot, got %+v", found)
	}
	if found[0].Joined || !found[0].Open {
		t.Fatalf("expected an open, unjoined pot, got %+v", found[0])
	}

	// Text query matches name/description/category, and misses nothing else.
	byCategory, err := svc.DiscoverPots(ctx, stranger.ID, "", "transport")
	if err != nil || len(byCategory) != 1 {
		t.Fatalf("category filter: %d results, err=%v", len(byCategory), err)
	}
	if none, err := svc.DiscoverPots(ctx, stranger.ID, "shuttle-club", ""); err != nil || len(none) != 0 {
		t.Fatalf("a non-matching query must return nothing, got %d err=%v", len(none), err)
	}

	// Joining is direct — no invite code.
	if _, err := svc.JoinPublicPot(ctx, stranger.ID, publicPot.ID); err != nil {
		t.Fatalf("JoinPublicPot: %v", err)
	}
	members, err := svc.ListMembers(ctx, publicPot.ID, stranger.ID)
	if err != nil || len(members) != 2 {
		t.Fatalf("expected treasurer + joiner after joining: %d err=%v", len(members), err)
	}

	// The private pot is unreachable this way.
	if _, err := svc.JoinPublicPot(ctx, stranger.ID, privatePot.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a private pot must refuse direct joins, got %v", err)
	}
}

// Goal progress reports the balance as a share of the target.
func TestGoalProgress(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	group, _, _ := setupGroup(t, svc, CreateGroupRequest{
		Name: "Studio Fund", PerMemberKobo: int64(money.FromNaira(1_000)),
		ContributionDueDate: dueSoon(), Visibility: models.VisibilityPublic,
		TargetKobo: int64(money.FromNaira(100_000)),
	}, 0)

	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(50_000)),
		PayerName: "Studio", ProviderEventID: "goal-1",
	}); err != nil {
		t.Fatalf("ReconcileDeposit: %v", err)
	}

	target, balance, percent, err := svc.GoalProgress(ctx, group.ID)
	if err != nil {
		t.Fatalf("GoalProgress: %v", err)
	}
	if target != int64(money.FromNaira(100_000)) || balance != int64(money.FromNaira(50_000)) || percent != 50 {
		t.Fatalf("expected 50%% of the goal, got target=%d balance=%d percent=%d", target, balance, percent)
	}
}

// A treasurer refunds a contribution: the wallet is credited, the ledger is
// debited, the payment stops counting, and it can never be refunded twice.
func TestRefundPaymentReturnsMoneyToWallet(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	group, members, treasurer := setupGroup(t, svc, CreateGroupRequest{
		Name: "Refund Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 1)

	member := members[0]
	memberships, err := svc.ListMembers(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ListMembers: %v", err)
	}
	ref := ""
	for _, m := range memberships {
		if m.UserID == member.ID {
			ref = m.Reference
		}
	}
	p, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(1_000)),
		QuotedReference: ref, PayerName: member.Name, ProviderEventID: "refund-1",
	})
	if err != nil {
		t.Fatalf("ReconcileDeposit: %v", err)
	}

	refunded, err := svc.RefundPayment(ctx, group.ID, treasurer.ID, p.ID)
	if err != nil {
		t.Fatalf("RefundPayment: %v", err)
	}
	if refunded.Status != models.PaymentRefunded || refunded.RefundedAt == nil {
		t.Fatalf("expected a refunded payment, got %+v", refunded)
	}

	// The member's wallet got the money back; the pot ledger was debited.
	assertWallet(t, svc, member.ID, int64(money.FromNaira(1_000)))
	bal, err := svc.Balance(ctx, group.ID)
	if err != nil || bal != 0 {
		t.Fatalf("pot balance after refund = %d (err=%v), want 0", bal, err)
	}

	// Their outstanding recomputes to the full levy again.
	acct, err := svc.LookupPotAccount(ctx, member.ID, group.VirtualAccountNumber)
	if err != nil {
		t.Fatalf("LookupPotAccount: %v", err)
	}
	if acct.OutstandingKobo != int64(money.FromNaira(1_000)) {
		t.Fatalf("expected the full levy outstanding again, got %d", acct.OutstandingKobo)
	}

	// Never twice.
	if _, err := svc.RefundPayment(ctx, group.ID, treasurer.ID, p.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected ErrConflict on double refund, got %v", err)
	}
}

// Escalating a dispute opens a support case with a visible paper trail.
func TestEscalateDisputeOpensSupportCase(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	group, members, treasurer := setupGroup(t, svc, CreateGroupRequest{
		Name: "Dispute Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 2)
	m1, m2 := members[0], members[1]

	d1, err := svc.RaiseDispute(ctx, group.ID, m1.ID, RaiseDisputeRequest{Reason: "Bus fare looks wrong"})
	if err != nil {
		t.Fatalf("RaiseDispute: %v", err)
	}
	if _, err := svc.RaiseDispute(ctx, group.ID, m2.ID, RaiseDisputeRequest{Reason: "Same concern"}); err != nil {
		t.Fatalf("RaiseDispute 2: %v", err)
	}

	// Someone else cannot escalate another member's dispute.
	if _, err := svc.EscalateDispute(ctx, group.ID, d1.ID, m2.ID, "not mine"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}

	sc, err := svc.EscalateDispute(ctx, group.ID, d1.ID, m1.ID, "Need an independent review")
	if err != nil {
		t.Fatalf("EscalateDispute: %v", err)
	}
	if sc.Status != models.CaseOpen || sc.DisputeID == nil || *sc.DisputeID != d1.ID {
		t.Fatalf("expected an open case linked to the dispute, got %+v", sc)
	}

	// Escalating twice is refused.
	if _, err := svc.EscalateDispute(ctx, group.ID, d1.ID, m1.ID, "again"); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected ErrConflict on double escalation, got %v", err)
	}

	// Visibility: raiser and treasurer see the case; the other member does not.
	if cases, err := svc.ListSupportCases(ctx, group.ID, m1.ID); err != nil || len(cases) != 1 {
		t.Fatalf("raiser should see their case: %d err=%v", len(cases), err)
	}
	if cases, err := svc.ListSupportCases(ctx, group.ID, treasurer.ID); err != nil || len(cases) != 1 {
		t.Fatalf("treasurer should see the case: %d err=%v", len(cases), err)
	}
	if cases, err := svc.ListSupportCases(ctx, group.ID, m2.ID); err != nil || len(cases) != 0 {
		t.Fatalf("another member must not see it: %d err=%v", len(cases), err)
	}
}

// Each paid contribution cycle gets its own journal, oldest first.
func TestContributionJournalsPerCycle(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	treasurer := newUser(t, svc.db, "Ada J", "adaj-x@x.ng")
	member := newUser(t, svc.db, "Chidi J", "chidij-x@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, CreateGroupRequest{
		Name: "Journal Pot", PotType: "rotating", ContributionFrequency: "weekly",
		PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	})
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	addTestMember(t, svc, group, treasurer.ID, member, models.RoleMember)

	memberships, err := svc.ListMembers(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ListMembers: %v", err)
	}
	refs := map[uuid.UUID]string{}
	for _, m := range memberships {
		refs[m.UserID] = m.Reference
	}

	// Everyone pays the first cycle → it closes and the next opens.
	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(1_000)),
		QuotedReference: refs[treasurer.ID], PayerName: treasurer.Name, ProviderEventID: "j1",
	}); err != nil {
		t.Fatalf("deposit treasurer: %v", err)
	}
	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(1_000)),
		QuotedReference: refs[member.ID], PayerName: member.Name, ProviderEventID: "j2",
	}); err != nil {
		t.Fatalf("deposit member: %v", err)
	}

	journals, err := svc.ContributionJournals(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ContributionJournals: %v", err)
	}
	if len(journals) != 2 {
		t.Fatalf("expected 2 cycles (closed + next), got %d", len(journals))
	}

	first := journals[0]
	if first.Status != "closed" {
		t.Fatalf("the first cycle should be closed, got %s", first.Status)
	}
	if first.CollectedKobo != int64(money.FromNaira(2_000)) {
		t.Fatalf("first cycle collected = %d, want 2000 NGN", first.CollectedKobo)
	}
	if first.PaidCount != 2 || first.UnpaidCount != 0 {
		t.Fatalf("expected everyone paid in cycle 1, got %+v", first)
	}
	if first.ClosingBalanceKobo != int64(money.FromNaira(2_000)) {
		t.Fatalf("first cycle closing balance = %d, want 2000 NGN", first.ClosingBalanceKobo)
	}
	if first.PeriodLabel == "" {
		t.Fatal("expected a human period label")
	}

	second := journals[1]
	if second.Status != "open" || second.CollectedKobo != 0 {
		t.Fatalf("the next cycle should be open and empty, got %+v", second)
	}
	if second.PeriodLabel == first.PeriodLabel {
		t.Fatalf("consecutive weekly cycles must have distinct labels: %q", second.PeriodLabel)
	}

	// Opening one journal in full shows each member's line.
	detail, err := svc.ContributionJournal(ctx, group.ID, first.LevyID, member.ID)
	if err != nil {
		t.Fatalf("ContributionJournal: %v", err)
	}
	if len(detail.Rows) != 2 {
		t.Fatalf("expected a row per member, got %d", len(detail.Rows))
	}
	for _, row := range detail.Rows {
		if row.State != "paid" || len(row.Payments) != 1 {
			t.Fatalf("expected one full payment per member, got %+v", row)
		}
	}
}

// A treasurer can hide the pot's balance from ordinary members: they keep
// seeing contributions and goals, but not the treasury itself.
func TestHideTreasuryMasksBalanceFromMembers(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestService(t)
	group, members, treasurer := setupGroup(t, svc, CreateGroupRequest{
		Name: "Quiet Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	}, 1)
	member := members[0]

	if _, err := svc.ReconcileDeposit(ctx, DepositEvent{
		GroupID: group.ID, AmountKobo: int64(money.FromNaira(4_000)),
		PayerName: "Someone", ProviderEventID: "ht-1",
	}); err != nil {
		t.Fatalf("ReconcileDeposit: %v", err)
	}

	on := true
	if _, err := svc.UpdateGroup(ctx, group.ID, treasurer.ID, UpdateGroupRequest{HideTreasury: &on}); err != nil {
		t.Fatalf("UpdateGroup: %v", err)
	}

	// The treasurer still sees the real figures.
	sum, err := svc.Summary(ctx, group.ID, nil)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	sum = svc.MaskTreasury(sum, group.ID, treasurer.ID)
	if sum.BalanceKobo != int64(money.FromNaira(4_000)) || sum.TreasuryHidden {
		t.Fatalf("treasurer must see the treasury, got %+v", sum)
	}

	// An ordinary member gets a masked summary: no balance, flag raised.
	sum, err = svc.Summary(ctx, group.ID, nil)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	sum = svc.MaskTreasury(sum, group.ID, member.ID)
	if sum.BalanceKobo != 0 || sum.CollectedKobo != 0 || sum.SpentKobo != 0 || !sum.TreasuryHidden {
		t.Fatalf("member should see a masked treasury, got %+v", sum)
	}

	// The member's personal overview hides it too.
	overview, err := svc.AccountOverview(ctx, member.ID)
	if err != nil {
		t.Fatalf("AccountOverview: %v", err)
	}
	if len(overview.Pots) != 1 || overview.Pots[0].BalanceKobo != 0 || !overview.Pots[0].TreasuryHidden {
		t.Fatalf("expected the pot hidden in the member's overview, got %+v", overview.Pots)
	}
}

// helpers -----------------------------------------------------------------

// flexAt wraps a time as the JSON-flexible time the API accepts.
func flexAt(t time.Time) *FlexTime {
	ft := FlexTime(t)
	return &ft
}

// demoFundedKobo mirrors the demo welcome balance new accounts get when
// created through the auth service. Test users start at zero.
func demoFundedKobo() int64 { return 0 }

// assertWallet checks a user's wallet balance.
func assertWallet(t *testing.T, svc *Service, userID uuid.UUID, want int64) {
	t.Helper()
	w, err := svc.Wallet(context.Background(), userID)
	if err != nil {
		t.Fatalf("Wallet: %v", err)
	}
	if w.BalanceKobo != want {
		t.Fatalf("wallet = %d, want %d", w.BalanceKobo, want)
	}
}
