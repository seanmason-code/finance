# Demo / Test Profile — Design

**Date drafted:** 2026-04-30
**Project:** finance-v2 (Personal Finance PWA)
**Predecessor:** Phase 4 — Dashboard (`docs/PHASE-4-COMPLETE.md`)
**Implementation repo:** `~/Projects/finance-v2/`
**Origin:** captured as a future-phase candidate in `2026-04-30-phase-4-dashboard-design.md`; promoted to its own spec via brainstorm 2026-04-30.

---

## Context

Sean wants to be able to demo finance-v2 to other people without exposing his and Jenny's real financial data. The current app has only one household (his real one), so any demo today means showing real merchants, real balances, real categories — that's not acceptable for showing the app around.

Per Sean's design philosophy: *"a test profile so I can show the app around and it doesn't show my actual proper information."*

---

## Goal

A fully-isolated **demo household** that anyone Sean signs in to (with shared credentials) can poke around. The demo looks indistinguishable in shape from a real two-person household, anchored to today's date, populated with realistic but synthetic NZ financial data. Sean refreshes it on demand before each demo.

---

## Locked design decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Access model | Separate Supabase auth user + separate household, RLS-isolated |
| Data source | Synthesised cadence + curated NZ merchant list (no real-data leak risk) |
| Time-relevance | Rolling 12 months ending today; refreshed on demand via script |
| Categories | Shared with rest of app (categories table is global, no household scope) |
| Rules | Demo household gets its own seeded rule pack (~6 starter rules) |
| Seed mechanism | Node script `scripts/seed-demo.mjs` using Supabase service-role key; run locally |
| Demo household | Two-person — "Demo Sean" (weekly Wed pay) + "Demo Jenny" (monthly 14th-rule pay) |

---

## Architecture

A standalone seed script (`scripts/seed-demo.mjs`) using the Supabase service-role key (RLS-bypassing, used only locally) to create and refresh a fully-isolated demo household. The demo user signs in through the normal Supabase auth flow and sees a populated app indistinguishable in shape from a real household, but with synthetic data only. RLS does the isolation; no app-side changes are required for the data path.

The only app-side change is a small UI guard that hides or disables the "Sync from Akahu" button for the demo user (no real bank account is connected, so triggering sync would either error or be confusing).

---

## Demo household composition

### Auth + household setup (one-time)

- **Auth user:** `demo@finance.local` (or whatever Sean picks), password set once in Supabase dashboard.
- **One household** named `demo` with the auth user linked via `household_members`.
- **Two profiles** under that household: "Demo Sean" + "Demo Jenny".
- **One `bank_feed_state` row** with `cutover_date` = roughly 12 months before "today at first run", so the timeline starts cleanly.

### Accounts (5)

| Name | Owner | Type | Tag | Provider | Approximate balance |
|---|---|---|---|---|---|
| Demo Sean Cheque | Demo Sean | transactional | sean | akahu | $2,400 |
| Demo Sean Savings | Demo Sean | savings | sean | akahu | $8,000 |
| Demo Jenny Cheque | Demo Jenny | transactional | jenny | akahu | $3,800 |
| Demo Jenny Savings | Demo Jenny | savings | jenny | akahu | $15,000 |
| Joint Credit Card | (joint) | credit | shared | akahu | -$430 |

`akahu_account_id` set to a synthetic value (e.g. `demo-acc-<n>`) — not a real Akahu ID, but populated so the rest of the app's account rendering doesn't break on null.

### Cycle anchor

The dashboard's pay-cycle helper (`lib/payday/cycle.ts`) reads "today" from `Pacific/Auckland` and applies the 14th-rule. Demo data is synthesised so Demo Jenny's monthly payday matches that rule exactly — the dashboard cycle math just works.

---

## Seed cadence

Roughly **250–300 txns** spanning 12 months ending today. Per month, the script generates approximately:

### Income (anchors)
- 4–5× **Demo Sean weekly pay** — every Wednesday, ~$1,650 ±5%
- 1× **Demo Jenny monthly pay** — 14th-rule (Sat→13, Sun→12), ~$5,400 ±3%
- 1× **Demo Jenny annual bonus** — once in February, ~$16,000 (mirrors real pattern in spec)

