package pot

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// ChatMessageView is one chat message enriched with its author's name and the
// ids of the members who have read it. Chat is open to every active member of
// the pot — there is no separate chat membership to manage.
type ChatMessageView struct {
	ID             uuid.UUID   `json:"id"`
	UserID         uuid.UUID   `json:"userId"`
	Author         string      `json:"author"`
	Body           string      `json:"body"`
	ReplyToID      *uuid.UUID  `json:"replyToId,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"`
	ReadBy         []uuid.UUID `json:"readBy"`
	AttachmentName string      `json:"attachmentName,omitempty"`
	AttachmentType string      `json:"attachmentType,omitempty"`
	AttachmentURL  string      `json:"attachmentUrl,omitempty"`
}

// ChatParticipants returns the active members who can see the pot chat. Chat
// membership is derived from pot membership, so leaving the pot (or being
// removed) also removes the person from the chat.
func (s *Service) ChatParticipants(_ context.Context, groupID, actorID uuid.UUID) ([]models.Membership, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var members []models.Membership
	err := s.db.Preload("User").
		Where("group_id = ? AND status = ?", groupID, models.MembershipActive).
		Order("created_at ASC").Find(&members).Error
	return members, err
}

// ListChat returns a pot's messages in order, each with its read receipts.
func (s *Service) ListChat(_ context.Context, groupID, actorID uuid.UUID) ([]ChatMessageView, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}

	var msgs []models.ChatMessage
	if err := s.db.Omit("AttachmentData").Where("group_id = ?", groupID).Order("created_at ASC").Find(&msgs).Error; err != nil {
		return nil, err
	}

	var receipts []models.ChatReadReceipt
	if err := s.db.Where("group_id = ?", groupID).Find(&receipts).Error; err != nil {
		return nil, err
	}
	readBy := make(map[uuid.UUID][]uuid.UUID, len(msgs))
	for _, r := range receipts {
		readBy[r.MessageID] = append(readBy[r.MessageID], r.UserID)
	}

	names, err := s.loadMemberNames(groupID)
	if err != nil {
		return nil, err
	}

	out := make([]ChatMessageView, 0, len(msgs))
	for _, m := range msgs {
		readers := readBy[m.ID]
		if readers == nil {
			readers = []uuid.UUID{}
		}
		out = append(out, ChatMessageView{
			ID:             m.ID,
			UserID:         m.UserID,
			Author:         names[m.UserID],
			Body:           m.Body,
			ReplyToID:      m.ReplyToID,
			CreatedAt:      m.CreatedAt,
			ReadBy:         readers,
			AttachmentName: m.AttachmentName,
			AttachmentType: m.AttachmentType,
			AttachmentURL:  chatAttachmentURL(groupID, m.ID, m.AttachmentName),
		})
	}
	return out, nil
}

func chatAttachmentURL(groupID, messageID uuid.UUID, name string) string {
	if name == "" {
		return ""
	}
	return fmt.Sprintf("/api/v1/groups/%s/chat/%s/attachment", groupID, messageID)
}

// UploadChatAttachment stores a small chat file or voice note in the database
// so it remains available across API restarts and instances.
func (s *Service) UploadChatAttachment(ctx context.Context, groupID, actorID uuid.UUID, name, contentType string, file io.Reader) (*ChatMessageView, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	const maxSize = 10 << 20
	data, err := io.ReadAll(io.LimitReader(file, maxSize+1))
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || len(data) > maxSize {
		return nil, fmt.Errorf("%w: attachment must be between 1 byte and 10 MB", ErrInvalid)
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "attachment"
	}
	if len(name) > 180 {
		name = name[:180]
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if len(contentType) > 120 {
		return nil, fmt.Errorf("%w: unsupported content type", ErrInvalid)
	}
	msg := &models.ChatMessage{GroupID: groupID, UserID: actorID, Body: "", AttachmentName: name, AttachmentType: contentType, AttachmentData: data}
	if err := s.db.Create(msg).Error; err != nil {
		return nil, err
	}
	_ = s.db.Create(&models.ChatReadReceipt{GroupID: groupID, MessageID: msg.ID, UserID: actorID}).Error
	names, _ := s.loadMemberNames(groupID)
	return &ChatMessageView{ID: msg.ID, UserID: msg.UserID, Author: names[actorID], CreatedAt: msg.CreatedAt, ReadBy: []uuid.UUID{actorID}, AttachmentName: name, AttachmentType: contentType, AttachmentURL: chatAttachmentURL(groupID, msg.ID, name)}, nil
}

func (s *Service) ChatAttachment(ctx context.Context, groupID, actorID, messageID uuid.UUID) (string, string, []byte, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return "", "", nil, err
	}
	var msg models.ChatMessage
	if err := s.db.WithContext(ctx).First(&msg, "id = ? AND group_id = ?", messageID, groupID).Error; err != nil {
		return "", "", nil, ErrNotFound
	}
	if len(msg.AttachmentData) == 0 {
		return "", "", nil, ErrNotFound
	}
	return msg.AttachmentName, msg.AttachmentType, bytes.Clone(msg.AttachmentData), nil
}

