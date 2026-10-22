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

// BankOption is one selectable payout bank (display name + settlement code).
type BankOption struct {
	Name string `json:"name"`
	Code string `json:"code"`
}

// VerifiedAccount is the result of a name enquiry on a bank account. It is
// what the UI shows the sender to confirm the money is going to the right
// person before any debit happens.
type VerifiedAccount struct {
	AccountNumber     string `json:"accountNumber"`
	BankName          string `json:"bankName"`
	BankCode          string `json:"bankCode"`
	AccountHolderName string `json:"accountHolderName"`
}

// Destination renders the verified account the way payout destinations are
// stored on an expense: bank · number · verified holder name.
func (v VerifiedAccount) Destination() string {
	return fmt.Sprintf("Bank: %s · %s · %s", v.BankName, v.AccountNumber, v.AccountHolderName)
}

// PotAccount is the result of resolving a pot's dedicated collection account
// (its virtual NUBAN). It is what the sender confirms before paying into a pot:
// the pot name, the account, and whether the caller is actually a member (only
// members may pay into a pot, so money can never land uncredited).
type PotAccount struct {
	GroupID         uuid.UUID `json:"groupId"`
	GroupName       string    `json:"groupName"`
	AccountNumber   string    `json:"accountNumber"`
	BankName        string    `json:"bankName"`
	AccountName     string    `json:"accountName"`
	IsMember        bool      `json:"isMember"`
	OutstandingKobo int64     `json:"outstandingKobo"`
}

// LookedUpUser is the PotKeeper counterpart of a name enquiry: it resolves an
// email/phone to the account holder's name so a wallet transfer to another
// member can be confirmed before it is sent.
type LookedUpUser struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Email string    `json:"email"`
	Phone string    `json:"phone,omitempty"`
}

// bankAliases maps the short names the UI offers onto B Moni bank codes, so
// name enquiry works whichever way the bank was written.
var bankAliases = map[string]string{
	"gtbank":                "058",
	"guaranty trust bank":   "058",
	"zenith":                "057",
	"zenith bank":           "057",
	"access":                "044",
	"access bank":           "044",
	"first bank":            "011",
	"first bank of nigeria": "011",
	"uba":                   "033",
	"united bank for africa": "033",
	"opay":                  "999999",
	"paycom":                "999999",
	"kuda":                  "999992",
	"kuda mfb":              "999992",
	"moniepoint":            "999991",
	"moniepoint mfb":        "999991",
}

func normalizeBank(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(s)), " "))
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

// bmoniUserIDFor returns the B Moni user id to attribute rail calls to. It may
// be empty — the mock ignores it and the HTTP client degrades to the mock.
func (s *Service) bmoniUserIDFor(userID uuid.UUID) string {
	var user models.User
	if err := s.db.Select("bmoni_user_id").First(&user, "id = ?", userID).Error; err != nil {
		return ""
	}
	return user.BMoniUserID
}

// ListBanks returns the Nigerian banks a payout can be sent to.
func (s *Service) ListBanks(ctx context.Context, userID uuid.UUID) ([]BankOption, error) {
	banks, err := s.bmoni.ListNigerianBanks(ctx, s.bmoniUserIDFor(userID))
	if err != nil {
		return nil, err
	}
	out := make([]BankOption, 0, len(banks))
	for _, b := range banks {
		out = append(out, BankOption{Name: b.Name, Code: b.Code})
	}
	return out, nil
}

// VerifyBankAccount runs name enquiry: given a 10-digit account number and a
// bank (by name or code) it returns the account holder's name, or ErrNotFound
// when the account does not exist. Every bank payout must pass this before
// money can move, so the sender always sees who they are paying.
func (s *Service) VerifyBankAccount(ctx context.Context, userID uuid.UUID, accountNumber, bankName, bankCode string) (*VerifiedAccount, error) {
	return s.verifyBankAccount(ctx, s.bmoniUserIDFor(userID), accountNumber, bankName, bankCode)
}

