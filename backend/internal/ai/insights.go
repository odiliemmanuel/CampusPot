package ai

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

func answerSnapshot(sum *pot.GroupSummary) string {
	return fmt.Sprintf("%s — current snapshot\nBalance: %s\nCollected: %s\nSpent: %s\nMembers: %d\nPending payouts: %d\nOpen disputes: %d",
		sum.GroupName,
		money.Kobo(sum.BalanceKobo).Format(),
		money.Kobo(sum.CollectedKobo).Format(),
		money.Kobo(sum.SpentKobo).Format(),
		sum.Members,
		sum.PendingExpenses,
		sum.OpenDisputes,
	)
}

func answerDeadline(group *models.Group, sum *pot.GroupSummary, now time.Time) string {
	var due *time.Time
	if sum.Levy != nil && sum.Levy.DueDate != nil {
		due = sum.Levy.DueDate
	} else if group.ContributionDueDate != nil {
		due = group.ContributionDueDate
	}
	if due == nil {
		return "This pot doesn't have a contribution deadline set. A treasurer can set one in Pot settings."
	}
	days := calendarDaysBetween(now, *due)
	dateLabel := due.Format("2 Jan 2006")
	if sum.Levy == nil {
		if days < 0 {
			return fmt.Sprintf("The configured pot deadline was %s (%d days ago). There isn't an open levy right now, so no current amount is outstanding.", dateLabel, -days)
		}
		return fmt.Sprintf("The configured pot deadline is %s (%s). There isn't an open levy right now, so I can't calculate a remaining contribution target.", dateLabel, relativeDays(days))
	}
	if sum.OutstandingKobo == 0 {
		return fmt.Sprintf("The %q contributions are fully collected. The deadline is %s.", sum.Levy.Title, dateLabel)
	}
	if days < 0 {
		return fmt.Sprintf("The %q deadline was %s (%d days ago). %s is still outstanding. Review Contributions to follow up.", sum.Levy.Title, dateLabel, -days, money.Kobo(sum.OutstandingKobo).Format())
	}
	if days == 0 {
		return fmt.Sprintf("The %q levy is due today. %s remains outstanding.", sum.Levy.Title, money.Kobo(sum.OutstandingKobo).Format())
	}
	perDay := int64(math.Ceil(float64(sum.OutstandingKobo) / float64(days)))
	return fmt.Sprintf("The %q levy is due %s (%s). %s remains outstanding, so the group needs to collect about %s per day to reach the target.", sum.Levy.Title, dateLabel, relativeDays(days), money.Kobo(sum.OutstandingKobo).Format(), money.Kobo(perDay).Format())
}

func answerSpending(sum *pot.GroupSummary, expenses []models.ExpenseRequest, payments []models.Payment, now time.Time) string {
	var spentCurrent, spentPrevious, contributionsCurrent, contributionsPrevious int64
	cutoff := now.AddDate(0, 0, -30)
	previousCutoff := now.AddDate(0, 0, -60)
	for _, expense := range expenses {
		if expense.Status != models.ExpenseCompleted {
			continue
		}
		at := expense.CreatedAt
		if expense.ExecutedAt != nil {
			at = *expense.ExecutedAt
		}
		switch {
		case !at.Before(cutoff) && !at.After(now):
			spentCurrent += expense.AmountKobo
		case !at.Before(previousCutoff) && at.Before(cutoff):
			spentPrevious += expense.AmountKobo
		}
	}
	for _, payment := range payments {
		if payment.Status != models.PaymentMatched && payment.Status != models.PaymentPartial {
			continue
		}
		switch {
		case !payment.CreatedAt.Before(cutoff) && !payment.CreatedAt.After(now):
			contributionsCurrent += payment.AmountKobo
		case !payment.CreatedAt.Before(previousCutoff) && payment.CreatedAt.Before(cutoff):
			contributionsPrevious += payment.AmountKobo
		}
	}
	return fmt.Sprintf("In the last 30 days, this pot recorded %s in completed payouts and %s in matched contributions. In the previous 30 days, it recorded %s in payouts and %s in contributions. Current balance: %s.",
		money.Kobo(spentCurrent).Format(), money.Kobo(contributionsCurrent).Format(),
		money.Kobo(spentPrevious).Format(), money.Kobo(contributionsPrevious).Format(), money.Kobo(sum.BalanceKobo).Format())
}

type recurringPattern struct {
	category string
	count    int
	average  int64
	cadence  string
}

