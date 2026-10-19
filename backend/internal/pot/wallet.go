package pot

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// WalletOverview is a user's personal wallet: its balance and recent activity.
type WalletOverview struct {
	BalanceKobo  int64                      `json:"balanceKobo"`
	BMoniUserID  string                     `json:"bmoniUserId,omitempty"`
	Transactions []models.WalletTransaction `json:"transactions"`
}

// Wallet returns the signed-in user's wallet balance and recent movements.
func (s *Service) Wallet(_ context.Context, userID uuid.UUID) (*WalletOverview, error) {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, ErrNotFound
	}
	var txs []models.WalletTransaction
	if err := s.db.Where("user_id = ?", userID).
		Order("created_at DESC").Limit(200).Find(&txs).Error; err != nil {
		return nil, err
	}
	return &WalletOverview{
		BalanceKobo:  user.WalletBalanceKobo,
		BMoniUserID:  user.BMoniUserID,
		Transactions: txs,
	}, nil
}

// WalletDepositRequest tops up the caller's own wallet (simulated bank funding).
type WalletDepositRequest struct {
	AmountKobo int64  `json:"amountKobo" binding:"required,gt=0"`
	Reference  string `json:"reference"`
	Note       string `json:"note"`
}

// WalletDeposit credits the caller's wallet. This is the demo equivalent of a
// bank transfer landing; the ledger of wallet movements stays append-only.
func (s *Service) WalletDeposit(_ context.Context, userID uuid.UUID, req WalletDepositRequest) (*WalletOverview, error) {
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := creditWallet(tx, userID, req.AmountKobo); err != nil {
			return err
		}
		if err := tx.Create(&models.WalletTransaction{
			UserID:       userID,
			Kind:         models.WalletDeposit,
			AmountKobo:   req.AmountKobo,
			Counterparty: firstNonEmpty(strings.TrimSpace(req.Note), "Bank transfer"),
			Reference:    req.Reference,
			Note:         req.Note,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Wallet(context.Background(), userID)
}

// WalletTransferRequest sends money out of the caller's wallet.
type WalletTransferRequest struct {
	AmountKobo int64  `json:"amountKobo" binding:"required,gt=0"`
	Recipient  string `json:"recipient" binding:"required"` // email/phone of a user, or a bank account number
	// BankName, when set, marks this as an external payout to a bank account
	// rather than a transfer to another PotKeeper user.
	BankName string `json:"bankName"`
	Note     string `json:"note"`
}

// WalletTransfer moves money to another PotKeeper user when the recipient
// matches a registered email/phone, otherwise it records an external payout
// (e.g. to a bank account outside PotKeeper).
func (s *Service) WalletTransfer(_ context.Context, userID uuid.UUID, req WalletTransferRequest) (*WalletOverview, error) {
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	recipient := strings.TrimSpace(req.Recipient)
	if recipient == "" {
		return nil, fmt.Errorf("%w: a recipient is required", ErrInvalid)
	}

	var to *models.User
	// A named bank means an external payout — never match it to a user.
	if strings.TrimSpace(req.BankName) == "" {
		var match models.User
		err := s.db.Where("LOWER(email) = ?", strings.ToLower(recipient)).
			Or("phone = ?", recipient).First(&match).Error
		if err == nil {
			to = &match
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	if to != nil && to.ID == userID {
		return nil, fmt.Errorf("%w: you cannot send money to yourself", ErrInvalid)
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := debitWallet(tx, userID, req.AmountKobo); err != nil {
			return err
		}
		out := &models.WalletTransaction{
			UserID:     userID,
			Kind:       models.WalletTransferOut,
			AmountKobo: req.AmountKobo,
			Note:       req.Note,
		}
		if to != nil {
			out.Counterparty = to.Name
			uid := to.ID
			out.CounterpartyUserID = &uid
			if err := creditWallet(tx, to.ID, req.AmountKobo); err != nil {
				return err
			}
			if err := tx.Create(&models.WalletTransaction{
				UserID:             to.ID,
				Kind:               models.WalletTransferIn,
				AmountKobo:         req.AmountKobo,
				Counterparty:       "PotKeeper wallet",
				CounterpartyUserID: &userID,
				Note:               req.Note,
			}).Error; err != nil {
				return err
			}
		} else {
			bank := strings.TrimSpace(req.BankName)
			if bank != "" {
				out.Counterparty = fmt.Sprintf("%s · %s", bank, recipient)
			} else {
				out.Counterparty = recipient
			}
		}
		return tx.Create(out).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Wallet(context.Background(), userID)
}

// WalletPayRequest pays a member's contribution into a pot from their wallet.
type WalletPayRequest struct {
	GroupID    uuid.UUID  `json:"groupId" binding:"required"`
	LevyID     *uuid.UUID `json:"levyId"`
	AmountKobo int64      `json:"amountKobo" binding:"required,gt=0"`
}

// WalletPayPot debits the caller's wallet and credits a pot, reconciling the
// payment to the caller like any deposit — so a member can pay part or all of
// their own contribution without leaving PotKeeper.
func (s *Service) WalletPayPot(_ context.Context, userID uuid.UUID, req WalletPayRequest) (*models.Payment, error) {
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	m, err := s.requireMember(req.GroupID, userID)
	if err != nil {
		return nil, err
	}

	var payment models.Payment
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// Resolve the levy (explicit, else latest open).
		levyID := req.LevyID
		var levy models.Levy
		if levyID != nil {
			if err := tx.First(&levy, "id = ? AND group_id = ?", *levyID, req.GroupID).Error; err != nil {
				return fmt.Errorf("%w: levy not found", ErrNotFound)
			}
		} else {
			if err := tx.Where("group_id = ? AND status = ?", req.GroupID, "open").
				Order("created_at DESC").First(&levy).Error; err != nil {
				return fmt.Errorf("%w: no open levy for this group", ErrNotFound)
			}
			lid := levy.ID
			levyID = &lid
		}

		// Take the money out of the member's wallet first.
		if err := debitWallet(tx, userID, req.AmountKobo); err != nil {
			return err
		}

		paid, err := paidByUserTx(tx, req.GroupID, levy.ID, userID)
		if err != nil {
			return err
		}
		status := models.PaymentPartial
		if paid+req.AmountKobo >= levy.AmountKobo {
			status = models.PaymentMatched
		}

		entry := &models.LedgerEntry{
			GroupID:     req.GroupID,
			Kind:        models.LedgerCredit,
			AmountKobo:  req.AmountKobo,
			Description: "Wallet payment: " + levy.Title,
			RefType:     "payment",
			ActorUserID: &userID,
		}
		if err := s.appendLedger(tx, entry); err != nil {
			return err
		}

		payment = models.Payment{
			GroupID:         req.GroupID,
			LevyID:          levyID,
			UserID:          &userID,
			AmountKobo:      req.AmountKobo,
			Status:          status,
			ProviderEventID: "WALLET-" + uuid.NewString(),
			QuotedReference: m.Reference,
			MatchedBy:       "wallet",
			LedgerEntryID:   &entry.ID,
		}
		if err := tx.Create(&payment).Error; err != nil {
			return err
		}
		return tx.Create(&models.WalletTransaction{
			UserID:       userID,
			Kind:         models.WalletPotPayment,
			AmountKobo:   req.AmountKobo,
			Counterparty: "Pot contribution",
			GroupID:      &req.GroupID,
			LevyID:       levyID,
			Note:         levy.Title,
		}).Error; err != nil { return err }
		return s.advanceRecurringContributionTx(tx, req.GroupID, levy.ID)
	})
	if err != nil {
		return nil, err
	}
	return &payment, nil
}

// debitWallet removes amount from a wallet, refusing to overdraw. The
// conditional UPDATE makes concurrent sends safe.
func debitWallet(tx *gorm.DB, userID uuid.UUID, amount int64) error {
	res := tx.Model(&models.User{}).
		Where("id = ? AND wallet_balance_kobo >= ?", userID, amount).
		UpdateColumn("wallet_balance_kobo", gorm.Expr("wallet_balance_kobo - ?", amount))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("%w: not enough money in your wallet", ErrConflict)
	}
	return nil
}

// creditWallet adds amount to a wallet.
func creditWallet(tx *gorm.DB, userID uuid.UUID, amount int64) error {
	return tx.Model(&models.User{}).
		Where("id = ?", userID).
		UpdateColumn("wallet_balance_kobo", gorm.Expr("wallet_balance_kobo + ?", amount)).Error
}
