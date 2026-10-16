// Package ai is PotKeeper's "AI treasurer". It answers questions about a pot
// in plain English or Pidgin, drafts member reminders, and narrates risk flags.
//
// Design rule: the AI only ever READS. It calls the pot engine's read-only
// queries and turns the numbers into language. It never moves money, and it
// never decides risk — it explains a decision the deterministic engine made.
package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

// Service implements the AI treasurer.
type Service struct {
	db   *gorm.DB
	pots *pot.Service
	cfg  *config.Config
	llm  *llmClient
}

// NewService builds the AI treasurer.
func NewService(db *gorm.DB, pots *pot.Service, cfg *config.Config) *Service {
	var client *llmClient
	if !cfg.UseRuleBasedAI() {
		client = newLLMClient(cfg.AIBaseURL, cfg.AIAPIKey, cfg.AIModel)
	}
	return &Service{db: db, pots: pots, cfg: cfg, llm: client}
}

// AnswerResponse is what the assistant endpoint returns.
type AnswerResponse struct {
	Answer string      `json:"answer"`
	Intent string      `json:"intent"`
	Data   interface{} `json:"data,omitempty"`
}

// Answer routes a free-text question to the right read-only query and returns
// a natural-language answer.
func (s *Service) Answer(ctx context.Context, groupID, actorID uuid.UUID, question string) (*AnswerResponse, error) {
	group, err := s.pots.GetGroup(ctx, groupID, actorID)
	if err != nil {
		return nil, err
	}

	switch intentOf(question) {
	case intentOutstanding:
		outstanding, levy, err := s.pots.WhoHasntPaid(ctx, groupID, nil)
		if err != nil {
			return nil, err
		}
		answer := s.renderOutstanding(ctx, group, outstanding, levy)
		return &AnswerResponse{Answer: answer, Intent: "outstanding", Data: outstanding}, nil

	case intentRemind:
		outstanding, levy, err := s.pots.WhoHasntPaid(ctx, groupID, nil)
		if err != nil {
			return nil, err
		}
		var b strings.Builder
		b.WriteString(s.renderOutstanding(ctx, group, outstanding, levy))
		if len(outstanding) > 0 {
			b.WriteString("\n\nDrafts you can send:\n")
			for i, o := range outstanding {
				if i >= 3 {
					break
				}
				b.WriteString(fmt.Sprintf("• %s: \"%s\"\n", o.Name, draftFor(o, "friendly")))
			}
		}
		return &AnswerResponse{Answer: b.String(), Intent: "remind", Data: outstanding}, nil

	default:
		sum, err := s.pots.Summary(ctx, groupID, nil)
		if err != nil {
			return nil, err
		}
		answer := s.renderSummary(ctx, sum)
		extra := "Ask me: \"Who hasn't paid?\" or \"Draft reminders for the excursion levy.\""
		return &AnswerResponse{
			Answer: answer + "\n\n" + extra,
			Intent: "summary",
			Data:   sum,
		}, nil
	}
}

// renderOutstanding formats the unpaid list, optionally via the LLM.
func (s *Service) renderOutstanding(_ context.Context, group *models.Group, outstanding []pot.OutstandingMember, levy *models.Levy) string {
	if len(outstanding) == 0 {
		if levy == nil {
			return "There is no open levy right now, so there is nothing to track."
		}
		return fmt.Sprintf("Everyone has paid the %q levy. Nothing outstanding. 🎉", levy.Title)
	}

	var b strings.Builder
	title := "the current levy"
	if levy != nil {
		title = fmt.Sprintf("%q (%s each)", levy.Title, money.Kobo(levy.AmountKobo).Format())
	}
	b.WriteString(fmt.Sprintf("%d member(s) still owing on %s in %s:\n", len(outstanding), title, group.Name))
	var total int64
	for _, o := range outstanding {
		total += o.OutstandingKobo
		tag := ""
		switch o.State {
		case "partial":
			tag = fmt.Sprintf(" (part-paid, %s left)", money.Kobo(o.OutstandingKobo).Format())
		default:
			tag = fmt.Sprintf(" (%s)", money.Kobo(o.OutstandingKobo).Format())
		}
		b.WriteString(fmt.Sprintf("• %s%s\n", nonEmpty(o.Name, "Unnamed member"), tag))
	}
	b.WriteString(fmt.Sprintf("\nTotal outstanding: %s.", money.Kobo(total).Format()))
	return b.String()
}

// renderSummary formats the pot summary.
func (s *Service) renderSummary(_ context.Context, sum *pot.GroupSummary) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("%s — weekly summary\n", sum.GroupName))
	b.WriteString(fmt.Sprintf("Collected: %s\n", money.Kobo(sum.CollectedKobo).Format()))
	b.WriteString(fmt.Sprintf("Spent: %s\n", money.Kobo(sum.SpentKobo).Format()))
	b.WriteString(fmt.Sprintf("Balance: %s\n", money.Kobo(sum.BalanceKobo).Format()))
	if sum.Levy != nil {
		b.WriteString(fmt.Sprintf("Levy: %q\n", sum.Levy.Title))
		b.WriteString(fmt.Sprintf("Paid: %d/%d, partial: %d, outstanding: %d (%s)\n",
			sum.PaidCount, sum.Members, sum.PartialCount, sum.OutstandingCount,
			money.Kobo(sum.OutstandingKobo).Format()))
	}
	b.WriteString(fmt.Sprintf("Expenses awaiting approval: %d", sum.PendingExpenses))
	return b.String()
}

