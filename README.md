# CampusPot

**One pot. Everyone can see it. No one can run with it.**

CampusPot is a shared group wallet and AI treasurer for Nigerian campus groups
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

## What CampusPot does

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
        └── pages/           landing, auth, dashboard, contributions,
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

Health check: `curl http://localhost:8080/health`

> Prefer Postgres? `docker compose up -d db` then set `DB_DRIVER=postgres` and the
> `DB_*` vars. See `backend/README.md`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`.env` already points at `http://localhost:8080/api/v1`. The backend allows
CORS from localhost origins, so the two talk out of the box.

---

## Demo accounts (after seeding)

Password for all: **`password123`**

| Role        | Email |
|-------------|-------|
| Treasurer   | `ada@campuspot.ng` |
| Co-signer 1 | `tunde@campuspot.ng` |
| Co-signer 2 | `ngozi@campuspot.ng` |
| Members     | `chidi@`, `fatima@`, `emeka@`, `blessing@`, `seun@`, `halima@campuspot.ng` |

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
  rule-based treasurer answers outstanding/summary questions offline.

## Deploying (Neon + Render + Vercel)

The app is built to run on free tiers: **Neon** (Postgres), **Render** (API),
**Vercel** (frontend).

### 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech) and copy the connection
   string (it looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require`).
2. That single URL is all the backend needs — set it as `DATABASE_URL` (it
   overrides the discrete `DB_*` vars). Tables are auto-migrated on boot.

### 2. Backend — Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. The root-level
   `render.yaml` builds `backend/Dockerfile` (context `backend/`) and exposes
   `/health`.
3. Set the env vars marked `sync:false` in the dashboard:
   - `DATABASE_URL` — the Neon string from step 1.
   - `CORS_ORIGINS` — your Vercel URL, e.g. `https://campuspot.vercel.app`.
   - `JWT_SECRET` is generated automatically.
4. Note the deployed API URL, e.g. `https://campuspot-api.onrender.com`.

> If you create the service manually instead of via Blueprint, set **Runtime**
> to `Docker`, **Root Directory** to `backend`, and leave **Dockerfile Path**
> as `Dockerfile`. Setting Root Directory to `render.yaml` causes
> "Root directory does not exist".

Optional: seed the demo data once with `go run ./cmd/seed` against the same
`DATABASE_URL`.

### 3. Frontend — Vercel

1. Import the repo in Vercel and set **Root Directory** to `frontend`.
2. Add an environment variable `VITE_API_URL` =
   `https://campuspot-api.onrender.com/api/v1` (your Render URL + `/api/v1`).
3. Deploy. `frontend/vercel.json` rewrites all routes to `index.html` so
   client-side routes survive a refresh.
4. Copy the final Vercel URL back into the backend's `CORS_ORIGINS` and
   redeploy the API.

## Security & limitations

- Sandbox only — synthetic data, no real financial credentials.
- JWT auth; secrets via environment variables only.
- SQLite is for local demos; production uses PostgreSQL.
- This is a hackathon prototype, not a production financial product.

© 2026 CampusPot · B Moni × TINC26
# CampusSpot
