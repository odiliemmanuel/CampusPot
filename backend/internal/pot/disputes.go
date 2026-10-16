package pot

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// DisputeThreshold is how many distinct open disputes freeze a pot's spending.
// "More than one person" means two or more.
const DisputeThreshold = 2

// DisputeView is a dispute enriched with the raiser's name.
type DisputeView struct {
	models.Dispute
	Name string `json:"name"`
}

// openDisputeCount counts distinct members with an open dispute on a pot.
func (s *Service) openDisputeCount(groupID uuid.UUID) (int64, error) {
	var n int64
	err := s.db.Model(&models.Dispute{}).
		Where("group_id = ? AND status = ?", groupID, models.DisputeOpen).
		Count(&n).Error
	return n, err
}

// spendingFrozen reports whether the pot's spending is currently frozen by
// member disputes, and returns the number of open disputes.
func (s *Service) spendingFrozen(groupID uuid.UUID) (bool, int64, error) {
	n, err := s.openDisputeCount(groupID)
	if err != nil {
		return false, 0, err
	}
	return n >= DisputeThreshold, n, nil
}

// RaiseDisputeRequest is the body for opening a dispute. ExpenseRequestID is
// optional: set it to dispute a specific payout rather than the pot in general.
type RaiseDisputeRequest struct {
	Reason           string     `json:"reason"`
	ExpenseRequestID *uuid.UUID `json:"expenseRequestId"`
}

// expenseDisputed reports whether a payout has any open dispute against it.
func (s *Service) expenseDisputed(expenseID uuid.UUID) (bool, error) {
	var n int64
	err := s.db.Model(&models.Dispute{}).
		Where("expense_request_id = ? AND status = ?", expenseID, models.DisputeOpen).
		Count(&n).Error
	return n > 0, err
}

// RaiseDispute opens a dispute against how the pot is being run, or against a
// specific payout. Any active member may raise one; each member counts once.
// A single open dispute freezes the payout it names; two or more open disputes
// freeze all spending so the treasurer cannot move money.
func (s *Service) RaiseDispute(_ context.Context, groupID, userID uuid.UUID, req RaiseDisputeRequest) (*models.Dispute, error) {
	if _, err := s.requireMember(groupID, userID); err != nil {
		return nil, err
	}
	if req.ExpenseRequestID != nil {
		var expense models.ExpenseRequest
		if err := s.db.First(&expense, "id = ? AND group_id = ?", *req.ExpenseRequestID, groupID).Error; err != nil {
			return nil, fmt.Errorf("%w: no such payout in this pot", ErrNotFound)
		}
	}
	d := &models.Dispute{
		GroupID:          groupID,
		UserID:           userID,
		ExpenseRequestID: req.ExpenseRequestID,
		Reason:           strings.TrimSpace(req.Reason),
		Status:           models.DisputeOpen,
	}
	if err := s.db.Create(d).Error; err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("%w: you have already raised a dispute on this pot", ErrConflict)
		}
		return nil, err
	}
	return d, nil
}

// ListDisputes returns a pot's disputes, newest first, with raiser names.
func (s *Service) ListDisputes(_ context.Context, groupID, actorID uuid.UUID) ([]DisputeView, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	names, err := s.loadMemberNames(groupID)
	if err != nil {
		return nil, err
	}
	var disputes []models.Dispute
	if err := s.db.Where("group_id = ?", groupID).Order("created_at DESC").Find(&disputes).Error; err != nil {
		return nil, err
	}
	out := make([]DisputeView, 0, len(disputes))
	for _, d := range disputes {
		out = append(out, DisputeView{Dispute: d, Name: names[d.UserID]})
	}
	return out, nil
}

// ResolveDispute closes a dispute. The treasurer can resolve any dispute; a
// member can withdraw their own. Once fewer than two remain, spending unfreezes.
func (s *Service) ResolveDispute(_ context.Context, groupID, disputeID, actorID uuid.UUID) (*models.Dispute, error) {
	role, err := s.requireMember(groupID, actorID)
	if err != nil {
		return nil, err
	}
	var d models.Dispute
	if err := s.db.First(&d, "id = ? AND group_id = ?", disputeID, groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	if d.Status == models.DisputeResolved {
		return &d, nil
	}
	if role.Role != models.RoleTreasurer && d.UserID != actorID {
		return nil, fmt.Errorf("%w: only the treasurer or the member who raised it can resolve a dispute", ErrForbidden)
	}
	now := s.now()
	if err := s.db.Model(&d).Updates(map[string]interface{}{
		"status":      models.DisputeResolved,
		"resolved_by": actorID,
		"resolved_at": &now,
	}).Error; err != nil {
		return nil, err
	}
	if err := s.db.First(&d, "id = ?", disputeID).Error; err != nil {
		return nil, err
	}
	return &d, nil
}
