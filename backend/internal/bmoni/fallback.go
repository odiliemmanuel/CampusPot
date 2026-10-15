package bmoni

import "context"

// FallbackClient tries the real B Moni API first and transparently falls back to
// the in-process mock when a call fails.
//
// It exists because several B Moni endpoints are only reachable with an
// on-device owner wallet and EIP-191 signatures (smart-wallet provisioning,
// owner-proof challenges, proposals). A backend-only integration cannot
// produce those, so the mock keeps the demo working even when a real API key
// is configured. Verified endpoints (e.g. POST /v1/users) still hit the API;
// unverified ones degrade to the mock rather than breaking the request.
type FallbackClient struct {
	primary  Client
	fallback Client
}

// NewFallbackClient pairs a real client with a mock fallback.
func NewFallbackClient(primary, fallback Client) *FallbackClient {
	return &FallbackClient{primary: primary, fallback: fallback}
}

func (c *FallbackClient) CreateUser(ctx context.Context, req CreateUserRequest) (User, error) {
	if out, err := c.primary.CreateUser(ctx, req); err == nil {
		return out, nil
	}
	return c.fallback.CreateUser(ctx, req)
}

func (c *FallbackClient) CreateWallet(ctx context.Context, req CreateWalletRequest) (Wallet, error) {
	if out, err := c.primary.CreateWallet(ctx, req); err == nil {
		return out, nil
	}
	return c.fallback.CreateWallet(ctx, req)
}

func (c *FallbackClient) StartNigeriaOnboarding(ctx context.Context, req NigeriaOnboardingRequest) (OnboardingResult, error) {
	if out, err := c.primary.StartNigeriaOnboarding(ctx, req); err == nil {
		return out, nil
	}
	return c.fallback.StartNigeriaOnboarding(ctx, req)
}

func (c *FallbackClient) GetDepositAccount(ctx context.Context, bmoniUserID string) (DepositAccount, error) {
	if out, err := c.primary.GetDepositAccount(ctx, bmoniUserID); err == nil {
		return out, nil
	}
	return c.fallback.GetDepositAccount(ctx, bmoniUserID)
}

func (c *FallbackClient) ListNigerianBanks(ctx context.Context, bmoniUserID string) ([]Bank, error) {
	if out, err := c.primary.ListNigerianBanks(ctx, bmoniUserID); err == nil {
		return out, nil
	}
	return c.fallback.ListNigerianBanks(ctx, bmoniUserID)
}

func (c *FallbackClient) VerifyNigerianAccount(ctx context.Context, bmoniUserID, accountNumber, bankCode string) (AccountHolder, error) {
	if out, err := c.primary.VerifyNigerianAccount(ctx, bmoniUserID, accountNumber, bankCode); err == nil {
		return out, nil
	}
	return c.fallback.VerifyNigerianAccount(ctx, bmoniUserID, accountNumber, bankCode)
}

func (c *FallbackClient) RegisterWithdrawalAccount(ctx context.Context, req RegisterWithdrawalRequest) (WithdrawalAccount, error) {
	if out, err := c.primary.RegisterWithdrawalAccount(ctx, req); err == nil {
		return out, nil
	}
	return c.fallback.RegisterWithdrawalAccount(ctx, req)
}

func (c *FallbackClient) CreateNigeriaOfframp(ctx context.Context, req OfframpRequest) (Proposal, error) {
	if out, err := c.primary.CreateNigeriaOfframp(ctx, req); err == nil {
		return out, nil
	}
	return c.fallback.CreateNigeriaOfframp(ctx, req)
}

func (c *FallbackClient) GetProposal(ctx context.Context, bmoniUserID, proposalID string) (Proposal, error) {
	if out, err := c.primary.GetProposal(ctx, bmoniUserID, proposalID); err == nil {
		return out, nil
	}
	return c.fallback.GetProposal(ctx, bmoniUserID, proposalID)
}