func (s *Service) verifyBankAccount(ctx context.Context, bmoniUserID, accountNumber, bankName, bankCode string) (*VerifiedAccount, error) {
	accountNumber = strings.TrimSpace(accountNumber)
	if len(accountNumber) != 10 || !allDigits(accountNumber) {
		return nil, fmt.Errorf("%w: an account number must be exactly 10 digits", ErrInvalid)
	}
	name := strings.TrimSpace(bankName)
	code := strings.TrimSpace(bankCode)
	if code == "" {
		code = bankAliases[normalizeBank(name)]
	}
	if name == "" && code != "" {
		if banks, err := s.bmoni.ListNigerianBanks(ctx, bmoniUserID); err == nil {
			for _, b := range banks {
				if b.Code == code {
					name = b.Name
					break
				}
			}
		}
		if name == "" {
			name = code
		}
	}
	if code == "" {
		if name == "" {
			return nil, fmt.Errorf("%w: choose a bank for this account", ErrInvalid)
		}
		if banks, err := s.bmoni.ListNigerianBanks(ctx, bmoniUserID); err == nil {
			for _, b := range banks {
				if normalizeBank(b.Name) == normalizeBank(name) {
					code = b.Code
					name = b.Name
					break
				}
			}
		}
		if code == "" {
			return nil, fmt.Errorf("%w: unknown bank %q", ErrInvalid, name)
		}
	}

	holder, err := s.bmoni.VerifyNigerianAccount(ctx, bmoniUserID, accountNumber, code)
	if err != nil || strings.TrimSpace(holder.Name) == "" {
		return nil, fmt.Errorf("%w: %s at %s does not exist — check the account number and bank",
			ErrAccountNotFound, accountNumber, name)
	}
	return &VerifiedAccount{
		AccountNumber:     accountNumber,
		BankName:          name,
		BankCode:          code,
		AccountHolderName: strings.TrimSpace(holder.Name),
	}, nil
}

// LookupPotAccount resolves a 10-digit account number to the pot that owns it
// (each pot has its own dedicated collection account). It reports whether the
// caller is an active member of that pot, so the UI can confirm a member before
// they pay in and warn anyone else that only members can contribute.
func (s *Service) LookupPotAccount(_ context.Context, userID uuid.UUID, accountNumber string) (*PotAccount, error) {
	accountNumber = strings.TrimSpace(accountNumber)
	if len(accountNumber) != 10 || !allDigits(accountNumber) {
		return nil, fmt.Errorf("%w: an account number must be exactly 10 digits", ErrInvalid)
	}
	var group models.Group
	if err := s.db.Where("virtual_account_number = ?", accountNumber).First(&group).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: no pot collection account matches %s", ErrAccountNotFound, accountNumber)
		}
		return nil, err
	}
	out := &PotAccount{
		GroupID:       group.ID,
		GroupName:     group.Name,
		AccountNumber: group.VirtualAccountNumber,
		BankName:      group.VirtualAccountBank,
		AccountName:   group.VirtualAccountName,
	}
	var m models.Membership
	if err := s.db.Where("group_id = ? AND user_id = ? AND status = ?", group.ID, userID, models.MembershipActive).
		First(&m).Error; err == nil {
		out.IsMember = true
		var levy models.Levy
		if err := s.db.Where("group_id = ? AND status = ?", group.ID, "open").
			Order("created_at DESC").First(&levy).Error; err == nil {
			paid, perr := paidByUserTx(s.db, group.ID, levy.ID, userID)
			if perr == nil && levy.AmountKobo-paid > 0 {
				out.OutstandingKobo = levy.AmountKobo - paid
			}
		}
	}
	return out, nil
}

// LookupUser resolves a PotKeeper recipient (email or phone) to a display
// name, so a transfer to another member can be confirmed before it is sent.
func (s *Service) LookupUser(_ context.Context, recipient string) (*LookedUpUser, error) {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return nil, fmt.Errorf("%w: a recipient is required", ErrInvalid)
	}
	var user models.User
	err := s.db.Where("LOWER(email) = ?", strings.ToLower(recipient)).Or("phone = ?", recipient).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: no PotKeeper user matches %s", ErrAccountNotFound, recipient)
		}
		return nil, err
	}
	return &LookedUpUser{ID: user.ID, Name: user.Name, Email: user.Email, Phone: user.Phone}, nil
}
