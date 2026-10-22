package pot

import (
	"context"
	"testing"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// testGroupRequest is a valid pot-creation body for dispute/chat tests.
func testGroupRequest(name string) CreateGroupRequest {
	return CreateGroupRequest{Name: name, PerMemberKobo: int64(money.FromNaira(1_000)), ContributionDueDate: dueSoon()}
}

func TestChatReadReceiptsAndReplies(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)

	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	member := newUser(t, db, "Chidi", "chidi@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, testGroupRequest("200L Dues"))
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	addTestMember(t, svc, group, treasurer.ID, member, models.RoleMember)

	first, err := svc.PostChat(ctx, group.ID, treasurer.ID, PostChatRequest{Body: "hello"})
	if err != nil {
		t.Fatalf("PostChat: %v", err)
	}
	if len(first.ReadBy) != 1 || first.ReadBy[0] != treasurer.ID {
		t.Fatalf("expected author to be the only reader, got %v", first.ReadBy)
	}

	reply, err := svc.PostChat(ctx, group.ID, member.ID, PostChatRequest{Body: "hi", ReplyToID: &first.ID})
	if err != nil {
		t.Fatalf("reply: %v", err)
	}
	if reply.ReplyToID == nil || *reply.ReplyToID != first.ID {
		t.Fatal("expected reply to reference the first message")
	}

	// Member reads up to the reply, which also marks the earlier message read.
	if err := svc.MarkChatRead(ctx, group.ID, member.ID, reply.ID); err != nil {
		t.Fatalf("MarkChatRead: %v", err)
	}
	msgs, err := svc.ListChat(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ListChat: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if len(msgs[0].ReadBy) != 2 {
		t.Fatalf("expected msg1 read by both, got %v", msgs[0].ReadBy)
	}

	// Chat membership follows the pot: a member can't be removed while active.
	if err := svc.RemoveChatMember(ctx, group.ID, treasurer.ID, member.ID); err == nil {
		t.Fatal("expected removing an active member from chat to be blocked")
	}
}

func TestDisputesFreezeSpending(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)

	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	m1 := newUser(t, db, "Chidi", "chidi@x.ng")
	m2 := newUser(t, db, "Fatima", "fatima@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, testGroupRequest("200L Dues"))
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	addTestMember(t, svc, group, treasurer.ID, m1, models.RoleMember)
	addTestMember(t, svc, group, treasurer.ID, m2, models.RoleMember)

	if _, err := svc.RaiseDispute(ctx, group.ID, m1.ID, RaiseDisputeRequest{Reason: "no receipts"}); err != nil {
		t.Fatalf("RaiseDispute m1: %v", err)
	}
	if _, err := svc.RaiseDispute(ctx, group.ID, m1.ID, RaiseDisputeRequest{}); err == nil {
		t.Fatal("expected a duplicate dispute to be rejected")
	}
	if _, err := svc.RaiseDispute(ctx, group.ID, m2.ID, RaiseDisputeRequest{}); err != nil {
		t.Fatalf("RaiseDispute m2: %v", err)
	}

	if frozen, n, err := svc.spendingFrozen(group.ID); err != nil || !frozen || n != 2 {
		t.Fatalf("expected frozen with 2 disputes, got frozen=%v n=%d err=%v", frozen, n, err)
	}
	if _, err := svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{AmountKobo: 1000, DestinationType: models.ExpenseBank, Recipient: "0123456789", BankName: "GTBank"}); err == nil {
		t.Fatal("expected CreateExpense to be blocked while frozen")
	}

	// Resolving one dispute brings it back under the threshold.
	var d models.Dispute
	if err := db.Where("group_id = ? AND user_id = ?", group.ID, m1.ID).First(&d).Error; err != nil {
		t.Fatalf("load dispute: %v", err)
	}
	if _, err := svc.ResolveDispute(ctx, group.ID, d.ID, treasurer.ID); err != nil {
		t.Fatalf("ResolveDispute: %v", err)
	}
	if frozen, n, _ := svc.spendingFrozen(group.ID); frozen || n != 1 {
		t.Fatalf("expected unfrozen with 1 dispute, got frozen=%v n=%d", frozen, n)
	}
	if _, err := svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{AmountKobo: 1000, DestinationType: models.ExpenseBank, Recipient: "0123456789", BankName: "GTBank"}); err != nil {
		t.Fatalf("expected CreateExpense to succeed after resolving, got %v", err)
	}
}

