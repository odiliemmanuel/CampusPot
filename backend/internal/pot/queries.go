package pot

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// OutstandingMember describes one member's position against a levy.
type OutstandingMember struct {
	UserID          uuid.UUID `json:"userId"`
	Name            string    `json:"name"`
	Reference       string    `json:"reference"`
	PaidKobo        int64     `json:"paidKobo"`
	AmountKobo      int64     `json:"amountKobo"`
	OutstandingKobo int64     `json:"outstandingKobo"`
	State           string    `json:"state"` // paid | partial | unpaid
}

// WhoHasntPaid returns every active member who has not fully paid a levy.
// If levyID is nil the latest open levy is used. Read-only: safe for the AI
// to call.
func (s *Service) WhoHasntPaid(ctx context.Context, groupID uuid.UUID, levyID *uuid.UUID) ([]OutstandingMember, *models.Levy, error) {
	levy, err := s.resolveLevy(groupID, levyID)
	if err != nil {
		return nil, nil, err
	}

	var members []models.Membership
	if err := s.db.Preload("User").
		Where("group_id = ? AND status = ?", groupID, models.MembershipActive).
		Find(&members).Error; err != nil {
		return nil, nil, err
	}

	var out []OutstandingMember
	for _, m := range members {
		paid, err := paidByUserTx(s.db, groupID, levy.ID, m.UserID)
		if err != nil {
			return nil, nil, err
		}
		line := OutstandingMember{
			UserID:          m.UserID,
			Reference:       m.Reference,
			PaidKobo:        paid,
			AmountKobo:      levy.AmountKobo,
			OutstandingKobo: levy.AmountKobo - paid,
		}
		if m.User != nil {
			line.Name = m.User.Name
		}
		switch {
		case paid <= 0:
			line.State = "unpaid"
		case paid < levy.AmountKobo:
			line.State = "partial"
		default:
			line.State = "paid"
		}
		if line.OutstandingKobo > 0 {
			out = append(out, line)
		}
	}
	return out, levy, nil
}

// GroupSummary is the weekly-summary data the AI and dashboard render.
type GroupSummary struct {
	GroupID       uuid.UUID    `json:"groupId"`
	GroupName     string       `json:"groupName"`
	Currency      string       `json:"currency"`
	BalanceKobo   int64        `json:"balanceKobo"`
	CollectedKobo int64        `json:"collectedKobo"`
	SpentKobo     int64        `json:"spentKobo"`
	Levy          *models.Levy `json:"levy,omitempty"`
	Members       int          `json:"members"`
	// ExpectedKobo is the pot's full collection target: the levy amount times
	// the number of joined members. 0 when there is no open levy.
	ExpectedKobo     int64 `json:"expectedKobo"`
	PaidCount        int   `json:"paidCount"`
	PartialCount     int   `json:"partialCount"`
	OutstandingCount int   `json:"outstandingCount"`
	OutstandingKobo  int64 `json:"outstandingKobo"`
	PendingExpenses  int   `json:"pendingExpenses"`
}

// Summary builds the group's weekly-summary numbers.
func (s *Service) Summary(ctx context.Context, groupID uuid.UUID, levyID *uuid.UUID) (*GroupSummary, error) {
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	balance, err := s.Balance(ctx, groupID)
	if err != nil {
		return nil, err
	}
	collected, spent, err := s.collectedSpent(groupID)
	if err != nil {
		return nil, err
	}

	sum := &GroupSummary{
		GroupID:       group.ID,
		GroupName:     group.Name,
		Currency:      group.Currency,
		BalanceKobo:   balance,
		CollectedKobo: collected,
		SpentKobo:     spent,
	}

	var memberCount int64
	_ = s.db.Model(&models.Membership{}).
		Where("group_id = ? AND status = ?", groupID, models.MembershipActive).
		Count(&memberCount).Error
	sum.Members = int(memberCount)

	if outstanding, levy, err := s.WhoHasntPaid(ctx, groupID, levyID); err == nil {
		sum.Levy = levy
		if levy != nil {
			sum.ExpectedKobo = levy.AmountKobo * int64(sum.Members)
		}
		for _, o := range outstanding {
			switch o.State {
			case "partial":
				sum.PartialCount++
			case "unpaid":
				sum.OutstandingCount++
			}
			sum.OutstandingKobo += o.OutstandingKobo
		}
		sum.PaidCount = sum.Members - sum.OutstandingCount - sum.PartialCount
	}

	var pending int64
	_ = s.db.Model(&models.ExpenseRequest{}).
		Where("group_id = ? AND status = ?", groupID, models.ExpensePendingApproval).
		Count(&pending).Error
	sum.PendingExpenses = int(pending)

	return sum, nil
}

func (s *Service) collectedSpent(groupID uuid.UUID) (int64, int64, error) {
	var collected, spent int64
	if err := s.db.Model(&models.LedgerEntry{}).
		Where("group_id = ? AND kind = ?", groupID, models.LedgerCredit).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&collected).Error; err != nil {
		return 0, 0, err
	}
	if err := s.db.Model(&models.LedgerEntry{}).
		Where("group_id = ? AND kind = ?", groupID, models.LedgerDebit).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&spent).Error; err != nil {
		return 0, 0, err
	}
	return collected, spent, nil
}

func (s *Service) resolveLevy(groupID uuid.UUID, levyID *uuid.UUID) (*models.Levy, error) {
	var levy models.Levy
	if levyID != nil {
		if err := s.db.First(&levy, "id = ? AND group_id = ?", *levyID, groupID).Error; err != nil {
			return nil, fmt.Errorf("%w: levy not found", ErrNotFound)
		}
		return &levy, nil
	}
	err := s.db.Where("group_id = ? AND status = ?", groupID, "open").
		Order("created_at DESC").First(&levy).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("%w: no open levy for this group", ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	return &levy, nil
}

// FormatMoney is a small convenience used by AI narration.
func FormatMoney(kobo int64) string { return money.Kobo(kobo).Format() }
