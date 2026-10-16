// Package auth handles registration, login, JWT issuance, and the gin
// middleware that authenticates protected routes.
package auth

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// demoWelcomeKobo is the starting wallet balance every new account gets so the
// demo has money to send and pay with (₦10,000 in kobo). It is play money.
const demoWelcomeKobo int64 = 1_000_000

// ErrEmailTaken is returned when registering an email that already exists.
var ErrEmailTaken = errors.New("email already registered")

// ErrPhoneTaken is returned when the phone (a wallet account) is already used.
var ErrPhoneTaken = errors.New("phone number already registered")

// ErrPhoneRequired is returned when registration omits the phone number.
var ErrPhoneRequired = errors.New("a phone number is required")

// ErrInvalidCredentials is returned on a failed login. The message is
// deliberately identical whether the email or the password was wrong.
var ErrInvalidCredentials = errors.New("invalid email or password")

// Service owns authentication logic.
type Service struct {
	db    *gorm.DB
	cfg   *config.Config
	bmoni bmoni.Client
}

// NewService wires the dependencies.
func NewService(db *gorm.DB, cfg *config.Config, client bmoni.Client) *Service {
	return &Service{db: db, cfg: cfg, bmoni: client}
}

// Register creates a user, hashes the password, best-effort provisions a
// B Moni user, and returns a signed token.
func (s *Service) Register(ctx context.Context, req RegisterRequest) (*models.User, string, error) {
	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		return nil, "", ErrPhoneRequired
	}

	var count int64
	if err := s.db.Model(&models.User{}).Where("email = ?", req.Email).Count(&count).Error; err != nil {
		return nil, "", err
	}
	if count > 0 {
		return nil, "", ErrEmailTaken
	}

	// The phone number is the user's wallet account, so it must be unique.
	if err := s.db.Model(&models.User{}).Where("phone = ?", phone).Count(&count).Error; err != nil {
		return nil, "", err
	}
	if count > 0 {
		return nil, "", ErrPhoneTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("auth: hash password: %w", err)
	}

	user := &models.User{
		Name:              req.Name,
		Email:             req.Email,
		Phone:             req.Phone,
		PasswordHash:      string(hash),
		WalletBalanceKobo: demoWelcomeKobo,
	}

	// Provision the B Moni user now so every member has a wallet id from day
	// one. Best-effort: a provisioning failure must not block sign-up.
	first, last := splitName(req.Name)
	if bu, err := s.bmoni.CreateUser(ctx, bmoni.CreateUserRequest{
		FirstName: first, LastName: last, Email: req.Email, Phone: req.Phone,
	}); err == nil {
		user.BMoniUserID = bu.ID
	} else {
		log.Printf("auth: bmoni CreateUser failed for %s: %v", req.Email, err)
	}

	if err := s.db.Create(user).Error; err != nil {
		return nil, "", err
	}

	// Record the demo welcome balance in the wallet's history too.
	_ = s.db.Create(&models.WalletTransaction{
		UserID:       user.ID,
		Kind:         models.WalletDeposit,
		AmountKobo:   demoWelcomeKobo,
		Counterparty: "Welcome balance",
		Note:         "Demo starting balance",
	}).Error

	token, err := s.IssueToken(user)
	if err != nil {
		return nil, "", err
	}
	return user, token, nil
}

// Login verifies credentials and returns a signed token.
func (s *Service) Login(_ context.Context, req LoginRequest) (*models.User, string, error) {
	var user models.User
	if err := s.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", ErrInvalidCredentials
		}
		return nil, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		return nil, "", ErrInvalidCredentials
	}
	token, err := s.IssueToken(&user)
	if err != nil {
		return nil, "", err
	}
	return &user, token, nil
}

// ErrInvalidProfile is returned when a profile update carries no usable field.
var ErrInvalidProfile = errors.New("nothing to update")

// UpdateProfile changes the signed-in user's display name and/or phone.
func (s *Service) UpdateProfile(_ context.Context, userID uuid.UUID, req UpdateProfileRequest) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	if req.Name == nil && req.Phone == nil {
		return nil, ErrInvalidProfile
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if len(name) < 2 {
			return nil, ErrInvalidProfile
		}
		user.Name = name
	}
	if req.Phone != nil {
		user.Phone = strings.TrimSpace(*req.Phone)
	}
	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// ErrSoleTreasurer is returned when a user tries to delete an account while
// still the only treasurer of a pot.
var ErrSoleTreasurer = errors.New("you are the only treasurer of a pot — promote someone before deleting")

// DeleteAccount removes the signed-in user's account. Their pot memberships are
// ended (so they leave every pot's chat and lists), their wallet history is
// cleared, and the account row is deleted. A pot must always keep a treasurer,
// so this is refused if the user is a pot's only treasurer.
func (s *Service) DeleteAccount(_ context.Context, userID uuid.UUID) error {
	var memberships []models.Membership
	if err := s.db.Where("user_id = ? AND status = ?", userID, models.MembershipActive).
		Find(&memberships).Error; err != nil {
		return err
	}
	for _, m := range memberships {
		if m.Role != models.RoleTreasurer {
			continue
		}
		var others int64
		if err := s.db.Model(&models.Membership{}).
			Where("group_id = ? AND role = ? AND status = ? AND user_id <> ?",
				m.GroupID, models.RoleTreasurer, models.MembershipActive, userID).
			Count(&others).Error; err != nil {
			return err
		}
		if others == 0 {
			return ErrSoleTreasurer
		}
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Membership{}).
			Where("user_id = ?", userID).
			Update("status", models.MembershipRemoved).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", userID).
			Delete(&models.WalletTransaction{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", userID).Delete(&models.User{}).Error
	})
}

// IssueToken signs a JWT for the user.
func (s *Service) IssueToken(u *models.User) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   u.ID.String(),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.cfg.JWTAccessTokenTTL)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(s.cfg.JWTSecret))
}

// Parse validates a token and returns the user id it carries.
func (s *Service) Parse(tokenStr string) (uuid.UUID, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{},
		func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
			}
			return []byte(s.cfg.JWTSecret), nil
		})
	if err != nil {
		return uuid.Nil, err
	}
	claims, ok := parsed.Claims.(*jwt.RegisteredClaims)
	if !ok || !parsed.Valid {
		return uuid.Nil, errors.New("auth: invalid token")
	}
	return uuid.Parse(claims.Subject)
}

// splitName divides a single display name into the first/last pair B Moni's
// POST /v1/users expects, tolerating empty and single-word names.
func splitName(name string) (first, last string) {
	parts := strings.Fields(name)
	switch len(parts) {
	case 0:
		return "PotKeeper", "Member"
	case 1:
		return parts[0], "Member"
	default:
		return parts[0], strings.Join(parts[1:], " ")
	}
}
