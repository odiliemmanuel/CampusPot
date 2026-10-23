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

func registerUser(t *testing.T, svc *Service, name, email, _ string) *models.User {
	t.Helper()
	user, _, err := svc.Register(context.Background(), RegisterRequest{
		Name: name, Email: email, Phone: "080" + phoneSuffix(email), Password: "secret123",
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
