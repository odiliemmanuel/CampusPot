package auth

// Email verification, referral rewards, password reset and KYC live here.
//
// Security model:
//   - Verification codes are 6 digits, stored only as a SHA-256 hash, expire
//     after CodeTTLMinutes and are consumed on first use. Issuing a new code
//     invalidates the previous one for that purpose.
//   - A referral bonus is paid only once the referred account proves it owns
//     the email address, so nobody can farm bonuses with throwaway sign-ups.
//   - KYC runs through B Moni's Nigeria onboarding; until it passes, the pot
//     engine caps how much the wallet can send (see internal/pot limits).

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// CodeTTLMinutes is how long an emailed verification code stays usable.
const CodeTTLMinutes = 5

// Referral rewards, in kobo. The referrer earns a bonus for each verified
// invitee; the invitee gets a little extra welcome balance on top of the
// standard demo balance.
const (
	referralRewardKobo  int64 = 100_000 // ₦1,000 to the referrer
	referralWelcomeKobo int64 = 50_000  // ₦500 to the new account
)

// ErrInvalidCode is returned when a submitted code does not match, is expired
// or was already used. The three cases are deliberately indistinguishable.
var ErrInvalidCode = errors.New("that code is incorrect or has expired")

// ErrCodeRequired means KYC (or another gated action) needs verification first.
var ErrCodeRequired = errors.New("verification required")

const otpAlphabet = "0123456789"

// generateOTP returns a random 6-digit code.
func generateOTP() (string, error) {
	var b strings.Builder
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(otpAlphabet))))
		if err != nil {
			return "", err
		}
		b.WriteByte(otpAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// generateReferralCode returns a short, human-typable code with ambiguous
// characters (0/O, 1/I) removed.
func generateReferralCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	var b strings.Builder
	for i := 0; i < 8; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		b.WriteByte(alphabet[n.Int64()])
	}
	return b.String(), nil
}

// hashOTP binds a code to its email and purpose, so a code issued for one
// purpose (or one address) can never be replayed against another.
func hashOTP(email, purpose, code string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(email) + "|" + purpose + "|" + code))
	return hex.EncodeToString(sum[:])
}

// issueCode stores a fresh code for the user and emails it. Any earlier
// unconsumed code for the same purpose is consumed first, so only the latest
// code works. It returns the plaintext code and its expiry — the plaintext is
// needed by the caller only in log-email (dev) mode.
func (s *Service) issueCode(userID uuid.UUID, email, purpose, headline string) (string, time.Time, error) {
	code, err := generateOTP()
	if err != nil {
		return "", time.Time{}, err
	}
	expires := s.now().Add(time.Minute * CodeTTLMinutes)

	err = s.db.Transaction(func(tx *gorm.DB) error {
		now := s.now()
		if err := tx.Model(&models.VerificationCode{}).
			Where("email = ? AND purpose = ? AND consumed_at IS NULL", strings.ToLower(email), purpose).
			Update("consumed_at", &now).Error; err != nil {
			return err
		}
		return tx.Create(&models.VerificationCode{
			UserID:    userID,
			Email:     strings.ToLower(email),
			Hash:      hashOTP(email, purpose, code),
			Purpose:   purpose,
			ExpiresAt: expires,
		}).Error
	})
	if err != nil {
		return "", time.Time{}, err
	}

	subject := "Your PotKeeper verification code"
	if purpose == models.CodePurposeReset {
		subject = "Reset your PotKeeper password"
	}
	if err := s.mail.Send(context.Background(), email, subject,
		verificationBody(headline, code)); err != nil {
		// A mail hiccup must not break the flow: the code is stored, and the
		// client can ask for a resend.
		log.Printf("auth: verification email to %s failed: %v", email, err)
	}
	return code, expires, nil
}

