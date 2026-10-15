# AI Disclosure

CampusPot uses AI in one place: the **AI Treasurer** (`backend/internal/ai`).
This document states exactly what it does, what it does not do, and how it
behaves when no model is configured.

## What the AI does

- **Answers questions about a pot** in plain English or Pidgin — e.g. *"Who
  hasn't paid?"*, *"How much is left?"*. Answers are computed by the
  deterministic pot engine and rendered from the pot's own ledger and
  membership data. This path never calls an external model.
- **Drafts reminder messages** for members who owe money, in a chosen tone
  (friendly / firm / gentle). This is the only place a language model is used,
  and only when `AI_API_KEY` is set.
- **Narrates risk flags** on a proposed payout. The risk *decision* is made by a
  deterministic rule engine (`pot.assessRisk`); the AI only explains it.

## What the AI does not do

- **It never moves money.** There is no code path from the AI package to a
  ledger debit, a payout, or a B Moni transfer. Only the 2-of-3 co-signer
  approval flow can authorise a withdrawal.
- **It never decides a risk level**, approves an expense, or changes roles.
- **It never sends a message on its own.** Reminders are created as drafts and
  are only marked "sent" after a human confirms.
- **It cannot create levies, expenses, invitations, or payout accounts.**

## Model configuration

- When `AI_API_KEY` is set, the treasurer calls an **OpenAI-compatible chat
  completions endpoint** (`AI_BASE_URL`, `AI_MODEL`).
- When `AI_API_KEY` is empty, CampusPot uses a **deterministic rule-based
  fallback** that answers the same outstanding/summary/reminder questions
  offline. Every feature works with the AI switched off.
- The UI shows which mode is active (`AI: LLM` vs `AI: rule-based`).

## Data sent to a model

When an LLM is configured, the AI Treasurer sends the **minimum** needed to
answer: the question text and the relevant pot figures (group name, amounts in
kobo, member display names and outstanding balances). It does **not** send
passwords, JWTs, B Moni API keys, BVNs, or bank account numbers.

In this hackathon deployment no `AI_API_KEY` is set, so the **rule-based
fallback** is active and no data leaves the server.

## Determinism and safety

- Money math is integer kobo, never floating point, and is computed by the same
  deterministic engine regardless of AI involvement.
- **Answers are always deterministic.** The language model is used *only* to
  phrase reminder drafts.
- If an LLM call fails, times out, or returns nothing usable, reminder drafting
  falls back to a deterministic template — the feature never depends on model
  availability.

## Third-party services

| Service | Role | Data involved |
|---------|------|---------------|
| B Moni Embedded API | wallets, virtual accounts, payouts, webhooks | sandbox/synthetic only in this deployment |
| OpenAI-compatible LLM (optional) | reminder narration only | member name, outstanding amount, levy title, payment reference; unset in this deployment |

This is a hackathon prototype and not a production financial product.
