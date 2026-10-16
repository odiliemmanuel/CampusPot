# PotKeeper

**An AI treasurer for campus group money.**

PotKeeper is a shared group wallet with a safety rail: money can only leave the
pot when a quorum of co-signers approves it, and an AI treasurer answers the
questions every class rep and society treasurer gets asked a hundred times a
week — *"Who hasn't paid?"*, *"How much do we have left?"*, *"Can we afford
this?"*.

Built for the **B Moni x TINC26 hackathon** — theme *"From Access to Agency"*.

---

## The user

**The user is a class representative or society treasurer at a Nigerian
university — typically 18–24, handling ₦50,000–₦500,000 of other students'
money through a personal bank account and a WhatsApp group.**

They are not accountants. They are trusted because they are *present*, not
because they have financial training. Every semester they face the same
problems:

- Contributions land in a **personal account**, so there is no separation
  between the treasurer's money and the group's money.
- "Who has paid?" is answered by **scrolling chat history** and squinting at
  bank alerts.
- Reminders are **awkward and personal** — asking a friend for money is a social
  cost, so people avoid it until resentment builds.
- Spending decisions rely on **one person's memory**, with no record of who
  approved what.
- When the semester ends, there is **no clean statement** to hand over.

PotKeeper gives that person a real account for the group, automatic payment
reconciliation, and an assistant that does the awkward asking — while making it
*structurally impossible* for any single person (including the AI) to move
money alone.

---

## What it does

### 1. A real home for the money
When a treasurer creates a pot, PotKeeper provisions a **B Moni smart wallet**
plus a dedicated **Naira virtual account (NUBAN)**. Members pay into that
account the way they already pay anyone — a normal bank transfer. The money is
never mixed with anyone's personal account.

