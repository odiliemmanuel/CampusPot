package pot

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// ContributionRow is one member's position against the current levy. Amounts
// are only populated (and ShowAmount only true) for the treasurer and for the
// viewer's own row; everyone else sees the state (paid / partial / unpaid).
type ContributionRow struct {
	UserID     uuid.UUID `json:"userId"`
	Name       string    `json:"name"`
	Reference  string    `json:"reference,omitempty"`
	State      string    `json:"state"` // paid | partial | unpaid | none
	PaidKobo   int64     `json:"paidKobo"`
	AmountKobo int64     `json:"amountKobo"`
	ShowAmount bool      `json:"showAmount"`
	IsMe       bool      `json:"isMe"`
}

// ContributionsResponse is the pot's contribution breakdown for the viewer.
type ContributionsResponse struct {
	CollectedKobo  int64             `json:"collectedKobo"`
	ExpectedKobo   int64             `json:"expectedKobo"`
	LevyAmountKobo int64             `json:"levyAmountKobo"`
	ShowAmounts    bool              `json:"showAmounts"`
	Rows           []ContributionRow `json:"rows"`
}

// Contributions returns the pot's contribution breakdown. The treasurer sees
// the figures; other members see who has paid and whether it was full or
// partial, but not the amounts.
func (s *Service) Contributions(_ context.Context, groupID, actorID uuid.UUID) (*ContributionsResponse, error) {
	caller, err := s.requireMember(groupID, actorID)
	if err != nil {
		return nil, err
	}
	treasurer := caller.Role == models.RoleTreasurer

	levy, err := s.resolveLevy(groupID, nil)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		levy = nil
	} else if err != nil {
		return nil, err
	}

	var members []models.Membership
	if err := s.db.Preload("User").
		Where("group_id = ? AND status = ?", groupID, models.MembershipActive).
		Order("created_at ASC").Find(&members).Error; err != nil {
		return nil, err
	}

	resp := &ContributionsResponse{
		Rows:        make([]ContributionRow, 0, len(members)),
		ShowAmounts: treasurer,
	}
	if levy != nil {
		resp.LevyAmountKobo = levy.AmountKobo
		resp.ExpectedKobo = levy.AmountKobo * int64(len(members))
	}

	for _, m := range members {
		var paid int64
		if levy != nil {
			paid, err = paidByUserTx(s.db, groupID, levy.ID, m.UserID)
			if err != nil {
				return nil, err
			}
		}
		resp.CollectedKobo += paid

		row := ContributionRow{
			UserID:    m.UserID,
			Reference: m.Reference,
			State:     "none",
			IsMe:      m.UserID == actorID,
		}
		if m.User != nil {
			row.Name = m.User.Name
		}

		visible := treasurer || row.IsMe
		if levy != nil {
			row.AmountKobo = levy.AmountKobo
			switch {
			case paid <= 0:
				row.State = "unpaid"
			case paid < levy.AmountKobo:
				row.State = "partial"
			default:
				row.State = "paid"
			}
		}
		if visible {
			row.PaidKobo = paid
			row.ShowAmount = true
		} else {
			row.AmountKobo = 0
		}
		resp.Rows = append(resp.Rows, row)
	}
	return resp, nil
}