// PostChatRequest is the body for sending a chat message.
type PostChatRequest struct {
	Body      string     `json:"body" binding:"required"`
	ReplyToID *uuid.UUID `json:"replyToId"`
}

// PostChat adds a message. The author is recorded as the first reader.
func (s *Service) PostChat(_ context.Context, groupID, actorID uuid.UUID, req PostChatRequest) (*ChatMessageView, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		return nil, fmt.Errorf("%w: message cannot be empty", ErrInvalid)
	}
	if req.ReplyToID != nil {
		var parent models.ChatMessage
		if err := s.db.First(&parent, "id = ? AND group_id = ?", *req.ReplyToID, groupID).Error; err != nil {
			return nil, fmt.Errorf("%w: the message you replied to is gone", ErrNotFound)
		}
	}

	msg := &models.ChatMessage{
		GroupID:   groupID,
		UserID:    actorID,
		Body:      body,
		ReplyToID: req.ReplyToID,
	}
	if err := s.db.Create(msg).Error; err != nil {
		return nil, err
	}
	_ = s.db.Create(&models.ChatReadReceipt{
		GroupID: groupID, MessageID: msg.ID, UserID: actorID,
	}).Error

	names, _ := s.loadMemberNames(groupID)
	return &ChatMessageView{
		ID:        msg.ID,
		UserID:    msg.UserID,
		Author:    names[actorID],
		Body:      msg.Body,
		ReplyToID: msg.ReplyToID,
		CreatedAt: msg.CreatedAt,
		ReadBy:    []uuid.UUID{actorID},
	}, nil
}

// MarkChatRead records that the caller has read every message up to and
// including messageID. Redelivery is harmless (FirstOrCreate).
func (s *Service) MarkChatRead(_ context.Context, groupID, userID, messageID uuid.UUID) error {
	if _, err := s.requireMember(groupID, userID); err != nil {
		return err
	}
	var msg models.ChatMessage
	if err := s.db.First(&msg, "id = ? AND group_id = ?", messageID, groupID).Error; err != nil {
		return ErrNotFound
	}

	var msgs []models.ChatMessage
	if err := s.db.Where("group_id = ? AND created_at <= ?", groupID, msg.CreatedAt).
		Find(&msgs).Error; err != nil {
		return err
	}
	for _, m := range msgs {
		receipt := models.ChatReadReceipt{GroupID: groupID, MessageID: m.ID, UserID: userID}
		if err := s.db.Where("message_id = ? AND user_id = ?", m.ID, userID).
			FirstOrCreate(&receipt).Error; err != nil {
			return err
		}
	}
	return nil
}

// RemoveChatMember enforces the rule that a chat participant cannot be removed
// while they are still in the pot. Someone who has already left the pot is out
// of the chat automatically, so this is an idempotent no-op for them.
func (s *Service) RemoveChatMember(_ context.Context, groupID, actorID, targetID uuid.UUID) error {
	if _, err := s.requireRole(groupID, actorID, models.RoleTreasurer); err != nil {
		return err
	}
	var active int64
	if err := s.db.Model(&models.Membership{}).
		Where("group_id = ? AND user_id = ? AND status = ?", groupID, targetID, models.MembershipActive).
		Count(&active).Error; err != nil {
		return err
	}
	if active > 0 {
		return fmt.Errorf("%w: a member cannot be removed from the chat while they are still in the pot", ErrConflict)
	}
	return nil
}

func (s *Service) loadMemberNames(groupID uuid.UUID) (map[uuid.UUID]string, error) {
	var members []models.Membership
	if err := s.db.Preload("User").Where("group_id = ?", groupID).Find(&members).Error; err != nil {
		return nil, err
	}
	names := make(map[uuid.UUID]string, len(members))
	for _, m := range members {
		if m.User == nil {
			continue
		}
		name := m.User.Name
		if strings.TrimSpace(name) == "" {
			name = m.User.Email
		}
		names[m.UserID] = name
	}
	return names, nil
}
