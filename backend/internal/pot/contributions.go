package pot

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// ContributionRow is one member's position against the current levy. Every
// member sees the full breakdown — the per-person amount, what each person has
// paid, and who is still owing — so the pot is transparent to everyone.
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

// Contributions returns the pot's contribution breakdown for every member: the
// amount each person is asked to contribute, what they have paid towards it,
// and who is still owing.
func (s *Service) Contributions(_ context.Context, groupID, actorID uuid.UUID) (*ContributionsResponse, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}

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
		ShowAmounts: true,
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
		row.PaidKobo = paid
		row.ShowAmount = true
		resp.Rows = append(resp.Rows, row)
	}
	return resp, nil
}