### Recurring outgoings
- 4× **fortnightly groceries** — alternating PAK N SAVE Wairau / New World Wairau, $140–$220, charged to Demo Jenny Cheque
- 2× **fuel** — alternating Z Energy / BP, $75–$95
- 1× **electricity bill** — Genesis Energy or Mercury, ~$160 (varies seasonally — higher in winter months)
- 1× **internet bill** — Spark, $89
- 2× **phone bills** — Spark or 2degrees, ~$45 each (one per profile)
- 1× **Spotify** — $12.99
- 1× **Netflix** — $19.99

### Discretionary (jittered)
- 3–5× **eating out** — Mexico Felipe's, Burger Fuel, Mr Bun, café names — $25–$80
- 1–2× **household / hardware** — Mitre 10, Briscoes, The Warehouse, Kmart — $30–$200
- 1–2× **clothing or sport** — Rebel Sport, Hallenstein, Glassons — $40–$150
- Occasional one-off: Wellington Zoo, Te Papa, movie tickets

### Realism notes
- All amounts have ±10% randomness so the dashboard isn't suspiciously round.
- Categories pre-assigned where the cadence is strict (income, groceries, fuel, bills); discretionary txns 50% pre-categorised to leave a believable "uncategorised count" for the dashboard's uncategorised tile.
- Some transfers between Demo Sean Cheque and Demo Sean Savings (auto-savings pattern) so the savings balance grows visibly over the year.

---

## Merchant list

Hardcoded in `scripts/_demo/merchants.ts` as a typed list of ~30 real NZ brand names with category hints:

```ts
export type DemoMerchant = {
  raw: string;          // What appears in merchant_raw
  clean: string;        // Cleaned display name (merchant_clean)
  categoryHint: string; // Default category (must exist in categories table)
  amountRange: [number, number];
  cadenceTag: "weekly" | "fortnightly" | "monthly" | "occasional";
};
```

All entries are public NZ brand names (PAK N SAVE, Z Energy, Spark, etc.). None of them are personal data — they're chains visible to anyone in NZ. No leak risk.

---

## Rules pack

~6 starter rules seeded with the demo so the rules CRUD feature is visible and clickable when Sean shows it off:

| Match | Action |
|---|---|
| `merchant_keyword: "PAK N SAVE"` OR `"NEW WORLD"` | → Groceries |
| `merchant_keyword: "Z ENERGY"` OR `"BP "` | → Fuel |
| `merchant_keyword: "SPARK"` OR `"GENESIS"` OR `"MERCURY"` | → Utilities |
| `merchant_keyword: "SPOTIFY"` OR `"NETFLIX"` | → Subscriptions |
| `merchant_keyword: "DEMO JENNY PAY"` (income source) | → Income |
| `merchant_keyword: "DEMO SEAN PAY"` (income source) | → Income |

