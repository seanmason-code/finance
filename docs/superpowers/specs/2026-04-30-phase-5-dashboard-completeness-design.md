# Phase 5 — Dashboard Completeness — Design

**Date drafted:** 2026-04-30
**Project:** finance-v2 (Personal Finance PWA)
**Predecessor:** Phase 4 — Dashboard (`docs/PHASE-4-COMPLETE.md`)
**Implementation repo:** `~/Projects/finance-v2/`
**Roadmap context:** Phases 5–9 chunked in this session — 5 (this), 6 (savings goals), 7 (AI sanity advisor), 8 (charts), 9 (cycle/payday settings UI).

---

## Context

Phase 4 shipped a useful 5-tile dashboard, but three things were explicitly deferred to keep the first version focused: cross-cycle comparison, an income tile, and a transaction detail page. Without these, the dashboard answers "how is this cycle going?" but not "is that better or worse than last cycle?", "where did the money come from this cycle?", or "what was that $80 charge actually for?" Phase 5 closes that gap.

Sean also flagged in the brainstorm that he wants automated sanity-checking against the live app — Phase 5 includes a deterministic reconciliation script (a follow-on AI advisor phase is queued separately).

---

## Goal

Round out the dashboard so it covers the full daily-use surface: spending pace vs last cycle, income tracking, and a way to drill into and edit a single transaction. Plus an automated reconciliation script that catches dashboard math drift before users see it.

---

## Locked design decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Cross-cycle delta presentation | Inline delta line under each tile's main number |
| Cross-cycle math | Apples-to-apples — this cycle through day N vs last cycle through day N |
| Tiles that get cross-cycle deltas | Cycle Spend, Top Categories (per-row), Income |
| Tiles that don't | Net Position (point-in-time), Recent Activity (no aggregate), Uncategorised (current-state) |
| Editable fields on txn detail | Category, labels, notes (lean + notes; one-column migration) |
| Notes column | `notes text` nullable, matches existing `description` convention |
| Save mechanism | Next 16 server actions, autosave-on-blur per field |
| Edit pattern | Inline editable controls — no separate edit mode |
| Income tile position | First-row of grid alongside Net Position and Cycle Spend |
| `/transactions` row click | Whole row links to `/transactions/[id]` |
| Reconciliation | Standalone script `pnpm run reconcile` (no AI in this phase) |

---

## Architecture

Phase 5 is additive on top of Phase 4. No existing tile gets removed; existing tiles gain optional `delta` props rendered under their main numbers. One new tile (Income) is added. One new route is added (`/transactions/[id]`). One new column is added (`transactions.notes`). One new pure helper module is added (`lib/cycle-compare/compute-deltas.ts`). One new dev script is added (`scripts/reconcile-dashboard.mjs`).

The dashboard's existing single-flight `Promise.all` is extended to also fetch last-cycle's data alongside the current cycle's; the tile-by-tile delta computation happens in TS after the fetch resolves, same pattern as Phase 4's TS-side top-categories aggregation.

---

## Cross-cycle compare

### Math (apples-to-apples)

For each tile that supports compare:

1. `cycleStart` = current cycle start (already computed in Phase 4).
2. `lastCycleStart` = previous cycle start.
3. `n = daysIntoCycle(today)` — days into current cycle.
4. `lastCycleCutoff` = `lastCycleStart + n days` (string-date math).
5. Pull last cycle's transactions where `posted_at >= lastCycleStart AND posted_at <= lastCycleCutoff`.
6. Aggregate same as current cycle.
7. Delta % = `(current - last) / last * 100` (with sign-handling for spend vs income).
8. **Edge case — `last === 0`:** render delta line as *"first cycle this period"* placeholder, no percentage.
9. **Edge case — first cycle ever (no last cycle txns at all):** same placeholder.

### Display

Inline delta line under each tile's main number. Examples:

- Cycle Spend tile (today day 16, this cycle so far $1,234, last cycle through day 16 was $1,153):
  > **$1,234**
  > 16 days into cycle · ↑ 7% vs last cycle

