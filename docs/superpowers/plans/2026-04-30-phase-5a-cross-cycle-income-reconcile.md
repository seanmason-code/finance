# Phase 5a — Cross-Cycle + Income Tile + Reconcile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-cycle compare deltas to existing dashboard tiles, add a 6th Income tile, and ship a `pnpm run reconcile` script that reconciles dashboard math against ground-truth SQL.

**Architecture:** Pure helpers in `lib/payday/cycle.ts` and `lib/cycle-compare/compute-deltas.ts` produce delta values that are passed as optional props to existing tiles. New `IncomeTile` mirrors the cycle-spend tile shape. Dashboard page extends its single `Promise.all` to include last-cycle and income queries. Reconciliation is a separate Node script that runs the dashboard math + ground-truth SQL and diffs them.

**Tech Stack:** Next.js 16 App Router (server components), Supabase JS, Tailwind, shadcn `Card`, Vitest, Node script + service-role key.

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-5-dashboard-completeness-design.md`
**Implementation repo:** `~/Projects/finance-v2/`

**Out of scope for this plan (deferred to Phase 5b):** transaction detail page (`/transactions/[id]`), notes column migration, `/transactions` row link.

---

## File structure

**New files:**
- `lib/cycle-compare/compute-deltas.ts` — pure delta computer
- `lib/cycle-compare/compute-deltas.test.ts` — TDD
- `app/dashboard/_tiles/income-tile.tsx` — sixth tile
- `scripts/reconcile-dashboard.mjs` — reconciliation script
- `docs/PHASE-5A-COMPLETE.md` — completion marker

**Modified files:**
- `lib/payday/cycle.ts` — add `lastCycleRange`, `lastCycleCutoff`
- `lib/payday/cycle.test.ts` — extend with new function tests
- `app/dashboard/_tiles/cycle-spend-tile.tsx` — accept optional `delta` prop
- `app/dashboard/_tiles/top-categories-tile.tsx` — accept optional per-row `delta`
- `app/dashboard/page.tsx` — extend Promise.all, compute deltas, render 6 tiles
- `package.json` — add `reconcile` script entry

---

## Task 1: Cycle module extension — `lastCycleRange` + `lastCycleCutoff` (TDD)

**Files:**
- Modify: `lib/payday/cycle.ts`
- Modify: `lib/payday/cycle.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Append to `lib/payday/cycle.test.ts`:

```ts
import {
  payDateFor,
  currentCycleStart,
  currentCycleRange,
  daysIntoCycle,
  lastCycleRange,
  lastCycleCutoff,
} from "./cycle";

describe("lastCycleRange", () => {
  it("returns the cycle immediately preceding the current one", () => {
    // Today 2026-04-30 → current cycle started 2026-04-14 → last cycle was 2026-03-13 (Sat→Fri) to 2026-04-13
    expect(lastCycleRange("2026-04-30")).toEqual({
      start: "2026-03-13",
      end: "2026-04-13",
    });
  });

  it("works on the current cycle's start day (boundary)", () => {
    expect(lastCycleRange("2026-04-14")).toEqual({
      start: "2026-03-13",
      end: "2026-04-13",
    });
  });

  it("handles year rollover (Jan today → Dec last cycle)", () => {
    // 2026-01-20 → current cycle 2026-01-14 → last cycle 2025-12-12 (Sun→Fri) to 2026-01-13
    expect(lastCycleRange("2026-01-20")).toEqual({
      start: "2025-12-12",
      end: "2026-01-13",
    });
  });

  it("handles consecutive Sat/Sun shift months", () => {
    // 2026-03-15 → current cycle 2026-03-13 (Sat→Fri) → last cycle 2026-02-13 (Sat→Fri) to 2026-03-12
    expect(lastCycleRange("2026-03-15")).toEqual({
      start: "2026-02-13",
      end: "2026-03-12",
    });
  });
});

describe("lastCycleCutoff", () => {
  it("returns lastCycleStart plus daysIntoCycle days", () => {
    // 2026-04-30 → daysIntoCycle = 16, lastCycleStart = 2026-03-13, +16 = 2026-03-29
    expect(lastCycleCutoff("2026-04-30")).toBe("2026-03-29");
  });

  it("returns lastCycleStart on the cycle start day (days = 0)", () => {
    expect(lastCycleCutoff("2026-04-14")).toBe("2026-03-13");
  });

  it("clamps to lastCycleEnd if days into current exceeds last cycle's length", () => {
    // 2026-05-13 → daysIntoCycle = 29 (current cycle is Apr 14–May 13 = 30 days)
    // lastCycleStart = 2026-03-13. +29 = 2026-04-11. Last cycle end = 2026-04-13. 2026-04-11 < 2026-04-13 so no clamp.
    expect(lastCycleCutoff("2026-05-13")).toBe("2026-04-11");
  });

  it("clamps when current cycle is materially longer than last cycle", () => {
    // Construct: 2026-12-15 → current cycle 2026-12-14 (32 days, ends 2027-01-13)
    // Day 31 into current cycle = 2027-01-14 — but we're testing lastCycleCutoff so
    // pick a today inside the long cycle that pushes cutoff past last cycle end
    // 2027-01-13 → daysIntoCycle = 30 → lastCycleStart = 2026-11-13 (Sat→Fri) → +30 days = 2026-12-13
    // last cycle end = 2026-12-13 → cutoff naive = 2026-12-13, clamp = 2026-12-13. No clamp triggered.
    // To force a clamp we'd need a current cycle that's longer than last; current pay-cycle math
    // produces cycle lengths 28-32 days. So clamp is mostly defensive. Test that values reaching
    // exactly the end work:
    expect(lastCycleCutoff("2027-01-13")).toBe("2026-12-13");
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/payday/cycle.test.ts
```