// verificationBody renders the code email.
func verificationBody(headline, code string) string {
	return fmt.Sprintf(`<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5FF;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <h2 style="color:#4c1d95;margin:0 0 8px">PotKeeper</h2>
    <p style="color:#475569;font-size:14px">%s</p>
    <p style="font-size:34px;letter-spacing:10px;font-weight:700;color:#4c1d95;text-align:center;background:#f5f3ff;border-radius:12px;padding:16px">%s</p>
    <p style="color:#94a3b8;font-size:12px">This code expires in %d minutes. If you did not request it, ignore this email.</p>
  </div>
</body></html>`, headline, code, CodeTTLMinutes)
}

// SendVerification emails a fresh sign-up verification code. It is called at
// registration and again when the user asks for a resend.
func (s *Service) SendVerification(_ context.Context, email string) (*SendOTPResponse, error) {
	var user models.User
	if err := s.db.First(&user, "LOWER(email) = ?", strings.ToLower(strings.TrimSpace(email))).Error; err != nil {
		// Never reveal whether the address exists.
		return &SendOTPResponse{Sent: true}, nil
	}
	if user.EmailVerified {
		return &SendOTPResponse{Sent: true}, nil
	}
	code, expires, err := s.issueCode(user.ID, user.Email, models.CodePurposeSignup, "Confirm your email address to secure your account.")
	if err != nil {
		return nil, err
	}
	resp := &SendOTPResponse{Sent: true, Expires: expires.Format(time.RFC3339)}
	// Log-email mode (no SMTP configured): surface the code so the demo can
	// complete verification without a mail server. Never in production.
	if s.mail.IsLog() && !s.cfg.IsProduction() {
		resp.DevCode = code
	}
	return resp, nil
}

// RequestPasswordReset emails a reset code. Unknown addresses are treated
// exactly like known ones so the endpoint cannot be used to enumerate users.
func (s *Service) RequestPasswordReset(_ context.Context, email string) (*SendOTPResponse, error) {
	var user models.User
	if err := s.db.First(&user, "LOWER(email) = ?", strings.ToLower(strings.TrimSpace(email))).Error; err != nil {
		return &SendOTPResponse{Sent: true}, nil
	}
	code, expires, err := s.issueCode(user.ID, user.Email, models.CodePurposeReset, "Use this code to reset your PotKeeper password.")
	if err != nil {
		return nil, err
	}
	resp := &SendOTPResponse{Sent: true, Expires: expires.Format(time.RFC3339)}
	if s.mail.IsLog() && !s.cfg.IsProduction() {
		resp.DevCode = code
	}
	return resp, nil
}

// verifyCode consumes the newest valid code for the email/purpose pair and
// returns the user it belongs to.
func (s *Service) verifyCode(email, purpose, code string) (*models.User, error) {
	var rec models.VerificationCode
	err := s.db.
		Where("email = ? AND purpose = ? AND hash = ? AND consumed_at IS NULL AND expires_at > ?",
			strings.ToLower(email), purpose, hashOTP(email, purpose, code), s.now()).
		Order("created_at DESC").First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrInvalidCode
	}
	if err != nil {
		return nil, err
	}
	now := s.now()
	consumed := s.db.Model(&models.VerificationCode{}).
		Where("id = ? AND consumed_at IS NULL", rec.ID).
		Update("consumed_at", &now)
	if consumed.Error != nil {
		return nil, consumed.Error
	}
	if consumed.RowsAffected == 0 {
		return nil, ErrInvalidCode
	}
	var user models.User
	if err := s.db.First(&user, "id = ?", rec.UserID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// VerifyEmail proves ownership of the address and pays any referral reward
// that was waiting on it.
func (s *Service) VerifyEmail(_ context.Context, req VerifyOTPRequest) (*models.User, error) {
	user, err := s.verifyCode(req.Email, models.CodePurposeSignup, req.Code)
	if err != nil {
		return nil, err
	}
	if !user.EmailVerified {
		if err := s.db.Model(&models.User{}).
			Where("id = ?", user.ID).
			Update("email_verified", true).Error; err != nil {
			return nil, err
		}
		user.EmailVerified = true
		if err := s.payReferralReward(user); err != nil {
			// The verification itself succeeded; a reward hiccup is logged
			// rather than thrown away.
			log.Printf("auth: referral reward for %s failed: %v", user.Email, err)
		}
	}
	return user, nil
}

// ResetPassword changes the password of the account the reset code was mailed
// to.
func (s *Service) ResetPassword(_ context.Context, req ResetPasswordRequest) error {
	user, err := s.verifyCode(req.Email, models.CodePurposeReset, req.Code)
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("auth: hash password: %w", err)
	}
	return s.db.Model(&models.User{}).
		Where("id = ?", user.ID).
		Update("password_hash", string(hash)).Error
}

