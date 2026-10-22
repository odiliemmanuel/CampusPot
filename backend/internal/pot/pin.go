package pot

import (
	"context"
	"fmt"
	"regexp"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// pinPattern is a 4–6 digit transaction PIN. It must be numeric so it is easy
// to type on the wallet screen, and short enough to remember but long enough
// to be more than a speed bump.
var pinPattern = regexp.MustCompile(`^[0-9]{4,6}$`)

// SetPinRequest sets or changes the caller's transaction PIN.
//
// First-time setup (no PIN yet) is confirmed with the account password. A
// change is confirmed with the current PIN, so a hijacked session cannot
// silently swap the PIN and drain the wallet.
type SetPinRequest struct {
	Pin        string `json:"pin" binding:"required"`
	CurrentPin string `json:"currentPin"`
	Password   string `json:"password"`
}

// SetTransactionPin sets the PIN for the first time or changes an existing one.
func (s *Service) SetTransactionPin(_ context.Context, userID uuid.UUID, req SetPinRequest) error {
	pin := req.Pin
	if !pinPattern.MatchString(pin) {
		return fmt.Errorf("%w: your PIN must be 4 to 6 digits", ErrInvalid)
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return ErrNotFound
	}

	if user.TransactionPinHash != "" {
		// Changing an existing PIN requires the current one.
		if bcrypt.CompareHashAndPassword([]byte(user.TransactionPinHash), []byte(req.CurrentPin)) != nil {
			return fmt.Errorf("%w: your current PIN is incorrect", ErrInvalid)
		}
	} else {
		// First-time setup is confirmed with the account password.
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
			return fmt.Errorf("%w: your password is incorrect", ErrInvalid)
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("pin: hash: %w", err)
	}
	return s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Update("transaction_pin_hash", string(hash)).Error
}

// requireTransactionPin authorises a wallet debit. Every movement out of a
// wallet (a send to a member or bank account, or a payment into a pot) must
// carry the owner's PIN. An account with no PIN set cannot spend at all until
// it sets one, so money is never one stolen session away from leaving.
//
// It returns ErrPinRequired when no PIN is set yet and ErrInvalidPin when the
// supplied PIN does not match.
func (s *Service) requireTransactionPin(userID uuid.UUID, pin string) error {
	var user models.User
	if err := s.db.Select("transaction_pin_hash").First(&user, "id = ?", userID).Error; err != nil {
		return ErrNotFound
	}
	if user.TransactionPinHash == "" {
		return fmt.Errorf("%w: set a transaction PIN before sending money", ErrPinRequired)
	}
	if bcrypt.CompareHashAndPassword([]byte(user.TransactionPinHash), []byte(pin)) != nil {
		return fmt.Errorf("%w: the PIN you entered is incorrect", ErrInvalidPin)
	}
	return nil
}
