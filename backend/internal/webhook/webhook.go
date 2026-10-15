// Package webhook receives B Moni event deliveries, verifies their signature,
// deduplicates retries, and hands deposits to the pot engine for
// reconciliation.
package webhook

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

// Handler processes webhook deliveries.
type Handler struct {
	db     *gorm.DB
	pots   *pot.Service
	secret string
}

// NewHandler builds the webhook handler.
func NewHandler(db *gorm.DB, pots *pot.Service, secret string) *Handler {
	return &Handler{db: db, pots: pots, secret: secret}
}

// RegisterRoutes attaches the public webhook endpoint (no JWT).
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/webhooks/bmoni", h.receive)
}

// Event is the B Moni delivery envelope.
type Event struct {
	ID        string          `json:"id"`
	EventType string          `json:"eventType"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp string          `json:"timestamp"`
}

// DepositPayload covers the fields we use from a deposit event. B Moni sends
// amounts as decimal strings; reference/narration may arrive under a few keys.
type DepositPayload struct {
	UserID        string `json:"userId"`
	Amount        string `json:"amount"`
	Currency      string `json:"currency"`
	SenderName    string `json:"senderName"`
	SenderAccount string `json:"senderAccount"`
	TransactionID string `json:"transactionId"`
	Reference     string `json:"reference"`
	Concept       string `json:"concept"`
	Narration     string `json:"narration"`
}

func (h *Handler) receive(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unreadable body"})
		return
	}

	// 1. Verify the signature over the raw bytes. In dev with no secret set we
	//    skip verification so the simulator can drive the endpoint.
	if h.secret == "" {
		log.Printf("webhook: BMONI_WEBHOOK_SECRET not set; skipping signature verification")
	} else if !bmoni.VerifySignature(raw, c.GetHeader("X-Webhook-Signature"), h.secret) {
		// 401 is a permanent failure upstream — correct for a bad signature.
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
		return
	}

	var event Event
	if err := json.Unmarshal(raw, &event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}
	if event.ID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing event id"})
		return
	}

	// 2. Deduplicate: the event id is the primary key, so a retry is a no-op.
	record := &models.WebhookEvent{
		ID:        event.ID,
		EventType: event.EventType,
		Payload:   string(raw),
		Status:    "received",
	}
	if err := h.db.Create(record).Error; err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusOK, gin.H{"received": true, "duplicate": true})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not persist event"})
		return
	}

	// 3. Handle the event. A processing error means "retry me", so we return
	//    500 (transient), never 4xx, and record why.
	if err := h.handle(c, event); err != nil {
		_ = h.db.Model(record).Updates(map[string]interface{}{
			"status": "failed", "error": err.Error(),
		}).Error
		log.Printf("webhook: event %s (%s) failed: %v", event.ID, event.EventType, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "processing failed"})
		return
	}

	_ = h.db.Model(record).Update("status", "processed").Error
	c.JSON(http.StatusOK, gin.H{"received": true})
}

func (h *Handler) handle(c *gin.Context, event Event) error {
	switch event.EventType {
	case "employee.deposit.completed", "wallet.deposit.completed":
		return h.handleDeposit(c, event)
	default:
		// Ignore events we do not act on, but still ack them.
		log.Printf("webhook: ignoring event type %s", event.EventType)
		return nil
	}
}

func (h *Handler) handleDeposit(c *gin.Context, event Event) error {
	var p DepositPayload
	if err := json.Unmarshal(event.Payload, &p); err != nil {
		return err
	}

	group, err := h.pots.GroupByBMoniUser(c.Request.Context(), p.UserID)
	if err != nil {
		// The deposit may belong to a user we do not manage; ack it rather
		// than triggering endless retries.
		log.Printf("webhook: deposit for unknown bmoni user %s: %v", p.UserID, err)
		return nil
	}

	amount, err := money.FromDecimalString(p.Amount)
	if err != nil {
		return err
	}

	ref := p.Reference
	if ref == "" {
		ref = p.Concept
	}
	if ref == "" {
		ref = p.Narration
	}

	_, err = h.pots.ReconcileDeposit(c.Request.Context(), pot.DepositEvent{
		GroupID:         group.ID,
		AmountKobo:      int64(amount),
		QuotedReference: ref,
		PayerName:       p.SenderName,
		PayerAccount:    p.SenderAccount,
		ProviderEventID: event.ID,
	})
	return err
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return contains(s, "duplicate key") || contains(s, "UNIQUE") || contains(s, "SQLSTATE 23505")
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
