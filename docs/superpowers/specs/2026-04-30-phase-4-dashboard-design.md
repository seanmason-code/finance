# Phase 4 — Dashboard — Design

**Date drafted:** 2026-04-30
**Project:** finance-v2 (Personal Finance PWA)
**Predecessor:** Phase 3c — Rules CRUD (`docs/PHASE-3C-COMPLETE.md`)
**Implementation repo:** `~/Projects/finance-v2/`

---

## Context

The current `/dashboard` is a placeholder card that says *"Bones phase complete. The real dashboard arrives in Phase 4."* Phase 1-3c built all the data plumbing (transactions, accounts, categories, rules, sync). Phase 4 turns it into a useful at-a-glance daily surface.

Per Sean's design philosophy: *"Dashboard = at a glance only, click through for detail. Minimal tiles not lists."*

---

## Goal

A `/dashboard` page that answers, in five seconds: *"how is the household tracking this cycle?"* Five tiles. Each tile shows one number or one tight list, with a click-through to the detailed view on an existing page.

---

## The pay-cycle anchor

The dashboard is anchored to **Jenny's monthly pay cycle**, not the calendar month. The cycle starts when household income arrives — so "this cycle's spending" is uncluttered by pre-payday spending of the previous cycle.

**Pay-date rule (verified against 11 of 11 of Jenny's L'Oréal income txns over the last 12 months):**

- Pay lands on the **14th** of the month.
- If the 14th is a **Saturday** → previous Friday (13th).
- If the 14th is a **Sunday** → previous Friday (12th).
- (No Monday/holiday handling for Phase 4. Drift of ±1 day on rare holiday months is acceptable; revisit if it becomes annoying.)

**Annual L'Oréal bonus (e.g. 2026-02-25, $16,346) is excluded** from cycle math — only the regular monthly paycheck anchors the cycle.

**Sean's pay** (weekly, Wednesday) is not used to anchor the cycle. Sean's weekly inflows just land inside whichever monthly cycle is active.

**Pure function (engine-style, no DB):**

The functions work on date-only values (no time-of-day), avoiding timezone drift around cycle-start midnight in NZ.

```ts
// lib/payday/cycle.ts

// Returns the pay date for a given year/month in YYYY-MM-DD form.
export function payDateFor(year: number, monthIndex: number /* 0-11 */): string {
  const d = new Date(Date.UTC(year, monthIndex, 14));
  const dow = d.getUTCDay(); // 0 Sun ... 6 Sat
  if (dow === 6) d.setUTCDate(13);   // Sat → Fri
  else if (dow === 0) d.setUTCDate(12); // Sun → Fri
  return d.toISOString().slice(0, 10);
}

// Returns the date Sean's "today" sees in NZ — i.e. the date a user in Pacific/Auckland
// is currently on, regardless of the server's UTC clock. This is the right anchor for
// "what cycle am I in" because bank txns post_at uses the user-visible date, not UTC midnight.
export function todayInNZ(now: Date = new Date()): string {
  // 'en-CA' formats as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

export function currentCycleStart(todayIso: string = todayInNZ()): string {
  const [yearStr, monthStr] = todayIso.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const thisMonth = payDateFor(year, monthIndex);
  if (todayIso >= thisMonth) return thisMonth;
  // Today is before this month's pay date — cycle started in the previous month.
  return monthIndex === 0
    ? payDateFor(year - 1, 11)
    : payDateFor(year, monthIndex - 1);
}

export function daysIntoCycle(todayIso: string = todayInNZ()): number {
  const start = currentCycleStart(todayIso);
  // Both inputs are YYYY-MM-DD; parse to UTC midnight and diff in days.
  const ms = Date.UTC(...todayIso.split("-").map(Number).map((n, i) => i === 1 ? n - 1 : n) as [number, number, number])
    - Date.UTC(...start.split("-").map(Number).map((n, i) => i === 1 ? n - 1 : n) as [number, number, number]);
  return Math.floor(ms / 86_400_000);
}
```

This module gets its own unit tests (TDD): every weekday/weekend permutation across 24 months, plus boundary cases for Jan/Dec year-rollover and pay-date midnight in NZ.

**Why string dates not `Date` objects:** `posted_at` in the DB is a `date` column (YYYY-MM-DD, no time, no timezone). Cycle queries compare `posted_at >= cycleStart` as strings — Postgres date comparison + ISO string comparison both work correctly. Using `Date` objects would introduce timezone semantics that don't match the data.

---

## Page

### Route