// payReferralReward credits both sides of a verified referral, exactly once.
// The referee's welcome bonus is keyed to their user id, so a replay is a
// no-op.
func (s *Service) payReferralReward(referee *models.User) error {
	if referee.ReferredBy == nil {
		return nil
	}
	var already int64
	if err := s.db.Model(&models.WalletTransaction{}).
		Where("user_id = ? AND kind = ? AND reference = ?", referee.ID, models.WalletBonus, "REF-"+referee.ID.String()).
		Count(&already).Error; err != nil {
		return err
	}
	if already > 0 {
		return nil
	}

	var referrer models.User
	if err := s.db.First(&referrer, "id = ?", *referee.ReferredBy).Error; err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// The referrer's bonus, tracked on their profile for the referral card.
		if err := tx.Model(&models.User{}).
			Where("id = ?", referrer.ID).
			Updates(map[string]interface{}{
				"wallet_balance_kobo": gorm.Expr("wallet_balance_kobo + ?", referralRewardKobo),
				"referral_bonus_kobo": gorm.Expr("referral_bonus_kobo + ?", referralRewardKobo),
			}).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.WalletTransaction{
			UserID:       referrer.ID,
			Kind:         models.WalletBonus,
			AmountKobo:   referralRewardKobo,
			Counterparty: "Referral bonus",
			Reference:    "REF-" + referee.ID.String(),
			Note:         referee.Name + " joined with your code",
		}).Error; err != nil {
			return err
		}
		// The invitee's welcome boost.
		if err := tx.Model(&models.User{}).
			Where("id = ?", referee.ID).
			Update("wallet_balance_kobo", gorm.Expr("wallet_balance_kobo + ?", referralWelcomeKobo)).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.WalletTransaction{
			UserID:       referee.ID,
			Kind:         models.WalletBonus,
			AmountKobo:   referralWelcomeKobo,
			Counterparty: "Welcome bonus",
			Reference:    "REF-" + referee.ID.String(),
			Note:         "Joined with " + referrer.Name + "'s referral code",
		}).Error; err != nil {
			return err
		}
		return createNotifications(tx,
			models.Notification{UserID: referrer.ID, Kind: models.NotifyReferral,
				Title: "Referral reward earned",
				Body:  fmt.Sprintf("%s verified their account with your code — %s added to your wallet.", referee.Name, koboNaira(referralRewardKobo)),
				Link:  "/account"},
			models.Notification{UserID: referee.ID, Kind: models.NotifyReferral,
				Title: "Welcome bonus added",
				Body:  fmt.Sprintf("%s landed in your wallet for joining with a referral code.", koboNaira(referralWelcomeKobo)),
				Link:  "/account"},
		)
	})
}

