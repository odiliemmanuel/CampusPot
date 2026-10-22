package pot

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// setupPotWithMember creates a pot (with a per-member levy) whose treasurer is
// the caller, then joins a second member. Returns the group and the member.
func setupPotWithMember(t *testing.T, svc *Service, treasurer *models.User) (*models.Group, *models.User) {
	t.Helper()
	ctx := context.Background()
	group, err := svc.CreateGroup(ctx, treasurer.ID, CreateGroupRequest{
		Name: "Test Pot", PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon(),
	})
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	if group.VirtualAccountNumber == "" {
		t.Fatal("expected a virtual account to be provisioned")
	}
	member := newUser(t, svc.db, "Chidi", "chidi@"+group.ID.String()+".ng")
	if _, err := svc.Invite(ctx, group.ID, treasurer.ID, InviteMemberRequest{Email: member.Email, Role: models.RoleMember}); err != nil {
		t.Fatalf("Invite: %v", err)
	}
	if _, err := svc.Join(ctx, member.ID, group.JoinCode); err != nil {
		t.Fatalf("Join: %v", err)
	}
	return group, member
}

// Sending to a pot's own collection account must resolve to that pot, require
// membership, and be recorded as the sender's real contribution (a Payment),
// so it reflects in their standing — not as a faceless bank payout.
func TestSendToPotAccountReflectsContribution(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	group, member := setupPotWithMember(t, svc, treasurer)

	if _, err := svc.WalletDeposit(ctx, member.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(10_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}
	setTestPin(t, svc, member.ID)

	// The pot's account resolves for the member, and reports what they owe.
	acct, err := svc.LookupPotAccount(ctx, member.ID, group.VirtualAccountNumber)
	if err != nil {
		t.Fatalf("LookupPotAccount: %v", err)
	}
	if acct.GroupID != group.ID || acct.GroupName != group.Name || !acct.IsMember {
		t.Fatalf("expected a resolved pot account with membership, got %+v", acct)
	}
	if acct.OutstandingKobo != int64(money.FromNaira(1_000)) {
		t.Fatalf("expected outstanding = levy amount, got %d", acct.OutstandingKobo)
	}

	// A send addressed to the pot's account pays INTO the pot.
	if _, err := svc.WalletTransfer(ctx, member.ID, WalletTransferRequest{
		AmountKobo: int64(money.FromNaira(1_000)), Recipient: group.VirtualAccountNumber, Pin: testPin,
	}); err != nil {
		t.Fatalf("WalletTransfer to pot account: %v", err)
	}

	// The pot ledger was credited.
	bal, err := svc.Balance(ctx, group.ID)
	if err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if bal != int64(money.FromNaira(1_000)) {
		t.Fatalf("pot balance = %d, want 1000 NGN", bal)
	}

	// It is a real Payment attributed to the sender, so their contribution shows.
	payments, err := svc.ListPayments(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ListPayments: %v", err)
	}
	var found bool
	for _, p := range payments {
		if p.UserID != nil && *p.UserID == member.ID && p.AmountKobo == int64(money.FromNaira(1_000)) {
			found = true
			if p.Status != models.PaymentMatched {
				t.Fatalf("expected matched payment, got %s", p.Status)
			}
		}
	}
	if !found {
		t.Fatalf("expected a Payment attributed to the sender, got %+v", payments)
	}

	// Their outstanding contribution is now zero.
	acct, err = svc.LookupPotAccount(ctx, member.ID, group.VirtualAccountNumber)
	if err != nil {
		t.Fatalf("LookupPotAccount (after): %v", err)
	}
	if acct.OutstandingKobo != 0 {
		t.Fatalf("expected outstanding to be cleared, got %d", acct.OutstandingKobo)
	}
}

// Only members may pay into a pot. A non-member is refused before any debit,
// and the wallet balance is untouched.
func TestSendToPotAccountRefusesNonMember(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	group, _ := setupPotWithMember(t, svc, treasurer)

	outsider := newUser(t, db, "Bisi", "bisi@x.ng")
	if _, err := svc.WalletDeposit(ctx, outsider.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(5_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}
	setTestPin(t, svc, outsider.ID)

	// The lookup reports the pot but flags no membership.
	acct, err := svc.LookupPotAccount(ctx, outsider.ID, group.VirtualAccountNumber)
	if err != nil {
		t.Fatalf("LookupPotAccount: %v", err)
	}
	if acct.IsMember {
		t.Fatal("outsider must not be flagged a member")
	}

	// The send is refused with a reason naming the pot.
	_, err = svc.WalletTransfer(ctx, outsider.ID, WalletTransferRequest{
		AmountKobo: int64(money.FromNaira(500)), Recipient: group.VirtualAccountNumber, Pin: testPin,
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected ErrForbidden for a non-member, got %v", err)
	}
	if !strings.Contains(err.Error(), group.Name) {
		t.Fatalf("expected the refusal to name the pot, got %q", err.Error())
	}

	// No money left the wallet, and the pot was not credited.
	w, err := svc.Wallet(ctx, outsider.ID)
	if err != nil {
		t.Fatalf("Wallet: %v", err)
	}
	if w.BalanceKobo != int64(money.FromNaira(5_000)) {
		t.Fatalf("wallet must be untouched after a refused pot send, got %d", w.BalanceKobo)
	}
	bal, err := svc.Balance(ctx, group.ID)
	if err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if bal != 0 {
		t.Fatalf("pot balance must be untouched, got %d", bal)
	}
}