- Income tile (this cycle so far $4,200, last cycle through same day was $5,400):
  > **$4,200**
  > 2 paydays · ↓ 22% vs last cycle

- Top Categories rows get per-row deltas:
  > Groceries · $440 · ↑ 12%
  > Fuel · $180 · ↓ 5%
  > Dining · $120 · ↑ 40%

### Colours

- Spend ↑ = red (overspending vs pace)
- Spend ↓ = green (underspending — good)
- Income ↑ = green
- Income ↓ = red
- Per-row category deltas: same logic as Cycle Spend (↑ = red, ↓ = green).

### New cycle helpers

`lib/payday/cycle.ts` gains two exports:

```ts
/** Returns { start, end } of the previous cycle (one cycle before currentCycleStart). */
export function lastCycleRange(todayIso: string = todayInNZ()): { start: string; end: string };

/** Returns the date `n` days after `lastCycleStart`, as YYYY-MM-DD. Used to build apples-to-apples cutoff. */
export function lastCycleCutoff(todayIso: string = todayInNZ()): string;
```

TDD on these in the existing `cycle.test.ts`, including the year-rollover and Sat/Sun-shift edge cases.

### Pure delta computer

`lib/cycle-compare/compute-deltas.ts` — pure helpers, no DB:

```ts
export type DeltaResult =
  | { kind: "first-cycle" }
  | { kind: "compare"; pct: number; direction: "up" | "down" | "flat" };

export function computeDelta(current: number, last: number): DeltaResult;
```

Hardcoded thresholds: `Math.abs(pct) < 1` → `"flat"`. Otherwise → `"up"` / `"down"`.

Tests: zero-last, equal-current-last, negative pct, positive pct, near-zero values.

---

## Income tile (new)

Sixth tile in the dashboard grid. Same `Card` structure as Phase 4 tiles.

```tsx
<IncomeTile
  totalCurrent={5400}        // sum of income amounts since cycle start
  totalLastSamePoint={5800}  // sum of income amounts in last cycle through day N
  paydayCountCurrent={4}     // count of distinct posted_at dates with income
  cycleStart="2026-04-14"
/>
```

**Display:**
- Title: "Income"
- Big number: `fmtMoneyWhole(totalCurrent)` (green if `> 0`)
- Secondary line: *"N paydays · [delta]"*
- Empty state: *"No income this cycle yet."*
- Click-through: `/transactions?type=income&since=<cycleStart>`

