package pot

// Public pots are discoverable: anyone signed in can browse them by name or
// category and join directly — no invite code needed. Private pots (the
// default) stay reachable only by join code, exactly as before.
//
// A pot may also carry a savings goal (TargetKobo). Goal progress is shown to
// members and discoverers alike: it is the pot's balance against its target,
// never the identities of who paid.

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// DiscoverablePot is one public pot as a stranger sees it.
type DiscoverablePot struct {
	ID                   uuid.UUID  `json:"id"`
	Name                 string     `json:"name"`
	Description          string     `json:"description,omitempty"`
	Category             string     `json:"category,omitempty"`
	Currency             string     `json:"currency"`
	PotType              string     `json:"potType"`
	ContributionAmountKobo int64    `json:"contributionAmountKobo"`
	TargetKobo           int64      `json:"targetKobo"`
	BalanceKobo          int64      `json:"balanceKobo"`
	Members              int        `json:"members"`
	Open                 bool       `json:"open"` // still below its member goal, if it set one
	Joined               bool       `json:"joined"`
	CreatedAt            string     `json:"createdAt"`
}

// DiscoverPots lists public pots, newest first, optionally filtered by a text
// query and a category. A pot never appears twice, and a caller's own pots
// are flagged with Joined so the UI can say "open" instead of "join".
func (s *Service) DiscoverPots(_ context.Context, userID uuid.UUID, query, category string) ([]DiscoverablePot, error) {
	q := s.db.Model(&models.Group{}).Where("visibility = ?", models.VisibilityPublic)
	if c := strings.TrimSpace(category); c != "" {
		q = q.Where("LOWER(category) = ?", strings.ToLower(c))
	}
	if term := strings.TrimSpace(query); term != "" {
		like := "%" + strings.ToLower(term) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ? OR LOWER(COALESCE(category,'')) LIKE ?",
			like, like, like)
	}
	var groups []models.Group
	if err := q.Order("created_at DESC").Limit(50).Find(&groups).Error; err != nil {
		return nil, err
	}

	// Which of these has the caller already joined?
	joinedIDs := map[uuid.UUID]bool{}
	if len(groups) > 0 {
		var mine []models.Membership
		if err := s.db.Where("user_id = ? AND status = ?", userID, models.MembershipActive).
			Find(&mine).Error; err != nil {
			return nil, err
		}
		for _, m := range mine {
			joinedIDs[m.GroupID] = true
		}
	}

	out := make([]DiscoverablePot, 0, len(groups))
	for _, g := range groups {
		var members int64
		_ = s.db.Model(&models.Membership{}).
			Where("group_id = ? AND status = ?", g.ID, models.MembershipActive).
			Count(&members).Error
		bal, _ := s.Balance(context.Background(), g.ID)
		d := DiscoverablePot{
			ID: g.ID, Name: g.Name, Description: g.Description, Category: g.Category,
			Currency: g.Currency, PotType: g.PotType,
			ContributionAmountKobo: g.ContributionAmountKobo,
			TargetKobo:             g.TargetKobo,
			BalanceKobo:            bal,
			Members:                int(members),
			Joined:                 joinedIDs[g.ID],
			CreatedAt:              g.CreatedAt.Format("2006-01-02"),
		}
		if g.TargetKobo > 0 {
			d.Open = bal < g.TargetKobo
		}
		out = append(out, d)
	}
	return out, nil
}

// JoinPublicPot joins a public pot directly, without a join code. Private
// pots (or unknown ids) are indistinguishable from one another to a caller —
// both refuse — so this endpoint cannot be used to probe private pots.
func (s *Service) JoinPublicPot(_ context.Context, userID uuid.UUID, groupID uuid.UUID) (*models.Group, error) {
	var group models.Group
	if err := s.db.First(&group, "id = ? AND visibility = ?", groupID, models.VisibilityPublic).Error; err != nil {
		return nil, fmt.Errorf("%w: no public pot with that id", ErrNotFound)
	}

	var m models.Membership
	err := s.db.Where("group_id = ? AND user_id = ?", group.ID, userID).First(&m).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if m.Status == models.MembershipActive {
		// Already in it — idempotent, the UI simply shows "open".
		return &group, nil
	}
	if m.ID == uuid.Nil {
		m = models.Membership{
			GroupID:   group.ID,
			UserID:    userID,
			Role:      models.RoleMember,
			Reference: memberReference(group.JoinCode, userID),
		}
	}
	m.Status = models.MembershipActive
	m.JoinedAt = timeNowPtr()
	if err := s.db.Save(&m).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

// GoalProgress renders a pot's savings-goal position, or reports that it has
// no fixed goal.
func (s *Service) GoalProgress(_ context.Context, groupID uuid.UUID) (targetKobo, balanceKobo int64, percent int, err error) {
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return 0, 0, 0, ErrNotFound
	}
	bal, err := s.Balance(context.Background(), groupID)
	if err != nil {
		return 0, 0, 0, err
	}
	if group.TargetKobo <= 0 {
		return 0, bal, 0, nil
	}
	percent = int(float64(bal) / float64(group.TargetKobo) * 100)
	if percent > 100 {
		percent = 100
	}
	return group.TargetKobo, bal, percent, nil
}

// potGoalText is used by notification/summary copy.
func potGoalText(group *models.Group, balanceKobo int64) string {
	if group.TargetKobo <= 0 {
		return ""
	}
	return fmt.Sprintf(" (%s of %s saved)",
		money.Kobo(balanceKobo).Format(), money.Kobo(group.TargetKobo).Format())
}