`/dashboard` — the existing route. Replace the placeholder card content. Auth-gate via `redirect("/login")` if no user, mirroring `/transactions/page.tsx` and `/settings/rules/page.tsx`.

### Layout

**Mobile-first stacked.** Single column on phone, 2-col grid on tablet, 3-col on desktop:

```
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
```

Tiles flow naturally; no fixed heights. Each tile is a Card with consistent padding, heading, value, optional secondary line, and tap target → click-through.

### Header region

Above the tiles, a small cycle indicator:

> **Cycle 14 Apr — 13 May**  ·  *17 days in*

Both dates rendered relative to the current cycle (start = `currentCycleStart(now)`, end = `payDateFor(currentCycle + 1) - 1` or just "next 14th"). The "X days in" comes from `daysIntoCycle(now)`.

---

## The five tiles

### 1. Net Position

**What it shows:** sum of all account balances.
**Display:** *"$XX,XXX"* big number, secondary line *"across N accounts"*. No cycle context — this is a point-in-time number.
**Empty state:** if zero accounts, *"Add an account to see your net position →"* linking to `/accounts`.
**Click-through:** `/accounts`.
**Query:** `SELECT SUM(balance) FROM v2.accounts WHERE household_id = ?` plus `SELECT COUNT(*)` for the secondary line.

### 2. Cycle Spend

**What it shows:** total expenses since cycle start.
**Display:** *"$X,XXX spent"* big number, secondary line *"X days into cycle"*. Stylistically, expense → red token if any spend; muted if zero.
**Empty state:** *"No spend yet this cycle."* (rare — only at cycle reset.)
**Click-through:** `/transactions?type=expense&since=<cycleStart>` (URL params filter the list — needs Phase 4-side filter support, see "Transactions filtering" below).
**Query:** `SELECT SUM(amount) FROM v2.transactions WHERE type='expense' AND posted_at >= cycleStart AND household_id = ?` (amount stored signed; expense rows are negative; sum and abs).

### 3. Top 3 Categories This Cycle

**What it shows:** the three highest-spend categories since cycle start.
**Display:** three rows, each *"Groceries · $XXX"* with a small bar showing relative share. Use `text-foreground` for category name, `tabular-nums` on the amount.
**Empty state:** *"No categorised spend yet this cycle."*
**Click-through:** click a row → `/transactions?category=<id>&since=<cycleStart>` filtered to that category in the cycle.
**Query:** `SELECT category_id, categories.name, SUM(amount) FROM v2.transactions JOIN categories ... WHERE type='expense' AND posted_at >= cycleStart GROUP BY category_id ORDER BY SUM ASC LIMIT 3` (ordering by ASC because expense amounts are negative; smallest = largest absolute outflow).

### 4. Recent Activity

**What it shows:** the last 5 transactions across all accounts, regardless of cycle.
**Display:** compact rows: *"Yesterday · PAK N SAVE WAIRAU · -$45.20"*. Date as relative ("today", "yesterday", "Tue") for the last 7 days, ISO date for older. Amount right-aligned with sign-coloured token (red expense, green income).
**Empty state:** *"No transactions yet."* (will be true only on a brand-new account.)
**Click-through:** clicking the tile body → `/transactions` (full list). Clicking an individual row → could deep-link to that txn's detail, but no detail page exists yet — for Phase 4, the whole tile clicks through to `/transactions`.
**Query:** `SELECT id, posted_at, amount, merchant_clean, merchant_raw, description FROM v2.transactions WHERE household_id = ? ORDER BY posted_at DESC LIMIT 5`.

### 5. Uncategorised count (conditional)

**What it shows:** count of transactions with `category_id IS NULL`. Only renders when count > 0.
**Display:** *"3 transactions need categorising"* + a small "→" chevron. Single line, slightly attention-grabbing styling (e.g. left-border accent).
**Empty state:** tile is hidden entirely. (When all txns are categorised, the dashboard shows 4 tiles instead of 5.)
**Click-through:** `/transactions?uncategorised=true`.
**Query:** `SELECT COUNT(*) FROM v2.transactions WHERE category_id IS NULL AND household_id = ?`.

---

## Data fetch strategy

**Single page-level fetch via `Promise.all` of all queries**, then slice for each tile. One round-trip, simplest server component, sub-second on the current 5347-txn dataset.

