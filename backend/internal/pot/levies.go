package pot

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// FlexTime accepts either a full RFC3339 timestamp ("2026-10-16T00:00:00Z") or
// a bare calendar date ("2026-10-16"). Browsers send the latter from
// <input type="date">, which encoding/json cannot decode straight into a
// time.Time.
type FlexTime time.Time

// UnmarshalJSON decodes a date string in either accepted layout.
func (t *FlexTime) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), ` "`)
	if s == "" || s == "null" {
		return nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339} {
		if parsed, err := time.Parse(layout, s); err == nil {
			*t = FlexTime(parsed)
			return nil
		}
	}
	return fmt.Errorf("invalid date %q: want YYYY-MM-DD or RFC3339", s)
}

// Time returns the value as a standard time.Time.
func (t *FlexTime) Time() time.Time { return time.Time(*t) }

// CreateLevyRequest sets up a collection (dues, excursion, project budget).
type CreateLevyRequest struct {
	Title      string    `json:"title" binding:"required,min=2"`
	AmountKobo int64     `json:"amountKobo" binding:"required,gt=0"`
	DueDate    *FlexTime `json:"dueDate"`
}

// CreateLevy creates a levy on a group. Treasurer only.
func (s *Service) CreateLevy(_ context.Context, groupID, actorID uuid.UUID, req CreateLevyRequest) (*models.Levy, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	var due *time.Time
	if req.DueDate != nil && !req.DueDate.Time().IsZero() {
		d := req.DueDate.Time()
		due = &d
	}
	levy := &models.Levy{
		GroupID:    groupID,
		Title:      req.Title,
		AmountKobo: req.AmountKobo,
		DueDate:    due,
		Status:     "open",
		CreatedBy:  actorID,
	}
	if err := s.db.Create(levy).Error; err != nil {
		return nil, err
	}
	return levy, nil
}

// ListLevies returns all levies for a group.
func (s *Service) ListLevies(_ context.Context, groupID, actorID uuid.UUID) ([]models.Levy, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var levies []models.Levy
	err := s.db.Where("group_id = ?", groupID).Order("created_at DESC").Find(&levies).Error
	return levies, err
}

// CloseLevy marks a levy closed. Treasurer only.
func (s *Service) CloseLevy(_ context.Context, groupID, levyID, actorID uuid.UUID) error {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return err
	}
	return s.db.Model(&models.Levy{}).
		Where("id = ? AND group_id = ?", levyID, groupID).
		Update("status", "closed").Error
}
