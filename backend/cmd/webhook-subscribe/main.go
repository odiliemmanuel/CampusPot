// Command webhook-subscribe registers PotKeeper's callback URL with B Moni so
// deposits and payouts arrive as employee.* events on the partner-scoped
// subscription. Run it once per environment; it prints the secretKey B Moni
// issues, which you then store as BMONI_WEBHOOK_SECRET.
//
// Usage:
//
//	BMONI_API_KEY=... BMONI_PARTNER_ID=... \
//	go run ./cmd/webhook-subscribe -url https://api.example.com/api/v1/webhooks/bmoni
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/odiliemmmanuel/campuspot/config"
)

// events are the partner-scoped names B Moni remaps money movement to. Do not
// use wallet.* here: a partner-scoped subscription never receives those.
var events = []string{
	"employee.deposit.completed",
	"employee.withdrawal.completed",
	"employee.withdrawal.failed",
	"employee.withdrawal.processing",
	"onboarding.completed",
	"kyc.action_required",
}

func main() {
	cfg := config.Load()

	url := flag.String("url", os.Getenv("WEBHOOK_CALLBACK_URL"), "HTTPS callback URL B Moni should POST deliveries to")
	flag.Parse()

	if cfg.BMoniAPIKey == "" {
		log.Fatal("webhook-subscribe: BMONI_API_KEY is required")
	}
	if cfg.BMoniPartnerID == "" {
		log.Fatal("webhook-subscribe: BMONI_PARTNER_ID is required (without it you get the legacy wallet.* subscription)")
	}
	if *url == "" {
		log.Fatal("webhook-subscribe: -url (or WEBHOOK_CALLBACK_URL) is required")
	}

	body, err := json.Marshal(map[string]interface{}{
		"callbackUrl": *url,
		"events":      events,
		"partnerId":   cfg.BMoniPartnerID,
		"active":      true,
	})
	if err != nil {
		log.Fatalf("webhook-subscribe: encode request: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, cfg.BMoniBaseURL+"/v1/webhooks/config", bytes.NewReader(body))
	if err != nil {
		log.Fatalf("webhook-subscribe: build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", cfg.BMoniAPIKey)

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		log.Fatalf("webhook-subscribe: %v", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusConflict {
		log.Fatal("webhook-subscribe: subscription already exists — use PATCH /v1/webhooks/config to update it")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Fatalf("webhook-subscribe: B Moni returned %d: %s", resp.StatusCode, raw)
	}

	var out struct {
		ID        string `json:"id"`
		SecretKey string `json:"secretKey"`
	}
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &envelope); err == nil && len(envelope.Data) > 0 {
		_ = json.Unmarshal(envelope.Data, &out)
	} else {
		_ = json.Unmarshal(raw, &out)
	}

	fmt.Printf("webhook subscription ready\n  id: %s\n  callbackUrl: %s\n  events: %v\n", out.ID, *url, events)
	if out.SecretKey != "" {
		fmt.Printf("  secretKey: %s\n\nStore this as BMONI_WEBHOOK_SECRET now — B Moni prints it only once.\n", out.SecretKey)
	}
}
