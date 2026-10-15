package bmoni

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// HTTPClient is the real B Moni Embedded API client. Every request carries the
// partner API key in the x-api-key header.
type HTTPClient struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

// NewHTTPClient builds a client against baseURL (sandbox or production).
func NewHTTPClient(baseURL, apiKey string) *HTTPClient {
	return &HTTPClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 20 * time.Second},
	}
}

// do performs a JSON request and decodes the response into out.
// B Moni wraps payloads in {"data": ...}; the envelope is unwrapped here.
func (c *HTTPClient) do(ctx context.Context, method, path string, body, out interface{}) error {
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("bmoni: encode request: %w", err)
		}
		reader = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("bmoni: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("bmoni: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("bmoni: %s %s returned %d: %s", method, path, resp.StatusCode, string(raw))
	}
	if out == nil {
		return nil
	}

	// Unwrap the {"data": ...} envelope when present, else decode directly.
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &envelope); err == nil && len(envelope.Data) > 0 {
		return json.Unmarshal(envelope.Data, out)
	}
	return json.Unmarshal(raw, out)
}

func (c *HTTPClient) CreateUser(ctx context.Context, req CreateUserRequest) (User, error) {
	var out User
	err := c.do(ctx, http.MethodPost, "/v1/users", req, &out)
	return out, err
}

func (c *HTTPClient) CreateWallet(ctx context.Context, req CreateWalletRequest) (Wallet, error) {
	var out Wallet
	path := fmt.Sprintf("/v1/users/%s/smart-wallets/create-managed", url.PathEscape(req.BMoniUserID))
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *HTTPClient) StartNigeriaOnboarding(ctx context.Context, req NigeriaOnboardingRequest) (OnboardingResult, error) {
	var out OnboardingResult
	path := fmt.Sprintf("/v1/users/%s/onboarding/start-nigeria", url.PathEscape(req.BMoniUserID))
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *HTTPClient) GetDepositAccount(ctx context.Context, bmoniUserID string) (DepositAccount, error) {
	var out DepositAccount
	path := fmt.Sprintf("/v1/users/%s/bank-accounts/deposit-accounts/NGN", url.PathEscape(bmoniUserID))
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

func (c *HTTPClient) ListNigerianBanks(ctx context.Context, bmoniUserID string) ([]Bank, error) {
	var out []Bank
	path := fmt.Sprintf("/v1/users/%s/bank-accounts/nigerian-banks", url.PathEscape(bmoniUserID))
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

func (c *HTTPClient) VerifyNigerianAccount(ctx context.Context, bmoniUserID, accountNumber, bankCode string) (AccountHolder, error) {
	var out AccountHolder
	path := fmt.Sprintf("/v1/users/%s/bank-accounts/verify-nigerian-account", url.PathEscape(bmoniUserID))
	err := c.do(ctx, http.MethodPost, path, map[string]string{
		"accountNumber": accountNumber,
		"bankCode":      bankCode,
	}, &out)
	return out, err
}

func (c *HTTPClient) RegisterWithdrawalAccount(ctx context.Context, req RegisterWithdrawalRequest) (WithdrawalAccount, error) {
	var out WithdrawalAccount
	path := fmt.Sprintf("/v1/users/%s/bank-accounts/withdrawal-accounts/nigeria", url.PathEscape(req.BMoniUserID))
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *HTTPClient) CreateNigeriaOfframp(ctx context.Context, req OfframpRequest) (Proposal, error) {
	var out Proposal
	path := fmt.Sprintf("/v1/users/%s/smart-wallets/%s/offramp/nigeria",
		url.PathEscape(req.BMoniUserID), url.PathEscape(req.WalletID))
	body := map[string]string{
		"bankAccountId": req.BankAccountID,
		"fromAmount":    req.FromAmount,
	}
	err := c.do(ctx, http.MethodPost, path, body, &out)
	return out, err
}

func (c *HTTPClient) GetProposal(ctx context.Context, bmoniUserID, proposalID string) (Proposal, error) {
	var out Proposal
	path := fmt.Sprintf("/v1/users/%s/smart-wallets/proposals/%s", url.PathEscape(bmoniUserID), url.PathEscape(proposalID))
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}