func TestDisputeOnExpenseBlocksItsPayout(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)

	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	m1 := newUser(t, db, "Chidi", "chidi@x.ng")
	m2 := newUser(t, db, "Fatima", "fatima@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, testGroupRequest("200L Dues"))
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	addTestMember(t, svc, group, treasurer.ID, m1, models.RoleMember)
	addTestMember(t, svc, group, treasurer.ID, m2, models.RoleMember)

	expense, err := svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{AmountKobo: 1000, DestinationType: models.ExpenseBank, Recipient: "0123456789", BankName: "GTBank"})
	if err != nil {
		t.Fatalf("CreateExpense: %v", err)
	}
	// Pretend it cleared approvals.
	if err := db.Model(expense).Update("status", models.ExpenseApproved).Error; err != nil {
		t.Fatalf("approve: %v", err)
	}

	// A single dispute aimed at this payout blocks it, without freezing the pot.
	if _, err := svc.RaiseDispute(ctx, group.ID, m1.ID, RaiseDisputeRequest{Reason: "fake receipt", ExpenseRequestID: &expense.ID}); err != nil {
		t.Fatalf("RaiseDispute: %v", err)
	}
	if frozen, n, _ := svc.spendingFrozen(group.ID); frozen || n != 1 {
		t.Fatalf("expected one dispute and no pot-wide freeze, got frozen=%v n=%d", frozen, n)
	}
	if _, err := svc.Execute(ctx, group.ID, expense.ID, treasurer.ID); err == nil {
		t.Fatal("expected Execute to be blocked while the payout is disputed")
	}

	// A dispute may only target a payout in the same pot.
	other, err := svc.CreateGroup(ctx, treasurer.ID, testGroupRequest("Other"))
	if err != nil {
		t.Fatalf("CreateGroup other: %v", err)
	}
	if _, err := svc.RaiseDispute(ctx, other.ID, treasurer.ID, RaiseDisputeRequest{ExpenseRequestID: &expense.ID}); err == nil {
		t.Fatal("expected a cross-pot dispute target to be rejected")
	}

	// Once resolved, the payout is no longer disputed.
	var d models.Dispute
	if err := db.Where("group_id = ? AND user_id = ?", group.ID, m1.ID).First(&d).Error; err != nil {
		t.Fatalf("load dispute: %v", err)
	}
	if _, err := svc.ResolveDispute(ctx, group.ID, d.ID, m1.ID); err != nil {
		t.Fatalf("ResolveDispute: %v", err)
	}
	if disputed, err := svc.expenseDisputed(expense.ID); err != nil || disputed {
		t.Fatalf("expected payout to be clear after resolving, got disputed=%v err=%v", disputed, err)
	}
}

func TestLeavePotRemovesFromChat(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)

	treasurer := newUser(t, db, "Ada", "ada@x.ng")
	m1 := newUser(t, db, "Chidi", "chidi@x.ng")
	m2 := newUser(t, db, "Fatima", "fatima@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, testGroupRequest("200L Dues"))
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	addTestMember(t, svc, group, treasurer.ID, m1, models.RoleMember)
	addTestMember(t, svc, group, treasurer.ID, m2, models.RoleMember)

	if err := svc.Leave(ctx, group.ID, m2.ID); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	parts, err := svc.ChatParticipants(ctx, group.ID, treasurer.ID)
	if err != nil {
		t.Fatalf("ChatParticipants: %v", err)
	}
	if len(parts) != 2 {
		t.Fatalf("expected 2 participants after leaving, got %d", len(parts))
	}
	// Someone who already left is out of chat, so this is a no-op success.
	if err := svc.RemoveChatMember(ctx, group.ID, treasurer.ID, m2.ID); err != nil {
		t.Fatalf("RemoveChatMember for a left member: %v", err)
	}
}
