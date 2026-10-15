package bmoni

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"sync"

	"github.com/google/uuid"
)

// MockClient implements Client with synthetic, deterministic data. It is the
// default so the demo runs end-to-end without the sandbox. All accounts and
// amounts are fake — no real money, BVN, or bank details are involved.
type MockClient struct {
	mu    sync.Mutex
	seq   int
	users map[string]string // email -> bmoni user id
}

// NewMockClient returns a ready-to-use mock.
func NewMockClient() *MockClient {
	return &MockClient{users: make(map[string]string)}
}

func (m *MockClient) CreateUser(_ context.Context, req CreateUserRequest) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id, ok := m.users[req.Email]; ok {
		return User{ID: id}, nil
	}
	m.seq++
	id := fmt.Sprintf("bmoni_usr_%s", uuid.NewString()[:8])
	m.users[req.Email] = id
	return User{ID: id}, nil
}

func (m *MockClient) CreateWallet(_ context.Context, req CreateWalletRequest) (Wallet, error) {
	return Wallet{
		ID:       "bmoni_wal_" + uuid.NewString()[:8],
		Address:  "0x" + fmt.Sprintf("%08x", hash32(req.BMoniUserID+req.Currency)),
		Currency: req.Currency,
		Status:   "active",
	}, nil
}

func (m *MockClient) StartNigeriaOnboarding(_ context.Context, req NigeriaOnboardingRequest) (OnboardingResult, error) {
	// The sandbox test BVN is documented; any 11-digit value works in mock.
	if len(req.BVN) != 11 {
		return OnboardingResult{}, fmt.Errorf("bmoni(mock): bvn must be 11 digits")
	}
	return OnboardingResult{
		Currency:             "CNGN",
		Status:               "active",
		VirtualAccountNumber: nuban(req.BMoniUserID),
		BankName:             "Wema Bank (sandbox)",
		AccountName:          "CAMPUSPOT SANDBOX",
	}, nil
}

func (m *MockClient) GetDepositAccount(_ context.Context, bmoniUserID string) (DepositAccount, error) {
	return DepositAccount{
		Number:      nuban(bmoniUserID),
		BankName:    "Wema Bank (sandbox)",
		AccountName: "CAMPUSPOT SANDBOX",
		Currency:    "NGN",
	}, nil
}

func (m *MockClient) ListNigerianBanks(_ context.Context, _ string) ([]Bank, error) {
	return []Bank{
		{Name: "Guaranty Trust Bank", Code: "058"},
		{Name: "Zenith Bank", Code: "057"},
		{Name: "Access Bank", Code: "044"},
		{Name: "First Bank of Nigeria", Code: "011"},
		{Name: "Wema Bank", Code: "035"},
	}, nil
}

func (m *MockClient) VerifyNigerianAccount(_ context.Context, _, accountNumber, bankCode string) (AccountHolder, error) {
	if len(accountNumber) != 10 {
		return AccountHolder{}, fmt.Errorf("bmoni(mock): account number must be 10 digits")
	}
	return AccountHolder{Name: fmt.Sprintf("SANDBOX HOLDER %s/%s", bankCode, accountNumber[6:])}, nil
}

func (m *MockClient) RegisterWithdrawalAccount(_ context.Context, req RegisterWithdrawalRequest) (WithdrawalAccount, error) {
	return WithdrawalAccount{
		ID:                "bmoni_bank_" + uuid.NewString()[:8],
		AccountNumber:     req.AccountNumber,
		BankCode:          req.BankCode,
		BankName:          req.BankName,
		AccountHolderName: req.AccountHolderName,
	}, nil
}

func (m *MockClient) CreateNigeriaOfframp(_ context.Context, req OfframpRequest) (Proposal, error) {
	return Proposal{
		ID:     "bmoni_prop_" + uuid.NewString()[:8],
		Status: "PENDING_APPROVALS",
		Amount: req.FromAmount,
	}, nil
}

func (m *MockClient) GetProposal(_ context.Context, _, proposalID string) (Proposal, error) {
	return Proposal{ID: proposalID, Status: "COMPLETED"}, nil
}

// nuban derives a stable, fake 10-digit NUBAN from an id.
func nuban(id string) string {
	h := hash64(id)
	return fmt.Sprintf("%010d", h%10_000_000_000)
}

func hash32(s string) uint32 {
	sum := sha256.Sum256([]byte(s))
	return binary.BigEndian.Uint32(sum[:4])
}

func hash64(s string) uint64 {
	sum := sha256.Sum256([]byte(s))
	return binary.BigEndian.Uint64(sum[:8])
}
