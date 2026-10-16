package pot

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// PotMembership is one pot a user belongs to, shaped for their personal
// overview: when they joined, what the current levy asks for, what they've
// paid, and what they still owe.
type PotMembership struct {
	GroupID         uuid.UUID   `json:"groupId"`
	GroupName       string      `json:"groupName"`
	Currency        string      `json:"currency"`
	Role            models.Role `json:"role"`
	JoinedAt        *time.Time  `json:"joinedAt,omitempty"`
	Reference       string      `json:"reference"`
	BalanceKobo     int64       `json:"balanceKobo"`
	LevyTitle       string      `json:"levyTitle,omitempty"`
	LevyAmountKobo  int64       `json:"levyAmountKobo"`
	PaidKobo        int64       `json:"paidKobo"`
	OutstandingKobo int64       `json:"outstandingKobo"`
	State           string      `json:"state"` // paid | partial | unpaid | none
}

// MyTransaction is one of the user's own deposits across every pot.
type MyTransaction struct {
	ID         uuid.UUID `json:"id"`
	GroupID    uuid.UUID `json:"groupId"`
	GroupName  string    `json:"groupName"`
	AmountKobo int64     `json:"amountKobo"`
	Status     string    `json:"status"`
	PayerName  string    `json:"payerName,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

// AccountOverview is everything the "Balance & History" screen needs: a
// per-pot summary (across all of the user's pots) plus their own transactions.
type AccountOverview struct {
	TotalContributedKobo int64           `json:"totalContributedKobo"`
	TotalOutstandingKobo int64           `json:"totalOutstandingKobo"`
	Pots                 []PotMembership `json:"pots"`
	Transactions         []MyTransaction `json:"transactions"`
}

// AccountOverview builds a user's cross-pot summary and transaction history.
// It is read-only and scoped to the caller's own memberships.
func (s *Service) AccountOverview(ctx context.Context, userID uuid.UUID) (*AccountOverview, error) {
	var memberships []models.Membership
	if err := s.db.
		Where("user_id = ? AND status = ?", userID, models.MembershipActive).
		Find(&memberships).Error; err != nil {
		return nil, err
	}

	ov := &AccountOverview{Pots: []PotMembership{}, Transactions: []MyTransaction{}}

	for _, m := range memberships {
		var group models.Group
		if err := s.db.First(&group, "id = ?", m.GroupID).Error; err != nil {
			continue
		}
		pot := PotMembership{
			GroupID:   group.ID,
			GroupName: group.Name,
			Currency:  group.Currency,
			Role:      m.Role,
			JoinedAt:  m.JoinedAt,
			Reference: m.Reference,
		}
		if bal, err := s.Balance(ctx, group.ID); err == nil {
			pot.BalanceKobo = bal
		}

		// Position against the pot's latest open levy, if any.
		var levy models.Levy
		err := s.db.Where("group_id = ? AND status = ?", group.ID, "open").
			Order("created_at DESC").First(&levy).Error
		if err == nil {
			paid, perr := paidByUserTx(s.db, group.ID, levy.ID, userID)
			if perr != nil {
				return nil, perr
			}
			pot.LevyTitle = levy.Title
			pot.LevyAmountKobo = levy.AmountKobo
			pot.PaidKobo = paid
			if levy.AmountKobo-paid > 0 {
				pot.OutstandingKobo = levy.AmountKobo - paid
			}
			switch {
			case paid <= 0:
				pot.State = "unpaid"
			case paid < levy.AmountKobo:
				pot.State = "partial"
			default:
				pot.State = "paid"
			}
		} else {
			// No open levy: report their lifetime contributions to this pot.
			paid, perr := paidByUserAllTx(s.db, group.ID, userID)
			if perr != nil {
				return nil, perr
			}
			pot.PaidKobo = paid
			pot.State = "none"
		}

		ov.Pots = append(ov.Pots, pot)
		ov.TotalContributedKobo += pot.PaidKobo
		ov.TotalOutstandingKobo += pot.OutstandingKobo
	}

	// The user's own deposits across every pot, newest first.
	type txRow struct {
		ID         uuid.UUID
		GroupID    uuid.UUID
		AmountKobo int64
		Status     string
		PayerName  string
		CreatedAt  time.Time
		GroupName  string
	}
	var rows []txRow
	if err := s.db.Model(&models.Payment{}).
		Select("payments.id, payments.group_id, payments.amount_kobo, payments.status, payments.payer_name, payments.created_at, groups.name AS group_name").
		Joins("JOIN groups ON groups.id = payments.group_id").
		Where("payments.user_id = ?", userID).
		Order("payments.created_at DESC").
		Limit(200).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		ov.Transactions = append(ov.Transactions, MyTransaction{
			ID:         r.ID,
			GroupID:    r.GroupID,
			GroupName:  r.GroupName,
			AmountKobo: r.AmountKobo,
			Status:     r.Status,
			PayerName:  r.PayerName,
			CreatedAt:  r.CreatedAt,
		})
	}

	return ov, nil
}

// paidByUserAllTx sums a member's matched/partial payments across every levy in
// a pot. Used when the pot has no open levy to measure against.
func paidByUserAllTx(tx *gorm.DB, groupID, userID uuid.UUID) (int64, error) {
	var total int64
	err := tx.Model(&models.Payment{}).
		Where("group_id = ? AND user_id = ? AND status IN ?",
			groupID, userID, []string{models.PaymentMatched, models.PaymentPartial}).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&total).Error
	return total, err
}
