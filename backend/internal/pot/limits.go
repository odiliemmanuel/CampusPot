package pot

// Wallet movement limits. Two independent gates run on every debit out of a
// wallet (sends, scheduled transfers, wallet-funded contributions):
//
//   - the owner must have verified their email address, so a stolen session
//     alone cannot drain a brand-new account;
//   - KYC state and a rolling per-day velocity cap decide how much can move.
//     Unverified accounts stay small on purpose; identity verification raises
//     the cap to the account's daily ceiling.
//
// The caps are enforced in one place (checkTransferLimits) so every send
// path — one-off, scheduled, pot payment — is covered identically.

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// Daily send ceilings in kobo.
const (
	// unverifiedKYCDailyCap is the rolling per-day cap before identity
	// verification: ₦50,000.
	unverifiedKYCDailyCap int64 = 5_000_000
	// verifiedDailyCap is the rolling per-day cap after KYC: ₦1,000,000.
	verifiedDailyCap int64 = 100_000_000
)

// checkTransferLimits authorises a wallet debit of amountKobo for userID.
// It refuses spends from unverified-email accounts, spends above the
// account's single-transaction cap, and spends that would push the account
// over its per-day velocity ceiling.
func (s *Service) checkTransferLimits(userID uuid.UUID, amountKobo int64) error {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return ErrNotFound
	}
	if !user.EmailVerified {
		return fmt.Errorf("%w: verify your email address before moving money — open the code we emailed you in Settings", ErrForbidden)
	}

	cap := unverifiedKYCDailyCap
	capLabel := "unverified"
	if user.KYCStatus == models.KYCVerified {
		cap = verifiedDailyCap
		capLabel = "verified"
	}

	if amountKobo > cap {
		return fmt.Errorf("%w: one send cannot exceed %s for a %s account — verify your identity to raise the limit",
			ErrInvalid, money.Kobo(cap).Format(), capLabel)
	}

	// Rolling per-day velocity: everything already out of the wallet today.
	dayStart := startOfUTCDay(s.now())
	var spentToday int64
	if err := s.db.Model(&models.WalletTransaction{}).
		Where("user_id = ? AND kind IN ? AND created_at >= ?",
			userID, []string{models.WalletTransferOut, models.WalletPotPayment}, dayStart).
		Select("COALESCE(SUM(amount_kobo),0)").Scan(&spentToday).Error; err != nil {
		return err
	}
	if spentToday+amountKobo > cap {
		return fmt.Errorf("%w: that is %s out of your wallet today — the limit is %s a day for a %s account. Try again tomorrow or verify your identity",
			ErrInvalid, money.Kobo(spentToday+amountKobo).Format(), money.Kobo(cap).Format(), capLabel)
	}
	return nil
}

// startOfUTCDay truncates to midnight UTC so the velocity window is stable
// regardless of the server's local timezone.
func startOfUTCDay(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}
