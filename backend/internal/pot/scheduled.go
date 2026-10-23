package pot

// Scheduled and recurring wallet movements. A member authorises the stream
// once with their transaction PIN; the sweeper (see RunDueSchedules) then
// executes it on time without asking again. Two shapes exist:
//
//   - a send to another PotKeeper user or a bank account;
//   - a contribution into one of their pots (groupId set), which lands as a
//     real Payment exactly like a hand-made one.
//
// Cadence "once" completes after the first run; "weekly" and "monthly"
// advance ExecuteAt by one period and keep running until cancelled.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// maxScheduleAttempts is how many times a due transfer is retried before it
// is parked as failed (the owner is notified either way).
const maxScheduleAttempts = 3

// ScheduleTransferRequest creates a scheduled or recurring wallet movement.
type ScheduleTransferRequest struct {
	AmountKobo int64      `json:"amountKobo" binding:"required,gt=0"`
	Recipient  string     `json:"recipient"`  // email/phone or 10-digit account number
	BankName   string     `json:"bankName"`
	BankCode   string     `json:"bankCode"`
	Note       string     `json:"note"`
	GroupID    *uuid.UUID `json:"groupId"` // set => contribute into that pot
	ExecuteAt  *FlexTime  `json:"executeAt"`
	Cadence    string     `json:"cadence"` // once | weekly | monthly
	Pin        string     `json:"pin"`     // authorises every future run
}

