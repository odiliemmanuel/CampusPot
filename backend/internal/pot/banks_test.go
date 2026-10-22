package pot

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/odiliemmmanuel/campuspot/common/money"
	"github.com/odiliemmmanuel/campuspot/internal/models"
)

func TestVerifyBankAccount(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	user := newUser(t, db, "Ada", "ada@x.ng")

	// A real sandbox account resolves to a holder name.
	v, err := svc.VerifyBankAccount(ctx, user.ID, "0123456789", "GTBank", "")
	if err != nil {
		t.Fatalf("VerifyBankAccount: %v", err)
	}
	if v.AccountHolderName == "" || v.BankCode == "" {
		t.Fatalf("expected a resolved name and bank code, got %+v", v)
	}

	// An account that does not exist raises ACCOUNT_NOT_FOUND.
	_, err = svc.VerifyBankAccount(ctx, user.ID, "0001234567", "GTBank", "")
	if !errors.Is(err, ErrAccountNotFound) {
		t.Fatalf("expected ErrAccountNotFound for 000-prefixed account, got %v", err)
	}

	// A malformed number is an invalid request, not an unknown account.
	_, err = svc.VerifyBankAccount(ctx, user.ID, "1234", "GTBank", "")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for short account number, got %v", err)
	}

	// An unknown bank is rejected.
	_, err = svc.VerifyBankAccount(ctx, user.ID, "0123456789", "Fake Bank", "")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for unknown bank, got %v", err)
	}
}

func TestLookupUser(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	newUser(t, db, "Ada Okafor", "ada@x.ng")

	found, err := svc.LookupUser(ctx, "ada@x.ng")
	if err != nil {
		t.Fatalf("LookupUser: %v", err)
	}
	if found.Name != "Ada Okafor" {
		t.Fatalf("expected Ada Okafor, got %q", found.Name)
	}

	_, err = svc.LookupUser(ctx, "nobody@x.ng")
	if !errors.Is(err, ErrAccountNotFound) {
		t.Fatalf("expected ErrAccountNotFound for unknown user, got %v", err)
	}
}

func TestWalletBankSendRequiresExistingAccount(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	ada := newUser(t, db, "Ada", "ada@x.ng")

	// Fund the wallet.
	if _, err := svc.WalletDeposit(ctx, ada.ID, WalletDepositRequest{AmountKobo: int64(money.FromNaira(10_000))}); err != nil {
		t.Fatalf("WalletDeposit: %v", err)
	}

	// A send to an account that does not exist is refused before any debit.
	_, err := svc.WalletTransfer(ctx, ada.ID, WalletTransferRequest{
		AmountKobo: int64(money.FromNaira(1_000)), Recipient: "0001234567", BankName: "GTBank",
	})
	if !errors.Is(err, ErrAccountNotFound) {
		t.Fatalf("expected ErrAccountNotFound, got %v", err)
	}
	w, err := svc.Wallet(ctx, ada.ID)
	if err != nil {
		t.Fatalf("Wallet: %v", err)
	}
	if w.BalanceKobo != int64(money.FromNaira(10_000)) {
		t.Fatalf("balance must be untouched after a refused send, got %d", w.BalanceKobo)
	}

	// A verified send records the resolved holder name on the transaction.
	w, err = svc.WalletTransfer(ctx, ada.ID, WalletTransferRequest{
		AmountKobo: int64(money.FromNaira(1_000)), Recipient: "0123456789", BankName: "GTBank",
	})
	if err != nil {
		t.Fatalf("WalletTransfer: %v", err)
	}
	if len(w.Transactions) == 0 || !strings.Contains(w.Transactions[0].Counterparty, "SANDBOX HOLDER") {
		t.Fatalf("expected the verified holder name in the counterparty, got %+v", w.Transactions)
	}
}

func TestWalletTransferLowBalanceAlert(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	ada := newUser(t, db, "Ada", "ada@x.ng")

	_, err := svc.WalletTransfer(ctx, ada.ID, WalletTransferRequest{
		AmountKobo: int64(money.FromNaira(5_000)), Recipient: "0123456789", BankName: "GTBank",
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("expected ErrConflict for low balance, got %v", err)
	}
	if !strings.Contains(err.Error(), "low balance") || !strings.Contains(err.Error(), "₦5,000.00") {
		t.Fatalf("expected the alert to name the shortfall, got %q", err.Error())
	}
}

func TestExpenseRejectsNonexistentAccount(t *testing.T) {
	ctx := context.Background()
	svc, db := newTestService(t)
	treasurer := newUser(t, db, "Ada", "ada@x.ng")

	group, err := svc.CreateGroup(ctx, treasurer.ID, testGroupRequest("G"))
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}

	_, err = svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{
		AmountKobo: int64(money.FromNaira(1_000)), DestinationType: models.ExpenseBank,
		Recipient: "0001234567", BankName: "GTBank",
	})
	if !errors.Is(err, ErrAccountNotFound) {
		t.Fatalf("expected ErrAccountNotFound, got %v", err)
	}

	// The verified name — not a typed-in one — is what gets stored.
	exp, err := svc.CreateExpense(ctx, group.ID, treasurer.ID, CreateExpenseRequest{
		AmountKobo: int64(money.FromNaira(1_000)), DestinationType: models.ExpenseBank,
		Recipient: "0123456789", BankName: "GTBank", AccountName: "SOMEONE ELSE",
	})
	if err != nil {
		t.Fatalf("CreateExpense: %v", err)
	}
	if !strings.Contains(exp.AccountName, "SANDBOX HOLDER") {
		t.Fatalf("expected the bank-verified name to override the typed one, got %q", exp.AccountName)
	}
	if !strings.Contains(exp.Destination, exp.AccountName) {
		t.Fatalf("expected the destination to show the verified name, got %q", exp.Destination)
	}
}