// ReferralOverview returns the caller's code, share link and reward stats.
func (s *Service) ReferralOverview(_ context.Context, userID uuid.UUID) (*ReferralOverview, error) {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	if user.ReferralCode == nil || *user.ReferralCode == "" {
		// Accounts created before the referral feature still get a code.
		for i := 0; i < 5; i++ {
			code, err := generateReferralCode()
			if err != nil {
				return nil, err
			}
			err = s.db.Model(&models.User{}).
				Where("id = ?", userID).Update("referral_code", code).Error
			if err == nil {
				user.ReferralCode = &code
				break
			}
			if i == 4 {
				return nil, err
			}
		}
	}

	var invited, verified int64
	if err := s.db.Model(&models.User{}).Where("referred_by = ?", userID).Count(&invited).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&models.User{}).
		Where("referred_by = ? AND email_verified = ?", userID, true).
		Count(&verified).Error; err != nil {
		return nil, err
	}

	return &ReferralOverview{
		Code:            *user.ReferralCode,
		Link:            referralLink(*user.ReferralCode),
		Invited:         invited,
		Verified:        verified,
		EarnedKobo:      user.ReferralBonusKobo,
		RewardEachKobo:  referralRewardKobo,
		WelcomeEachKobo: referralWelcomeKobo,
	}, nil
}

// referralLink builds the sign-up link carrying the code.
func referralLink(code string) string {
	return "https://potkeeper.ng/signup?ref=" + code
}

// SubmitKYC runs B Moni identity verification for the signed-in user. Sandbox
// only — the BVN is validated for shape and handed to the sandbox rail.
func (s *Service) SubmitKYC(ctx context.Context, userID uuid.UUID, bvn string) (*models.User, error) {
	bvn = strings.TrimSpace(bvn)
	if len(bvn) != 11 || !allDigits(bvn) {
		return nil, fmt.Errorf("%w: a BVN must be exactly 11 digits", ErrInvalidProfile)
	}
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	if user.KYCStatus == models.KYCVerified {
		return &user, nil
	}
	if !user.EmailVerified {
		return nil, fmt.Errorf("%w: verify your email before starting KYC", ErrCodeRequired)
	}

	// Make sure the person has a B Moni identity to verify.
	if user.BMoniUserID == "" {
		first, last := splitName(user.Name)
		if bu, err := s.bmoni.CreateUser(ctx, bmoni.CreateUserRequest{
			FirstName: first, LastName: last, Email: user.Email, Phone: user.Phone,
		}); err == nil {
			user.BMoniUserID = bu.ID
			_ = s.db.Model(&models.User{}).Where("id = ?", userID).Update("bmoni_user_id", bu.ID).Error
		} else {
			return nil, fmt.Errorf("identity service is unavailable — try again shortly")
		}
	}

	owner := "0x" + shortHex(userID) + strings.Repeat("0", 26)
	if _, err := s.bmoni.StartNigeriaOnboarding(ctx, bmoni.NigeriaOnboardingRequest{
		BMoniUserID:   user.BMoniUserID,
		BVN:           bvn,
		WalletAddress: owner[:42],
		WalletIndex:   0,
	}); err != nil {
		return nil, fmt.Errorf("identity verification did not complete: %w", err)
	}

	now := s.now()
	if err := s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"kyc_status":      models.KYCVerified,
			"kyc_verified_at": &now,
		}).Error; err != nil {
		return nil, err
	}
	user.KYCStatus = models.KYCVerified
	user.KYCVerifiedAt = &now
	_ = s.db.Create(&models.Notification{
		UserID: userID, Kind: models.NotifyVerification,
		Title: "Identity verified",
		Body:  "KYC complete — your wallet limits have been raised.",
		Link:  "/account",
	}).Error
	return &user, nil
}

// createNotifications inserts several notifications in one shot. Used by the
// referral flow; the pot engine has its own helper for money events.
func createNotifications(tx *gorm.DB, items ...models.Notification) error {
	for i := range items {
		if err := tx.Create(&items[i]).Error; err != nil {
			return err
		}
	}
	return nil
}

func koboNaira(kobo int64) string {
	return fmt.Sprintf("₦%d", kobo/100)
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

func shortHex(id uuid.UUID) string {
	sum := sha256.Sum256([]byte(id.String()))
	return hex.EncodeToString(sum[:8])
}