(Or-conditions split into separate rules if the rule schema doesn't support OR — the seed script handles whichever shape is current.)

---

## Seed script behaviour

### `pnpm run seed:demo`

1. Reads `DEMO_HOUSEHOLD_ID` from `.env.local`. **Refuses to run if the env var is missing** or doesn't match an existing household with `name = 'demo'` — safety check so it can't accidentally wipe Sean's real household.
2. Wipes existing demo household state:
   - DELETE all rows from `transactions WHERE household_id = $DEMO_HOUSEHOLD_ID`
   - DELETE all rows from `accounts WHERE household_id = $DEMO_HOUSEHOLD_ID`
   - DELETE all rows from `rules WHERE household_id = $DEMO_HOUSEHOLD_ID`
   - DOES NOT touch the auth user, profiles, household, household_members, or bank_feed_state
3. Generates 12 months of data ending today (UTC `Pacific/Auckland`).
4. Inserts accounts → rules → transactions in that order.
5. Updates account balances to match the running total of their txns + opening balance.
6. Prints a summary: `Seeded 287 txns across 5 accounts, 6 rules, 12 months ending 2026-04-30. Net household: $28,770.`

### `pnpm run seed:demo --dry-run`

Prints what it would do (counts, date ranges, balance totals) without writing anything. Use to check the seed before running for real.

### Determinism

The script uses `Math.random()` jitter by default (each run produces a slightly different distribution within the same cadence rules). A `--seed=<n>` flag pins randomness to a known seed for reproducible demos. Either is fine; default to non-determinism so successive demos don't look identical.

---

## App-side change — show all features, gracefully block live actions

Sean's call: **keep all real-app buttons visible in demo mode** so anyone Sean shows the app to can see the full surface he built. When a demo user clicks a button that would hit a live external system (Akahu sync, Akahu connect/disconnect, any future bank/external integration), the app shows a friendly "demo mode — not connected to a real bank" notice instead of attempting the call.

### Detection

A single helper:

```ts
// lib/demo/is-demo-user.ts
export function isDemoUser(email: string | undefined | null): boolean {
  return email === process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
}
```

Set `NEXT_PUBLIC_DEMO_USER_EMAIL=demo@finance.local` in Vercel + `.env.local`. The check is email-based (not household-id-based) because email is what the auth context already exposes; the household is fetched later.

### Affected actions (current scope)

- **Sync from Akahu button** (on `/accounts`) — clicking shows a `<DemoNoticeDialog>` instead of triggering the API call.
- **Akahu connect / disconnect** (anywhere they exist or get added) — same treatment.

### Notice presentation

Reuse the project's existing dialog primitive (or add a tiny `<DemoNoticeDialog>` wrapper if one doesn't exist) with copy like:

> **Demo mode**
> This account isn't connected to a real bank, so syncing is disabled here. On a real account, this button would pull the latest transactions from Akahu.

Single OK button to dismiss. No spinner, no error toast — it's a clean explanatory modal.

### Implementation pattern

A small `<DemoActionGuard>` HOC or hook that wraps the button-level click handler:

```tsx
const handleSync = useDemoGuard(() => syncAkahu(), {
  reason: "syncing from Akahu",
});
```

When `isDemoUser(currentUserEmail)` is true, `useDemoGuard` returns a function that opens the demo notice dialog instead of running the wrapped action. When false (real user), it just runs the action.

This keeps every demo guard a 1-line addition at the call site rather than a sprawling `if (isDemo)` ladder, and means new live-action buttons added later only need the wrapper.

This is the only app-side change this phase requires.

---

## One-time setup (Sean does this once)

1. **Supabase dashboard → Authentication → Users → Add user**: `demo@finance.local` + chosen password.
2. **Run** `pnpm run setup:demo-household` — a small one-shot script (`scripts/setup-demo-household.mjs`) that:
   - Creates the demo household (`name = 'demo'`)
   - Creates 2 profiles ("Demo Sean", "Demo Jenny")
   - Links the auth user via `household_members`
   - Creates a `bank_feed_state` row
   - Prints the new household's UUID
3. **Add to `.env.local`:**
   ```
   DEMO_HOUSEHOLD_ID=<uuid printed above>
   ```
4. **Add to Vercel env (Production):**
   ```
   NEXT_PUBLIC_DEMO_USER_EMAIL=demo@finance.local
   ```
5. **Run** `pnpm run seed:demo` — populates with 12 months of data.

After that, it's a single `pnpm run seed:demo` before each demo, and a redeploy after the first ship to pick up the Akahu-sync guard.

---

## Out of scope (deferred)

- **No "reset demo" button in-app** — laptop-only for now. Promote to a button if demos become very frequent.
- **No rolling auto-reset** (cron, middleware, etc.) — manual reset only.
- **No multi-tenant demo** — one demo household, period. If multiple people want to demo simultaneously, they all see the same data; modifications by one are visible to the others until next refresh.
- **No fixed "demo today"** — the script always uses real today. If demos run over multiple days without re-seeding, the cycle math will still be correct (the cycle anchor moves with calendar time) but the most recent txns will progressively age.
- **No demo-mode toggle on real account** — separate user only, per locked decision.
- **Production demo-data scrubbing** — out of scope. The demo household sits alongside real data in the same Supabase project. RLS isolates them. If that ever feels uncomfortable, escalate to a separate Supabase project.

