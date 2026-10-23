// Package models holds every GORM entity for PotKeeper. Keeping them in one
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
	// MembershipRemoved is set when a member leaves or is removed. Their chat
	// access ends with the membership, since chat participants are derived from
	// active memberships.
	MembershipRemoved MembershipStatus = "removed"
)

// User is a PotKeeper account. It maps 1:1 to a B Moni user/wallet.
type User struct {
	Base
	Name         string `gorm:"not null" json:"name"`
	Email        string `gorm:"uniqueIndex;not null" json:"email"`
	Phone        string `json:"phone,omitempty"`
	PasswordHash string `gorm:"not null" json:"-"`
	// TransactionPinHash is the bcrypt hash of the 4–6 digit PIN that authorises
	// wallet debits (sends and pot payments). Empty until the user sets one, and
	// never serialised — only the boolean PinSet reaches the client.
	TransactionPinHash string `gorm:"column:transaction_pin_hash" json:"-"`
	// BMoniUserID is the id returned by POST /v1/users. Persisted so we never
	// create a duplicate B Moni user for the same person.
	BMoniUserID string `gorm:"index" json:"bmoniUserId,omitempty"`
	// WalletBalanceKobo is the user's own spendable balance, separate from any
	// pot. Money added here can be sent to another member or paid into a pot.
	WalletBalanceKobo int64 `gorm:"not null;default:0" json:"walletBalanceKobo"`

	// EmailVerified is set once the owner proves control of the email with a
	// one-time code. Unverified accounts can browse but cannot move money.
	EmailVerified bool `gorm:"not null;default:false" json:"emailVerified"`

	// Locale is the user's preferred language ("en", "fr", ...).
	Locale string `gorm:"default:en" json:"locale"`
}

// Wallet transaction kinds.
const (
	WalletDeposit     = "deposit"      // money added to the wallet (funding)
	WalletTransferIn  = "transfer_in"  // received from another PotKeeper user
	WalletTransferOut = "transfer_out" // sent to a member/user or an external bank
	WalletPotPayment  = "pot_payment"  // paid from the wallet into a pot levy
	WalletRefund      = "refund"       // a pot returned a contribution to the wallet
)

// WalletTransaction is one movement in a user's personal wallet. It is an
// append-only record so the wallet has its own auditable history.
type WalletTransaction struct {
	Base
	UserID       uuid.UUID `gorm:"type:uuid;index;not null" json:"userId"`
	Kind         string    `gorm:"not null" json:"kind"`
	AmountKobo   int64     `gorm:"not null" json:"amountKobo"`
	Counterparty string    `json:"counterparty,omitempty"` // name/email/phone/bank
	// CounterpartyUserID is set when the money moved to/from another PotKeeper
	// user's wallet; nil for external (bank) transfers and simulated deposits.
	CounterpartyUserID *uuid.UUID `gorm:"type:uuid" json:"counterpartyUserId,omitempty"`
	GroupID            *uuid.UUID `gorm:"type:uuid;index" json:"groupId,omitempty"`
	LevyID             *uuid.UUID `gorm:"type:uuid" json:"levyId,omitempty"`
	Reference          string     `json:"reference,omitempty"`
	Note               string     `json:"note,omitempty"`
}

// Pot visibility: private pots are reachable only by join code or invite;
// public pots are discoverable and can be joined directly.
const (
	VisibilityPrivate = "private"
	VisibilityPublic  = "public"
)