// ScheduleView is a scheduled transfer shaped for the client.
type ScheduleView struct {
	ID         uuid.UUID  `json:"id"`
	AmountKobo int64      `json:"amountKobo"`
	Recipient  string     `json:"recipient,omitempty"`
	BankName   string     `json:"bankName,omitempty"`
	Note       string     `json:"note,omitempty"`
	GroupID    *uuid.UUID `json:"groupId,omitempty"`
	GroupName  string     `json:"groupName,omitempty"`
	ExecuteAt  time.Time  `json:"executeAt"`
	Cadence    string     `json:"cadence"`
	Status     string     `json:"status"`
	Attempts   int        `json:"attempts"`
	LastError  string     `json:"lastError,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}

// ScheduleTransfer validates and stores a scheduled movement. The PIN is
// checked now (authorising every future run) and the transfer limits are
// applied here too, so a schedule can never be used to bypass the caps.
func (s *Service) ScheduleTransfer(ctx context.Context, userID uuid.UUID, req ScheduleTransferRequest) (*ScheduleView, error) {
	if err := s.requireTransactionPin(userID, req.Pin); err != nil {
		return nil, err
	}
	if err := s.checkTransferLimits(userID, req.AmountKobo); err != nil {
		return nil, err
	}

	cadence := strings.TrimSpace(req.Cadence)
	if cadence == "" {
		cadence = "once"
	}
	if cadence != "once" && cadence != "weekly" && cadence != "monthly" {
		return nil, fmt.Errorf("%w: cadence must be once, weekly or monthly", ErrInvalid)
	}

	var executeAt time.Time
	if req.ExecuteAt != nil {
		executeAt = req.ExecuteAt.Time()
	}
	if executeAt.IsZero() {
		return nil, fmt.Errorf("%w: a run time is required", ErrInvalid)
	}
	if executeAt.Before(s.now().Add(-time.Minute)) {
		return nil, fmt.Errorf("%w: the run time must be in the future", ErrInvalid)
	}

	row := &models.ScheduledTransfer{
		UserID:     userID,
		AmountKobo: req.AmountKobo,
		BankName:   strings.TrimSpace(req.BankName),
		BankCode:   strings.TrimSpace(req.BankCode),
		Note:       strings.TrimSpace(req.Note),
		GroupID:    req.GroupID,
		ExecuteAt:  executeAt,
		Cadence:    cadence,
		Status:     models.ScheduleScheduled,
	}

	if req.GroupID != nil {
		// A contribution: the owner must be a member of that pot today, and
		// every future run re-checks membership before the money moves.
		if _, err := s.requireMember(*req.GroupID, userID); err != nil {
			return nil, err
		}
		row.Recipient = ""
		row.BankName = ""
		row.BankCode = ""
	} else {
		recipient := strings.TrimSpace(req.Recipient)
		if recipient == "" {
			return nil, fmt.Errorf("%w: a recipient is required", ErrInvalid)
		}
		row.Recipient = recipient
		// The destination must resolve NOW — a schedule that could never run
		// is worse than a refusal. The fresh check still happens at run time.
		if err := s.validateRecipient(ctx, userID, recipient, row.BankName, row.BankCode); err != nil {
			return nil, err
		}
	}

	if err := s.db.Create(row).Error; err != nil {
		return nil, err
	}
	_ = s.notifyMember(s.db, userID, req.GroupID, models.NotifySchedule,
		"Scheduled transfer created",
		fmt.Sprintf("%s %s on %s.", money.Kobo(row.AmountKobo).Format(), cadenceLabel(cadence),
			row.ExecuteAt.Format("2 Jan 2006 · 15:04")),
		"/account")
	return s.scheduleView(row), nil
}

// validateRecipient confirms a scheduled send destination resolves: a pot
// account (membership required), a bank account (name enquiry), or another
// PotKeeper user.
func (s *Service) validateRecipient(ctx context.Context, userID uuid.UUID, recipient, bankName, bankCode string) error {
	if len(recipient) == 10 && allDigits(recipient) {
		var group models.Group
		if err := s.db.Where("virtual_account_number = ?", recipient).First(&group).Error; err == nil {
			if _, err := s.requireMember(group.ID, userID); err != nil {
				return fmt.Errorf("only members of %s can pay into it — join the pot first", group.Name)
			}
			return nil
		}
	}
	if strings.TrimSpace(bankName) != "" || strings.TrimSpace(bankCode) != "" {
		_, err := s.VerifyBankAccount(ctx, userID, recipient, bankName, bankCode)
		return err
	}
	var match models.User
	err := s.db.Where("LOWER(email) = ?", strings.ToLower(recipient)).Or("phone = ?", recipient).First(&match).Error
	if err != nil {
		return fmt.Errorf("%w: no PotKeeper account matches %s — check the email or phone, or schedule to a bank account", ErrAccountNotFound, recipient)
	}
	if match.ID == userID {
		return fmt.Errorf("%w: you cannot send money to yourself", ErrInvalid)
	}
	return nil
}

// ListSchedules returns the caller's scheduled transfers, newest first.
func (s *Service) ListSchedules(_ context.Context, userID uuid.UUID) ([]ScheduleView, error) {
	var rows []models.ScheduledTransfer
	if err := s.db.Where("user_id = ?", userID).
		Order("execute_at ASC").Limit(200).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ScheduleView, 0, len(rows))
	for i := range rows {
		out = append(out, *s.scheduleView(&rows[i]))
	}
	return out, nil
}

// CancelSchedule stops a future run. Completed or already-failed transfers
// cannot be cancelled — there is nothing left to stop.
func (s *Service) CancelSchedule(_ context.Context, userID, id uuid.UUID) (*ScheduleView, error) {
	var row models.ScheduledTransfer
	if err := s.db.First(&row, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, ErrNotFound
	}
	if row.Status != models.ScheduleScheduled {
		return nil, fmt.Errorf("%w: this transfer is %s and can no longer be cancelled", ErrConflict, row.Status)
	}
	if err := s.db.Model(&row).Update("status", models.ScheduleCancelled).Error; err != nil {
		return nil, err
	}
	row.Status = models.ScheduleCancelled
	_ = s.notifyMember(s.db, userID, row.GroupID, models.NotifySchedule,
		"Scheduled transfer cancelled", money.Kobo(row.AmountKobo).Format()+" will no longer be sent.", "/account")
	return s.scheduleView(&row), nil
}

// RunDueSchedules executes every scheduled transfer whose moment has passed.
// It is called by the background sweeper (and directly by tests). Each row
// runs through the same money paths as a hand-made send, limits included.
func (s *Service) RunDueSchedules(ctx context.Context) (int, error) {
	var due []models.ScheduledTransfer
	if err := s.db.Where("status = ? AND execute_at <= ?", models.ScheduleScheduled, s.now()).
		Order("execute_at ASC").Limit(50).Find(&due).Error; err != nil {
		return 0, err
	}
	run := 0
	for i := range due {
		if s.runSchedule(ctx, &due[i]) {
			run++
		}
	}
	return run, nil
}

// runSchedule executes one due transfer and reports whether money moved.
func (s *Service) runSchedule(ctx context.Context, row *models.ScheduledTransfer) bool {
	// Re-check limits at run time: a schedule authorised last week cannot
	// push today's velocity over the cap.
	if err := s.checkTransferLimits(row.UserID, row.AmountKobo); err != nil {
		return s.failSchedule(row, err.Error())
	}

	var execErr error
	if row.GroupID != nil {
		// Re-check membership at run time — the owner may have left the pot.
		if _, err := s.requireMember(*row.GroupID, row.UserID); err != nil {
			return s.failSchedule(row, "no longer a member of the pot")
		}
		_, execErr = s.payPotTxTx(row.UserID, *row.GroupID, row.AmountKobo)
	} else {
		execErr = s.transferFunds(ctx, row.UserID, WalletTransferRequest{
			AmountKobo: row.AmountKobo,
			Recipient:  row.Recipient,
			BankName:   row.BankName,
			BankCode:   row.BankCode,
			Note:       row.Note,
		})
	}
	if execErr != nil {
		row.Attempts++
		if row.Attempts >= maxScheduleAttempts {
			return s.failSchedule(row, execErr.Error())
		}
		_ = s.db.Model(row).Updates(map[string]interface{}{
			"attempts": row.Attempts, "last_error": execErr.Error(),
		}).Error
		return false
	}

	now := s.now()
	if row.Cadence == "once" {
		if err := s.db.Model(row).Updates(map[string]interface{}{
			"status":       models.ScheduleCompleted,
			"completed_at": &now,
			"attempts":     row.Attempts,
			"last_error":   "",
		}).Error; err != nil {
			return false
		}
		_ = s.notifyMember(s.db, row.UserID, row.GroupID, models.NotifySchedule,
			"Scheduled transfer sent",
			money.Kobo(row.AmountKobo).Format()+" was sent as scheduled.", "/account")
		return true
	}

	// Recurring: advance the next run and keep the schedule alive.
	next := advanceCadence(row.ExecuteAt, row.Cadence)
	if err := s.db.Model(row).Updates(map[string]interface{}{
		"execute_at": next, "attempts": row.Attempts, "last_error": "",
	}).Error; err != nil {
		return false
	}
	row.ExecuteAt = next
	_ = s.notifyMember(s.db, row.UserID, row.GroupID, models.NotifySchedule,
		"Recurring transfer sent",
		fmt.Sprintf("%s was sent — %s. Next run: %s.",
			money.Kobo(row.AmountKobo).Format(), cadenceLabel(row.Cadence),
			next.Format("2 Jan 2006")), "/account")
	return true
}

// failSchedule parks a transfer as failed and tells its owner why.
func (s *Service) failSchedule(row *models.ScheduledTransfer, reason string) bool {
	now := s.now()
	_ = s.db.Model(row).Updates(map[string]interface{}{
		"status": models.ScheduleFailed, "last_error": reason, "completed_at": &now,
	}).Error
	_ = s.notifyMember(s.db, row.UserID, row.GroupID, models.NotifySchedule,
		"Scheduled transfer failed",
		fmt.Sprintf("%s could not be sent: %s", money.Kobo(row.AmountKobo).Format(), reason),
		"/account")
	return false
}

// advanceCadence moves a recurring run one period forward from its previous
// time, keeping the original hour-of-day.
func advanceCadence(from time.Time, cadence string) time.Time {
	switch cadence {
	case "weekly":
		return from.AddDate(0, 0, 7)
	case "monthly":
		return addMonthsClamped(from, 1)
	default:
		return from
	}
}

func cadenceLabel(cadence string) string {
	switch cadence {
	case "weekly":
		return "every week"
	case "monthly":
		return "every month"
	default:
		return "once"
	}
}

func (s *Service) scheduleView(row *models.ScheduledTransfer) *ScheduleView {
	v := &ScheduleView{
		ID: row.ID, AmountKobo: row.AmountKobo, Recipient: row.Recipient,
		BankName: row.BankName, Note: row.Note, GroupID: row.GroupID,
		ExecuteAt: row.ExecuteAt, Cadence: row.Cadence, Status: row.Status,
		Attempts: row.Attempts, LastError: row.LastError, CreatedAt: row.CreatedAt,
	}
	if row.GroupID != nil {
		var g models.Group
		if err := s.db.Select("name").First(&g, "id = ?", *row.GroupID).Error; err == nil {
			v.GroupName = g.Name
		}
	}
	return v
}

