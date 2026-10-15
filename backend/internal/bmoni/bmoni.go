// Package bmoni is the CampusPot wrapper around the B Moni Embedded API.
//
// Everything CampusPot needs from B Moni goes through the Client interface, so
// the rest of the app never talks HTTP directly. Two implementations exist:
//
//   - HTTPClient talks to the sandbox (or production) API.
//   - MockClient returns synthetic data and is the default for demos, so the
//     product works even when the sandbox is unreachable or no key is set.
//
// SANDBOX ONLY. Never use real money, BVN, or bank accounts with this code.
package bmoni

import "context"

// Client is the full surface CampusPot uses from B Moni.
type Client interface {
	// Lifecycle: create the user and provision a smart wallet.
	CreateUser(ctx context.Context, req CreateUserRequest) (User, error)
	CreateWallet(ctx context.Context, req CreateWalletRequest) (Wallet, error)

	// Nigeria onboarding activates the NGN rail and issues the virtual Naira
	// account (NUBAN) that members pay into.
	StartNigeriaOnboarding(ctx context.Context, req NigeriaOnboardingRequest) (OnboardingResult, error)
	GetDepositAccount(ctx context.Context, bmoniUserID string) (DepositAccount, error)

	// Bank withdrawals: look up code, verify account, register, then offramp.
	ListNigerianBanks(ctx context.Context, bmoniUserID string) ([]Bank, error)
	VerifyNigerianAccount(ctx context.Context, bmoniUserID, accountNumber, bankCode string) (AccountHolder, error)
	RegisterWithdrawalAccount(ctx context.Context, req RegisterWithdrawalRequest) (WithdrawalAccount, error)
	CreateNigeriaOfframp(ctx context.Context, req OfframpRequest) (Proposal, error)
	GetProposal(ctx context.Context, bmoniUserID, proposalID string) (Proposal, error)
}

// CreateUserRequest is POST /v1/users. B Moni expects the name split into
// first and last, with an E.164 phone number (e.g. "+2348012345678").
type CreateUserRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Phone     string `json:"phoneNumber,omitempty"`
}

// User is the minimal B Moni user representation we persist.
type User struct {
	ID string `json:"id"`
}

// CreateWalletRequest parameters for POST /v1/users/{userId}/smart-wallets/
// create-managed. Currency must be the stablecoin code (CNGN for Naira), not
// the fiat code.
//
// UNVERIFIED: B Moni requires the wallet owner to sign an EIP-191 owner-proof
// challenge on-device (ownerProofChallengeId + ownerProofSignature) before a
// managed wallet is deployed. This backend-only integration cannot produce
// that signature, so CreateWallet falls back to the mock (see FallbackClient).
type CreateWalletRequest struct {
	BMoniUserID           string `json:"-"`
	Currency              string `json:"currency"`
	UserOwnerAddress      string `json:"userOwnerAddress"`
	OwnerProofChallengeID string `json:"ownerProofChallengeId,omitempty"`
	OwnerProofSignature   string `json:"ownerProofSignature,omitempty"`
}

// Wallet is a provisioned smart wallet.
type Wallet struct {
	ID       string `json:"id"`
	Address  string `json:"address"`
	Currency string `json:"currency"`
	Status   string `json:"status"`
}

// NigeriaOnboardingRequest activates the NGN rail and issues the NUBAN via
// POST /v1/users/{userId}/onboarding/start-nigeria. The wallet fields are
// currency-prefixed (ngnWalletAddress / ngnWalletIndex) per the API contract.
type NigeriaOnboardingRequest struct {
	BMoniUserID   string `json:"-"`
	BVN           string `json:"bvn"`
	WalletAddress string `json:"ngnWalletAddress"`
	WalletIndex   int    `json:"ngnWalletIndex"`
}

// OnboardingResult reports the activated currency and the issued account.
type OnboardingResult struct {
	Currency             string `json:"currency"`
	Status               string `json:"status"`
	VirtualAccountNumber string `json:"virtualAccountNumber"`
	BankName             string `json:"bankName"`
	AccountName          string `json:"accountName"`
}

// DepositAccount is GET /bank-accounts/deposit-accounts/NGN.
type DepositAccount struct {
	Number      string `json:"accountNumber"`
	BankName    string `json:"bankName"`
	AccountName string `json:"accountName"`
	Currency    string `json:"currency"`
}

// Bank is one entry from the Nigerian banks list.
type Bank struct {
	Name string `json:"name"`
	Code string `json:"code"`
}

// AccountHolder is the result of account-name verification.
type AccountHolder struct {
	Name string `json:"accountHolderName"`
}

// RegisterWithdrawalRequest registers a payout account.
type RegisterWithdrawalRequest struct {
	BMoniUserID       string `json:"userId"`
	AccountNumber     string `json:"accountNumber"`
	BankCode          string `json:"bankCode"`
	BankName          string `json:"bankName"`
	AccountHolderName string `json:"accountHolderName"`
}

// WithdrawalAccount is a registered payout destination.
type WithdrawalAccount struct {
	ID                string `json:"id"`
	AccountNumber     string `json:"accountNumber"`
	BankCode          string `json:"bankCode"`
	BankName          string `json:"bankName"`
	AccountHolderName string `json:"accountHolderName"`
}

// OfframpRequest creates a payout proposal.
type OfframpRequest struct {
	BMoniUserID   string `json:"userId"`
	WalletID      string `json:"walletId"`
	BankAccountID string `json:"bankAccountId"`
	FromAmount    string `json:"fromAmount"` // decimal string, e.g. "5000.00"
}

// Proposal is a withdrawal awaiting approvals/signatures.
type Proposal struct {
	ID     string `json:"proposalId"`
	Status string `json:"status"`
	Amount string `json:"amount,omitempty"`
}
