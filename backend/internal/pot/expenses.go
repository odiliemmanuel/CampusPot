package pot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// RiskAssessment is the structured output of the rule-based spend check.
type RiskAssessment struct {
	Level   string   `json:"level"`
	Reasons []string `json:"reasons"`
}

// assessRisk scores a proposed spend. It is deterministic and explainable —
// the LLM only narrates the reasons, it never decides them.
func (s *Service) assessRisk(group *models.Group, amountKobo, balanceKobo int64, destination string) RiskAssessment {
	ra := RiskAssessment{Level: models.RiskLow}

	if amountKobo > balanceKobo {
		ra.Level = models.RiskHigh
		ra.Reasons = append(ra.Reasons, fmt.Sprintf(
			"Requested %s is more than the available pot balance of %s.",
			money.Kobo(amountKobo).Format(), money.Kobo(balanceKobo).Format()))
	}
	if balanceKobo > 0 && amountKobo*2 > balanceKobo {
		if ra.Level == models.RiskLow {
			ra.Level = models.RiskMedium
		}
		ra.Reasons = append(ra.Reasons, "This is more than half of the pot balance.")
	}
	if group.LargeExpenseKobo > 0 && amountKobo > group.LargeExpenseKobo {
		ra.Level = models.RiskHigh
		ra.Reasons = append(ra.Reasons, fmt.Sprintf(
			"Above the group's large-expense threshold of %s.",
			money.Kobo(group.LargeExpenseKobo).Format()))
	}
	if strings.TrimSpace(destination) == "" {
		if ra.Level == models.RiskLow {
			ra.Level = models.RiskMedium
		}
		ra.Reasons = append(ra.Reasons, "No payout destination was recorded.")
	}
	return ra
}

// CreateExpenseRequest proposes a withdrawal from the pot. A payout targets
// either a PotKeeper account (member/user, identified by Recipient as a user
// id or email/phone) or an external bank account (Recipient as the account
// number, with BankName/AccountName).
type CreateExpenseRequest struct {
	AmountKobo      int64  `json:"amountKobo" binding:"required,gt=0"`
	DestinationType string `json:"destinationType"` // member | user | bank
	Recipient       string `json:"recipient"`
	BankName        string `json:"bankName"`
	AccountName     string `json:"accountName"`
	Category        string `json:"category"`
	Note            string `json:"note"`
	// Destination is an optional free-text target, kept for backwards compat.
	Destination string `json:"destination"`
}

// payoutTarget is the resolved destination of a payout.
type payoutTarget struct {
	destType   string
	dest       string
	user       *models.User
	bankName   string
	accountNo  string
	accountNam string
}

// resolvePayout turns a create request into a concrete payout target. A
// member/user payout must resolve to a real PotKeeper account; a bank payout
// only needs an account number.
func (s *Service) resolvePayout(groupID uuid.UUID, req CreateExpenseRequest) (*payoutTarget, error) {
	destType := strings.TrimSpace(req.DestinationType)
	recipient := strings.TrimSpace(req.Recipient)

	if destType == "" {
		// Backwards compatible: a named bank is a bank payout, a recipient is a
		// PotKeeper user, and a bare free-text destination is treated as an
		// external bank account.
		if strings.TrimSpace(req.BankName) != "" {
			destType = models.ExpenseBank
		} else if recipient != "" {
			destType = models.ExpenseUser
		} else if legacy := strings.TrimSpace(req.Destination); legacy != "" {
			destType = models.ExpenseBank
			recipient = legacy
		} else {
			return nil, fmt.Errorf("%w: a payout destination is required", ErrInvalid)
		}
	}

	t := &payoutTarget{
		destType:   destType,
		bankName:   strings.TrimSpace(req.BankName),
		accountNo:  recipient,
		accountNam: strings.TrimSpace(req.AccountName),
	}

	switch destType {
	case models.ExpenseBank:
		if recipient == "" {
			return nil, fmt.Errorf("%w: an account number is required", ErrInvalid)
		}
		parts := []string{}
		if t.bankName != "" {
			parts = append(parts, t.bankName)
		}
		parts = append(parts, recipient)
		if t.accountNam != "" {
			parts = append(parts, t.accountNam)
		}
		t.dest = "Bank: " + strings.Join(parts, " · ")

	case models.ExpenseMember:
		uid, err := uuid.Parse(recipient)
		if err != nil {
			return nil, fmt.Errorf("%w: choose a pot member to pay", ErrInvalid)
		}
		var m models.Membership
		if err := s.db.Preload("User").
			Where("group_id = ? AND user_id = ? AND status = ?", groupID, uid, models.MembershipActive).
			First(&m).Error; err != nil {
			return nil, fmt.Errorf("%w: that person is not an active member of this pot", ErrNotFound)
		}
		t.user = m.User
		if m.User != nil {
			t.dest = fmt.Sprintf("Member: %s (%s)", m.User.Name, m.Reference)
		} else {
			t.dest = "Member: " + recipient
		}
	case models.ExpenseUser:
		if recipient == "" {
			return nil, fmt.Errorf("%w: a recipient is required", ErrInvalid)
		}
		var user models.User
		err := s.db.Where("LOWER(email) = ?", strings.ToLower(recipient)).
			Or("phone = ?", recipient).First(&user).Error
		if err != nil {
			return nil, fmt.Errorf("%w: no PotKeeper user matches that email or phone", ErrNotFound)
		}
		t.user = &user
		t.dest = fmt.Sprintf("PotKeeper: %s (%s)", user.Name, recipient)
	default:
		return nil, fmt.Errorf("%w: unknown payout destination", ErrInvalid)
	}
	return t, nil
}

