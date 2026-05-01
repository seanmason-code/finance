# Phase 6a — Service Accounts (foundation) — Design

**Date drafted:** 2026-05-01
**Project:** finance-v2 (Personal Finance PWA)
**Predecessor:** Phase 7 — AI Sanity Advisor (`docs/PHASE-7-COMPLETE.md`)
**Implementation repo:** `~/Projects/finance-v2/`
**Roadmap context:** Phase 6 (master spec's "differentiator") split into 6a / 6b / 6c. This spec is **6a — full manual experience**. Subsequent phases: 6b (AP recommendations + Akahu top-up auto-detection), 6c (email + Claude vision bill capture).

---

## Context

The master spec calls service accounts the "moat-level" feature: NZ households (Sean & Jenny included) commonly run separate accounts for utilities — power, water, gas, internet — feeding them via APs (Automatic Payments) and drawing them down via direct debits or manual bill payments. Most personal-finance apps can't model these "credit-balance services" — they treat every account as a transactional balance. v2 will model them properly.

This phase is the foundation: schema + UI + manual entry + dashboard integration. It's the experience Sean and Jenny use day-to-day with 100% manual top-up and bill entry. Subsequent phases automate the manual steps:

- **6b** — Akahu sees a debit matching a service-account provider pattern → app prompts "Top up Power by $250?" → confirm → rule auto-applies. Plus the AP-recommendation loop (advisor flags "needs more", logs the change, verifies new top-up landed).
- **6c** — Provider emails an invoice → Cloudflare Email Routing → webhook → Claude vision parses the PDF → bill record auto-created.

6a stands alone — it's useful from day one without 6b/6c.

---

## Goal

Ship the full manual service-account experience: data model, dedicated UI surface, manual top-up + bill entry, dashboard integration, threshold breach surfacing in three places, AI advisor integration. Tested thoroughly at every layer.

---

## Locked design decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Schema for service-specific fields | New `v2.service_accounts` table, 1:1 ref to `v2.accounts.id` |
| Top-ups + bills in transactions | Top-ups = existing `type='transfer'` transactions (paired via `parent_transaction_id`); bills = `type='expense'` transactions + new `v2.bills` row |
| Bills table field set | Full master-spec set upfront (`amount`, `billing_period_start/end`, `due_date`, `source_email_id`, `raw_pdf_url`, `claude_extracted_json`, `applied_to_balance_at`, `transaction_id`). 6c-only fields stay nullable until 6c populates them. |
| UI surface | Dedicated `/accounts/services` page with one mini-card per service account |
| Mini-card visual | **Fixed-size square card per service account.** Official provider icon at top (e.g. Watercare logo for water, Mercury for power), details below (name, balance, threshold breach indicator, weeks-of-burn). All cards same dimensions for grid alignment. New `icon_url text` column on `v2.service_accounts`; user pastes the icon URL on create/edit; default placeholder icon when blank. |
| Service account detail view | Click a mini-card → balance, threshold, weeks-of-burn, recent top-ups list, recent bills list |
| Burn rate algorithm | Trailing 3-month average of bills. Display **nothing** until ≥3 months of history exists — no coarse estimates from 1-2 bills. |
| Threshold breach UX | Surfaces in **three places**: mini-card red border + badge, dashboard summary teaser counter, AI advisor context |
| Dashboard surface | Small summary teaser tile: count of service accounts + count of breaches; links to `/accounts/services` |
| AI advisor integration | Extend `AdvisorContext` with `serviceAccounts: [{ name, balance, min_balance, target_balance, weeks_of_burn (null if <3 months) }]` |
| Multi-currency | Out of scope. NZD only (matches existing app). |
| Edit/delete semantics | Edit any field at any time; soft-delete (set `archived_at` timestamp) preserves bill history |
| Default `min_balance` on creation | Required field, no default — user must set it intentionally |
| Default `target_balance` on creation | Optional; if null, no top-up target |
| Auto-applying any rule without user approval | No (matches Phase 7 philosophy — humans approve) |
| AP recommendation loop | Out of scope (deferred to 6b) |
| Akahu top-up auto-detection | Out of scope (deferred to 6b) |
| Email + Claude vision bill capture | Out of scope (deferred to 6c) |

---

## Architecture

Phase 6a is additive. No existing accounts/transactions table changes. Two new tables (`v2.service_accounts`, `v2.bills`). One new dedicated page (`/accounts/services`). One new dashboard summary tile. Two new server actions (top-up entry, bill entry). One advisor-context extension.

Data flow when Sean enters a manual top-up:

```
[/accounts/services/[id] → "Add top-up" form]
        ↓ Server action
[Validate { amount > 0, source_account_id is real, date is parseable }]
        ↓
[INSERT pair into v2.transactions:
  - row 1: type='transfer', account_id=source, amount=-amount
  - row 2: type='transfer', account_id=service_account.account_id, amount=+amount,
           parent_transaction_id=row1.id]
        ↓
[Recompute service-account balance via existing balance-from-transactions logic]
        ↓
[Redirect back to /accounts/services/[id]]
```

Data flow when Sean enters a manual bill:

```
[/accounts/services/[id] → "Add bill" form]
        ↓ Server action
[Validate { amount > 0, billing_period_start ≤ end, due_date parseable }]
        ↓
[INSERT into v2.transactions:
  - type='expense', account_id=service_account.account_id, amount=-amount,
    posted_at=due_date]
        ↓
[INSERT into v2.bills:
  - service_account_id, transaction_id=above row, amount, billing_period_start/end,
    due_date, applied_to_balance_at=now()]
        ↓
[Recompute service-account balance]
        ↓
[Redirect back]
```

Threshold breach is computed lazily — wherever the balance is read (mini-card, dashboard teaser, advisor context), the consumer compares `balance < min_balance` and surfaces the breach state. No persisted "is_breached" flag — derived state only.

Burn rate is computed via a SQL aggregate: `SELECT avg(amount) FROM v2.bills WHERE service_account_id = X AND applied_to_balance_at >= now() - interval '90 days'`. If `count(*) < 3` returns over the same window, the function returns null and consumers display "—".

---

## Components

| Path | Purpose |
|---|---|
| `supabase/migrations/0006_v2_service_accounts.sql` | New `v2.service_accounts` table + RLS |
| `supabase/migrations/0007_v2_bills.sql` | New `v2.bills` table + RLS |
| `lib/service-accounts/burn-rate.ts` | Pure function: `(bills: Bill[]) → { weeksOfBurn: number \| null, monthlyAverage: number \| null }`. Returns null when <3 bills in last 90 days. |
| `lib/service-accounts/balance.ts` | Pure function: `(transactions: Txn[]) → number`. Sums account-id-scoped transactions; reusable across mini-card, detail view, advisor context. |
| `lib/service-accounts/threshold.ts` | Pure function: `(balance, min_balance) → "ok" \| "breach"`. Trivial but isolated for testability. |
| `app/accounts/services/page.tsx` | Server component listing all service accounts as mini-cards |
| `app/accounts/services/_components/service-mini-card.tsx` | Mini-card rendering balance, threshold, breach badge, weeks-of-burn (or "—") |
| `app/accounts/services/_components/service-account-form.tsx` | Create/edit form for service accounts |
| `app/accounts/services/[id]/page.tsx` | Detail view: balance + threshold + weeks-of-burn + recent top-ups + recent bills |
| `app/accounts/services/[id]/_components/topup-form.tsx` | Manual top-up entry form |
| `app/accounts/services/[id]/_components/bill-form.tsx` | Manual bill entry form |
| `app/api/service-accounts/route.ts` | POST creates service account; PATCH /:id edits; DELETE /:id soft-deletes |
| `app/api/service-accounts/[id]/topup/route.ts` | POST creates the transfer pair |
| `app/api/service-accounts/[id]/bill/route.ts` | POST creates the expense + bill row |
| `app/dashboard/_tiles/service-accounts-tile.tsx` | Dashboard summary teaser: count + breach count, links to `/accounts/services` |
| `lib/advisor/build-context.ts` (modify) | Extend `AdvisorContext` with `serviceAccounts[]` |
| `lib/advisor/system-prompt.ts` (modify) | Add tone guidance for service accounts: name-by-name, threshold breach framing |

The `_components/` folder convention follows Next 16's "co-locate component files alongside their route". Pure logic lives in `lib/service-accounts/` so it's reusable across server components, route handlers, and tests.

---

## Schema

### Migration 0006 — `v2.service_accounts`

```sql
-- Phase 6a — service accounts metadata + thresholds.
-- 1:1 with v2.accounts where type='service'. Fields specific to service accounts
-- live here so the accounts table stays slim.

CREATE TABLE IF NOT EXISTS v2.service_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL UNIQUE REFERENCES v2.accounts(id) ON DELETE CASCADE,
  household_id             uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  -- Threshold + target — Sean's "alarm" + "top-up goal"
  min_balance              numeric NOT NULL,
  target_balance           numeric,
  -- Visual: official provider icon URL (Watercare logo, Mercury logo, etc.)
  icon_url                 text,
  -- Future fields (nullable, populated by 6b/6c)
  provider_email_pattern   text,
  inbound_alias            text,
  -- Lifecycle
  archived_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_accounts_household
  ON v2.service_accounts(household_id) WHERE archived_at IS NULL;

ALTER TABLE v2.service_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_accounts_household ON v2.service_accounts;
CREATE POLICY service_accounts_household ON v2.service_accounts
  FOR ALL USING (v2.is_household_member(household_id))
  WITH CHECK (v2.is_household_member(household_id));
```

### Migration 0007 — `v2.bills`

```sql
-- Phase 6a — bills (one per invoice, paired 1:1 with an expense transaction).
-- Most fields nullable so 6c (email + Claude vision) can backfill them.

CREATE TABLE IF NOT EXISTS v2.bills (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_account_id       uuid NOT NULL REFERENCES v2.service_accounts(id) ON DELETE CASCADE,
  household_id             uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  transaction_id           uuid NOT NULL UNIQUE REFERENCES v2.transactions(id) ON DELETE CASCADE,
  amount                   numeric NOT NULL,
  billing_period_start     date,
  billing_period_end       date,
  due_date                 date NOT NULL,
  applied_to_balance_at    timestamptz NOT NULL DEFAULT now(),
  -- 6c-only fields
  source_email_id          text,
  raw_pdf_url              text,
  claude_extracted_json    jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_service_account
  ON v2.bills(service_account_id, applied_to_balance_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_household
  ON v2.bills(household_id);

ALTER TABLE v2.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bills_household ON v2.bills;
CREATE POLICY bills_household ON v2.bills
  FOR ALL USING (v2.is_household_member(household_id))
  WITH CHECK (v2.is_household_member(household_id));
```

### `AdvisorContext` extension

```ts
// lib/advisor/build-context.ts — append to AdvisorContext type
export type AdvisorContext = {
  // ... existing fields ...
  serviceAccounts: Array<{
    name: string;
    balance: number;
    minBalance: number;
    targetBalance: number | null;
    weeksOfBurn: number | null;  // null when <3 months of bills
    isBreaching: boolean;        // balance < minBalance
  }>;
};
```

The system prompt (`lib/advisor/system-prompt.ts`) gets a new paragraph:

> When `serviceAccounts` is non-empty, you may flag any whose `isBreaching` is true ("Power balance below your $500 floor") in the items list with priority `high`. If `weeksOfBurn` is non-null and ≤6, surface that as a `medium` priority item. Don't speculate about service accounts that aren't breaching or running low.

---

## Failure modes & handling

| Failure | Handling |
|---|---|
| User submits top-up form with non-positive amount | 400 `{ error: "invalid_amount" }`; form shows inline error |
| User submits top-up with non-existent source account | 400 `{ error: "unknown_account" }` |
| User submits bill with `billing_period_start > billing_period_end` | 400 `{ error: "invalid_billing_period" }` |
| User submits bill missing `due_date` | 400 `{ error: "due_date_required" }` |
| User tries to delete a service account with bill history | Soft-delete (set `archived_at`); bill rows retained for history |
| Concurrent edits to a service account (rare; one user) | Last-write-wins; no optimistic-lock needed at this scale |
| User edits `min_balance` after a breach | Threshold derived state recomputes on next page load — no stale alert |
| Burn rate query returns 0 rows in 90-day window | Return null from helper; UI displays "—"; advisor `weeksOfBurn` is null |
| Account `type` was changed to non-'service' but a `service_account` row exists | Foreign key + UNIQUE on account_id keeps this consistent. Don't allow type change away from 'service' if a service_account row exists — return 409. |
| Auth missing / wrong household | Standard `authedAndScoped` 401/403, matching every other Phase 6/7 route |

---

## Testing strategy

| Layer | Test approach |
|---|---|
| `lib/service-accounts/burn-rate.ts` | Vitest pure-function tests: 0 bills, 1-2 bills (returns null), 3 bills exact, 4+ bills (3-month window only), bills outside window ignored |
| `lib/service-accounts/balance.ts` | Vitest with txn fixtures: empty, transfers in only, transfers + expenses, expenses only |
| `lib/service-accounts/threshold.ts` | Vitest: balance > min (ok), balance == min (ok or breach — pick + test), balance < min (breach), null inputs handled |
| `app/api/service-accounts/route.ts` (CRUD) | Vitest with mocked supabase: 200 create, 401 unauth, 403 no-household, 400 invalid body, 404 update-missing, soft-delete works |
| `app/api/service-accounts/[id]/topup/route.ts` | Vitest: 200 happy (verifies pair of inserts + parent_transaction_id wiring), 400 invalid amount, 400 unknown source account, 401, 403 |
| `app/api/service-accounts/[id]/bill/route.ts` | Vitest: 200 happy (verifies expense txn + bill row both created), 400 invalid billing period, 400 missing due_date, 401, 403 |
| `service-mini-card.tsx` | Vitest + RTL: renders balance + threshold; breach badge appears when `balance < min_balance`; "—" shown for weeks-of-burn when null |
| `service-account-form.tsx` | Vitest + RTL: required field validation, submits with right shape, edit mode pre-fills |
| `topup-form.tsx`, `bill-form.tsx` | Vitest + RTL: submit calls right endpoint with right body, validation messages render |
| `service-accounts-tile.tsx` (dashboard) | Vitest + RTL: shows correct count, breach count, links work |
| `lib/advisor/build-context.ts` (extension) | Vitest fixture: serviceAccounts populated correctly when service accounts exist; weeksOfBurn null when <3 bills; isBreaching true when balance < min |
| Integration: top-up flow end-to-end | Vitest: create service account → add top-up → balance updates → reflected in dashboard tile |
| Integration: breach surfacing | Vitest: balance drops below min → mini-card shows badge, dashboard tile counter +1, advisor context isBreaching=true |
| Manual prod smoke | Sign in as demo → /accounts/services → create test service account with min_balance=$500 → add top-up $400 → verify breach surfaces in mini-card + dashboard + click advisor → verify advisor mentions breach |

---

## Out of scope (deferred)

- **AP recommendation flow** — advisor flags "needs +$30/week", logs change, user marks done, Akahu confirms next top-up. **Phase 6b.**
- **Akahu top-up auto-detection** — match incoming debits to service-account provider patterns, prompt one-tap top-up. **Phase 6b.**
- **Email + Claude vision bill capture** — Cloudflare Email Routing, webhook, PDF parsing. **Phase 6c.**
- **Recurring bill awareness / forecasting** — detect "Power bills monthly on the 5th". **Phase 8 (charts).**
- **Multi-currency** — NZD only.
- **Bill review queue** — not needed until 6c (auto-extracted bills sometimes need review).
- **Mobile-specific UX** — share dashboard's responsive layout, no special phone work.
- **Service account import** — manual creation only; no CSV import.
- **Calendar export of due dates** — Phase 7 / 8 territory.
- **Statement reconciliation** — out of scope; existing reconcile script handles dashboard-level math.

---

## Estimated build

**~14-16 plan tasks**, ~3-4 hours of subagent-driven build. Larger than Phase 7 because the surface area is wider (3 routes + 3 forms + a new page + tile integration + 2 migrations + advisor extension), but each task remains atomic.

Rough order:

1. Migration 0006 (v2.service_accounts) + apply
2. Migration 0007 (v2.bills) + apply
3. `lib/service-accounts/balance.ts` + tests
4. `lib/service-accounts/burn-rate.ts` + tests
5. `lib/service-accounts/threshold.ts` + tests
6. POST/PATCH/DELETE `/api/service-accounts` + tests
7. POST `/api/service-accounts/[id]/topup` + tests
8. POST `/api/service-accounts/[id]/bill` + tests
9. `service-mini-card.tsx` + tests
10. `service-account-form.tsx` + tests
11. `/accounts/services/page.tsx` (list + create flow)
12. `topup-form.tsx`, `bill-form.tsx` + tests
13. `/accounts/services/[id]/page.tsx` (detail view)
14. `service-accounts-tile.tsx` + tests + dashboard wiring
15. Extend `AdvisorContext` + system prompt + advisor tests update
16. Manual smoke checklist in `docs/PHASE-6A-COMPLETE.md`

---

## Predecessor

Phase 7 — AI Sanity Advisor (`docs/PHASE-7-COMPLETE.md`).

## Successor

- **Phase 6b** — AP recommendation flow + Akahu top-up auto-detection. Sean's described workflow ("AI flags burn rate problem → log entry → Sean updates AP at bank → ticks done → Akahu detects new top-up → confirms"). Depends on 6a being shipped + ≥2 weeks of bill history accumulating.
- **Phase 6c** — Email + Claude vision bill capture. Cloudflare Email Routing → webhook → PDF parsing.
- **Phase 8** — Charts; will produce burn-rate trend visuals using 6a's bill history.
