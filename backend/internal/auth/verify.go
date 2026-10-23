package auth

// Email verification and password reset live here.
//
// Verification codes are hashed, expire after CodeTTLMinutes, and are consumed
// on first use. Issuing a new code invalidates the previous code for that purpose.

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

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// CodeTTLMinutes is how long an emailed verification code stays usable.
const CodeTTLMinutes = 5

// ErrInvalidCode is returned when a submitted code does not match, is expired
// or was already used. The three cases are deliberately indistinguishable.
var ErrInvalidCode = errors.New("that code is incorrect or has expired")

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

// VerifyEmail proves ownership of the address.
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