// CreateExpense records a spend request, risk-checks it, and parks it in
// pending_approval. Treasurer only. Requesting does NOT move money.
func (s *Service) CreateExpense(ctx context.Context, groupID, actorID uuid.UUID, req CreateExpenseRequest) (*models.ExpenseRequest, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	if frozen, n, err := s.spendingFrozen(groupID); err != nil {
		return nil, err
	} else if frozen {
		return nil, fmt.Errorf("%w: spending is frozen by %d member disputes", ErrConflict, n)
	}
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	t, err := s.resolvePayout(groupID, req)
	if err != nil {
		return nil, err
	}
	balance, err := s.Balance(ctx, groupID)
	if err != nil {
		return nil, err
	}

	ra := s.assessRisk(&group, req.AmountKobo, balance, t.dest)
	reasonsJSON, _ := json.Marshal(ra.Reasons)
	var activeMembers int64
	if err := s.db.Model(&models.Membership{}).
		Where("group_id = ? AND status = ?", groupID, models.MembershipActive).
		Count(&activeMembers).Error; err != nil {
		return nil, err
	}
	status := models.ExpensePendingApproval
	var approvedAt *time.Time
	if activeMembers == 1 {
		status = models.ExpenseApproved
		now := s.now()
		approvedAt = &now
	}

	expense := &models.ExpenseRequest{
		GroupID:         groupID,
		RequestedBy:     actorID,
		AmountKobo:      req.AmountKobo,
		Destination:     t.dest,
		DestinationType: t.destType,
		BankName:        t.bankName,
		AccountNumber:   t.accountNo,
		AccountName:     t.accountNam,
		Category:        req.Category,
		Note:            req.Note,
		Status:          status,
		ApprovedAt:      approvedAt,
		RiskLevel:       ra.Level,
		RiskReasons:     string(reasonsJSON),
	}
	if t.user != nil {
		uid := t.user.ID
		expense.RecipientUserID = &uid
	}
	if err := s.db.Create(expense).Error; err != nil {
		return nil, err
	}
	return expense, nil
}

// DecisionRequest is one co-signer's approval or rejection.
type DecisionRequest struct {
	Decision string `json:"decision" binding:"required,oneof=approve reject"`
	Comment  string `json:"comment"`
}

