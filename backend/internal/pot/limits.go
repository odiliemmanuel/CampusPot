package pot

// checkTransferLimits keeps the email ownership gate on wallet debits.
import (
	"fmt"
	"github.com/google/uuid"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

func (s *Service) checkTransferLimits(userID uuid.UUID, _ int64) error {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return ErrNotFound
	}
	if !user.EmailVerified {
		return fmt.Errorf("%w: verify your email address before moving money — open the code we emailed you in Settings", ErrForbidden)
	}
	return nil
}