// DraftReminder creates a draft reminder for one member and stores it. The
// treasurer must confirm sending — the AI never messages anyone directly.
func (s *Service) DraftReminder(ctx context.Context, groupID, actorID, memberID uuid.UUID, tone string) (*models.Reminder, error) {
	if _, err := s.pots.GetGroup(ctx, groupID, actorID); err != nil {
		return nil, err
	}
	outstanding, levy, err := s.pots.WhoHasntPaid(ctx, groupID, nil)
	if err != nil {
		return nil, err
	}
	var target *pot.OutstandingMember
	for i := range outstanding {
		if outstanding[i].UserID == memberID {
			target = &outstanding[i]
			break
		}
	}
	if target == nil {
		return nil, fmt.Errorf("%w: that member has nothing outstanding", pot.ErrNotFound)
	}

	if tone == "" {
		tone = "friendly"
	}
	message := draftFor(*target, tone)
	if s.llm != nil {
		if crafted, err := s.llm.DraftReminder(ctx, nonEmpty(target.Name, "there"), levy, target, tone); err == nil && crafted != "" {
			message = crafted
		}
	}

	reminder := &models.Reminder{
		GroupID: groupID,
		UserID:  &memberID,
		Channel: "whatsapp",
		Message: message,
		Status:  "draft",
	}
	if levy != nil {
		reminder.LevyID = &levy.ID
	}
	if err := s.db.Create(reminder).Error; err != nil {
		return nil, err
	}
	return reminder, nil
}

// ListReminders returns the group's reminders.
func (s *Service) ListReminders(ctx context.Context, groupID, actorID uuid.UUID) ([]models.Reminder, error) {
	if _, err := s.pots.GetGroup(ctx, groupID, actorID); err != nil {
		return nil, err
	}
	var reminders []models.Reminder
	err := s.db.Where("group_id = ?", groupID).Order("created_at DESC").Find(&reminders).Error
	return reminders, err
}

// SendReminder marks a drafted reminder as sent. This is the explicit human
// confirmation step; the AI only drafts.
func (s *Service) SendReminder(ctx context.Context, groupID, reminderID, actorID uuid.UUID) (*models.Reminder, error) {
	if _, err := s.pots.GetGroup(ctx, groupID, actorID); err != nil {
		return nil, err
	}
	var reminder models.Reminder
	if err := s.db.First(&reminder, "id = ? AND group_id = ?", reminderID, groupID).Error; err != nil {
		return nil, pot.ErrNotFound
	}
	now := timeNow()
	if err := s.db.Model(&reminder).Updates(map[string]interface{}{
		"status": "sent", "sent_at": &now,
	}).Error; err != nil {
		return nil, err
	}
	return &reminder, nil
}

// ExplainRisk narrates a spend request's risk reasons.
func (s *Service) ExplainRisk(expense *models.ExpenseRequest) string {
	reasons := decodeReasons(expense.RiskReasons)
	if len(reasons) == 0 {
		return fmt.Sprintf("This %s withdrawal looks routine — no red flags.", money.Kobo(expense.AmountKobo).Format())
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("Heads up on this %s withdrawal (risk: %s):\n", expense.RiskLevel, expense.RiskLevel))
	for _, r := range reasons {
		b.WriteString("• " + r + "\n")
	}
	b.WriteString("That is why it needs co-signer approval before it can run.")
	return b.String()
}

func draftFor(o pot.OutstandingMember, tone string) string {
	amount := money.Kobo(o.OutstandingKobo).Format()
	switch tone {
	case "firm":
		return fmt.Sprintf("Hi %s, the %s levy is still outstanding on your side (%s). Please settle it today so we can close it. Thank you.", o.Name, "group", amount)
	case "gentle":
		return fmt.Sprintf("Hey %s, just a gentle nudge about the outstanding %s on the group levy. No rush, but whenever you can 🙏", o.Name, amount)
	default:
		return fmt.Sprintf("Hi %s 👋 Friendly reminder that your group levy has an outstanding balance of %s. Kindly pay using your reference %s. Thank you!", o.Name, amount, o.Reference)
	}
}

func intentOf(q string) string {
	l := strings.ToLower(q)
	switch {
	case containsAny(l, "hasn't paid", "hasnt paid", "not paid", "outstanding", "who has not", "owing", "who owes", "debt", "unpaid"):
		return intentOutstanding
	case containsAny(l, "remind", "reminder", "chase", "nudge", "draft"):
		return intentRemind
	default:
		return intentSummary
	}
}

const (
	intentOutstanding = "outstanding"
	intentRemind      = "remind"
	intentSummary     = "summary"
)

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func nonEmpty(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
