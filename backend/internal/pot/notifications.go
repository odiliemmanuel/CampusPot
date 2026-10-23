package pot

// Persisted in-app notifications for money events. The frontend's bell used
// to be reconstructed from raw payments/expenses on every load; these rows
// make it a real feed: contributions received, payouts, refunds, scheduled
// transfers and disputes all land here, attributed to the
// exact users who care.

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// notifyTx inserts one notification inside an open transaction.
func notifyTx(tx *gorm.DB, n models.Notification) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return tx.Create(&n).Error
}

// notifyLeaders notifies a pot's treasurer and co-signers — the people who
// must act on the event (a contribution landed, a member raised a dispute).
func (s *Service) notifyLeaders(tx *gorm.DB, groupID uuid.UUID, n models.Notification) error {
	var leaders []models.Membership
	if err := tx.Where("group_id = ? AND status = ? AND role IN ?",
		groupID, models.MembershipActive,
		[]models.Role{models.RoleTreasurer, models.RoleCosigner}).
		Find(&leaders).Error; err != nil {
		return err
	}
	gid := groupID
	for _, m := range leaders {
		if m.UserID == n.UserID {
			continue // never notify the actor about their own action
		}
		row := n
		row.ID = uuid.New()
		row.UserID = m.UserID
		row.GroupID = &gid
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// notifyMember notifies one specific member (e.g. the treasurer when a
// payment arrives, or a payer when their money is refunded). groupID may be
// nil for account-level events that belong to no pot.
func (s *Service) notifyMember(tx *gorm.DB, userID uuid.UUID, groupID *uuid.UUID, kind, title, body, link string) error {
	return notifyTx(tx, models.Notification{
		UserID: userID, GroupID: groupID, Kind: kind,
		Title: title, Body: body, Link: link,
	})
}

// Notification is a notification row shaped for the client, with an ISO date.
type Notification struct {
	ID        uuid.UUID  `json:"id"`
	GroupID   *uuid.UUID `json:"groupId,omitempty"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body,omitempty"`
	Link      string     `json:"link,omitempty"`
	Read      bool       `json:"read"`
	CreatedAt time.Time  `json:"createdAt"`
}

// ListNotifications returns the caller's notifications, newest first.
func (s *Service) ListNotifications(_ context.Context, userID uuid.UUID, unreadOnly bool) ([]Notification, error) {
	q := s.db.Where("user_id = ?", userID)
	if unreadOnly {
		q = q.Where("read_at IS NULL")
	}
	var rows []models.Notification
	if err := q.Order("created_at DESC").Limit(100).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Notification, 0, len(rows))
	for _, r := range rows {
		out = append(out, Notification{
			ID: r.ID, GroupID: r.GroupID, Kind: r.Kind,
			Title: r.Title, Body: r.Body, Link: r.Link,
			Read: r.ReadAt != nil, CreatedAt: r.CreatedAt,
		})
	}
	return out, nil
}

// MarkNotificationRead marks one notification as read. Owners only.
func (s *Service) MarkNotificationRead(_ context.Context, userID, id uuid.UUID) error {
	now := s.now()
	return s.db.Model(&models.Notification{}).
		Where("id = ? AND user_id = ? AND read_at IS NULL", id, userID).
		Update("read_at", &now).Error
}

// MarkAllNotificationsRead marks every unread notification for the caller.
func (s *Service) MarkAllNotificationsRead(_ context.Context, userID uuid.UUID) error {
	now := s.now()
	return s.db.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", &now).Error
}

// paymentReceivedNotification builds the treasurer-facing note for a deposit.
func paymentReceivedNotification(payerName string, amountKobo int64) (string, string) {
	title := "Contribution received"
	body := fmt.Sprintf("%s paid %s into the pot.",
		firstNonEmpty(payerName, "A member"), money.Kobo(amountKobo).Format())
	return title, body
}
