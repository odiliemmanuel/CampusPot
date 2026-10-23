package auth

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/email"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// newTestAuthService builds an auth service on a throwaway SQLite file with
// the mock rail and log-mode email, so verification codes come back in the
// response exactly like a demo deployment without SMTP.
func newTestAuthService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "auth.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(models.AllModels()...); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	cfg := &config.Config{EmailFrom: "test@potkeeper.ng"} // not production
	return NewService(db, cfg, bmoni.NewMockClient(), email.NewLogSender(cfg.EmailFrom)), db
}

func registerUser(t *testing.T, svc *Service, name, email, ref string) *models.User {
	t.Helper()
	user, _, err := svc.Register(context.Background(), RegisterRequest{
		Name: name, Email: email, Phone: "080" + phoneSuffix(email), Password: "secret123",
		ReferralCode: ref,
	})
	if err != nil {
		t.Fatalf("register %s: %v", email, err)
	}
	return user
}

// phoneSuffix derives a stable, unique phone number from an email — the
// phone is the wallet account, so it must never collide in tests.
func phoneSuffix(email string) string {
	var h uint32 = 2166136261
	for _, r := range email {
		h = (h ^ uint32(r)) * 16777619
	}
	return fmt.Sprintf("%07d", h%10_000_000)
}

// A referral pays both sides once the new account proves its email, and never
// twice.
func TestReferralRewardsOnEmailVerification(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestAuthService(t)

	inviter := registerUser(t, svc, "Ada", "ada@x.ng", "")
	overview, err := svc.ReferralOverview(ctx, inviter.ID)
	if err != nil {
		t.Fatalf("ReferralOverview: %v", err)
	}
	if overview.Code == "" || overview.Link == "" {
		t.Fatal("expected a referral code and share link")
	}

	invitee := registerUser(t, svc, "Chidi", "chidi@x.ng", overview.Code)
	if invitee.ReferredBy == nil || *invitee.ReferredBy != inviter.ID {
		t.Fatal("invitee must remember who referred them")
	}

	// Nothing is paid before verification.
	assertWallet(t, svc, inviter.ID, demoWelcomeKobo)
	assertWallet(t, svc, invitee.ID, demoWelcomeKobo)

	// Verify the invitee with the emailed code → both sides are rewarded.
	code := sendCode(t, svc, invitee.Email, models.CodePurposeSignup)
	if _, err := svc.VerifyEmail(ctx, VerifyOTPRequest{Email: invitee.Email, Code: code, Purpose: models.CodePurposeSignup}); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}
	assertWallet(t, svc, inviter.ID, demoWelcomeKobo+referralRewardKobo)
	assertWallet(t, svc, invitee.ID, demoWelcomeKobo+referralWelcomeKobo)

	// A code is single-use: replaying it does not reward again.
	if _, err := svc.VerifyEmail(ctx, VerifyOTPRequest{Email: invitee.Email, Code: code, Purpose: models.CodePurposeSignup}); !errors.Is(err, ErrInvalidCode) {
		t.Fatalf("expected ErrInvalidCode on replay, got %v", err)
	}

	overview, err = svc.ReferralOverview(ctx, inviter.ID)
	if err != nil {
		t.Fatalf("ReferralOverview (after): %v", err)
	}
	if overview.Verified != 1 || overview.EarnedKobo != referralRewardKobo {
		t.Fatalf("expected 1 verified invitee and the full reward, got %+v", overview)
	}
}

// Requesting a new code invalidates the previous one.
func TestResendInvalidatesOldCode(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestAuthService(t)
	u := registerUser(t, svc, "Bisi", "bisi@x.ng", "")

	old := sendCode(t, svc, u.Email, models.CodePurposeSignup)
	if _, err := svc.SendVerification(ctx, u.Email); err != nil {
		t.Fatalf("SendVerification: %v", err)
	}
	if _, err := svc.VerifyEmail(ctx, VerifyOTPRequest{Email: u.Email, Code: old, Purpose: models.CodePurposeSignup}); !errors.Is(err, ErrInvalidCode) {
		t.Fatalf("expected the superseded code to fail, got %v", err)
	}
}

// Password reset: the emailed code sets a new password, and the old one stops
// working.
func TestPasswordResetFlow(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestAuthService(t)
	registerUser(t, svc, "Ngozi", "ngozi@x.ng", "")

	if _, err := svc.RequestPasswordReset(ctx, "ngozi@x.ng"); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	code := sendCode(t, svc, "ngozi@x.ng", models.CodePurposeReset)
	if err := svc.ResetPassword(ctx, ResetPasswordRequest{Email: "ngozi@x.ng", Code: code, Password: "brandnew1"}); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}

	if _, _, err := svc.Login(ctx, LoginRequest{Email: "ngozi@x.ng", Password: "secret123"}); err == nil {
		t.Fatal("the old password must no longer work")
	}
	if _, _, err := svc.Login(ctx, LoginRequest{Email: "ngozi@x.ng", Password: "brandnew1"}); err != nil {
		t.Fatalf("the new password must work: %v", err)
	}
}

// KYC needs a verified email first, then marks the account verified.
func TestSubmitKYCRequiresVerificationThenVerifies(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestAuthService(t)
	u := registerUser(t, svc, "Emeka", "emeka@x.ng", "")

	// Unverified email: KYC is refused up front.
	if _, err := svc.SubmitKYC(ctx, u.ID, "22222222222"); !errors.Is(err, ErrCodeRequired) {
		t.Fatalf("expected ErrCodeRequired before email verification, got %v", err)
	}

	code := sendCode(t, svc, u.Email, models.CodePurposeSignup)
	if _, err := svc.VerifyEmail(ctx, VerifyOTPRequest{Email: u.Email, Code: code, Purpose: models.CodePurposeSignup}); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}

	if _, err := svc.SubmitKYC(ctx, u.ID, "12345"); err == nil {
		t.Fatal("a short BVN must be refused")
	}
	verified, err := svc.SubmitKYC(ctx, u.ID, "22222222222")
	if err != nil {
		t.Fatalf("SubmitKYC: %v", err)
	}
	if verified.KYCStatus != "verified" {
		t.Fatalf("expected verified KYC, got %s", verified.KYCStatus)
	}
}

// helpers -----------------------------------------------------------------

// sendCode asks for a code and returns the plaintext one, which log-mode
// email surfaces in the response so the demo can complete the flow.
func sendCode(t *testing.T, svc *Service, email, purpose string) string {
	t.Helper()
	var (
		resp *SendOTPResponse
		err  error
	)
	if purpose == models.CodePurposeReset {
		resp, err = svc.RequestPasswordReset(context.Background(), email)
	} else {
		resp, err = svc.SendVerification(context.Background(), email)
	}
	if err != nil {
		t.Fatalf("send code (%s): %v", purpose, err)
	}
	if resp.DevCode == "" {
		t.Fatal("expected a dev code from log-mode email")
	}
	return resp.DevCode
}

func assertWallet(t *testing.T, svc *Service, userID uuid.UUID, want int64) {
	t.Helper()
	var user struct{ WalletBalanceKobo int64 }
	if err := svc.db.Model(&models.User{}).
		Select("wallet_balance_kobo").
		Where("id = ?", userID).
		Scan(&user).Error; err != nil {
		t.Fatalf("read wallet: %v", err)
	}
	if user.WalletBalanceKobo != want {
		t.Fatalf("wallet = %d, want %d", user.WalletBalanceKobo, want)
	}
}

var _ = time.Now