func answerRecurring(expenses []models.ExpenseRequest) string {
	byCategory := make(map[string][]models.ExpenseRequest)
	for _, expense := range expenses {
		category := strings.TrimSpace(expense.Category)
		if expense.Status == models.ExpenseCompleted && category != "" {
			key := strings.ToLower(category)
			byCategory[key] = append(byCategory[key], expense)
		}
	}
	patterns := make([]recurringPattern, 0)
	for _, items := range byCategory {
		sort.Slice(items, func(i, j int) bool { return payoutDate(items[i]).Before(payoutDate(items[j])) })
		var weekly, monthly int
		for i := 1; i < len(items); i++ {
			days := payoutDate(items[i]).Sub(payoutDate(items[i-1])).Hours() / 24
			if days >= 5 && days <= 9 {
				weekly++
			}
			if days >= 25 && days <= 35 {
				monthly++
			}
		}
		cadence := ""
		if monthly > 0 {
			cadence = "monthly"
		} else if weekly > 0 {
			cadence = "weekly"
		}
		if cadence == "" {
			continue
		}
		count := monthly + 1
		if cadence == "weekly" {
			count = weekly + 1
		}
		if count > len(items) {
			count = len(items)
		}
		var total int64
		for _, item := range items[len(items)-count:] {
			total += item.AmountKobo
		}
		patterns = append(patterns, recurringPattern{category: items[len(items)-1].Category, count: count, average: total / int64(count), cadence: cadence})
	}
	if len(patterns) == 0 {
		return "I don't see a clear recurring payout pattern yet. I compare completed payouts by category and look for weekly or monthly intervals; more history may reveal one."
	}
	sort.Slice(patterns, func(i, j int) bool { return patterns[i].count > patterns[j].count })
	if len(patterns) > 3 {
		patterns = patterns[:3]
	}
	var b strings.Builder
	b.WriteString("Possible recurring payout patterns (review these before treating them as scheduled costs):\n")
	for _, pattern := range patterns {
		fmt.Fprintf(&b, "• %s: about %s, %s, seen %d times.\n", pattern.category, money.Kobo(pattern.average).Format(), pattern.cadence, pattern.count)
	}
	return strings.TrimSpace(b.String())
}

func answerPayouts(sum *pot.GroupSummary, expenses []models.ExpenseRequest) string {
	waitingCount := 0
	var lines []string
	for _, expense := range expenses {
		if expense.Status != models.ExpensePendingApproval && expense.Status != models.ExpenseApproved && expense.Status != models.ExpenseExecuting {
			continue
		}
		waitingCount++
		if len(lines) < 4 {
			label := strings.ReplaceAll(expense.Status, "_", " ")
			category := strings.TrimSpace(expense.Category)
			if category == "" {
				category = "Payout"
			}
			lines = append(lines, fmt.Sprintf("• %s — %s (%s)", category, money.Kobo(expense.AmountKobo).Format(), label))
		}
	}
	if len(lines) == 0 {
		return fmt.Sprintf("There are no payouts waiting for approval or execution. Available balance: %s.", money.Kobo(sum.BalanceKobo).Format())
	}
	return fmt.Sprintf("%d payout(s) are waiting for approval or execution:\n%s\nThese still follow the pot's approval process; I can't approve or send them.", waitingCount, strings.Join(lines, "\n"))
}

var amountInQuestion = regexp.MustCompile(`(?i)(₦|ngn)\s*([0-9][0-9,]*(\.[0-9]{1,2})?)\s*(k|thousand|m|million)?|([0-9][0-9,]*(\.[0-9]{1,2})?)\s*(k|thousand|m|million)?`)

func answerAffordability(question string, balanceKobo int64) string {
	match := amountInQuestion.FindStringSubmatch(question)
	if len(match) == 0 {
		return fmt.Sprintf("The pot currently has %s available. Tell me the payout amount and I'll compare it with the balance. Any payout still needs the group's approval.", money.Kobo(balanceKobo).Format())
	}
	amountText, suffix := match[2], match[4]
	if amountText == "" {
		amountText, suffix = match[5], match[7]
	}
	value, err := strconv.ParseFloat(strings.ReplaceAll(amountText, ",", ""), 64)
	if err != nil {
		return fmt.Sprintf("The pot currently has %s available. I couldn't read that payout amount; try a number such as ₦10,000.", money.Kobo(balanceKobo).Format())
	}
	switch strings.ToLower(suffix) {
	case "k", "thousand":
		value *= 1000
	case "m", "million":
		value *= 1000000
	}
	requested := int64(math.Round(value * 100))
	if requested <= 0 {
		return "Tell me a positive payout amount and I'll compare it with the available balance."
	}
	if requested <= balanceKobo {
		return fmt.Sprintf("Yes, the current balance of %s can cover %s, leaving about %s. That only checks the balance; the payout still needs the required approvals.", money.Kobo(balanceKobo).Format(), money.Kobo(requested).Format(), money.Kobo(balanceKobo-requested).Format())
	}
	return fmt.Sprintf("No. The current balance is %s, which is %s short of %s. The AI Treasurer won't create or send a payout.", money.Kobo(balanceKobo).Format(), money.Kobo(requested-balanceKobo).Format(), money.Kobo(requested).Format())
}

func payoutDate(expense models.ExpenseRequest) time.Time {
	if expense.ExecutedAt != nil {
		return *expense.ExecutedAt
	}
	return expense.CreatedAt
}

func calendarDaysBetween(now, due time.Time) int {
	now = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	due = time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, time.UTC)
	return int(due.Sub(now).Hours() / 24)
}

func relativeDays(days int) string {
	switch {
	case days < 0:
		return fmt.Sprintf("%d days overdue", -days)
	case days == 0:
		return "today"
	case days == 1:
		return "in 1 day"
	default:
		return fmt.Sprintf("in %d days", days)
	}
}
