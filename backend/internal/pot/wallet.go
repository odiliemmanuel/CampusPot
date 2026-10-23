package pot

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

// WalletOverview is a user's personal wallet: its balance and recent activity.
type WalletOverview struct {
	BalanceKobo  int64                      `json:"balanceKobo"`
	BMoniUserID  string                     `json:"bmoniUserId,omitempty"`
	// PinSet tells the UI whether to ask for a transaction PIN or prompt the
	// user to create one before their first send.
	PinSet       bool                       `json:"pinSet"`
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
		PinSet:       user.TransactionPinHash != "",
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
		}).Error; err != nil {
			return err
		}
		return nil
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
	BankCode string `json:"bankCode"`
	// Pin authorises the debit. Every send requires the owner's transaction
	// PIN, whether the money goes to a member or an external bank account.
	Pin string `json:"pin"`
	Note string `json:"note"`
}// WalletTransfer moves money to another PotKeeper user, into a pot's collection
// account, or out to a bank account. Every path resolves the recipient before
// any debit:
//
//   - a bank payout runs name enquiry against B Moni and records the resolved
//     account holder's name, so money never leaves for an account that does
//     not exist;
//   - a PotKeeper send must match a registered user by email or phone. A
//     recipient that matches neither a user nor a verified bank account is
//     refused rather than silently recorded as a faceless payout;
//   - a send to a pot's dedicated account is paid INTO that pot: only active
//     members may do it, and it is recorded as the sender's contribution (a
//     real Payment), never as a bank payout.
//
// Every send also requires the owner's transaction PIN.
func (s *Service) WalletTransfer(ctx context.Context, userID uuid.UUID, req WalletTransferRequest) (*WalletOverview, error) {
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	recipient := strings.TrimSpace(req.Recipient)
	if recipient == "" {
		return nil, fmt.Errorf("%w: a recipient is required", ErrInvalid)
	}
	if err := s.requireTransactionPin(userID, req.Pin); err != nil {
		return nil, err
	}
	if err := s.checkTransferLimits(userID, req.AmountKobo); err != nil {
		return nil, err
	}
	if err := s.transferFunds(ctx, userID, req); err != nil {
		return nil, err
	}
	return s.Wallet(ctx, userID)
}

// transferFunds is the PIN-free core of a send — the part a scheduled
// transfer re-runs when its moment arrives (the PIN was captured once, at
// schedule time). It moves the money or returns the resolution error.
func (s *Service) transferFunds(ctx context.Context, userID uuid.UUID, req WalletTransferRequest) error {
	recipient := strings.TrimSpace(req.Recipient)

	// A 10-digit recipient may be a pot's dedicated collection account. Paying
	// into a pot is a contribution, not a bank payout — so resolve it first.
	if len(recipient) == 10 && allDigits(recipient) {
		var pot models.Group
		err := s.db.Where("virtual_account_number = ?", recipient).First(&pot).Error
		if err == nil {
			_, err = s.payIntoPot(ctx, userID, &pot, req)
			return err
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	var to *models.User
	var verified *VerifiedAccount
	// A named bank means an external payout — never match it to a user.
	if strings.TrimSpace(req.BankName) != "" || strings.TrimSpace(req.BankCode) != "" {
		// Name enquiry: confirm the account exists and remember who holds it.
		v, err := s.VerifyBankAccount(ctx, userID, recipient, req.BankName, req.BankCode)
		if err != nil {
			return err
		}
		verified = v
	} else {
		var match models.User
		err := s.db.Where("LOWER(email) = ?", strings.ToLower(recipient)).
			Or("phone = ?", recipient).First(&match).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// No user and no bank: refuse rather than send into the void.
				return fmt.Errorf("%w: no PotKeeper account matches %s — check the email or phone, or send to a bank account", ErrAccountNotFound, recipient)
			}
			return err
		}
		to = &match
	}
	if to != nil && to.ID == userID {
		return fmt.Errorf("%w: you cannot send money to yourself", ErrInvalid)
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
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
			// A landed transfer is money the recipient can spend now — tell them.
			if err := notifyTx(tx, models.Notification{
				UserID: to.ID, Kind: models.NotifyTransferIn,
				Title: "Money received",
				Body: fmt.Sprintf("%s sent you %s.",
					userName(tx, userID), money.Kobo(req.AmountKobo).Format()),
				Link: "/account",
			}); err != nil {
				return err
			}
		} else {
			// Record the verified account holder's name, not just the number,
			// so the wallet history shows exactly who was paid.
			out.Counterparty = fmt.Sprintf("%s · %s · %s", verified.BankName, verified.AccountNumber, verified.AccountHolderName)
		}
		return tx.Create(out).Error
	})
}