```tsx
// In app/dashboard/page.tsx (server component):
const today = new Date();
const cycleStart = currentCycleStart(today);

const [
  { data: accountsAgg },
  { data: cycleTxnsAgg },
  { data: topCats },
  { data: recent },
  { data: uncatCount },
] = await Promise.all([
  // Net position + account count
  supabase.from("accounts").select("balance").eq("household_id", hh.id),
  // Cycle spend total — could be done in JS by summing client-side or via a Postgres view
  supabase.from("transactions")
    .select("amount, category_id")
    .eq("type", "expense")
    .eq("household_id", hh.id)
    .gte("posted_at", isoOf(cycleStart)),
  // Top 3 categories — Postgres-side aggregation needed; see "Aggregation" below
  // Recent 5
  supabase.from("transactions")
    .select("id, posted_at, amount, merchant_clean, merchant_raw, description")
    .eq("household_id", hh.id)
    .order("posted_at", { ascending: false })
    .limit(5),
  // Uncategorised count
  supabase.from("transactions")
    .select("id", { count: "exact", head: true })
    .is("category_id", null)
    .eq("household_id", hh.id),
]);
```

**Aggregation note:** Supabase's PostgREST does not natively support `GROUP BY` in `select()`. The two paths:

- **(a)** Create a Postgres view `v2.dashboard_category_spend(household_id, cycle_start, category_id, name, total)` that materialises group-by-category sums on demand. Cleanest. Adds a SQL migration in this phase.
- **(b)** Fetch all expense txns for the cycle (single query, no group-by), then group/sum/sort in TypeScript. Simpler, no migration. ~hundreds of rows per cycle max — negligible cost.

**Recommendation: (b)** for Phase 4. Faster to ship, no migration overhead. Move to (a) only if it becomes slow with future data growth (very unlikely at single-household scale).

---

## Error / loading / empty handling

- **Loading:** Page renders when all queries resolve. No `<Suspense>` boundaries. Sub-second on this dataset.
- **Error:** Page-level error boundary. If any query fails, the whole dashboard renders an "Couldn't load dashboard. Refresh and try again." message with a link back to `/transactions`. Tile-level error states are out of scope for Phase 4 — when one query fails on this app, they all probably will (Supabase outage scenario).
- **Empty:** Each tile has its own zero-state copy as detailed above. Uncategorised tile self-hides at zero.

---

## Transactions filtering (URL params)

Several tiles click through to `/transactions?<filters>`. The current `app/transactions/page.tsx` does NOT support filter query params yet — it shows everything paginated. To make the dashboard click-throughs land on a filtered view, Phase 4 needs to extend `/transactions` to honour these params:

- `?type=expense` — filter to expense rows only
- `?category=<id>` — filter to one category
- `?since=YYYY-MM-DD` — only txns with `posted_at >= since`
- `?uncategorised=true` — filter to `category_id IS NULL`

**Implementation:** small additive change to the existing server-component fetch — read `searchParams`, build conditional filters on the Supabase query. No new page, no breaking change. Existing call sites (no params) get the same all-rows view they currently have.

This is a small but real piece of work — included in the Phase 4 plan, not its own phase.

---

## Out of scope (explicit)

The dashboard is a starting surface; these are deliberately deferred:

- **Cross-cycle comparison.** "This cycle vs last cycle" sparklines, trend arrows. Phase 5.
- **Charts.** No charting library, no spend-over-time line chart, no category pie. Phase 5.
- **Savings goals tracking.** From the legacy roadmap backlog. Separate phase.
- **Pay-cycle settings UI.** Hardcoded 14th-rule for now. If Sean ever changes employers, the constant gets edited in code.
- **NZ public holiday handling.** ±1d drift acceptable. Add later if a real holiday lands on the 14th and Sean's annoyed.
- **Sean's weekly Wednesday pay** as its own anchor or sub-cycle. Not used in Phase 4.
- **Per-user views.** No "Sean's dashboard" vs "Jenny's dashboard" toggle. Household-wide is the only view.
- **Dashboard tile toggles.** No settings to hide/show tiles. If a tile becomes dead weight, remove from code.
- **Per-tile streaming via `<Suspense>`.** All-or-nothing page render. Add only if perf becomes a problem.
- **Tile-level error boundaries.** Page-level only. Same reason.
- **Income tile.** Skipped — you already know what your income is, the dashboard's job is "where did the money go."
- **Click-through to individual transaction detail page.** No txn detail page exists; tile clicks land on `/transactions`.

---

## Tests

TDD on the pure pay-cycle logic; manual smoke on the page itself.

### Unit tests (vitest)

