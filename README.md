# PotKeeper

**One pot. Everyone can see it. No one can run with it.**

PotKeeper is a shared group wallet and AI treasurer for Nigerian campus groups
(class reps, societies, hostels). Contributions land in *one* dedicated pot, and
money can only leave when a quorum of members co-signs — never on one person's
say-so. An AI treasurer answers "who hasn't paid?" in plain English.

Built for the **B Moni × TINC26 hackathon** (Theme: *From Access to Agency*).
Sandbox and synthetic data only — no real money, BVN, or cards.

---

## The problem

Every semester, one trusted student (the "treasurer") ends up holding other
people's money in their *personal* bank account with no tools and no records:

- Money is invisible — members can't see the balance or how it's spent.
- "Who has paid?" means scrolling WhatsApp screenshots against bank alerts.
- Payouts happen on trust alone, with no record of who approved what.

## What PotKeeper does

1. **One pot per group.** Each group gets its own wallet + NUBAN through B Moni.
   Nobody's personal account is involved.
2. **Self-reconciling payments.** Every member gets a unique reference; incoming
   transfers are matched to people and the ledger updates automatically.
3. **2-of-3 approvals on every payout.** A withdrawal needs a quorum of
   co-signers. The requester can't approve their own request.
4. **An AI treasurer that reads, never spends.** Ask "who still owes?" or "how
   much is left?" — it answers from the ledger, and can draft reminders.
5. **A visible ledger.** Append-only record of every deposit and payout.

---

## Monorepo layout

```
campuspot/
├── backend/     Go API — the "treasurer engine" (B Moni integration, 2-of-3,
│   │            AI, ledger, webhooks)
│   ├── cmd/api          HTTP server entry point
│   ├── cmd/seed         demo-data seeder
│   ├── cmd/reset        wipes every table, then re-seeds (clean demo slate)
│   ├── cmd/webhook-subscribe  registers the B Moni webhook subscription
│   ├── common/          response envelope + money (kobo) helpers
│   ├── config/          env-driven configuration
│   ├── database/        GORM setup (Postgres or SQLite)
│   └── internal/
│       ├── models/      GORM models
│       ├── bmoni/       B Moni client (HTTP + in-process mock + HMAC verify)
│       ├── auth/        JWT register/login
│       ├── pot/         the money engine (groups, levies, payments, expenses)
│       ├── webhook/     signed B Moni deposit callbacks
│       └── ai/          AI treasurer (LLM + rule-based fallback)
└── frontend/    React + Vite + TypeScript + Tailwind single-page app
    └── src/
        ├── lib/api.ts       typed API client for every endpoint
        ├── providers/       theme + active-group context
        ├── layouts/         AppShell (sidebar), AuthLayout
        ├── components/      GroupGate (onboarding), ProtectedRoute
        └── pages/           pots (list + per-pot dashboard), contributions,
                             levies, expenses, members, ledger, assistant,
                             settings
```

See **[backend/README.md](backend/README.md)** for the full API reference,
architecture notes, and security model.

---

## Tech stack

| Layer     | Choices |
|-----------|---------|
| Backend   | Go 1.22, Gin, GORM, PostgreSQL (SQLite for local demo), JWT |
| Money     | Integer **kobo** everywhere (1 naira = 100 kobo) — no float rounding |
| Frontend  | React 18, Vite 5, TypeScript, Tailwind CSS 3, React Router 6, Framer Motion, Recharts |
| Integrations | B Moni Embedded API (wallets, virtual accounts, webhooks); AI via any OpenAI-compatible endpoint, with an offline rule-based fallback |

---

## Quick start

### 1. Backend (SQLite — zero external services)

```bash
cd backend

# Simpler: copy the example env, then point it at SQLite
cp .env.example .env         # then set DB_DRIVER=sqlite

GOTOOLCHAIN=local go run ./cmd/seed    # creates + seeds campuspot.db, prints logins
GOTOOLCHAIN=local go run ./cmd/api     # serves http://localhost:8080
```

Health check: `curl http://localhost:8080/healthz` (or `/health`)

To start over from zero at any time: `GOTOOLCHAIN=local go run ./cmd/reset`
(wipe + re-seed) or `... ./cmd/reset -seed=false` for a blank database.

> Prefer Postgres? `docker compose up -d db` then set `DB_DRIVER=postgres` and the
> `DB_*` vars. See `backend/README.md`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The API base is resolved at runtime: localhost talks to `http://localhost:8080/api/v1`
automatically, so no `.env` is needed for local dev. In any other environment
(e.g. Vercel) set `VITE_API_URL=https://your-api/api/v1`; if it is missing the
app falls back to the deployed API, so a deploy still connects.

