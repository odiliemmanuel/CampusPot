package pot

// Per-cycle contribution journals. A recurring pot (daily, weekly, monthly)
// advances one levy per period; each levy is therefore one period's book.
// These helpers open that book: the period itself, every contribution paid
// into it (with who paid, how much, when and by which route), and the pot's
// closing balance once the period is settled.
//
// One-time (goal) pots get a single journal too — the ledger still reads as
// one book, which is exactly what a treasurer wants to show at the end.

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// JournalPayment is one contribution line inside a cycle's journal.
type JournalPayment struct {
	ID         uuid.UUID  `json:"id"`
	UserID     *uuid.UUID `json:"userId,omitempty"`
	PayerName  string     `json:"payerName,omitempty"`
	AmountKobo int64      `json:"amountKobo"`
	Status     string     `json:"status"`
	Method     string     `json:"method,omitempty"` // reference | payer_name | wallet | manual
	Refunded   bool       `json:"refunded"`
	CreatedAt  time.Time  `json:"createdAt"`
}

// JournalRow is one member's line in a cycle's journal.
type JournalRow struct {
	UserID     uuid.UUID        `json:"userId"`
	Name       string           `json:"name"`
	Reference  string           `json:"reference"`
	State      string           `json:"state"` // paid | partial | unpaid
	PaidKobo   int64            `json:"paidKobo"`
	AmountKobo int64            `json:"amountKobo"`
	Payments   []JournalPayment `json:"payments"`
}

// ContributionJournal is one period's book: the levy that defines it, every
// payment made into it, and the position of each member.
type ContributionJournal struct {
	LevyID              uuid.UUID        `json:"levyId"`
	Title               string           `json:"title"`
	Status              string           `json:"status"`  // open | closed
	Cadence             string           `json:"cadence"` // one_time | daily | weekly | monthly | quarterly
	PeriodLabel         string           `json:"periodLabel"`
	DueDate             *time.Time       `json:"dueDate,omitempty"`
	AmountKobo          int64            `json:"amountKobo"` // what each member owes this period
	CollectedKobo       int64            `json:"collectedKobo"`
	ExpectedKobo        int64            `json:"expectedKobo"`
	PaidCount           int              `json:"paidCount"`
	PartialCount        int              `json:"partialCount"`
	UnpaidCount         int              `json:"unpaidCount"`
	ClosingBalanceKobo  int64            `json:"closingBalanceKobo"`
	CreatedAt           time.Time        `json:"createdAt"`
	Rows                []JournalRow     `json:"rows"`
	Payments            []JournalPayment `json:"payments"` // everything, flat, for the audit view
}

// ContributionJournals returns every cycle's journal for a pot, oldest first,
// so the list reads like a ledger book. Members may read any journal of their
// own pot — the pot is transparent to everyone in it.
func (s *Service) ContributionJournals(_ context.Context, groupID, actorID uuid.UUID) ([]ContributionJournal, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	var levies []models.Levy
	if err := s.db.Where("group_id = ?", groupID).Order("created_at ASC").Find(&levies).Error; err != nil {
		return nil, err
	}

	members, err := s.activeMembers(groupID)
	if err != nil {
		return nil, err
	}

	// One pass for every payment in the pot, to keep this a handful of queries.
	var all []models.Payment
	if err := s.db.Where("group_id = ?", groupID).Order("created_at ASC").Find(&all).Error; err != nil {
		return nil, err
	}
	paymentsByLevy := map[uuid.UUID][]models.Payment{}
	for _, p := range all {
		if p.LevyID != nil {
			paymentsByLevy[*p.LevyID] = append(paymentsByLevy[*p.LevyID], p)
		}
	}

	balanceAfter, err := s.ledgerBalanceByLevy(all)
	if err != nil {
		return nil, err
	}

	out := make([]ContributionJournal, 0, len(levies))
	for _, levy := range levies {
		out = append(out, *s.buildJournal(&group, &levy, members, paymentsByLevy[levy.ID], balanceAfter[levy.ID]))
	}
	return out, nil
}