// userName reads a display name for notification copy.
func userName(tx *gorm.DB, userID uuid.UUID) string {
	var u models.User
	if err := tx.Select("name").First(&u, "id = ?", userID).Error; err == nil {
		return u.Name
	}
	return "Someone"
}

// WalletPayRequest pays a member's contribution into a pot from their wallet.
type WalletPayRequest struct {
	GroupID    uuid.UUID  `json:"groupId" binding:"required"`
	LevyID     *uuid.UUID `json:"levyId"`
	AmountKobo int64      `json:"amountKobo" binding:"required,gt=0"`
	// Pin authorises the debit, just like a send: money leaving the wallet
	// always requires the owner's transaction PIN.
	Pin string `json:"pin"`
}

// WalletPayPot debits the caller's wallet and credits a pot, reconciling the
// payment to the caller like any deposit — so a member can pay part or all of
// their own contribution without leaving PotKeeper.
func (s *Service) WalletPayPot(_ context.Context, userID uuid.UUID, req WalletPayRequest) (*models.Payment, error) {
	if req.AmountKobo <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	if err := s.requireTransactionPin(userID, req.Pin); err != nil {
		return nil, err
	}
	if err := s.checkTransferLimits(userID, req.AmountKobo); err != nil {
		return nil, err
	}
	if _, err := s.requireMember(req.GroupID, userID); err != nil {
		return nil, err
	}

	var payment models.Payment
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var err error
		payment, err = s.payPotTx(tx, userID, req.GroupID, req.AmountKobo, req.LevyID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &payment, nil
}

// payIntoPot is the WalletTransfer branch for a send addressed to a pot's own
// collection account. Because every pot has a dedicated NUBAN, sending money to
// it is paying INTO the pot — not an external bank payout. Only active members
// may do this, and the money is recorded as the sender's contribution so it
// shows up in their standing immediately.
func (s *Service) payIntoPot(ctx context.Context, userID uuid.UUID, group *models.Group, req WalletTransferRequest) (*WalletOverview, error) {
	if _, err := s.requireMember(group.ID, userID); err != nil {
		// A non-member may see the pot's account (it is public on the pot page),
		// but cannot pay into it: the money would be unattributable. Refund path
		// is avoided entirely by refusing before any debit.
		return nil, fmt.Errorf("%w: only members of %s can pay into it — join the pot first, then send", ErrForbidden, group.Name)
	}

	// payPotTx records the whole movement: the wallet debit, the pot_payment
	// row in the sender's history (counterparty + group id), the ledger credit
	// and the contribution itself.
	if _, err := s.payPotTxTx(userID, group.ID, req.AmountKobo); err != nil {
		return nil, err
	}
	return s.Wallet(ctx, userID)
}

// payPotTxTx runs payPotTx inside its own transaction.
func (s *Service) payPotTxTx(userID, groupID uuid.UUID, amountKobo int64) (models.Payment, error) {
	var payment models.Payment
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var err error
		payment, err = s.payPotTx(tx, userID, groupID, amountKobo, nil)
		return err
	})
	return payment, err
}