---

## Tests

### Unit tests (vitest)

- `scripts/_demo/cadence.test.ts` — pure cadence generator. Cases:
  - Generates ~52 weekly pay events for Demo Sean over 12 months
  - Generates exactly 12 monthly pay events for Demo Jenny following the 14th-rule
  - Generates 1 annual bonus in February
  - Total txn count is in the 250-300 range
  - All dates fall within `[start, today]`
  - Balances reconcile (sum of income > sum of expenses by the visible "savings growth" delta)

### Manual smoke (after first ship)

- Sign in to prod as `demo@finance.local`
- `/dashboard` shows cycle header anchored to Demo Jenny's last 14th
- Net Position ≈ $28k (sum of demo balances)
- Cycle Spend > 0 (assuming today is at least a few days into a cycle)
- Top 3 Categories: Groceries, Fuel, Utilities (or similar)
- Recent Activity: 5 plausible-looking NZ txns
- Uncategorised tile: 0 if all txns categorised, otherwise small visible number
- `/transactions` shows ~287 rows
- `/settings/rules` shows 6 demo rules
- `/accounts` shows the "Sync from Akahu" button as normal; clicking opens the demo-notice modal instead of attempting a real sync
- Cycle math is correct on dashboard

### Out of test scope

- The seed script's DB-write path — covered by manual smoke after first run.
- The setup-demo-household script — runs once; verified once.

---

## File structure

**New files:**
- `scripts/_demo/merchants.ts` — curated NZ merchant + category-hint list
- `scripts/_demo/rules.ts` — starter rule definitions
- `scripts/_demo/cadence.ts` — pure cadence generator (TDD)
- `scripts/_demo/cadence.test.ts` — unit tests
- `scripts/setup-demo-household.mjs` — one-time household + profiles + members setup
- `scripts/seed-demo.mjs` — rolling 12-month refresh (the main script)
- `lib/demo/is-demo-user.ts` — pure helper, takes email returns boolean
- `lib/demo/use-demo-guard.ts` — client hook that wraps action handlers; opens notice dialog when demo user
- `components/demo-notice-dialog.tsx` — small reusable modal explaining demo mode
- `docs/PHASE-5-COMPLETE.md` (or whatever phase number this lands at) — completion marker

**Modified files:**
- `app/accounts/page.tsx` (or wherever the Akahu sync button lives) — wrap sync handler in `useDemoGuard`
- Any other live-action button surfaces that exist today (Akahu connect/disconnect if present) — same guard pattern
- `package.json` — add `seed:demo` and `setup:demo-household` scripts
- `.env.example` — document `DEMO_HOUSEHOLD_ID` and `NEXT_PUBLIC_DEMO_USER_EMAIL`

---

## Implementation order (preview)

This will be detailed in the writing-plans output. Rough sequence:

1. `scripts/_demo/merchants.ts` + `rules.ts` — typed lists (no logic)
2. `scripts/_demo/cadence.ts` + tests (TDD)
3. `scripts/setup-demo-household.mjs` — one-time household setup
4. `scripts/seed-demo.mjs` — main refresh script (wires merchants + cadence + DB writes)
5. Demo-mode guard primitives — `lib/demo/is-demo-user.ts`, `lib/demo/use-demo-guard.ts`, `components/demo-notice-dialog.tsx`
6. Wrap existing live-action buttons (Akahu sync etc.) with `useDemoGuard`
7. `package.json` scripts + `.env.example` + completion marker doc

Roughly **6-7 plan tasks** total.

---

## References

- Phase 4 (Dashboard) completion: `~/Projects/finance-v2/docs/PHASE-4-COMPLETE.md`
- Phase 4 spec — origin of demo profile callout: `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-4-dashboard-design.md` § "Future phase candidate — Demo / test profile"
- Schema: `~/Projects/finance-v2/supabase/migrations/0001_v2_schema.sql`
- Existing reference scripts (same shape): `~/Projects/finance-v2/scripts/detect-jenny-pay.mjs`, `~/Projects/finance-v2/scripts/show-account-tags.mjs`