---

## Demo accounts (after seeding)

Password for all: **`password123`**

| Role        | Email |
|-------------|-------|
| Treasurer   | `ada@potkeeper.ng` |
| Co-signer 1 | `tunde@potkeeper.ng` |
| Co-signer 2 | `ngozi@potkeeper.ng` |
| Members     | `chidi@`, `fatima@`, `emeka@`, `blessing@`, `seun@`, `halima@potkeeper.ng` |

### 90-second demo script

1. Log in as **Ada** (treasurer) → see the pot balance, who owes, and the ledger.
2. **Contributions** → *Simulate deposit* with a member's reference → watch it
   reconcile and the ledger update.
3. **Assistant** → ask *"Who hasn't paid?"* → the AI treasurer lists who owes.
4. **Expenses** → *New request* for e.g. ₦15,000 transport → it's flagged
   high-risk and needs approvals.
5. Ada **can't approve her own request** (blocked by design). Log in as
   **Tunde**, then **Ngozi**, and approve → status goes to *approved*.
6. Back as Ada → **Execute payout** → balance drops, ledger shows the payout.

---

## API surface (v1)

All responses share the envelope `{ success, data, error, meta }`.

| Area        | Endpoints |
|-------------|-----------|
| Auth        | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Meta        | `GET /meta` (active AI + B Moni modes) |
| Groups      | `POST /groups`, `GET /groups`, `POST /groups/join`, `GET /groups/:id`, `GET /groups/:id/members`, `POST /groups/:id/invite` |
| Levies      | `POST/GET /groups/:id/levies`, `POST /groups/:id/levies/:levyId/close` |
| Payments    | `GET /groups/:id/payments`, `POST /groups/:id/payments/manual`, `POST /groups/:id/deposits`, `GET /groups/:id/ledger` |
| Reports     | `GET /groups/:id/summary`, `GET /groups/:id/outstanding` |
| Expenses    | `POST/GET /groups/:id/expenses`, `POST /groups/:id/expenses/:id/decisions`, `GET /groups/:id/expenses/:id/approvals`, `POST /groups/:id/expenses/:id/execute` |
| AI          | `POST /groups/:id/assistant`, `POST/GET /groups/:id/reminders`, `POST /groups/:id/reminders/:id/send` |
| Webhooks    | `POST /webhooks/bmoni` (HMAC-SHA256 signed) |

---

## Design decisions

- **Money is integer kobo.** Every amount is stored and transported as an
  integer, so balances never drift. Parsing/formatting lives in
  `common/money` (backend) and `lib/format.ts` (frontend).
- **The AI is read-only.** It can answer questions and draft reminders, but it
  has no path to move money. Only the 2-of-3 approval flow can.
- **B Moni degrades to a mock.** With no `BMONI_API_KEY`, an in-process mock
  provisions wallets/virtual accounts so the demo never depends on live
  availability.
- **The AI degrades to rules.** With no `AI_API_KEY`, a deterministic
  rule-based treasurer answers outstanding/summary questions offline. See
  **[AI_DISCLOSURE.md](AI_DISCLOSURE.md)** for the full AI disclosure.

---

## B Moni integration

Everything PotKeeper needs from B Moni goes through one Go interface
(`internal/bmoni.Client`). There are two implementations and a wrapper:

- **`HTTPClient`** — the real Embedded API. Base URL is **origin-only**
  (`https://embedded-dev.bmoni.com` for sandbox); every request carries the
  partner key in the `x-api-key` header. Never append `/v1` to the base URL.
- **`MockClient`** — synthetic wallets, virtual accounts, banks and payouts.
  The default when `BMONI_API_KEY` is empty, so the demo runs offline.
- **`FallbackClient`** — uses the real API first and transparently falls back
  to the mock if a call fails. This keeps the demo alive for endpoints that
  require on-device owner-wallet signing, which a backend-only integration
  cannot perform.

### Webhooks

B Moni signs every delivery with the subscription's `secretKey`:
`X-Webhook-Signature` is the hex HMAC-SHA256 of the **raw** request body (the
`X-Webhook-Id` header equals the body `id`). PotKeeper verifies it in constant
time, deduplicates on the event `id` (primary key), and returns `401` for a bad
signature and `5xx` (never `4xx`) for transient failures so B Moni retries.

Money-movement events arrive under **partner-scoped `employee.*` names** when
the subscription supplies a `partnerId` — subscribing to `wallet.*` silently
receives nothing:

| Event | Action |
|-------|--------|
| `employee.deposit.completed` | reconcile the deposit against a member reference/name |
| `employee.withdrawal.processing` | mark the payout in-flight |
| `employee.withdrawal.completed` | debit the ledger, mark the payout complete |
| `employee.withdrawal.failed` | mark the payout failed |

Register the subscription once (it prints the `secretKey` to store as
`BMONI_WEBHOOK_SECRET`):

```bash
cd backend
BMONI_API_KEY=... BMONI_PARTNER_ID=... \
  GOTOOLCHAIN=local go run ./cmd/webhook-subscribe \
  -url https://<your-api>/api/v1/webhooks/bmoni
```

### Mock vs live

The UI shows two badges so it is always clear which backends are running:
**`AI: LLM`** vs **`AI: rule-based`**, and **`B Moni: sandbox`** vs
**`B Moni: mock`**. The mode comes from `GET /api/v1/meta`.

| Flag | `BMONI_API_KEY` set | `BMONI_API_KEY` empty |
|------|---------------------|-----------------------|
| B Moni client | `HTTPClient` + mock fallback | `MockClient` |
| `AI_API_KEY` set | LLM drafts reminders; answers stay deterministic | — |
| `AI_API_KEY` empty | — | deterministic rule-based answers |

Some B Moni endpoints (smart-wallet provisioning, owner-proof signatures,
proposal signing) require an on-device owner wallet this backend cannot hold, so
those calls stay behind the interface and degrade to the mock. They are marked
**UNVERIFIED** in code.

---

## Deploying (Neon + Render + Vercel)

The app is built to run on free tiers: **Neon** (Postgres), **Render** (API),
**Vercel** (frontend).

### 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech) and copy the connection
   string (a `postgres://…` URL ending in `sslmode=require`).
2. That single URL is all the backend needs — set it as `DATABASE_URL` (it
   overrides the discrete `DB_*` vars). Tables are auto-migrated on boot.

### 2. Backend — Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. The root-level
   `render.yaml` builds `backend/Dockerfile` (context `backend/`) and exposes
   `/health`.
3. Set the env vars marked `sync:false` in the dashboard:
    - `DATABASE_URL` — the Neon string from step 1.
    - `CORS_ORIGINS` — your Vercel URL, e.g. `https://campus-spot-six.vercel.app`.
    - `JWT_SECRET` is generated automatically.
    - Optional `AUTO_SEED` (default `true`) — on a blank database the API
      self-seeds the demo accounts on boot. Set `AUTO_SEED=false` for a truly
      empty start with only the accounts you create yourself.
4. Note the deployed API URL, e.g. `https://campusspot-kvjm.onrender.com`.

> If you create the service manually instead of via Blueprint, set **Runtime**
> to `Docker`, **Root Directory** to `backend`, and leave **Dockerfile Path**
> as `Dockerfile`. Setting Root Directory to `render.yaml` causes
> "Root directory does not exist".

Optional: seed the demo data once with `go run ./cmd/seed` against the same
`DATABASE_URL`.

#### Resetting a deployed database

To wipe Neon and start clean (e.g. an old demo left stale logins behind):

1. **Wipe + re-seed in one command** against the Neon URL:
   ```bash
   cd backend
   DATABASE_URL='postgres://…sslmode=require' GOTOOLCHAIN=local go run ./cmd/reset
   ```
   Add `-seed=false` to leave it empty. Then restart the Render service so the
   API reconnects.
2. Or, in the Neon **SQL Editor**: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
   and restart the API (it re-migrates on boot, and re-seeds if `AUTO_SEED` is on).

Note: wiping the database does **not** log anyone out — the JWT lives in the
browser's `localStorage`. Clear site data (or use a fresh session) to drop it.

### 3. Frontend — Vercel

1. Import the repo in Vercel and set **Root Directory** to `frontend`.
2. Add an environment variable `VITE_API_URL` =
   `https://campusspot-kvjm.onrender.com/api/v1` (your Render URL + `/api/v1`).
3. Deploy. `frontend/vercel.json` rewrites all routes to `index.html` so
   client-side routes survive a refresh.
4. Copy the final Vercel URL back into the backend's `CORS_ORIGINS` and
   redeploy the API.

## Security & limitations

- Sandbox only — synthetic data, no real financial credentials.
- JWT auth; secrets via environment variables only.
- SQLite is for local demos; production uses PostgreSQL.
- This is a hackathon prototype, not a production financial product.

© 2026 PotKeeper · B Moni × TINC26
# CampusSpot
