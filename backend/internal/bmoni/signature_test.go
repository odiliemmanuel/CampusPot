package bmoni

import (
	"context"
	"testing"
)

func TestVerifySignature(t *testing.T) {
	secret := "test-webhook-secret" // test fixture only — never a real key
	body := []byte(`{"id":"evt_1","eventType":"employee.deposit.completed","payload":{"amount":"5000.00"}}`)
	sig := Sign(body, secret)

	if !VerifySignature(body, sig, secret) {
		t.Fatal("expected valid signature to verify")
	}
	if VerifySignature(body, sig, "wrong-secret") {
		t.Fatal("signature must not verify under a different secret")
	}
	if VerifySignature([]byte(`{"tampered":true}`), sig, secret) {
		t.Fatal("signature must not verify for a modified body")
	}
	if VerifySignature(body, "", secret) {
		t.Fatal("empty signature must not verify")
	}
	if VerifySignature(body, sig, "") {
		t.Fatal("empty secret must not verify")
	}
}

func TestMockLifecycle(t *testing.T) {
	c := NewMockClient()
	ctx := context.Background()

	u, err := c.CreateUser(ctx, CreateUserRequest{FirstName: "Ada", LastName: "Obi", Email: "ada@example.com"})
	if err != nil || u.ID == "" {
		t.Fatalf("CreateUser: id=%q err=%v", u.ID, err)
	}

	// Same email must return the same user (no duplicate users on relaunch).
	again, _ := c.CreateUser(ctx, CreateUserRequest{FirstName: "Ada", LastName: "Obi", Email: "ada@example.com"})
	if again.ID != u.ID {
		t.Fatalf("expected stable user id, got %q then %q", u.ID, again.ID)
	}

	w, err := c.CreateWallet(ctx, CreateWalletRequest{BMoniUserID: u.ID, Currency: "CNGN", UserOwnerAddress: "0xabc"})
	if err != nil || w.Currency != "CNGN" {
		t.Fatalf("CreateWallet: %+v err=%v", w, err)
	}

	on, err := c.StartNigeriaOnboarding(ctx, NigeriaOnboardingRequest{BMoniUserID: u.ID, BVN: "22222222222", WalletAddress: w.Address})
	if err != nil {
		t.Fatalf("StartNigeriaOnboarding: %v", err)
	}
	if len(on.VirtualAccountNumber) != 10 {
		t.Fatalf("expected 10-digit NUBAN, got %q", on.VirtualAccountNumber)
	}

	if _, err := c.StartNigeriaOnboarding(ctx, NigeriaOnboardingRequest{BVN: "123"}); err == nil {
		t.Fatal("expected error for malformed BVN")
	}
}