### 2. Automatic reconciliation
Every member gets a **unique payment reference**. When an incoming transfer
arrives (via B Moni's deposit webhook, or a manual entry for cash), PotKeeper
matches it to the member who owes, updates the ledger, and flips their status
from `unpaid` → `partial` → `paid`. Unmatched payments are still banked and
flagged for review — no money is ever lost.

### 3. An AI treasurer that only reads
Ask in plain language and get answers grounded in the ledger:

> **Treasurer:** Who hasn't paid the excursion levy?
> **PotKeeper:** 3 member(s) still owing on "Excursion levy" (₦5,000.00 each):
> Chidi Nwosu (₦5,000.00, unpaid), Fatima Yusuf (₦3,000.00, partial), …
> Total outstanding: ₦13,000.00.

The assistant can also **draft reminders** (with adjustable tone) and
**explain risk flags** on spending requests. It is deliberately **read-only**:
it never moves money and never sends a message without the treasurer's explicit
confirmation.

### 4. 2-of-3 approval on every payout
Spending is a two-step, multi-person process:

1. The treasurer **requests** an expense. No money moves.
2. Co-signers **approve or reject**. When the quorum is met, the pot is marked
   approved.
3. Only then can an approved payout be **executed** to the destination.

A requester **cannot approve their own request**. A configurable
`largeExpenseKobo` soft limit flags unusually large spends as high-risk before
anyone signs off.

---

## Architecture

```
                         ┌──────────────────────────┐
   members ──transfer──▶ │  B Moni NUBAN (virtual)  │
                         └────────────┬─────────────┘
                                      │ webhook
                                      ▼
   ┌───────────────┐        ┌────────────────────┐        ┌──────────────┐
   │  REST API     │◀──────▶│  pot engine        │◀──────▶│  PostgreSQL/ │
   │  (Gin)        │        │  ledger + reconcile│        │  SQLite      │
   └──────┬────────┘        │  2-of-3 approvals  │        └──────────────┘
          │                 └────────────────────┘
          │                          ▲
   ┌──────▼────────┐        ┌────────┴─────────┐
   │ AI treasurer  │───────▶│  read-only views  │
   │ (LLM or rules)│        │  (summary, owing) │
   └───────────────┘        └───────────────────┘
```

- **Gin** HTTP API, **GORM** ORM. PostgreSQL in production, pure-Go SQLite for a
  zero-setup local demo and for tests.
- The **pot engine** is the only component that touches balances. It writes an
  append-only **ledger** (`balanceAfterKobo` on every entry) and enforces roles,
  approvals, and idempotency.
- The **B Moni client** sits behind an interface with three implementations:
  an HTTP client (real sandbox), an in-process **mock** (default for demos), and
  a shared HMAC signature verifier.
- The **AI treasurer** sits behind the pot engine's read-only queries. When no
  LLM key is configured it falls back to a deterministic rule-based responder,
  so the demo always works offline.

---

## Quickstart (zero setup, SQLite)

```bash
# 1. Build and run against a local SQLite file — no database server needed.
DB_DRIVER=sqlite DB_PATH=campuspot.db go run ./cmd/api
# → listening on :8080

# 2. In another terminal, load the demo dataset.
DB_DRIVER=sqlite DB_PATH=campuspot.db go run ./cmd/seed
```

The seed creates a class group ("200L Mass Comm Dues"), 3 executives, 6 members,
a levy, a spread of full/partial/unpaid contributions, and two pending expenses
(a medium-risk one with one approval already recorded, and an over-budget one
flagged high-risk).

### Demo logins (password `password123`)

| Role        | Email                                             |
| ----------- | ------------------------------------------------- |
| Treasurer   | `ada@potkeeper.ng`                                 |
| Co-signer 1 | `tunde@potkeeper.ng`                               |
| Co-signer 2 | `ngozi@potkeeper.ng`                               |
| Members     | `chidi@…`, `fatima@…`, `emeka@…`, `blessing@…`, …  |

### Quickstart with PostgreSQL (production path)

```bash
make docker-up          # starts postgres:16 on :5432
cp .env.example .env    # defaults already point at the compose database
make run
make seed
```

---

## The 3-minute demo script

1. **Create a pot** as the treasurer → note the provisioned virtual account.
2. **Show the levy** and the roster of who has/hasn't paid.
3. **Simulate a member transfer** (`POST /groups/:id/deposits`) → the member
   flips from unpaid to paid; the ledger and balance update.
4. **Ask the AI** *"Who hasn't paid?"* → grounded, specific answer.
5. **Draft a reminder** to a member → show the awkward-asking problem disappear.
6. **Request a large expense** → it lands in `pending_approval` with a risk flag.
7. **Try to approve it as the requester** → blocked (403).
8. **Two co-signers approve** → status becomes `approved`.
9. **Execute** → balance drops, ledger records the debit with the new balance.
10. **Fire a signed B Moni deposit webhook** → idempotent reconciliation, then
    replay it → accepted as a duplicate, balance unchanged.

---

## API reference

All responses use one envelope:

```json
{ "success": true, "data": { }, "error": null, "meta": { } }
```

Errors: `{ "success": false, "error": { "code": "FORBIDDEN", "message": "…" } }`.

Everything under `/api/v1` except auth and the webhook requires
`Authorization: Bearer <jwt>`.

### Auth

| Method | Path                  | Notes                        |
| ------ | --------------------- | ---------------------------- |
| POST   | `/auth/register`      | name, email, password        |
| POST   | `/auth/login`         | email, password → JWT        |
| GET    | `/auth/me`            | current user                 |

### Groups, levies, payments

| Method | Path                                   | Role         |
| ------ | -------------------------------------- | ------------ |
| POST   | `/groups`                              | any          |
| GET    | `/groups`                              | any          |
| GET    | `/groups/:id`                          | member       |
| POST   | `/groups/:id/invite`                   | treasurer    |
| POST   | `/groups/join`                         | any          |
| GET    | `/groups/:id/members`                  | member       |
| POST   | `/groups/:id/levies`                   | treasurer    |
| GET    | `/groups/:id/levies`                   | member       |
| POST   | `/groups/:id/levies/:levyId/close`     | treasurer    |
| POST   | `/groups/:id/payments/manual`          | treasurer    |
| POST   | `/groups/:id/deposits`                 | treasurer *(demo simulator)* |
| GET    | `/groups/:id/payments`                 | member       |
| GET    | `/groups/:id/ledger`                   | member       |
| GET    | `/groups/:id/summary`                  | member       |
| GET    | `/groups/:id/outstanding`              | member       |

### Expenses (the money-out flow)

| Method | Path                                          | Role             |
| ------ | --------------------------------------------- | ---------------- |
| POST   | `/groups/:id/expenses`                         | treasurer        |
| GET    | `/groups/:id/expenses`                         | member           |
| POST   | `/groups/:id/expenses/:expenseId/decisions`    | treasurer/cosigner |
| GET    | `/groups/:id/expenses/:expenseId/approvals`    | member           |
| POST   | `/groups/:id/expenses/:expenseId/execute`      | treasurer        |

### AI treasurer

| Method | Path                                       | Role      |
| ------ | ------------------------------------------ | --------- |
| POST   | `/groups/:id/assistant`                    | member    |
| POST   | `/groups/:id/reminders`                    | treasurer |
| GET    | `/groups/:id/reminders`                    | member    |
| POST   | `/groups/:id/reminders/:reminderId/send`   | treasurer |

### Webhooks & health

| Method | Path                  | Notes                                   |
| ------ | --------------------- | --------------------------------------- |
| POST   | `/webhooks/bmoni`     | HMAC-SHA256 verified, idempotent by id  |
| GET    | `/health`, `/healthz` | liveness + DB ping                      |
| GET    | `/meta`               | active AI + B Moni modes                |

---

## Configuration

See `.env.example`. Key settings:

| Variable               | Default                         | Purpose                                        |
| ---------------------- | ------------------------------- | ---------------------------------------------- |
| `APP_ENV`              | `development`                   | `production` enforces a real `JWT_SECRET`      |
| `PORT`                 | `8080`                          | HTTP port (Render sets this automatically)     |
| `CORS_ORIGINS`         | *(empty)*                       | comma-separated browser origins (e.g. your Vercel URL); localhost always allowed |
| `DATABASE_URL`         | *(empty)*                       | full managed Postgres URL (Neon/Render); overrides the `DB_*` fields |
| `DB_DRIVER`            | `postgres`                      | `postgres` or `sqlite`                         |
| `GORM_LOG`             | `warn`                          | `silent`/`error`/`warn`/`info`                 |
| `JWT_SECRET`           | `dev-only-change-me`            | must be set in production                      |
| `BMONI_API_KEY`        | *(empty)*                       | empty → in-process mock                        |
| `BMONI_WEBHOOK_SECRET` | *(empty)*                       | empty → skip signature check (dev only)        |
| `AI_API_KEY`           | *(empty)*                       | empty → rule-based treasurer                   |

The app **degrades gracefully**: with no B Moni key it uses a mock; with no AI
key it uses the rule-based treasurer. The demo has no external dependencies.

---

## Testing

```bash
make test        # unit tests (money, signatures, pot lifecycle, risk flags)
go vet ./...
```

The pot engine test suite covers reconciliation (exact/partial/unmatched),
idempotency, the 2-of-3 approval rules, self-approval blocking, and risk
classification.

---

## B Moni integration

PotKeeper uses the B Moni Embedded API (sandbox):

- `POST /v1/users` — provision a user, returns `bmoniUserId`.
- `POST /v1/smart-wallets/create-managed` — create the CNGN smart wallet.
- `POST /v1/onboarding/start-nigeria` — attach a virtual Naira account (NUBAN).
- Deposit webhook `employee.deposit.completed` → reconciled by `bmoniUserId`.
- Payouts route through the off-ramp / withdrawal-account flow.

**Sandbox and synthetic data only.** No real money, BVN, or cards are used
anywhere in this project.

---

## Security & safety model

- **Separation of custody** — funds live in a group virtual account, never a
  personal one.
- **Quorum payouts** — money can only leave after `approvalThreshold` distinct
  co-signers approve; requester cannot self-approve.
- **Read-only AI** — the assistant can *see* everything and *draft* messages,
  but cannot move money or send without human confirmation.
- **Append-only ledger** — every credit/debit records the resulting balance.
- **Idempotent webhooks** — event id is the primary key; retries are no-ops.
- **Constant-time signatures** — HMAC compared with `hmac.Equal`.
- **Scoped CORS** — the browser is only granted access from localhost origins
  (the Vite dev server), so the API stays locked down when deployed.
- **No secrets in code** — everything is environment-driven; `.env` is
  gitignored.

---

## AI & open-source disclosure

- **AI usage:** the AI treasurer is a first-class feature (it answers questions
  and drafts reminders/risk explanations). The core money logic is deterministic
  and never delegates a financial decision to a model. When no LLM key is set,
  a rule-based responder is used. In development, AI coding assistants were used
  to help write and review code; all code was reviewed and understood by the
  author.
- **Open source:** built with Gin, GORM, `glebarez/sqlite`, `golang-jwt`, and
  `google/uuid` (see `go.mod` for the full list and licenses).

---

## Project layout

```
cmd/api            API entry point (wiring + graceful shutdown)
cmd/seed           demo dataset loader
config             environment-driven configuration
database           connection pool + log-level handling
common/response    the standard JSON envelope
common/money       integer-kobo money type + formatting
internal/models    GORM models (users, groups, levies, ledger, expenses…)
internal/bmoni     B Moni client (HTTP + mock + HMAC verifier)
internal/auth      registration, login, JWT middleware
internal/pot       the treasurer engine: reconciliation, approvals, risk, ledger
internal/ai        AI treasurer (LLM + deterministic fallback)
internal/webhook   signed, idempotent B Moni webhook receiver
```

---

## Status

Working end-to-end prototype: auth, group + wallet provisioning, levies,
automatic reconciliation, ledger, 2-of-3 approvals, risk flags, AI Q&A and
reminder drafting, and signed idempotent webhooks — verified by unit tests and
a full HTTP smoke test.
