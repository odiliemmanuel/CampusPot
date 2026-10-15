// Package auth handles registration, login, JWT issuance, and the gin
// middleware that authenticates protected routes.
package auth

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/config"
	"github.com/odiliemmmanuel/campuspot/internal/bmoni"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// ErrEmailTaken is returned when registering an email that already exists.
var ErrEmailTaken = errors.New("email already registered")

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
	var count int64
	if err := s.db.Model(&models.User{}).Where("email = ?", req.Email).Count(&count).Error; err != nil {
		return nil, "", err
	}
	if count > 0 {
		return nil, "", ErrEmailTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("auth: hash password: %w", err)
	}

	user := &models.User{
		Name:         req.Name,
		Email:        req.Email,
		Phone:        req.Phone,
		PasswordHash: string(hash),
	}

	// Provision the B Moni user now so every member has a wallet id from day
	// one. Best-effort: a provisioning failure must not block sign-up.
	if bu, err := s.bmoni.CreateUser(ctx, bmoni.CreateUserRequest{
		Name: req.Name, Email: req.Email, Phone: req.Phone,
	}); err == nil {
		user.BMoniUserID = bu.ID
	} else {
		log.Printf("auth: bmoni CreateUser failed for %s: %v", req.Email, err)
	}

	if err := s.db.Create(user).Error; err != nil {
		return nil, "", err
	}

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