**Query (added to dashboard's `Promise.all`):**

```ts
supabase
  .from("transactions")
  .select("amount, posted_at")
  .eq("household_id", hh.id)
  .eq("type", "income")
  .gte("posted_at", cycleStart),
```

Plus a sibling query for `lastCycleStart` → `lastCycleCutoff` for the apples-to-apples compare.

**Why "net" not "gross":** finance-v2 reads what arrived in the bank account. Tax has already been deducted by Sean's and Jenny's employers before the transfer hits Akahu. So "income" in this app is post-tax-as-arrived. No grossing-up logic.

---

## Transaction detail page

### Route

`/transactions/[id]/page.tsx` — server component. Fetches the single transaction via Supabase scoped by `household_id` (RLS). Renders 404 page if not found or scoped out.

### Layout

Stacked, mobile-first, max-width like other detail surfaces. Two visual blocks:

1. **Read-only header block** — amount (sign-coloured, big), posted_at, account name, merchant_clean (or merchant_raw), source.
2. **Editable block** — three controls, each autosaving on blur:
   - **Category** — dropdown from existing `categories` table.
   - **Labels** — chip input. Each chip is a string from `labels[]`. Add/remove inline.
   - **Notes** — textarea, ~3 rows tall.

No "Save" button — autosave on blur. No "Edit" toggle — controls are always live (matches Phase 3c's rules CRUD modal pattern).

### Server actions

`app/transactions/[id]/actions.ts`:

```ts
"use server";

export async function updateCategory(txnId: string, categoryId: string | null): Promise<void>;
export async function updateLabels(txnId: string, labels: string[]): Promise<void>;
export async function updateNotes(txnId: string, notes: string): Promise<void>;
```

Each:
1. Validates the auth user owns the txn (RLS enforces, but action verifies again as defense in depth).
2. Updates the single column.
3. Calls `revalidatePath` on `/transactions/[id]` and `/transactions` so the changes show on navigation.

No optimistic UI in this phase — server-action latency is sub-200ms on this app, no need for the complexity. Add later if it ever feels sluggish.

### Delete

A small `Delete this transaction` link at the bottom of the page, opens a confirm dialog (reuse the existing dialog primitive). On confirm, server action `deleteTransaction(txnId)` → `revalidatePath` → `redirect("/transactions")`. If the dialog primitive doesn't trivially support a confirm flow, defer delete to Phase 6 — don't block this phase.

### Migration

```sql
-- supabase/migrations/00XX_add_transactions_notes.sql
ALTER TABLE v2.transactions ADD COLUMN notes text;
```

Nullable. No backfill needed — existing rows have `notes IS NULL` which the UI treats as empty.

### `/transactions` row → detail link

Wrap each `<TableRow>` in a `<Link href={\`/transactions/${id}\`}>` (Next 16 supports `<Link>` wrapping `<tr>` via `legacyBehavior` or by making the row a single anchor — the cleanest pattern is a CSS-grid table not a `<table>`; in this codebase the existing table is a `<table>`, so use a click handler on the row that calls `router.push` plus add `cursor-pointer` and `aria-label`. Keep "make rule" button click-event-stop-propagation so it doesn't navigate when clicked).

---

## Reconciliation script

`scripts/reconcile-dashboard.mjs`:

1. Reads `DEMO_HOUSEHOLD_ID` and the real household ID from env (or accepts a `--household=<id>` flag).
2. For each household, computes the 5 (now 6 after Phase 5) tile values **using replicated query logic** (cleaner than importing from `app/`):
   - Net Position
   - Cycle Spend
   - Top 3 Categories
   - Recent 5 Activity (just count for reconciliation)
   - Uncategorised count
   - Income total
3. Runs ground-truth SQL queries (raw SQL via service-role key) for the same metrics.
4. Diffs. Prints PASS / DRIFT DETECTED.
5. On drift: prints per-field diff with both values. Exit non-zero so it can be CI-wired later.

Run as `pnpm run reconcile`. Optional `pnpm run reconcile --household=<id>` for a specific household.

Output example:

```
Reconciliation report — household 12abc...

  Net position:       PASS  $28,770
  Cycle spend:        PASS  $1,234
  Top 3 categories:   PASS  Groceries / Fuel / Utilities
  Recent count:       PASS  5
  Uncategorised:      DRIFT app=3, sql=4   (1-row diff)
  Income:             PASS  $5,400

1 drift detected. Investigate uncategorised pipeline.
```

---

## File structure

**New files:**
- `app/transactions/[id]/page.tsx` — server component, fetches single txn, renders read-only + editable blocks
- `app/transactions/[id]/edit-form.tsx` — client component, the editable block (category, labels, notes with autosave)
- `app/transactions/[id]/actions.ts` — server actions for updateCategory, updateLabels, updateNotes, deleteTransaction
- `app/dashboard/_tiles/income-tile.tsx` — sixth tile
- `lib/cycle-compare/compute-deltas.ts` — pure delta computer
- `lib/cycle-compare/compute-deltas.test.ts` — TDD
- `scripts/reconcile-dashboard.mjs` — reconciliation script
- `supabase/migrations/00XX_add_transactions_notes.sql` — notes column
- `docs/PHASE-5-COMPLETE.md` — completion marker

**Modified files:**
- `lib/payday/cycle.ts` — add `lastCycleRange`, `lastCycleCutoff`
- `lib/payday/cycle.test.ts` — extend tests for the new helpers
- `lib/db/schema.ts` — add `notes: string | null` to Transaction type
- `app/dashboard/page.tsx` — extend `Promise.all` with last-cycle queries + income query, compute deltas, pass to tiles, render 6th tile
- `app/dashboard/_tiles/cycle-spend-tile.tsx` — accept optional `delta` prop, render delta line
- `app/dashboard/_tiles/top-categories-tile.tsx` — accept optional per-row `delta`, render in row
- `app/transactions/page.tsx` — wrap each row in click-to-detail link
- `package.json` — add `reconcile` script

---

## Tests

### Unit tests (vitest)

- `lib/payday/cycle.test.ts` (extended) — `lastCycleRange` (basic, year-rollover, Sat/Sun shift), `lastCycleCutoff` (basic + edge cases).
- `lib/cycle-compare/compute-deltas.test.ts` — zero-last, flat (sub-1% diff), up, down, both signs.

### Manual smoke (after deploy)

- Hit `/dashboard` on prod. Confirm:
  - 6 tiles rendered (or 5 if uncategorised count is 0).
  - Cycle Spend, Top Categories rows, and Income each show a delta line below their number.
  - Delta math reconciles with manual SQL (or use `pnpm run reconcile` post-deploy).
- Hit `/transactions`, click a row → lands on `/transactions/[id]`.
- Edit category → blur → reload → category persists.
- Edit notes → blur → reload → notes persist.
- Add/remove labels → persists.
- Click `Delete` → confirm → row gone, redirected to `/transactions`.
- `pnpm run reconcile` returns PASS for both real and demo households.

### Out of test scope

- The dashboard page itself — server component + Supabase reads, manual smoke is the gate (same as Phase 4).
- The detail page server actions — manual smoke (same convention).

---

## Out of scope (deferred)

- **AI sanity advisor** — promoted to its own phase (Phase 7 in the roadmap). Sean wants an LLM-driven anomaly checker that reads the dashboard state + recent txns and flags weirdness. Worthy of a real brainstorm.
- **Optimistic UI on txn edits** — server actions are fast enough; add only if latency becomes a complaint.
- **Edit history / audit trail** on transactions — not needed for personal finance use case.
- **Override merchant or amount** — out of scope; Phase 5 is "augment categorisation," not "fix bank data."
- **Sparklines on tiles** — chart territory, Phase 8.
- **More than 1-cycle-back compare** (3-month / 6-month trends) — Phase 8 (charts) handles this.
- **Pay-cycle anchor settings UI** — Phase 9.

---

## Estimated build

**~12 plan tasks**, ~3-4 hours of subagent-driven build:

1. Extend `lib/payday/cycle.ts` with `lastCycleRange` + `lastCycleCutoff` + tests
2. Create `lib/cycle-compare/compute-deltas.ts` + TDD tests
3. Migration: `00XX_add_transactions_notes.sql`
4. `app/dashboard/_tiles/income-tile.tsx` (mirrors NetPosition tile shape, takes delta prop)
5. Add delta-line addon to `cycle-spend-tile.tsx` (optional `delta` prop)
6. Add per-row delta to `top-categories-tile.tsx`
7. Wire `app/dashboard/page.tsx` — extend `Promise.all` with last-cycle + income, compute deltas, render 6 tiles
8. `app/transactions/[id]/page.tsx` — read-only block
9. `app/transactions/[id]/edit-form.tsx` + `actions.ts` — editable block + server actions + autosave + delete
10. `app/transactions/page.tsx` — wrap each row in click-to-detail link
11. `scripts/reconcile-dashboard.mjs` + `package.json` script entry
12. Phase 5 completion marker doc

---

## References

- Phase 4 (Dashboard) completion: `~/Projects/finance-v2/docs/PHASE-4-COMPLETE.md`
- Phase 4 spec: `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-4-dashboard-design.md`
- Demo profile spec (related): `~/Projects/finance/docs/superpowers/specs/2026-04-30-demo-test-profile-design.md`
- Schema: `~/Projects/finance-v2/supabase/migrations/0001_v2_schema.sql`
- Existing pay-cycle module: `~/Projects/finance-v2/lib/payday/cycle.ts`
- Existing tiles: `~/Projects/finance-v2/app/dashboard/_tiles/`
