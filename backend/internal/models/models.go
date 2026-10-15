// Package models holds every GORM entity for CampusPot. Keeping them in one
// package avoids import cycles between feature packages (groups, payments,
// expenses) that all need to reference each other. Money is always stored as
// integer kobo (see common/money); never as a float.
package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Base is embedded by entities that use a UUID primary key and timestamps.
// The promoted BeforeCreate hook generates the UUID for us.
type Base struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// BeforeCreate fills in a UUID when the caller has not set one.
func (b *Base) BeforeCreate(*gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

// Role is a member's role within one group.
type Role string

const (
	RoleTreasurer Role = "treasurer"
	RoleCosigner  Role = "cosigner"
	RoleMember    Role = "member"
)

// MembershipStatus tracks the invite → active lifecycle of a group member.
type MembershipStatus string

const (
	MembershipInvited MembershipStatus = "invited"
	MembershipActive  MembershipStatus = "active"
)

// User is a CampusPot account. It maps 1:1 to a B Moni user/wallet.
type User struct {
	Base
	Name         string `gorm:"not null" json:"name"`
	Email        string `gorm:"uniqueIndex;not null" json:"email"`
	Phone        string `json:"phone,omitempty"`
	PasswordHash string `gorm:"not null" json:"-"`
	// BMoniUserID is the id returned by POST /v1/users. Persisted so we never
	// create a duplicate B Moni user for the same person.
	BMoniUserID string `gorm:"index" json:"bmoniUserId,omitempty"`
}

// Group is a shared pot (e.g. "200L Mass Comm Dues").
type Group struct {
	Base
	Name      string    `gorm:"not null" json:"name"`
	JoinCode  string    `gorm:"uniqueIndex;not null" json:"joinCode"`
	Currency  string    `gorm:"not null;default:NGN" json:"currency"`
	CreatedBy uuid.UUID `gorm:"type:uuid;index" json:"createdBy"`

	// B Moni wallet + virtual Naira account (NUBAN) that members pay into.
	// BMoniUserID is the owner (treasurer) B Moni user id that owns the
	// wallet; incoming deposit webhooks reference it, so it indexes the group.
	BMoniUserID          string `gorm:"index" json:"bmoniUserId,omitempty"`
	BMoniWalletID        string `json:"bmoniWalletId,omitempty"`
	BMoniWalletAddress   string `json:"bmoniWalletAddress,omitempty"`
	VirtualAccountNumber string `json:"virtualAccountNumber,omitempty"`
	VirtualAccountBank   string `json:"virtualAccountBank,omitempty"`
	VirtualAccountName   string `json:"virtualAccountName,omitempty"`

	// Spending rules.
	ApprovalThreshold int   `gorm:"not null;default:2" json:"approvalThreshold"`
	ApprovalTotal     int   `gorm:"not null;default:3" json:"approvalTotal"`
	LargeExpenseKobo  int64 `gorm:"not null;default:0" json:"largeExpenseKobo"`
}

// Membership links a user to a group with a role.
type Membership struct {
	Base
	GroupID uuid.UUID        `gorm:"type:uuid;uniqueIndex:idx_group_user;not null" json:"groupId"`
	UserID  uuid.UUID        `gorm:"type:uuid;uniqueIndex:idx_group_user;not null" json:"userId"`
	Role    Role             `gorm:"not null;default:member" json:"role"`
	Status  MembershipStatus `gorm:"not null;default:invited" json:"status"`
	// Reference is the unique payment reference a member quotes on their
	// transfer so incoming deposits reconcile automatically.
	Reference string     `gorm:"uniqueIndex" json:"reference"`
	JoinedAt  *time.Time `json:"joinedAt,omitempty"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// Levy is an amount a group is collecting (dues, excursion, project budget).
type Levy struct {
	Base
	GroupID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"groupId"`
	Title      string     `gorm:"not null" json:"title"`
	AmountKobo int64      `gorm:"not null" json:"amountKobo"`
	DueDate    *time.Time `json:"dueDate,omitempty"`
	Status     string     `gorm:"not null;default:open" json:"status"`
	CreatedBy  uuid.UUID  `gorm:"type:uuid" json:"createdBy"`
}

// Payment statuses.
const (
	PaymentPending   = "pending"   // reference known, funds not yet seen
	PaymentMatched   = "matched"   // fully paid by the matched member
	PaymentPartial   = "partial"   // paid less than the levy amount
	PaymentUnmatched = "unmatched" // landed but no member/reference matched
)

// Payment is one deposit credited to a group pot.
type Payment struct {
	Base
	GroupID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"groupId"`
	LevyID       *uuid.UUID `gorm:"type:uuid;index" json:"levyId,omitempty"`
	UserID       *uuid.UUID `gorm:"type:uuid;index" json:"userId,omitempty"`
	PayerName    string     `json:"payerName,omitempty"`
	PayerAccount string     `json:"payerAccount,omitempty"`
	AmountKobo   int64      `gorm:"not null" json:"amountKobo"`
	Status       string     `gorm:"not null;default:unmatched" json:"status"`
	// ProviderEventID is the B Moni transaction/event id. It is unique so a
	// redelivered webhook can never double-credit the pot.
	ProviderEventID string `gorm:"uniqueIndex" json:"providerEventId,omitempty"`
	// QuotedReference is the member reference the payer put on the transfer.
	QuotedReference string `json:"quotedReference,omitempty"`
	// MatchedBy records how reconciliation identified the member.
	MatchedBy string `json:"matchedBy,omitempty"` // reference | payer_name | manual
	// LedgerEntryID links the payment to the ledger credit it produced.
	LedgerEntryID *uuid.UUID `gorm:"type:uuid" json:"ledgerEntryId,omitempty"`
}

// Ledger kinds.
const (
	LedgerCredit = "credit"
	LedgerDebit  = "debit"
)

// LedgerEntry is an immutable, append-only record of money in or out of a pot.
type LedgerEntry struct {
	Base
	GroupID          uuid.UUID  `gorm:"type:uuid;index;not null" json:"groupId"`
	Kind             string     `gorm:"not null" json:"kind"`
	AmountKobo       int64      `gorm:"not null" json:"amountKobo"`
	BalanceAfterKobo int64      `gorm:"not null" json:"balanceAfterKobo"`
	Description      string     `json:"description"`
	RefType          string     `json:"refType,omitempty"`
	RefID            string     `json:"refId,omitempty"`
	ActorUserID      *uuid.UUID `gorm:"type:uuid" json:"actorUserId,omitempty"`
}

// ExpenseRequest statuses.
const (
	ExpensePendingApproval = "pending_approval"
	ExpenseApproved        = "approved"
	ExpenseRejected        = "rejected"
	ExpenseExecuting       = "executing"
	ExpenseCompleted       = "completed"
	ExpenseFailed          = "failed"
)

// Risk levels assigned by the AI risk check.
const (
	RiskLow    = "low"
	RiskMedium = "medium"
	RiskHigh   = "high"
)

// ExpenseRequest is a withdrawal the treasurer wants to make from the pot.
type ExpenseRequest struct {
	Base
	GroupID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"groupId"`
	RequestedBy uuid.UUID  `gorm:"type:uuid;not null" json:"requestedBy"`
	AmountKobo  int64      `gorm:"not null" json:"amountKobo"`
	Destination string     `json:"destination"` // description / bank account / bmoni user
	Category    string     `json:"category,omitempty"`
	Note        string     `json:"note,omitempty"`
	Status      string     `gorm:"not null;default:pending_approval" json:"status"`
	RiskLevel   string     `gorm:"default:low" json:"riskLevel"`
	RiskReasons string     `json:"riskReasons,omitempty"` // JSON array stored as text
	ProposalID  string     `json:"proposalId,omitempty"`
	ApprovedAt  *time.Time `json:"approvedAt,omitempty"`
	ExecutedAt  *time.Time `json:"executedAt,omitempty"`
}

// Approval decisions.
const (
	DecisionApprove = "approve"
	DecisionReject  = "reject"
)

// Approval is one co-signer's decision on an expense request. A unique index
// on (expense_request_id, approver_user_id) stops one person approving twice.
type Approval struct {
	Base
	ExpenseRequestID uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_expense_approver;not null" json:"expenseRequestId"`
	ApproverUserID   uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_expense_approver;not null" json:"approverUserId"`
	Decision         string    `gorm:"not null" json:"decision"`
	Comment          string    `json:"comment,omitempty"`
}

// WebhookEvent records every delivery from B Moni. Its primary key is the
// provider event id, which makes deduplication on retries a simple insert.
type WebhookEvent struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	EventType string    `gorm:"index" json:"eventType"`
	Payload   string    `json:"payload"`
	Status    string    `gorm:"default:received" json:"status"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// Reminder is an AI-drafted nudge for a member who has not paid.
type Reminder struct {
	Base
	GroupID uuid.UUID  `gorm:"type:uuid;index;not null" json:"groupId"`
	LevyID  *uuid.UUID `gorm:"type:uuid" json:"levyId,omitempty"`
	UserID  *uuid.UUID `gorm:"type:uuid" json:"userId,omitempty"`
	Channel string     `gorm:"default:whatsapp" json:"channel"`
	Message string     `json:"message"`
	Status  string     `gorm:"default:draft" json:"status"`
	SentAt  *time.Time `json:"sentAt,omitempty"`
}

// AllModels is the AutoMigrate list. Order does not strictly matter for
// GORM but is kept readable.
func AllModels() []interface{} {
	return []interface{}{
		&User{},
		&Group{},
		&Membership{},
		&Levy{},
		&Payment{},
		&LedgerEntry{},
		&ExpenseRequest{},
		&Approval{},
		&WebhookEvent{},
		&Reminder{},
	}
}