- `lib/payday/cycle.test.ts` — `payDateFor`, `currentCycleStart`, `daysIntoCycle`. Cases:
  - 14th lands on every weekday (Mon-Fri) → returns 14
  - 14th is Sat → returns 13 (Fri)
  - 14th is Sun → returns 12 (Fri)
  - `currentCycleStart` for `today < this-month-pay-date` → returns previous month's pay date
  - `currentCycleStart` for `today >= this-month-pay-date` → returns this month's pay date
  - `currentCycleStart` for `today === this-month-pay-date` → returns this month's pay date (boundary)
  - `daysIntoCycle` returns whole-day count
  - At least 12 calendar months of `currentCycleStart` worked through (validates against the 11/11 fit from the detection script)

### Manual smoke (verify phase)

- Hit `/dashboard` on prod after deploy. Confirm:
  - Cycle header shows correct dates
  - Net position matches `SELECT SUM(balance) FROM v2.accounts`
  - Cycle spend matches a manual SQL sum
  - Top 3 categories matches manual aggregation
  - Recent activity shows the actual last 5 txns
  - Uncategorised tile hidden when count=0; visible+correct when count>0
  - Each click-through lands on a correctly-filtered `/transactions` view

### Out of test scope

- The dashboard page itself — server component + Supabase reads, doesn't lend to vitest cleanly. Same pattern as `/settings/rules/page.tsx` (Phase 3c) and `/transactions/page.tsx` — manual smoke is the gate. Playwright follow-up if E2E coverage is wanted later.
- The transactions-filter additions — covered manually as part of dashboard verification.

---

## File structure

New files:

- `lib/payday/cycle.ts` — pure pay-cycle helpers
- `lib/payday/cycle.test.ts` — TDD tests
- `app/dashboard/_tiles/net-position-tile.tsx`
- `app/dashboard/_tiles/cycle-spend-tile.tsx`
- `app/dashboard/_tiles/top-categories-tile.tsx`
- `app/dashboard/_tiles/recent-activity-tile.tsx`
- `app/dashboard/_tiles/uncategorised-tile.tsx`

(Tile components in a private `_tiles` folder — Next.js convention is `_underscore` directories are not routed. Each tile is a small client OR server component depending on whether it needs interactivity. Most are server-side renderable since they just display a fetched value.)

Modified files:

- `app/dashboard/page.tsx` — replace placeholder, do the parallel fetch, render tiles
- `app/transactions/page.tsx` — read `searchParams` and build conditional filters

---

## Implementation order (preview)

This will be detailed in the writing-plans output. Rough sequence:

1. `lib/payday/cycle.ts` + tests (TDD)
2. `app/transactions/page.tsx` — extend with `searchParams` filters (foundational for tile click-throughs)
3. The 5 tile components, one per task (small focused commits)
4. `app/dashboard/page.tsx` — wire it all together
5. Manual smoke + completion marker

Roughly 7-9 plan tasks total.

---

## Future phase candidate — Demo / test profile

**Not Phase 4. Captured here so it doesn't get lost; slot it into the right phase later.**

Sean wants to be able to demo the app to other people without exposing his and Jenny's real financial data. The fix is a dedicated **demo profile** that anyone (Sean included) can sign in to and see a fully populated, realistic-looking app:

- Dedicated test login + test password (separate auth user from the real household).
- Backed by a separate household + accounts row, so it doesn't appear in the real dashboard or affect real cycle math.
- Pre-seeded with **about 1 year of fake transactional data** (3 years if it's cheap; 1 year is the minimum for the dashboard, journey-style features, and category aggregation to look believable).
- Fake but realistic merchants (PAK N SAVE, Z, Spark, etc.), categories already assigned, accounts with sensible balances, an income stream consistent with the 14th-rule pay cycle.
- Reset-on-demand: a way to wipe and re-seed the demo profile so it stays in good shape between demos.

**Slot:** ideally after the dashboard and journey features have settled (so the demo profile actually shows them off), but before any wider sharing of the app. Could be its own phase, or a small companion phase to whichever launch milestone needs the demo most.

**Open questions for whoever picks this up:**
- Seed via a SQL migration, or via an idempotent seed script that hits Supabase with the service-role key?
- Do we synthesise the txns programmatically (per-category cadences) or import from a sanitised real export?
- Does the demo user share categories/rules with the real household, or get its own copy?

---

## References

- Phase 3c completion: `~/Projects/finance-v2/docs/PHASE-3C-COMPLETE.md`
- Memory note: `dashboard = at a glance only, click through for detail. Minimal tiles not lists.`
- Detection script (kept for future re-runs if pay pattern changes): `scripts/detect-jenny-pay.mjs`
- Pay-date verification data: 11/11 of Jenny's L'Oréal income txns over the last 12 months matched the 14th-rule (script run 2026-04-30).