// Group is a shared pot (e.g. "200L Mass Comm Dues").
type Group struct {
	Base
	Name      string    `gorm:"not null" json:"name"`
	JoinCode  string    `gorm:"uniqueIndex;not null" json:"joinCode"`
	Currency  string    `gorm:"not null;default:NGN" json:"currency"`
	CreatedBy uuid.UUID `gorm:"type:uuid;index" json:"createdBy"`
	PotType                   string     `gorm:"not null;default:goal" json:"potType"`
	ContributionFrequency     string     `gorm:"not null;default:one_time" json:"contributionFrequency"`
	ContributionAmountKobo    int64      `gorm:"not null;default:0" json:"contributionAmountKobo"`
	ContributionDueDate       *time.Time `json:"contributionDueDate,omitempty"`

	// Description, Category and Visibility shape how a pot presents itself when
	// it is public; TargetKobo is the savings goal the pot is aiming at (0 = no
	// fixed goal), so progress can be shown to members and discoverers.
	Description string `json:"description,omitempty"`
	Category    string `gorm:"index" json:"category,omitempty"`
	Visibility  string `gorm:"not null;default:private;index" json:"visibility"`
	TargetKobo  int64  `gorm:"not null;default:0" json:"targetKobo"`

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

	// HideTreasury keeps the pot's balance visible only to the treasurer and
	// co-signers; ordinary members see the collection progress but not the pot.
	HideTreasury bool `gorm:"not null;default:false" json:"hideTreasury"`
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
	PaymentRefunded  = "refunded"  // returned to the member (failed payout)
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
	// RefundedAt is set once this contribution has been returned to the member
	// (e.g. because the payout it funded failed). A refunded payment is never
	// refunded twice.
	RefundedAt *time.Time `json:"refundedAt,omitempty"`
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

// Payout destination kinds for a withdrawal.
const (
	ExpenseMember = "member" // another member of the same pot
	ExpenseUser   = "user"   // any PotKeeper account (email or phone)
	ExpenseBank   = "bank"   // an external bank account
)

// Risk levels assigned by the AI risk check.
const (
	RiskLow    = "low"
	RiskMedium = "medium"
	RiskHigh   = "high"
)

// ExpenseRequest is a withdrawal the treasurer wants to make from the pot. Its
// payout follows the same rails as a wallet transfer: another member, any
// PotKeeper account (by email/phone), or an external bank account.
type ExpenseRequest struct {
	Base
	GroupID     uuid.UUID `gorm:"type:uuid;index;not null" json:"groupId"`
	RequestedBy uuid.UUID `gorm:"type:uuid;not null" json:"requestedBy"`
	AmountKobo  int64     `gorm:"not null" json:"amountKobo"`
	// Destination is the human-readable payout target shown in the UI.
	Destination string `json:"destination"`
	// DestinationType is member | user | bank. When the target is a PotKeeper
	// account, RecipientUserID is set and the payout credits that wallet
	// directly (like a wallet transfer); a bank payout goes through B Moni.
	DestinationType string     `gorm:"default:bank" json:"destinationType"`
	RecipientUserID *uuid.UUID `gorm:"type:uuid;index" json:"recipientUserId,omitempty"`
	BankName        string     `json:"bankName,omitempty"`
	BankCode        string     `json:"bankCode,omitempty"`
	AccountNumber   string     `json:"accountNumber,omitempty"`
	// AccountName is the bank-verified account holder name from name enquiry
	// — never a free-text value typed into the form.
	AccountName     string     `json:"accountName,omitempty"`
	Category        string     `json:"category,omitempty"`
	Note            string     `json:"note,omitempty"`
	Status          string     `gorm:"not null;default:pending_approval" json:"status"`
	RiskLevel       string     `gorm:"default:low" json:"riskLevel"`
	RiskReasons     string     `json:"riskReasons,omitempty"` // JSON array stored as text
	ProposalID      string     `json:"proposalId,omitempty"`
	ApprovedAt      *time.Time `json:"approvedAt,omitempty"`
	ExecutedAt      *time.Time `json:"executedAt,omitempty"`
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
	GroupID        uuid.UUID  `gorm:"type:uuid;index;uniqueIndex:idx_reminder_idempotency,priority:1;not null" json:"groupId"`
	LevyID         *uuid.UUID `gorm:"type:uuid" json:"levyId,omitempty"`
	UserID         *uuid.UUID `gorm:"type:uuid" json:"userId,omitempty"`
	Channel        string     `gorm:"default:whatsapp" json:"channel"`
	Message        string     `json:"message"`
	Status         string     `gorm:"default:draft" json:"status"`
	SentAt         *time.Time `json:"sentAt,omitempty"`
	IdempotencyKey *string    `gorm:"uniqueIndex:idx_reminder_idempotency,priority:2" json:"-"`
}

// ChatMessage is one message in a pot's group chat. Membership is implied by
// the author's active Membership — nobody outside the pot can read or post.
type ChatMessage struct {
	Base
	GroupID uuid.UUID `gorm:"type:uuid;index;not null" json:"groupId"`
	UserID  uuid.UUID `gorm:"type:uuid;index;not null" json:"userId"`
	Body    string    `gorm:"not null" json:"body"`
	// ReplyToID links a message to the one it answers, for threaded replies.
	ReplyToID      *uuid.UUID `gorm:"type:uuid" json:"replyToId,omitempty"`
	AttachmentName string     `json:"attachmentName,omitempty"`
	AttachmentType string     `json:"attachmentType,omitempty"`
	AttachmentData []byte     `gorm:"type:bytea" json:"-"`
}

// ChatReadReceipt records that a member has seen a message. The unique index
// on (message_id, user_id) keeps the "read by" list free of duplicates.
type ChatReadReceipt struct {
	Base
	GroupID   uuid.UUID `gorm:"type:uuid;index;not null" json:"groupId"`
	MessageID uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_chat_read;not null" json:"messageId"`
	UserID    uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_chat_read;not null" json:"userId"`
}

// Dispute statuses.
const (
	DisputeOpen     = "open"
	DisputeResolved = "resolved"
)

// Dispute is one member's formal objection to how the pot is being run. When
// more than one member has an open dispute, the pot's spending is frozen so the
// treasurer cannot move money until the dispute is resolved. The unique index
// on (group_id, user_id) means each member counts once.
type Dispute struct {
	Base
	GroupID uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_dispute_member;not null" json:"groupId"`
	UserID  uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_dispute_member;not null" json:"userId"`
	// ExpenseRequestID, when set, is the specific payout this dispute is over.
	// Nil means the dispute is about how the pot is being run in general.
	ExpenseRequestID *uuid.UUID `gorm:"type:uuid;index" json:"expenseRequestId,omitempty"`
	Reason           string     `json:"reason,omitempty"`
	Status           string     `gorm:"not null;default:open" json:"status"`
	ResolvedBy       *uuid.UUID `gorm:"type:uuid" json:"resolvedBy,omitempty"`
	ResolvedAt       *time.Time `json:"resolvedAt,omitempty"`
	// EscalatedAt is set when the dispute is escalated to customer support,
	// which opens a support case the pot's leadership can track.
	EscalatedAt     *time.Time `json:"escalatedAt,omitempty"`
	EscalationNote  string     `json:"escalationNote,omitempty"`
}

// Verification code purposes.
const (
	CodePurposeSignup = "signup" // prove control of the email at sign-up
	CodePurposeReset  = "reset"  // password reset
)

// VerificationCode is a one-time code sent to a user's email. Only a hash is
// stored, it expires after CodeTTLMinutes, and it is consumed on first use.
type VerificationCode struct {
	Base
	UserID     uuid.UUID  `gorm:"type:uuid;index" json:"userId"`
	Email      string     `gorm:"index;not null" json:"email"`
	Hash       string     `gorm:"not null" json:"-"`
	Purpose    string     `gorm:"not null;index" json:"purpose"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	ConsumedAt *time.Time `json:"consumedAt,omitempty"`
}

// Notification kinds.
const (
	NotifyPayment      = "payment"
	NotifyTransferIn   = "transfer_in"
	NotifyPayout       = "payout"
	NotifyDispute      = "dispute"
	NotifySchedule     = "schedule"
	NotifyRefund       = "refund"
	NotifyVerification = "verification"
)

// Notification is a persisted in-app message for one user. Money events
// (contributions received, payouts, refunds, scheduled transfers) write here
// so the bell shows them even after a refresh.
type Notification struct {
	Base
	UserID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"userId"`
	GroupID *uuid.UUID `gorm:"type:uuid;index" json:"groupId,omitempty"`
	Kind    string     `gorm:"not null" json:"kind"`
	Title   string     `gorm:"not null" json:"title"`
	Body    string     `json:"body,omitempty"`
	Link    string     `json:"link,omitempty"`
	ReadAt  *time.Time `json:"readAt,omitempty"`
}

// Scheduled transfer statuses.
const (
	ScheduleScheduled = "scheduled"
	ScheduleCompleted = "completed"
	ScheduleFailed    = "failed"
	ScheduleCancelled = "cancelled"
)

// ScheduledTransfer is a wallet send (or pot contribution) that will execute
// automatically at ExecuteAt. It was authorised with the owner's PIN at
// creation time; the sweeper runs it without asking again. A recurring
// (weekly/monthly) schedule advances ExecuteAt after each run.
type ScheduledTransfer struct {
	Base
	UserID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"userId"`
	AmountKobo int64      `gorm:"not null" json:"amountKobo"`
	Recipient  string     `json:"recipient,omitempty"` // email/phone or bank account number
	BankName   string     `json:"bankName,omitempty"`
	BankCode   string     `json:"bankCode,omitempty"`
	Note       string     `json:"note,omitempty"`
	// GroupID, when set, makes this a contribution into that pot instead of a
	// send to a person or bank account.
	GroupID    *uuid.UUID `gorm:"type:uuid;index" json:"groupId,omitempty"`
	ExecuteAt  time.Time  `gorm:"index;not null" json:"executeAt"`
	Cadence    string     `gorm:"not null;default:once" json:"cadence"` // once | weekly | monthly
	Status     string     `gorm:"not null;default:scheduled;index" json:"status"`
	Attempts   int        `gorm:"not null;default:0" json:"attempts"`
	LastError  string     `json:"lastError,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
}

// Support case statuses.
const (
	CaseOpen     = "open"
	CaseResolved = "resolved"
)

// SupportCase is a dispute escalated to customer support. It is visible to the
// member who raised it and to the pot's treasurers, so escalation has a paper
// trail on both sides.
type SupportCase struct {
	Base
	GroupID         uuid.UUID  `gorm:"type:uuid;index;not null" json:"groupId"`
	DisputeID       *uuid.UUID `gorm:"type:uuid;index" json:"disputeId,omitempty"`
	ExpenseRequestID *uuid.UUID `gorm:"type:uuid" json:"expenseRequestId,omitempty"`
	RaisedBy        uuid.UUID  `gorm:"type:uuid;index;not null" json:"raisedBy"`
	Subject         string     `gorm:"not null" json:"subject"`
	Detail          string     `json:"detail,omitempty"`
	Status          string     `gorm:"not null;default:open;index" json:"status"`
	ResolvedAt      *time.Time `json:"resolvedAt,omitempty"`
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
		&WalletTransaction{},
		&ChatMessage{},
		&ChatReadReceipt{},
		&Dispute{},
		&VerificationCode{},
		&Notification{},
		&ScheduledTransfer{},
		&SupportCase{},
	}
}