// Approve records an executive's decision and moves the expense forward when
// the threshold is met. A member may not approve their own request.
func (s *Service) Approve(_ context.Context, groupID, expenseID, actorID uuid.UUID, req DecisionRequest) (*models.ExpenseRequest, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer, models.RoleCosigner); err != nil {
		return nil, err
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	var expense models.ExpenseRequest
	if err := s.db.First(&expense, "id = ? AND group_id = ?", expenseID, groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	if expense.Status != models.ExpensePendingApproval {
		return nil, fmt.Errorf("%w: expense is %s, not awaiting approval", ErrConflict, expense.Status)
	}
	if expense.RequestedBy == actorID {
		return nil, fmt.Errorf("%w: you cannot approve your own request", ErrForbidden)
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		approval := &models.Approval{
			ExpenseRequestID: expenseID,
			ApproverUserID:   actorID,
			Decision:         req.Decision,
			Comment:          req.Comment,
		}
		if err := tx.Create(approval).Error; err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("%w: you already voted on this request", ErrConflict)
			}
			return err
		}

		var approvals, rejections int64
		tx.Model(&models.Approval{}).
			Where("expense_request_id = ? AND decision = ?", expenseID, models.DecisionApprove).
			Count(&approvals)
		tx.Model(&models.Approval{}).
			Where("expense_request_id = ? AND decision = ?", expenseID, models.DecisionReject).
			Count(&rejections)

		// A reject can only win if too many approvals became impossible.
		if rejections >= int64(group.ApprovalTotal-group.ApprovalThreshold+1) {
			return tx.Model(&expense).Update("status", models.ExpenseRejected).Error
		}
		if approvals >= int64(group.ApprovalThreshold) {
			now := s.now()
			return tx.Model(&expense).Updates(map[string]interface{}{
				"status":      models.ExpenseApproved,
				"approved_at": &now,
			}).Error
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err := s.db.First(&expense, "id = ?", expenseID).Error; err != nil {
		return nil, err
	}
	return &expense, nil
}

// Execute runs an approved withdrawal through B Moni. Treasurer only. The
// ledger is debited only once the payout reports COMPLETED.
func (s *Service) Execute(ctx context.Context, groupID, expenseID, actorID uuid.UUID) (*models.ExpenseRequest, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	if frozen, n, err := s.spendingFrozen(groupID); err != nil {
		return nil, err
	} else if frozen {
		return nil, fmt.Errorf("%w: spending is frozen by %d member disputes", ErrConflict, n)
	}
	var expense models.ExpenseRequest
	if err := s.db.First(&expense, "id = ? AND group_id = ?", expenseID, groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	if disputed, err := s.expenseDisputed(expenseID); err != nil {
		return nil, err
	} else if disputed {
		return nil, fmt.Errorf("%w: this payout is disputed by a member", ErrConflict)
	}
	if expense.Status != models.ExpenseApproved {
		return nil, fmt.Errorf("%w: expense must be approved before execution (is %s)", ErrConflict, expense.Status)
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}

	balance, err := s.Balance(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if expense.AmountKobo > balance {
		return nil, fmt.Errorf("%w: the pot balance is too low for this payout", ErrConflict)
	}

	// A payout to another PotKeeper account is the same movement as a wallet
	// transfer: credit the recipient's wallet and debit the pot ledger. No bank
	// rail is involved.
	if expense.RecipientUserID != nil {
		return s.executeWalletPayout(groupID, actorID, &expense, *expense.RecipientUserID)
	}

	bankRef := firstNonEmpty(strings.TrimSpace(expense.AccountNumber), expense.Destination)
	proposal, err := s.bmoni.CreateNigeriaOfframp(ctx, bmoni.OfframpRequest{
		BMoniUserID:   group.BMoniUserID,
		WalletID:      group.BMoniWalletID,
		BankAccountID: bankRef,
		FromAmount:    money.Kobo(expense.AmountKobo).String(),
	})
	if err != nil {
		_ = s.db.Model(&expense).Update("status", models.ExpenseFailed).Error
		return nil, fmt.Errorf("pot: offramp failed: %w", err)
	}

	status := proposal.Status
	if status != "COMPLETED" {
		if p, err := s.bmoni.GetProposal(ctx, group.BMoniUserID, proposal.ID); err == nil {
			status = p.Status
		}
	}

	if status != "COMPLETED" {
		// Payout is in flight (e.g. still awaiting signatures).
		if err := s.db.Model(&expense).Updates(map[string]interface{}{
			"status":      models.ExpenseExecuting,
			"proposal_id": proposal.ID,
		}).Error; err != nil {
			return nil, err
		}
		return &expense, nil
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		entry := &models.LedgerEntry{
			GroupID:     groupID,
			Kind:        models.LedgerDebit,
			AmountKobo:  expense.AmountKobo,
			Description: "Withdrawal: " + firstNonEmpty(expense.Category, expense.Note, "approved spend"),
			RefType:     "expense",
			RefID:       expense.ID.String(),
			ActorUserID: &actorID,
		}
		if err := s.appendLedger(tx, entry); err != nil {
			return err
		}
		now := s.now()
		return tx.Model(&expense).Updates(map[string]interface{}{
			"status":      models.ExpenseCompleted,
			"proposal_id": proposal.ID,
			"executed_at": &now,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	if err := s.db.First(&expense, "id = ?", expenseID).Error; err != nil {
		return nil, err
	}
	return &expense, nil
}

// executeWalletPayout credits a PotKeeper account (a pot member or any other
// user) straight into their wallet and debits the pot, mirroring a wallet
// transfer. The caller must have verified approval, disputes and balance.
func (s *Service) executeWalletPayout(groupID, actorID uuid.UUID, expense *models.ExpenseRequest, recipientID uuid.UUID) (*models.ExpenseRequest, error) {
	var recipient models.User
	if err := s.db.First(&recipient, "id = ?", recipientID).Error; err != nil {
		return nil, fmt.Errorf("%w: the payout recipient no longer exists", ErrNotFound)
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := creditWallet(tx, recipient.ID, expense.AmountKobo); err != nil {
			return err
		}
		if err := tx.Create(&models.WalletTransaction{
			UserID:       recipient.ID,
			Kind:         models.WalletTransferIn,
			AmountKobo:   expense.AmountKobo,
			Counterparty: "Pot payout",
			Note:         firstNonEmpty(expense.Category, expense.Note),
		}).Error; err != nil {
			return err
		}
		entry := &models.LedgerEntry{
			GroupID:     groupID,
			Kind:        models.LedgerDebit,
			AmountKobo:  expense.AmountKobo,
			Description: "Payout: " + firstNonEmpty(expense.Category, expense.Note, "approved payout"),
			RefType:     "expense",
			RefID:       expense.ID.String(),
			ActorUserID: &actorID,
		}
		if err := s.appendLedger(tx, entry); err != nil {
			return err
		}
		now := s.now()
		return tx.Model(expense).Updates(map[string]interface{}{
			"status":      models.ExpenseCompleted,
			"executed_at": &now,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	if err := s.db.First(expense, "id = ?", expense.ID).Error; err != nil {
		return nil, err
	}
	return expense, nil
}

// ApplyWithdrawalEvent reconciles a withdrawal after B Moni reports a new state
// via webhook. It matches the expense by the stored proposal id and is
// idempotent: completing an already-completed expense, or failing one that
// already failed, is a no-op. status is one of "completed", "failed", or
// "processing".
//
// UNVERIFIED: B Moni does not publish the withdrawal webhook payload shape, so
// the caller tolerates missing proposal ids by acking the event.
func (s *Service) ApplyWithdrawalEvent(_ context.Context, proposalID, status string) error {
	var expense models.ExpenseRequest
	if err := s.db.Where("proposal_id = ?", proposalID).First(&expense).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("pot: withdrawal event for unknown proposal %s (status %s)", proposalID, status)
			return nil
		}
		return err
	}

	switch status {
	case "completed":
		if expense.Status == models.ExpenseCompleted {
			return nil
		}
		return s.db.Transaction(func(tx *gorm.DB) error {
			entry := &models.LedgerEntry{
				GroupID:     expense.GroupID,
				Kind:        models.LedgerDebit,
				AmountKobo:  expense.AmountKobo,
				Description: "Withdrawal: " + firstNonEmpty(expense.Category, expense.Note, "approved spend"),
				RefType:     "expense",
				RefID:       expense.ID.String(),
			}
			if err := s.appendLedger(tx, entry); err != nil {
				return err
			}
			now := s.now()
			return tx.Model(&expense).Updates(map[string]interface{}{
				"status":      models.ExpenseCompleted,
				"executed_at": &now,
			}).Error
		})
	case "failed":
		if expense.Status == models.ExpenseFailed || expense.Status == models.ExpenseCompleted {
			return nil
		}
		return s.db.Model(&expense).Update("status", models.ExpenseFailed).Error
	default: // processing / in-flight
		if expense.Status == models.ExpenseExecuting {
			return nil
		}
		return s.db.Model(&expense).Update("status", models.ExpenseExecuting).Error
	}
}

// ListExpenses returns all spend requests for a group.
func (s *Service) ListExpenses(_ context.Context, groupID, actorID uuid.UUID) ([]models.ExpenseRequest, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var expenses []models.ExpenseRequest
	err := s.db.Where("group_id = ?", groupID).Order("created_at DESC").Find(&expenses).Error
	return expenses, err
}

// ListApprovals returns all decisions for one expense.
func (s *Service) ListApprovals(_ context.Context, groupID, expenseID, actorID uuid.UUID) ([]models.Approval, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var approvals []models.Approval
	err := s.db.Where("expense_request_id = ?", expenseID).Order("created_at ASC").Find(&approvals).Error
	return approvals, err
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