// ContributionJournal returns a single cycle's journal in full.
func (s *Service) ContributionJournal(_ context.Context, groupID, levyID, actorID uuid.UUID) (*ContributionJournal, error) {
	if _, err := s.requireMember(groupID, actorID); err != nil {
		return nil, err
	}
	var group models.Group
	if err := s.db.First(&group, "id = ?", groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	var levy models.Levy
	if err := s.db.First(&levy, "id = ? AND group_id = ?", levyID, groupID).Error; err != nil {
		return nil, ErrNotFound
	}
	members, err := s.activeMembers(groupID)
	if err != nil {
		return nil, err
	}
	var payments []models.Payment
	if err := s.db.Where("group_id = ? AND levy_id = ?", groupID, levyID).
		Order("created_at ASC").Find(&payments).Error; err != nil {
		return nil, err
	}
	balanceAfter, err := s.ledgerBalanceByLevy(payments)
	if err != nil {
		return nil, err
	}
	return s.buildJournal(&group, &levy, members, payments, balanceAfter[levyID]), nil
}

// activeMembers loads a pot's active memberships with user names.
func (s *Service) activeMembers(groupID uuid.UUID) ([]models.Membership, error) {
	var members []models.Membership
	err := s.db.Preload("User").
		Where("group_id = ? AND status = ?", groupID, models.MembershipActive).
		Order("joined_at ASC, created_at ASC").Find(&members).Error
	return members, err
}

// ledgerBalanceByLevy maps each levy id to the pot's balance right after that
// levy's last credited contribution — the period's closing balance.
func (s *Service) ledgerBalanceByLevy(payments []models.Payment) (map[uuid.UUID]int64, error) {
	out := map[uuid.UUID]int64{}
	var ids []uuid.UUID
	byEntry := map[uuid.UUID]uuid.UUID{}
	for _, p := range payments {
		if p.LevyID == nil || p.LedgerEntryID == nil || p.Status == models.PaymentRefunded {
			continue
		}
		ids = append(ids, *p.LedgerEntryID)
		byEntry[*p.LedgerEntryID] = *p.LevyID
	}
	if len(ids) == 0 {
		return out, nil
	}
	var entries []models.LedgerEntry
	if err := s.db.Where("id IN ?", ids).Order("created_at ASC").Find(&entries).Error; err != nil {
		return nil, err
	}
	for _, e := range entries {
		out[byEntry[e.ID]] = e.BalanceAfterKobo // last one wins — the closing figure
	}
	return out, nil
}

// buildJournal assembles one cycle's journal from its pieces.
func (s *Service) buildJournal(group *models.Group, levy *models.Levy,
	members []models.Membership, payments []models.Payment, closing int64) *ContributionJournal {

	j := &ContributionJournal{
		LevyID:             levy.ID,
		Title:              levy.Title,
		Status:             levy.Status,
		Cadence:            group.ContributionFrequency,
		PeriodLabel:        periodLabel(group.ContributionFrequency, levy),
		DueDate:            levy.DueDate,
		AmountKobo:         levy.AmountKobo,
		ExpectedKobo:       levy.AmountKobo * int64(len(members)),
		ClosingBalanceKobo: closing,
		CreatedAt:          levy.CreatedAt,
		Rows:               []JournalRow{},
		Payments:           []JournalPayment{},
	}

	paid := map[uuid.UUID]int64{}
	byUser := map[uuid.UUID][]JournalPayment{}
	for _, p := range payments {
		jp := JournalPayment{
			ID: p.ID, UserID: p.UserID, PayerName: p.PayerName,
			AmountKobo: p.AmountKobo, Status: p.Status,
			Method: p.MatchedBy, Refunded: p.Status == models.PaymentRefunded,
			CreatedAt: p.CreatedAt,
		}
		j.Payments = append(j.Payments, jp)
		if p.Status == models.PaymentRefunded {
			continue // refunded money no longer counts toward this period
		}
		j.CollectedKobo += p.AmountKobo
		if p.UserID != nil {
			paid[*p.UserID] += p.AmountKobo
			byUser[*p.UserID] = append(byUser[*p.UserID], jp)
		}
	}

	for _, m := range members {
		paidKobo := paid[m.UserID]
		row := JournalRow{
			UserID: m.UserID, Reference: m.Reference,
			PaidKobo: paidKobo, AmountKobo: levy.AmountKobo,
			Payments: byUser[m.UserID],
		}
		if row.Payments == nil {
			row.Payments = []JournalPayment{}
		}
		if m.User != nil {
			row.Name = m.User.Name
		}
		switch {
		case paidKobo <= 0:
			row.State = "unpaid"
			j.UnpaidCount++
		case paidKobo < levy.AmountKobo:
			row.State = "partial"
			j.PartialCount++
		default:
			row.State = "paid"
			j.PaidCount++
		}
		j.Rows = append(j.Rows, row)
	}
	return j
}

// periodLabel names a cycle the way a member would say it: the day for a
// daily pot, the week for a weekly one, the month for a monthly pot.
func periodLabel(cadence string, levy *models.Levy) string {
	date := levy.CreatedAt
	if levy.DueDate != nil {
		date = *levy.DueDate
	}
	switch cadence {
	case "daily":
		return date.Format("Mon 2 Jan 2006")
	case "weekly":
		start := date.AddDate(0, 0, -int(date.Weekday()))
		return "week of " + start.Format("2 Jan 2006")
	case "monthly":
		return date.Format("Jan 2006")
	case "quarterly":
		q := (int(date.Month())-1)/3 + 1
		return fmt.Sprintf("Q%d %d", q, date.Year())
	default:
		return "collection · " + date.Format("2 Jan 2006")
	}
}
