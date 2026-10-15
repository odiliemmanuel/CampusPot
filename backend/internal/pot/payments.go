package pot

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// DepositEvent is a normalised incoming deposit, produced by the webhook layer
// from a B Moni employee.deposit.completed event.
type DepositEvent struct {
	GroupID         uuid.UUID
	LevyID          *uuid.UUID
	AmountKobo      int64
	QuotedReference string
	PayerName       string
	PayerAccount    string
	ProviderEventID string
}

// ReconcileDeposit matches an incoming deposit to a member and levy, credits
// the ledger, and records the payment — all in one transaction. It is
// idempotent: a repeated ProviderEventID returns the original payment.
func (s *Service) ReconcileDeposit(ctx context.Context, ev DepositEvent) (*models.Payment, error) {
	if ev.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: deposit amount must be positive", ErrInvalid)
	}

	var result models.Payment
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return s.reconcileTx(tx, &ev, &result)
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) reconcileTx(tx *gorm.DB, ev *DepositEvent, out *models.Payment) error {
	// Idempotency: if we have already processed this provider event, return it.
	if ev.ProviderEventID != "" {
		var existing models.Payment
		err := tx.Where("provider_event_id = ?", ev.ProviderEventID).First(&existing).Error
		if err == nil {
			*out = existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	// 1. Identify the member.
	var userID *uuid.UUID
	matchedBy := ""
	if ev.QuotedReference != "" {
		var m models.Membership
		err := tx.Where("group_id = ? AND UPPER(reference) = ?", ev.GroupID, strings.ToUpper(ev.QuotedReference)).First(&m).Error
		if err == nil {
			uid := m.UserID
			userID = &uid
			matchedBy = "reference"
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}
	if userID == nil && ev.PayerName != "" {
		var m models.Membership
		err := tx.
			Joins("JOIN users u ON u.id = memberships.user_id").
			Where("memberships.group_id = ? AND LOWER(u.name) = ?", ev.GroupID, strings.ToLower(strings.TrimSpace(ev.PayerName))).
			First(&m).Error
		if err == nil {
			uid := m.UserID
			userID = &uid
			matchedBy = "payer_name"
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	// 2. Choose the levy (explicit, else the latest open one).
	levyID := ev.LevyID
	if levyID == nil {
		var levy models.Levy
		err := tx.Where("group_id = ? AND status = ?", ev.GroupID, "open").
			Order("created_at DESC").First(&levy).Error
		if err == nil {
			lid := levy.ID
			levyID = &lid
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	// 3. Decide matched vs partial vs unmatched.
	status := models.PaymentUnmatched
	if userID != nil && levyID != nil {
		var levy models.Levy
		if err := tx.First(&levy, "id = ?", *levyID).Error; err != nil {
			return err
		}
		paid, err := paidByUserTx(tx, ev.GroupID, *levyID, *userID)
		if err != nil {
			return err
		}
		if paid+ev.AmountKobo >= levy.AmountKobo {
			status = models.PaymentMatched
		} else {
			status = models.PaymentPartial
		}
	}

	payment := models.Payment{
		GroupID:         ev.GroupID,
		LevyID:          levyID,
		UserID:          userID,
		PayerName:       ev.PayerName,
		PayerAccount:    ev.PayerAccount,
		AmountKobo:      ev.AmountKobo,
		Status:          status,
		ProviderEventID: ev.ProviderEventID,
		QuotedReference: ev.QuotedReference,
		MatchedBy:       matchedBy,
	}
	if payment.ProviderEventID == "" {
		payment.ProviderEventID = "manual_" + uuid.NewString()
	}

	desc := "Deposit received"
	if ev.PayerName != "" {
		desc = "Deposit from " + ev.PayerName
	}
	entry := &models.LedgerEntry{
		GroupID:     ev.GroupID,
		Kind:        models.LedgerCredit,
		AmountKobo:  ev.AmountKobo,
		Description: desc,
		RefType:     "payment",
	}
	if err := s.appendLedger(tx, entry); err != nil {
		return err
	}
	payment.LedgerEntryID = &entry.ID

	if err := tx.Create(&payment).Error; err != nil {
		if isUniqueViolation(err) {
			return tx.Where("provider_event_id = ?", payment.ProviderEventID).First(out).Error
		}
		return err
	}
	*out = payment
	return nil
}

// paidByUserTx sums a member's matched/partial payments toward one levy.
func paidByUserTx(tx *gorm.DB, groupID, levyID, userID uuid.UUID) (int64, error) {
	var total int64
	err := tx.Model(&models.Payment{}).
		Where("group_id = ? AND levy_id = ? AND user_id = ? AND status IN ?",
			groupID, levyID, userID, []string{models.PaymentMatched, models.PaymentPartial}).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&total).Error
	return total, err
}

// RecordManualPaymentRequest lets a treasurer log a cash payment by hand.
type RecordManualPaymentRequest struct {
	UserID     uuid.UUID  `json:"userId" binding:"required"`
	LevyID     *uuid.UUID `json:"levyId"`
	AmountKobo int64      `json:"amountKobo" binding:"required,gt=0"`
	Note       string     `json:"note"`
}

// RecordManualPayment logs a treasurer-recorded payment (e.g. cash) and
// credits the ledger. Treasurer only.
func (s *Service) RecordManualPayment(ctx context.Context, groupID, actorID uuid.UUID, req RecordManualPaymentRequest) (*models.Payment, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	levyID := req.LevyID
	if levyID == nil {
		var levy models.Levy
		if err := s.db.Where("group_id = ? AND status = ?", groupID, "open").Order("created_at DESC").First(&levy).Error; err == nil {
			lid := levy.ID
			levyID = &lid
		}
	}
	return s.ReconcileDeposit(ctx, DepositEvent{
		GroupID:         groupID,
		LevyID:          levyID,
		AmountKobo:      req.AmountKobo,
		PayerName:       req.Note,
		ProviderEventID: "", // generate a manual id
	})
}

// ListPayments returns a group's payments, newest first.
func (s *Service) ListPayments(_ context.Context, groupID, actorID uuid.UUID) ([]models.Payment, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var payments []models.Payment
	err := s.db.Where("group_id = ?", groupID).Order("created_at DESC").Find(&payments).Error
	return payments, err
}

// ListLedger returns the public ledger for a group.
func (s *Service) ListLedger(_ context.Context, groupID, actorID uuid.UUID) ([]models.LedgerEntry, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var entries []models.LedgerEntry
	err := s.db.Where("group_id = ?", groupID).Order("created_at ASC").Find(&entries).Error
	return entries, err
}
