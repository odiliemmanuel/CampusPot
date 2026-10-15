package pot

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// CreateLevyRequest sets up a collection (dues, excursion, project budget).
type CreateLevyRequest struct {
	Title      string     `json:"title" binding:"required,min=2"`
	AmountKobo int64      `json:"amountKobo" binding:"required,gt=0"`
	DueDate    *time.Time `json:"dueDate"`
}

// CreateLevy creates a levy on a group. Treasurer only.
func (s *Service) CreateLevy(_ context.Context, groupID, actorID uuid.UUID, req CreateLevyRequest) (*models.Levy, error) {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return nil, err
	}
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	levy := &models.Levy{
		GroupID:    groupID,
		Title:      req.Title,
		AmountKobo: req.AmountKobo,
		DueDate:    req.DueDate,
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
