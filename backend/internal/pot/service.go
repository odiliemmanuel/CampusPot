// Package pot is the CampusPot "treasurer engine". It owns the shared pot:
// groups, memberships, levies, payment reconciliation, the append-only ledger,
// and rule-based spending with co-signer approvals.
//
// It deliberately contains no HTTP or LLM code so the money logic stays easy
// to test and reason about.
package pot

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// Sentinel errors mapped to HTTP status codes by the controller.
var (
	ErrNotFound  = errors.New("not found")
	ErrForbidden = errors.New("forbidden")
	ErrConflict  = errors.New("conflict")
	ErrInvalid   = errors.New("invalid request")
)

// sandboxBVN is a synthetic BVN for sandbox onboarding only. It is never a
// real identity and must never be replaced with a real BVN.
const sandboxBVN = "22222222222"

// Service is the treasurer engine.
type Service struct {
	db    *gorm.DB
	cfg   *config.Config
	bmoni bmoni.Client
	now   func() time.Time
}

// NewService wires the engine's dependencies.
func NewService(db *gorm.DB, cfg *config.Config, client bmoni.Client) *Service {
	return &Service{db: db, cfg: cfg, bmoni: client, now: time.Now}
}

// appendLedger adds a ledger entry inside tx and returns the new balance.
// It is the only place that writes to the ledger, so every movement is
// balanced and auditable.
func (s *Service) appendLedger(tx *gorm.DB, e *models.LedgerEntry) error {
	current, err := balanceTx(tx, e.GroupID)
	if err != nil {
		return err
	}
	if e.Kind == models.LedgerCredit || e.Kind == models.LedgerOpening {
		current += e.AmountKobo
	} else {
		current -= e.AmountKobo
	}
	e.BalanceAfterKobo = current
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return tx.Create(e).Error
}

// balanceTx computes a group's balance from the ledger. Credits and demo
// opening floats increase the balance; debits decrease it.
func balanceTx(db *gorm.DB, groupID uuid.UUID) (int64, error) {
	var credit, debit int64
	if err := db.Model(&models.LedgerEntry{}).
		Where("group_id = ? AND kind IN ?", groupID, []string{models.LedgerCredit, models.LedgerOpening}).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&credit).Error; err != nil {
		return 0, err
	}
	if err := db.Model(&models.LedgerEntry{}).
		Where("group_id = ? AND kind = ?", groupID, models.LedgerDebit).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&debit).Error; err != nil {
		return 0, err
	}
	return credit - debit, nil
}

// Balance returns the current pot balance in kobo.
func (s *Service) Balance(_ context.Context, groupID uuid.UUID) (int64, error) {
	return balanceTx(s.db, groupID)
}

// membershipRole returns the caller's role in the group, or ErrForbidden.
func (s *Service) requireRole(groupID, userID uuid.UUID, roles ...models.Role) (*models.Membership, error) {
	var m models.Membership
	if err := s.db.Where("group_id = ? AND user_id = ?", groupID, userID).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrForbidden
		}
		return nil, err
	}
	if m.Status != models.MembershipActive {
		return nil, ErrForbidden
	}
	for _, r := range roles {
		if m.Role == r {
			return &m, nil
		}
	}
	return nil, ErrForbidden
}

const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateJoinCode() (string, error) {
	var b strings.Builder
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(joinCodeAlphabet))))
		if err != nil {
			return "", err
		}
		b.WriteByte(joinCodeAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// demoOpeningBalances are the random floats a freshly created pot may start
// with in a demo, so a brand-new pot is never empty and payouts can be
// approved and exercised straight away.
var demoOpeningBalances = []int64{
	int64(money.FromNaira(80_000)),
	int64(money.FromNaira(100_000)),
	int64(money.FromNaira(200_000)),
}

// randomOpeningBalance picks one of the demo opening floats at random.
func randomOpeningBalance() int64 {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(len(demoOpeningBalances))))
	if err != nil {
		return demoOpeningBalances[0]
	}
	return demoOpeningBalances[n.Int64()]
}

// shortRef is a human-quotable suffix derived from a UUID.
func shortRef(id uuid.UUID) string {
	s := strings.ToUpper(id.String())
	s = strings.ReplaceAll(s, "-", "")
	if len(s) > 6 {
		s = s[:6]
	}
	return s
}

// memberReference builds the per-member payment reference quoted on transfers.
func memberReference(joinCode string, userID uuid.UUID) string {
	return fmt.Sprintf("CP-%s-%s", joinCode, shortRef(userID))
}

// ErrToStr is a tiny helper used by the webhook layer to store errors.
func ErrToStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func timeNowPtr() *time.Time {
	t := time.Now()
	return &t
}