// payPotTx records a member's wallet contribution into a pot, inside an open
// transaction. It takes the money from the member's wallet, credits the pot
// ledger, and creates a Payment reconciled to that member and the levy — the
// same record a bank deposit would produce, so the contribution reflects in
// their standing whether they paid from the app or by transfer.
func (s *Service) payPotTx(tx *gorm.DB, userID, groupID uuid.UUID, amountKobo int64, levyID *uuid.UUID) (models.Payment, error) {
	var payment models.Payment
	// Resolve the levy (explicit, else latest open).
	var levy models.Levy
	if levyID != nil {
		if err := tx.First(&levy, "id = ? AND group_id = ?", *levyID, groupID).Error; err != nil {
			return payment, fmt.Errorf("%w: levy not found", ErrNotFound)
		}
	} else {
		if err := tx.Where("group_id = ? AND status = ?", groupID, "open").
			Order("created_at DESC").First(&levy).Error; err != nil {
			return payment, fmt.Errorf("%w: no open levy for this group", ErrNotFound)
		}
	}
	lid := levy.ID

	// Take the money out of the member's wallet first.
	if err := debitWallet(tx, userID, amountKobo); err != nil {
		return payment, err
	}

	paid, err := paidByUserTx(tx, groupID, levy.ID, userID)
	if err != nil {
		return payment, err
	}
	status := models.PaymentPartial
	if paid+amountKobo >= levy.AmountKobo {
		status = models.PaymentMatched
	}

	entry := &models.LedgerEntry{
		GroupID:     groupID,
		Kind:        models.LedgerCredit,
		AmountKobo:  amountKobo,
		Description: "Wallet payment: " + levy.Title,
		RefType:     "payment",
		ActorUserID: &userID,
	}
	if err := s.appendLedger(tx, entry); err != nil {
		return payment, err
	}

	var m models.Membership
	_ = tx.Preload("User").Where("group_id = ? AND user_id = ?", groupID, userID).First(&m).Error

	payment = models.Payment{
		GroupID:         groupID,
		LevyID:          &lid,
		UserID:          &userID,
		AmountKobo:      amountKobo,
		Status:          status,
		ProviderEventID: "WALLET-" + uuid.NewString(),
		QuotedReference: m.Reference,
		MatchedBy:       "wallet",
		LedgerEntryID:   &entry.ID,
	}
	if err := tx.Create(&payment).Error; err != nil {
		return payment, err
	}
	// Tell the pot's leadership that a contribution landed from the app.
	payer := "A member"
	if m.User != nil {
		payer = m.User.Name
	}
	title, body := paymentReceivedNotification(payer, amountKobo)
	if err := s.notifyLeaders(tx, groupID, models.Notification{
		Kind:  models.NotifyPayment,
		Title: title, Body: body,
		Link:  "/pots/" + groupID.String() + "?tab=contributions",
	}); err != nil {
		return payment, err
	}
	if err := tx.Create(&models.WalletTransaction{
		UserID:       userID,
		Kind:         models.WalletPotPayment,
		AmountKobo:   amountKobo,
		Counterparty: "Pot contribution",
		GroupID:      &groupID,
		LevyID:       &lid,
		Note:         levy.Title,
	}).Error; err != nil {
		return payment, err
	}
	if err := s.advanceRecurringContributionTx(tx, groupID, levy.ID); err != nil {
		return payment, err
	}
	return payment, nil
}

// debitWallet removes amount from a wallet, refusing to overdraw. The
// conditional UPDATE makes concurrent sends safe. A refused debit reports the
// actual balance so the UI can raise a low-balance alert with real numbers.
func debitWallet(tx *gorm.DB, userID uuid.UUID, amount int64) error {
	res := tx.Model(&models.User{}).
		Where("id = ? AND wallet_balance_kobo >= ?", userID, amount).
		UpdateColumn("wallet_balance_kobo", gorm.Expr("wallet_balance_kobo - ?", amount))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		var user models.User
		var balance int64
		if err := tx.Select("wallet_balance_kobo").First(&user, "id = ?", userID).Error; err == nil {
			balance = user.WalletBalanceKobo
		}
		return fmt.Errorf("%w: low balance — your wallet has %s but this send is %s",
			ErrConflict, money.Kobo(balance).Format(), money.Kobo(amount).Format())
	}
	return nil
}

// creditWallet adds amount to a wallet.
func creditWallet(tx *gorm.DB, userID uuid.UUID, amount int64) error {
	return tx.Model(&models.User{}).
		Where("id = ?", userID).
		UpdateColumn("wallet_balance_kobo", gorm.Expr("wallet_balance_kobo + ?", amount)).Error
}
