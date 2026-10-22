package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
	"github.com/odiliemmmanuel/campuspot/internal/pot"
)

// llmClient is a minimal OpenAI-compatible chat-completions client. Any
// provider that speaks the same schema (OpenAI, Groq, Together, local vLLM)
// works by setting AI_BASE_URL.
type llmClient struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
}

func newLLMClient(baseURL, apiKey, model string) *llmClient {
	return &llmClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		model:   model,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func (c *llmClient) chat(ctx context.Context, system, user string) (string, error) {
	body, _ := json.Marshal(chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.4,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("ai: llm returned %d: %s", resp.StatusCode, string(raw))
	}
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("ai: empty completion")
	}
	return out.Choices[0].Message.Content, nil
}

// DraftReminder asks the LLM for a short, tone-appropriate nudge. The facts
// (name, amount, reference) come from the pot engine; the model only phrases.
func (c *llmClient) DraftReminder(ctx context.Context, name string, levy *models.Levy, o *pot.OutstandingMember, tone string) (string, error) {
	system := "You are PotKeeper, a friendly treasurer for Nigerian student group money. " +
		"Write short WhatsApp reminders in clear, warm English (a little Nigerian Pidgin is welcome when the tone is friendly). " +
		"Never invent numbers. Use only the facts given. One or two sentences max."
	levyTitle := "the group levy"
	if levy != nil {
		levyTitle = levy.Title
	}
	user := fmt.Sprintf(
		"Tone: %s\nMember: %s\nOutstanding: %s\nLevy: %s\nPayment reference: %s\nWrite the reminder.",
		tone, name, money.Kobo(o.OutstandingKobo).Format(), levyTitle, o.Reference)
	return c.chat(ctx, system, user)
}

// AnswerPotQuestion answers open-ended questions from a deliberately small,
// read-only snapshot of the current pot. Payout account details are excluded.
func (c *llmClient) AnswerPotQuestion(ctx context.Context, question string, sum *pot.GroupSummary, outstanding []pot.OutstandingMember, levy *models.Levy, expenses []models.ExpenseRequest) (string, error) {
	type memberFact struct {
		Name      string `json:"name"`
		State     string `json:"state"`
		PaidKobo  int64  `json:"paidKobo"`
		OwingKobo int64  `json:"owingKobo"`
	}
	type payoutFact struct {
		AmountKobo int64  `json:"amountKobo"`
		Category   string `json:"category,omitempty"`
		Status     string `json:"status"`
		Risk       string `json:"risk"`
	}
	contextData := map[string]interface{}{
		"groupName": sum.GroupName, "currency": sum.Currency,
		"balanceKobo": sum.BalanceKobo, "collectedKobo": sum.CollectedKobo,
		"spentKobo": sum.SpentKobo, "members": sum.Members,
		"paidCount": sum.PaidCount, "partialCount": sum.PartialCount,
		"unpaidCount": sum.OutstandingCount, "outstandingKobo": sum.OutstandingKobo,
		"pendingPayouts": sum.PendingExpenses, "openDisputes": sum.OpenDisputes,
		"spendingFrozen": sum.SpendingFrozen,
	}
	if levy != nil {
		contextData["openLevy"] = map[string]interface{}{"title": levy.Title, "amountKobo": levy.AmountKobo, "dueDate": levy.DueDate}
	}
	members := make([]memberFact, 0, len(outstanding))
	for _, m := range outstanding {
		members = append(members, memberFact{Name: m.Name, State: m.State, PaidKobo: m.PaidKobo, OwingKobo: m.OutstandingKobo})
	}
	contextData["membersOwing"] = members
	latest := make([]payoutFact, 0, 8)
	for i, e := range expenses {
		if i >= 8 {
			break
		}
		latest = append(latest, payoutFact{AmountKobo: e.AmountKobo, Category: e.Category, Status: e.Status, Risk: e.RiskLevel})
	}
	contextData["recentPayouts"] = latest
	encoded, err := json.Marshal(contextData)
	if err != nil {
		return "", err
	}
	system := "You are PotKeeper's AI treasurer for a Nigerian student group. Answer the user's question conversationally and specifically using only the supplied current-pot snapshot. The snapshot amounts are integer kobo (100 kobo = ₦1); format them as naira. You may explain balances, contributions, member arrears, payout status, spending and disputes. If a fact is absent, say you cannot see it. Never invent details, claim to have sent messages, approve or initiate payouts, or imply you can move money. Politely redirect questions unrelated to this pot toward the pot's money and group activity. Keep answers concise and friendly."
	user := "Current pot snapshot (JSON):\n" + string(encoded) + "\n\nMember question: " + strings.TrimSpace(question)
	return c.chat(ctx, system, user)
}