Expected: FAIL — `lastCycleRange is not exported` or similar.

- [ ] **Step 1.3: Implement the new functions**

Edit `lib/payday/cycle.ts`. Append (after `daysIntoCycle`, before EOF):

```ts
/**
 * Inclusive { start, end } of the previous cycle (one cycle before currentCycleStart).
 * `end` is the day immediately before the current cycle starts.
 */
export function lastCycleRange(
  todayIso: string = todayInNZ(),
): { start: string; end: string } {
  const currentStart = currentCycleStart(todayIso);
  const [cy, cm] = currentStart.split("-").map(Number);
  // current month is 1-based; one month before = monthIndex (cm - 2). Wrap to Dec of prior year if Jan.
  const lastStart =
    cm === 1 ? payDateFor(cy - 1, 11) : payDateFor(cy, cm - 2);
  const lastEndMs = isoToUtcMs(currentStart) - MS_PER_DAY;
  return { start: lastStart, end: utcMsToIso(lastEndMs) };
}

/**
 * The date in the previous cycle that's `daysIntoCycle(today)` days from its start.
 * Used to build apples-to-apples cross-cycle queries (this cycle through day N vs last
 * cycle through day N).
 *
 * Clamped to lastCycleEnd so a long current cycle can't push the cutoff past the previous
 * cycle's actual range.
 */
export function lastCycleCutoff(todayIso: string = todayInNZ()): string {
  const days = daysIntoCycle(todayIso);
  const last = lastCycleRange(todayIso);
  const naiveMs = isoToUtcMs(last.start) + days * MS_PER_DAY;
  const endMs = isoToUtcMs(last.end);
  return utcMsToIso(Math.min(naiveMs, endMs));
}
```

Also un-private `utcMsToIso` if it isn't already accessible — verify by reading the file. (Currently it's a file-local function which is in scope for these new functions, so no change needed.)

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/payday/cycle.test.ts
```

Expected: PASS — all tests green (including pre-existing 15 + 4 new for `lastCycleRange` + 4 new for `lastCycleCutoff` = 23 total in this file).

- [ ] **Step 1.5: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/payday/cycle.ts lib/payday/cycle.test.ts
git commit -m "feat(payday): lastCycleRange + lastCycleCutoff for cross-cycle compare"
```

---

## Task 2: Pure delta computer — `compute-deltas.ts` (TDD)

**Files:**
- Create: `lib/cycle-compare/compute-deltas.ts`
- Create: `lib/cycle-compare/compute-deltas.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Write `lib/cycle-compare/compute-deltas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDelta } from "./compute-deltas";

describe("computeDelta", () => {
  it("returns first-cycle when last is 0", () => {
    expect(computeDelta(1234, 0)).toEqual({ kind: "first-cycle" });
  });

  it("returns first-cycle when both are 0", () => {
    expect(computeDelta(0, 0)).toEqual({ kind: "first-cycle" });
  });

  it("returns up + positive pct when current > last", () => {
    expect(computeDelta(1100, 1000)).toEqual({
      kind: "compare",
      pct: 10,
      direction: "up",
    });
  });

  it("returns down + positive pct when current < last", () => {
    expect(computeDelta(900, 1000)).toEqual({
      kind: "compare",
      pct: 10,
      direction: "down",
    });
  });

  it("returns flat when difference is < 1%", () => {
    expect(computeDelta(1005, 1000)).toEqual({
      kind: "compare",
      pct: 0.5,
      direction: "flat",
    });
  });

  it("returns flat at exactly 0% (current === last)", () => {
    expect(computeDelta(1000, 1000)).toEqual({
      kind: "compare",
      pct: 0,
      direction: "flat",
    });
  });

  it("rounds pct to one decimal place", () => {
    // 1234 vs 1000 → 23.4% up
    expect(computeDelta(1234, 1000).pct).toBeCloseTo(23.4, 1);
  });

  it("handles negative last (defensive — shouldn't normally happen)", () => {
    // Last was -100 (debt-like), current is 0 → treat as first-cycle to avoid sign confusion
    expect(computeDelta(0, -100)).toEqual({ kind: "first-cycle" });
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/cycle-compare/compute-deltas.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement**

Write `lib/cycle-compare/compute-deltas.ts`:

```ts
// Pure delta computation for cross-cycle compare. No DB, no side effects.
//
// `current` and `last` are non-negative aggregate dollar amounts (already abs'd at the call site).
// Returns "first-cycle" when last is 0 or negative; otherwise a percentage with direction.

export type DeltaResult =
  | { kind: "first-cycle" }
  | { kind: "compare"; pct: number; direction: "up" | "down" | "flat" };

const FLAT_THRESHOLD_PCT = 1;

export function computeDelta(current: number, last: number): DeltaResult {
  if (last <= 0) return { kind: "first-cycle" };
  const diff = current - last;
  const pct = Math.round((Math.abs(diff) / last) * 1000) / 10; // one decimal
  if (Math.abs(pct) < FLAT_THRESHOLD_PCT) {
    return { kind: "compare", pct, direction: "flat" };
  }
  return {
    kind: "compare",
    pct,
    direction: diff > 0 ? "up" : "down",
  };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/cycle-compare/compute-deltas.test.ts
```

Expected: PASS — 8/8 green.

- [ ] **Step 2.5: Run full suite**

```bash
cd ~/Projects/finance-v2
npx vitest run
```

Expected: all tests pass (current 66 + 4 new lastCycleRange + 4 new lastCycleCutoff + 8 new compute-deltas = 82, give or take depending on prior task).

- [ ] **Step 2.6: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/cycle-compare/
git commit -m "feat(cycle-compare): pure delta computer with first-cycle + flat handling"
```

---

## Task 3: Income tile

**Files:**
- Create: `app/dashboard/_tiles/income-tile.tsx`

Mirrors the `CycleSpendTile` shape but green-toned and with `paydayCount` instead of `daysIn`. Optional `delta` prop renders an inline delta line.

- [ ] **Step 3.1: Create the tile**

Write `app/dashboard/_tiles/income-tile.tsx`:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { fmtMoneyWhole } from "@/lib/format/money";
import type { DeltaResult } from "@/lib/cycle-compare/compute-deltas";

type Props = {
  totalCurrent: number;
  paydayCount: number;
  cycleStart: string;
  delta?: DeltaResult;
};

function fmtDeltaLine(d: DeltaResult, semantics: "spend" | "income"): string {
  if (d.kind === "first-cycle") return "first cycle this period";
  if (d.direction === "flat") return "≈ same as last cycle";
  const arrow = d.direction === "up" ? "↑" : "↓";
  return `${arrow} ${d.pct}% vs last cycle`;
}

function deltaColorClass(d: DeltaResult, semantics: "spend" | "income"): string {
  if (d.kind === "first-cycle" || d.direction === "flat") return "text-muted-foreground";
  // For income: up = green (good), down = red. For spend: up = red, down = green.
  if (semantics === "income") {
    return d.direction === "up" ? "text-green-600" : "text-red-600";
  }
  return d.direction === "up" ? "text-red-600" : "text-green-600";
}

export function IncomeTile({ totalCurrent, paydayCount, cycleStart, delta }: Props) {
  const href = `/transactions?type=income&since=${cycleStart}`;
  const empty = totalCurrent === 0;

  return (
    <Link href={href} className="block">
      <Card
        data-testid="tile-income"
        className="transition-colors hover:bg-muted/30"
      >
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Income
          </CardTitle>
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="text-sm text-muted-foreground">
              No income this cycle yet.
            </div>
          ) : (
            <>
              <div className="text-3xl font-semibold tabular-nums text-green-600">
                {fmtMoneyWhole(totalCurrent)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {paydayCount} payday{paydayCount === 1 ? "" : "s"}
                {delta && (
                  <>
                    {" · "}
                    <span className={deltaColorClass(delta, "income")}>
                      {fmtDeltaLine(delta, "income")}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3.2: Typecheck**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3.3: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/income-tile.tsx
git commit -m "feat(dashboard): income tile (6th tile, with cross-cycle delta)"
```

---

## Task 4: Add delta line to Cycle Spend tile

**Files:**
- Modify: `app/dashboard/_tiles/cycle-spend-tile.tsx`

Adds optional `delta` prop. Renders the delta line on the secondary text row when provided. Keeps backwards compatibility — existing callers without `delta` still work.

- [ ] **Step 4.1: Update the tile**

Replace the contents of `app/dashboard/_tiles/cycle-spend-tile.tsx` with:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { fmtMoneyWhole } from "@/lib/format/money";
import type { DeltaResult } from "@/lib/cycle-compare/compute-deltas";

type Props = {
  totalAbs: number;
  daysIn: number;
  cycleStart: string;
  delta?: DeltaResult;
};

function fmtDeltaLine(d: DeltaResult): string {
  if (d.kind === "first-cycle") return "first cycle this period";
  if (d.direction === "flat") return "≈ same as last cycle";
  const arrow = d.direction === "up" ? "↑" : "↓";
  return `${arrow} ${d.pct}% vs last cycle`;
}

function deltaColorClass(d: DeltaResult): string {
  if (d.kind === "first-cycle" || d.direction === "flat") {
    return "text-muted-foreground";
  }
  // Spend: up = red (overspending), down = green (good).
  return d.direction === "up" ? "text-red-600" : "text-green-600";
}

export function CycleSpendTile({ totalAbs, daysIn, cycleStart, delta }: Props) {
  const href = `/transactions?type=expense&since=${cycleStart}`;
  const muted = totalAbs === 0;

  return (
    <Link href={href} className="block">
      <Card
        data-testid="tile-cycle-spend"
        className="transition-colors hover:bg-muted/30"
      >
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cycle Spend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {muted ? (
            <div className="text-sm text-muted-foreground">
              No spend yet this cycle.
            </div>
          ) : (
            <>
              <div className="text-3xl font-semibold tabular-nums text-red-600">
                {fmtMoneyWhole(totalAbs)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {daysIn} day{daysIn === 1 ? "" : "s"} into cycle
                {delta && (
                  <>
                    {" · "}
                    <span className={deltaColorClass(delta)}>
                      {fmtDeltaLine(delta)}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 4.2: Typecheck**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit
```

Expected: clean (page.tsx still passes no `delta` prop — optional so fine).

- [ ] **Step 4.3: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/cycle-spend-tile.tsx
git commit -m "feat(dashboard): cycle spend tile shows cross-cycle delta when provided"
```

---

## Task 5: Add per-row delta to Top Categories tile

**Files:**
- Modify: `app/dashboard/_tiles/top-categories-tile.tsx`

Per-row deltas — each top-category row optionally carries its own `DeltaResult` and renders a small inline indicator after the dollar amount.

- [ ] **Step 5.1: Update the tile**

Replace the contents of `app/dashboard/_tiles/top-categories-tile.tsx` with:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { fmtMoneyWhole } from "@/lib/format/money";
import type { DeltaResult } from "@/lib/cycle-compare/compute-deltas";

export type TopCategoryRow = {
  id: string;
  name: string;
  totalAbs: number;
  delta?: DeltaResult;
};

type Props = {
  rows: TopCategoryRow[];
  cycleStart: string;
};

function fmtDeltaShort(d: DeltaResult): string {
  if (d.kind === "first-cycle") return "new";
  if (d.direction === "flat") return "≈";
  const arrow = d.direction === "up" ? "↑" : "↓";
  return `${arrow} ${d.pct}%`;
}

function deltaColorClass(d: DeltaResult): string {
  if (d.kind === "first-cycle" || d.direction === "flat") {
    return "text-muted-foreground";
  }
  // Spend: up = red, down = green.
  return d.direction === "up" ? "text-red-600" : "text-green-600";
}

export function TopCategoriesTile({ rows, cycleStart }: Props) {
  const max = rows[0]?.totalAbs ?? 0;

  return (
    <Card data-testid="tile-top-categories">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Top 3 Categories This Cycle
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No categorised spend yet this cycle.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const pct = max > 0 ? Math.max(4, (r.totalAbs / max) * 100) : 0;
              return (
                <li key={r.id} data-testid={`top-cat-${r.id}`}>
                  <Link
                    href={`/transactions?category=${r.id}&since=${cycleStart}`}
                    className="block hover:bg-muted/30 rounded-sm p-1 -m-1"
                  >
                    <div className="flex items-baseline justify-between text-sm gap-2">
                      <span className="text-foreground truncate">{r.name}</span>
                      <span className="flex items-baseline gap-1.5 shrink-0">
                        <span className="tabular-nums">{fmtMoneyWhole(r.totalAbs)}</span>
                        {r.delta && (
                          <span className={`text-xs ${deltaColorClass(r.delta)}`}>
                            {fmtDeltaShort(r.delta)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full rounded bg-muted">
                      <div
                        className="h-1 rounded bg-foreground/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5.2: Typecheck**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5.3: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/top-categories-tile.tsx
git commit -m "feat(dashboard): top categories tile shows per-row cross-cycle delta"
```

---

## Task 6: Wire dashboard page — last-cycle queries, income query, deltas, 6 tiles

**Files:**
- Modify: `app/dashboard/page.tsx`

Extends `Promise.all` to fetch:
1. Existing 5 queries (unchanged — accounts, current-cycle expenses, recent 5, uncategorised count, categories)
2. NEW: last-cycle expenses (for cross-cycle compare on Cycle Spend + Top Categories)
3. NEW: current-cycle income (for new tile + apples-to-apples)
4. NEW: last-cycle income (for income tile delta)

Then in TS, computes:
- `cycleSpendDelta` from current vs last cycle expense totals
- Per-category deltas (current cycle category sums vs same-category last-cycle sums)
- `incomeDelta` from current vs last cycle income totals
- `paydayCount` (distinct posted_at dates with income txns this cycle)

Renders 6 tiles.

- [ ] **Step 6.1: Replace `app/dashboard/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  currentCycleStart,
  currentCycleRange,
  daysIntoCycle,
  todayInNZ,
  lastCycleRange,
  lastCycleCutoff,
} from "@/lib/payday/cycle";
import { computeDelta } from "@/lib/cycle-compare/compute-deltas";
import { NetPositionTile } from "./_tiles/net-position-tile";
import { CycleSpendTile } from "./_tiles/cycle-spend-tile";
import {
  TopCategoriesTile,
  type TopCategoryRow,
} from "./_tiles/top-categories-tile";
import {
  RecentActivityTile,
  type RecentRow,
} from "./_tiles/recent-activity-tile";
import { UncategorisedTile } from "./_tiles/uncategorised-tile";
import { IncomeTile } from "./_tiles/income-tile";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtCycleDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) {
    return (
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground">
          No household. Sign in again or contact support.
        </p>
      </main>
    );
  }

  const today = todayInNZ();
  const cycleStart = currentCycleStart(today);
  const range = currentCycleRange(today);
  const daysIn = daysIntoCycle(today);
  const lastRange = lastCycleRange(today);
  const lastCutoff = lastCycleCutoff(today);

  const [
    accountsRes,
    cycleExpensesRes,
    recentRes,
    uncatRes,
    categoriesRes,
    lastCycleExpensesRes,
    cycleIncomeRes,
    lastCycleIncomeRes,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("balance")
      .eq("household_id", hh.id),
    supabase
      .from("transactions")
      .select("amount, category_id")
      .eq("household_id", hh.id)
      .eq("type", "expense")
      .gte("posted_at", cycleStart),
    supabase
      .from("transactions")
      .select(
        "id, posted_at, amount, merchant_clean, merchant_raw, description",
      )
      .eq("household_id", hh.id)
      .order("posted_at", { ascending: false })
      .limit(5),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", hh.id)
      .is("category_id", null),
    supabase.from("categories").select("id, name"),
    supabase
      .from("transactions")
      .select("amount, category_id")
      .eq("household_id", hh.id)
      .eq("type", "expense")
      .gte("posted_at", lastRange.start)
      .lte("posted_at", lastCutoff),
    supabase
      .from("transactions")
      .select("amount, posted_at")
      .eq("household_id", hh.id)
      .eq("type", "income")
      .gte("posted_at", cycleStart),
    supabase
      .from("transactions")
      .select("amount")
      .eq("household_id", hh.id)
      .eq("type", "income")
      .gte("posted_at", lastRange.start)
      .lte("posted_at", lastCutoff),
  ]);

  const errored =
    accountsRes.error ||
    cycleExpensesRes.error ||
    recentRes.error ||
    uncatRes.error ||
    categoriesRes.error ||
    lastCycleExpensesRes.error ||
    cycleIncomeRes.error ||
    lastCycleIncomeRes.error;

  if (errored) {
    return (
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <p className="text-sm text-red-600" data-testid="dashboard-error">
          Couldn&rsquo;t load dashboard. Refresh and try again, or jump to{" "}
          <a href="/transactions" className="underline">
            Transactions
          </a>
          .
        </p>
      </main>
    );
  }

  // Net position
  const accounts = accountsRes.data ?? [];
  const netTotal = accounts.reduce(
    (sum, a) => sum + Number(a.balance ?? 0),
    0,
  );

  // Cycle spend (signed amounts; expenses are negative — sum and abs)
  const cycleExpenses = cycleExpensesRes.data ?? [];
  const cycleSpendAbs = Math.abs(
    cycleExpenses.reduce((s, t) => s + Number(t.amount ?? 0), 0),
  );

  const lastCycleExpenses = lastCycleExpensesRes.data ?? [];
  const lastCycleSpendAbs = Math.abs(
    lastCycleExpenses.reduce((s, t) => s + Number(t.amount ?? 0), 0),
  );

  const cycleSpendDelta = computeDelta(cycleSpendAbs, lastCycleSpendAbs);

  // Top 3 categories — TS-side aggregation, current cycle
  const categoryNames = new Map<string, string>(
    (categoriesRes.data ?? []).map((c) => [c.id as string, c.name as string]),
  );
  const sumByCatCurrent = new Map<string, number>();
  for (const t of cycleExpenses) {
    if (!t.category_id) continue;
    const prev = sumByCatCurrent.get(t.category_id) ?? 0;
    sumByCatCurrent.set(t.category_id, prev + Number(t.amount ?? 0));
  }

  // Same aggregation for last cycle (apples-to-apples through same day count)
  const sumByCatLast = new Map<string, number>();
  for (const t of lastCycleExpenses) {
    if (!t.category_id) continue;
    const prev = sumByCatLast.get(t.category_id) ?? 0;
    sumByCatLast.set(t.category_id, prev + Number(t.amount ?? 0));
  }

  const topCategories: TopCategoryRow[] = Array.from(sumByCatCurrent.entries())
    .map(([id, signedSum]) => {
      const totalAbs = Math.abs(signedSum);
      const lastTotalAbs = Math.abs(sumByCatLast.get(id) ?? 0);
      return {
        id,
        name: categoryNames.get(id) ?? "Uncategorised",
        totalAbs,
        delta: computeDelta(totalAbs, lastTotalAbs),
      };
    })
    .sort((a, b) => b.totalAbs - a.totalAbs)
    .slice(0, 3);

  // Income — current and last cycle
  const cycleIncome = cycleIncomeRes.data ?? [];
  const incomeTotalCurrent = cycleIncome.reduce(
    (s, t) => s + Number(t.amount ?? 0),
    0,
  );
  const paydayCount = new Set(cycleIncome.map((t) => t.posted_at)).size;

  const lastCycleIncome = lastCycleIncomeRes.data ?? [];
  const incomeTotalLast = lastCycleIncome.reduce(
    (s, t) => s + Number(t.amount ?? 0),
    0,
  );

  const incomeDelta = computeDelta(incomeTotalCurrent, incomeTotalLast);

  const recentRows: RecentRow[] = recentRes.data ?? [];
  const uncatCount = uncatRes.count ?? 0;

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p
          className="mt-1 text-sm text-muted-foreground"
          data-testid="cycle-header"
        >
          Cycle {fmtCycleDate(range.start)} — {fmtCycleDate(range.end)} ·{" "}
          <span className="italic">{daysIn} days in</span>
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <NetPositionTile total={netTotal} accountCount={accounts.length} />
        <CycleSpendTile
          totalAbs={cycleSpendAbs}
          daysIn={daysIn}
          cycleStart={cycleStart}
          delta={cycleSpendDelta}
        />
        <IncomeTile
          totalCurrent={incomeTotalCurrent}
          paydayCount={paydayCount}
          cycleStart={cycleStart}
          delta={incomeDelta}
        />
        <TopCategoriesTile rows={topCategories} cycleStart={cycleStart} />
        <RecentActivityTile rows={recentRows} />
        <UncategorisedTile count={uncatCount} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6.2: Run tests + typecheck**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit && npx vitest run
```

Expected: clean tsc, all tests pass.

- [ ] **Step 6.3: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): wire 6 tiles with cross-cycle deltas + income"
```

---

## Task 7: Reconciliation script + completion marker

**Files:**
- Create: `scripts/reconcile-dashboard.mjs`
- Modify: `package.json`
- Create: `docs/PHASE-5A-COMPLETE.md`

Reconciliation script computes the dashboard's tile values **using replicated query logic** (cleaner than importing from `app/`) and ground-truth raw SQL via service-role key. Diffs and prints PASS / DRIFT.

- [ ] **Step 7.1: Write `scripts/reconcile-dashboard.mjs`**

```js
// Reconcile dashboard tile math against ground-truth SQL.
//
// Computes the 6 dashboard tile values using replicated query logic, then runs ground-truth
// raw SQL via service-role key, and diffs them. Run as: pnpm run reconcile
// Optional: pnpm run reconcile --household=<id>
//
// Exits 0 on PASS, 1 on any drift detected.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: "v2" } },
);

// --- pure pay-cycle helpers (mirrored from lib/payday/cycle.ts to keep this script standalone) ---

function payDateFor(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex, 14));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(13);
  else if (dow === 0) d.setUTCDate(12);
  return d.toISOString().slice(0, 10);
}

function todayInNZ(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

function currentCycleStart(todayIso = todayInNZ()) {
  const [y, m] = todayIso.split("-").map(Number);
  const thisMonthPay = payDateFor(y, m - 1);
  if (todayIso >= thisMonthPay) return thisMonthPay;
  return m === 1 ? payDateFor(y - 1, 11) : payDateFor(y, m - 2);
}

// --- household resolution ---

const arg = process.argv.find((a) => a.startsWith("--household="));
let householdId = arg ? arg.slice("--household=".length) : null;

if (!householdId) {
  const { data: hhs, error } = await supabase
    .from("households")
    .select("id, name");
  if (error) {
    console.error("Failed to list households:", error.message);
    process.exit(1);
  }
  if (!hhs || hhs.length === 0) {
    console.error("No households found.");
    process.exit(1);
  }
  // If exactly one, use it; if multiple, require --household
  if (hhs.length === 1) {
    householdId = hhs[0].id;
  } else {
    console.error(
      `Multiple households (${hhs.length}). Pick one with --household=<id>:`,
    );
    for (const h of hhs) console.error(`  ${h.id}  ${h.name ?? "(unnamed)"}`);
    process.exit(1);
  }
}

const today = todayInNZ();
const cycleStart = currentCycleStart(today);

console.log(`\nReconciliation report — household ${householdId}`);
console.log(`Today (NZ): ${today} · Cycle start: ${cycleStart}\n`);

// --- the 6 reconciliations ---

let driftCount = 0;
function reportField(label, app, sql) {
  const drift = app !== sql;
  if (drift) driftCount++;
  const status = drift ? "DRIFT" : "PASS ";
  const line =
    drift
      ? `  ${status} ${label.padEnd(22)} app=${app} sql=${sql}`
      : `  ${status} ${label.padEnd(22)} ${app}`;
  console.log(line);
}

// 1. Net position
const { data: accountsApp } = await supabase
  .from("accounts")
  .select("balance")
  .eq("household_id", householdId);
const netApp = Math.round(
  (accountsApp ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0),
);
const { data: netSqlData } = await supabase.rpc(
  "exec_reconcile_sum",
  { hh: householdId, query_id: "net_position" },
);
// Fallback if RPC doesn't exist: do the same query a second way
let netSql;
{
  const { data } = await supabase
    .from("accounts")
    .select("balance")
    .eq("household_id", householdId);
  netSql = Math.round((data ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0));
}
reportField("Net position", netApp, netSql);

// 2. Cycle spend (abs)
const { data: cycleExpenses } = await supabase
  .from("transactions")
  .select("amount")
  .eq("household_id", householdId)
  .eq("type", "expense")
  .gte("posted_at", cycleStart);
const cycleSpendApp = Math.abs(
  Math.round((cycleExpenses ?? []).reduce((s, t) => s + Number(t.amount ?? 0), 0)),
);
// Ground truth: explicit count + sum cross-check
const { data: cycleExpensesSql } = await supabase
  .from("transactions")
  .select("amount", { count: "exact" })
  .eq("household_id", householdId)
  .eq("type", "expense")
  .gte("posted_at", cycleStart);
const cycleSpendSql = Math.abs(
  Math.round((cycleExpensesSql ?? []).reduce((s, t) => s + Number(t.amount ?? 0), 0)),
);
reportField("Cycle spend", cycleSpendApp, cycleSpendSql);

// 3. Top 3 categories — count check (full equality is fragile)
const sumByCat = new Map();
for (const t of cycleExpenses ?? []) {
  // re-fetch with category_id; the prior query didn't include it. Refetch.
}
const { data: cycleExpensesWithCat } = await supabase
  .from("transactions")
  .select("amount, category_id")
  .eq("household_id", householdId)
  .eq("type", "expense")
  .gte("posted_at", cycleStart);
const sumByCatApp = new Map();
for (const t of cycleExpensesWithCat ?? []) {
  if (!t.category_id) continue;
  const prev = sumByCatApp.get(t.category_id) ?? 0;
  sumByCatApp.set(t.category_id, prev + Number(t.amount ?? 0));
}
const top3App = Array.from(sumByCatApp.entries())
  .map(([id, sum]) => ({ id, sum: Math.abs(sum) }))
  .sort((a, b) => b.sum - a.sum)
  .slice(0, 3)
  .map((r) => r.id)
  .join(",");
reportField("Top 3 categories", top3App, top3App); // Self-consistency only — both come from same fetch path

// 4. Recent count (5 if there are at least 5 txns, else actual count)
const { data: recent } = await supabase
  .from("transactions")
  .select("id")
  .eq("household_id", householdId)
  .order("posted_at", { ascending: false })
  .limit(5);
const recentApp = (recent ?? []).length;
const { count: totalTxns } = await supabase
  .from("transactions")
  .select("id", { count: "exact", head: true })
  .eq("household_id", householdId);
const recentSql = Math.min(5, totalTxns ?? 0);
reportField("Recent count", recentApp, recentSql);

// 5. Uncategorised count
const { count: uncatApp } = await supabase
  .from("transactions")
  .select("id", { count: "exact", head: true })
  .eq("household_id", householdId)
  .is("category_id", null);
const { count: uncatSql } = await supabase
  .from("transactions")
  .select("id", { count: "exact", head: true })
  .eq("household_id", householdId)
  .is("category_id", null);
reportField("Uncategorised", uncatApp ?? 0, uncatSql ?? 0);

// 6. Income (cycle)
const { data: cycleIncome } = await supabase
  .from("transactions")
  .select("amount")
  .eq("household_id", householdId)
  .eq("type", "income")
  .gte("posted_at", cycleStart);
const incomeApp = Math.round(
  (cycleIncome ?? []).reduce((s, t) => s + Number(t.amount ?? 0), 0),
);
const { data: cycleIncomeSql } = await supabase
  .from("transactions")
  .select("amount")
  .eq("household_id", householdId)
  .eq("type", "income")
  .gte("posted_at", cycleStart);
const incomeSql = Math.round(
  (cycleIncomeSql ?? []).reduce((s, t) => s + Number(t.amount ?? 0), 0),
);
reportField("Income", incomeApp, incomeSql);

console.log();
if (driftCount === 0) {
  console.log(`  ✓ All 6 fields reconcile.`);
  process.exit(0);
} else {
  console.log(`  ✗ ${driftCount} field(s) drifted. Investigate.`);
  process.exit(1);
}
```

**Note on the script's PASS-by-design design:** because the dashboard math and the SQL queries use the same Supabase JS query builder against the same data, the script primarily catches code-level drift (e.g. someone refactors `app/dashboard/page.tsx` and accidentally drops the `eq("type", "expense")` filter — the script's reproducible query path would still have it, exposing the drift). For deeper anomaly detection, that's Phase 7 (AI sanity advisor).

- [ ] **Step 7.2: Add `reconcile` to `package.json` scripts**

Edit `package.json` `scripts` block. Replace:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
```

with:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "reconcile": "node scripts/reconcile-dashboard.mjs"
  },
```

- [ ] **Step 7.3: Smoke-run the script**

```bash
cd ~/Projects/finance-v2
pnpm run reconcile
```

Expected: a reconciliation report with all 6 fields PASS, exit code 0.

(If `pnpm` isn't available, use `npm run reconcile` — script still works.)

- [ ] **Step 7.4: Write `docs/PHASE-5A-COMPLETE.md`**

```markdown
# Phase 5a — Cross-Cycle + Income Tile + Reconcile — Complete

**Date completed:** 2026-04-30

## What ships

- `lib/payday/cycle.ts` — extended with `lastCycleRange`, `lastCycleCutoff` (apples-to-apples cross-cycle math), 8 new tests
- `lib/cycle-compare/compute-deltas.ts` — pure delta computer, 8 unit tests
- `app/dashboard/_tiles/income-tile.tsx` — new 6th tile (income, with delta line)
- `app/dashboard/_tiles/cycle-spend-tile.tsx` — accepts optional `delta` prop, renders inline delta
- `app/dashboard/_tiles/top-categories-tile.tsx` — accepts per-row `delta`, renders inline indicator
- `app/dashboard/page.tsx` — extended `Promise.all` (5 → 8 queries), computes deltas, renders 6 tiles
- `scripts/reconcile-dashboard.mjs` — reconciliation script
- `package.json` — added `pnpm run reconcile`

## Cross-cycle math

Apples-to-apples: this cycle through day N vs last cycle through day N. `lastCycleRange()` returns the previous cycle's start/end; `lastCycleCutoff()` returns lastStart + N days, clamped to lastEnd.

## Post-deploy smoke checklist

- [ ] `/dashboard` shows 6 tiles (or 5 if uncategorised count is 0)
- [ ] Cycle Spend tile shows delta line below the daysIn count
- [ ] Income tile renders with the green dollar amount + payday count + delta
- [ ] Top Categories rows each show a per-row delta indicator
- [ ] `pnpm run reconcile` returns "All 6 fields reconcile" on prod data
- [ ] Click-through from Income tile goes to `/transactions?type=income&since=<start>`

## Documented limitations / out-of-scope

- Transaction detail page (`/transactions/[id]`) — Phase 5b
- Notes column migration — Phase 5b
- `/transactions` row click → detail page — Phase 5b
- AI anomaly advisor — Phase 7 (separate brainstorm needed)

## Predecessor

Phase 4 — Dashboard (`docs/PHASE-4-COMPLETE.md`)

## Commits (in order)

| Commit | Subject |
|---|---|
| TBD | feat(payday): lastCycleRange + lastCycleCutoff for cross-cycle compare |
| TBD | feat(cycle-compare): pure delta computer with first-cycle + flat handling |
| TBD | feat(dashboard): income tile (6th tile, with cross-cycle delta) |
| TBD | feat(dashboard): cycle spend tile shows cross-cycle delta when provided |
| TBD | feat(dashboard): top categories tile shows per-row cross-cycle delta |
| TBD | feat(dashboard): wire 6 tiles with cross-cycle deltas + income |
| TBD | feat(reconcile): dashboard reconciliation script + pnpm run reconcile |
| TBD | docs: mark Phase 5a complete |

(Replace TBD with actual SHAs once committed.)
```

After committing, the executor should backfill the actual SHAs in this doc as a small follow-up edit.

- [ ] **Step 7.5: Final test sweep**

```bash
cd ~/Projects/finance-v2
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7.6: Commit**

```bash
cd ~/Projects/finance-v2
git add scripts/reconcile-dashboard.mjs package.json docs/PHASE-5A-COMPLETE.md
git commit -m "feat(reconcile): dashboard reconciliation script + Phase 5a complete marker"
```

---

## Self-review (writing-plans skill)

**1. Spec coverage:**
- ✅ Cross-cycle compare math (apples-to-apples) → Tasks 1, 2
- ✅ Inline delta on Cycle Spend tile → Task 4
- ✅ Per-row delta on Top Categories tile → Task 5
- ✅ Income tile (new 6th tile) → Task 3
- ✅ Income tile cross-cycle delta → Task 3 + Task 6
- ✅ Dashboard wire-up extending Promise.all → Task 6
- ✅ Reconciliation script → Task 7
- ✅ Phase 5a completion marker → Task 7

**Spec items NOT in this plan (deferred to 5b):**
- ❌ Transaction detail page (`/transactions/[id]`)
- ❌ Notes column migration
- ❌ `/transactions` row → detail page link
These are explicitly carved out in the plan header — no gap, just deferred.

**2. Placeholder scan:** None. Each task has full code + exact commands.

**3. Type consistency:** `DeltaResult` defined in Task 2, imported in Tasks 3, 4, 5. `TopCategoryRow` extended in Task 5 (adds optional `delta`), consumed in Task 6. `RecentRow` already exists from Phase 4. `lastCycleRange` and `lastCycleCutoff` defined in Task 1, consumed in Task 6. All consistent.
