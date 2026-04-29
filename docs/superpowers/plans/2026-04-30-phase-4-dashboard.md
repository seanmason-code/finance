# Phase 4 — Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/dashboard` with a 5-tile, mobile-first, at-a-glance daily surface anchored to Jenny's monthly 14th-rule pay cycle.

**Architecture:** A pure pay-cycle module under `lib/payday/` (TDD) feeds a single server-component page `app/dashboard/page.tsx` that does one parallel `Promise.all` of Supabase reads, then renders 5 server-component tiles in a responsive grid. `app/transactions/page.tsx` is extended with `searchParams` filters so each tile can deep-link into a filtered transactions list.

**Tech Stack:** Next.js 16 App Router (server components, async `searchParams`), Supabase JS, Tailwind, shadcn `Card` primitives, Vitest for unit tests.

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-4-dashboard-design.md`
**Implementation repo:** `~/Projects/finance-v2/`

---

## File structure

**New files:**
- `lib/payday/cycle.ts` — pure pay-cycle helpers (`payDateFor`, `todayInNZ`, `currentCycleStart`, `currentCycleRange`, `daysIntoCycle`)
- `lib/payday/cycle.test.ts` — TDD tests
- `app/dashboard/_tiles/net-position-tile.tsx`
- `app/dashboard/_tiles/cycle-spend-tile.tsx`
- `app/dashboard/_tiles/top-categories-tile.tsx`
- `app/dashboard/_tiles/recent-activity-tile.tsx`
- `app/dashboard/_tiles/uncategorised-tile.tsx`
- `docs/PHASE-4-COMPLETE.md` — completion marker

**Modified files:**
- `app/dashboard/page.tsx` — replace placeholder, do parallel fetch, render tiles
- `app/transactions/page.tsx` — read `searchParams` and build conditional filters

---

## Task 1: Pure pay-cycle module (TDD)

**Files:**
- Create: `lib/payday/cycle.ts`
- Create: `lib/payday/cycle.test.ts`

This module is fully pure — string in, string/number out, no Date object leakage past the seam. TDD because it's the only piece of Phase 4 with non-trivial logic.

- [ ] **Step 1.1: Write the failing test file**

Write `lib/payday/cycle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  payDateFor,
  currentCycleStart,
  currentCycleRange,
  daysIntoCycle,
} from "./cycle";

describe("payDateFor", () => {
  it("returns 14th when 14th is a weekday", () => {
    // 2026-04-14 is a Tuesday
    expect(payDateFor(2026, 3)).toBe("2026-04-14");
    // 2026-05-14 is a Thursday
    expect(payDateFor(2026, 4)).toBe("2026-05-14");
    // 2025-08-14 is a Thursday
    expect(payDateFor(2025, 7)).toBe("2025-08-14");
  });

  it("returns 13th (Fri) when 14th is a Saturday", () => {
    // 2026-02-14 is a Saturday
    expect(payDateFor(2026, 1)).toBe("2026-02-13");
    // 2026-11-14 is a Saturday
    expect(payDateFor(2026, 10)).toBe("2026-11-13");
  });

  it("returns 12th (Fri) when 14th is a Sunday", () => {
    // 2025-09-14 is a Sunday
    expect(payDateFor(2025, 8)).toBe("2025-09-12");
    // 2026-06-14 is a Sunday
    expect(payDateFor(2026, 5)).toBe("2026-06-12");
  });

  it("zero-pads month and day in output", () => {
    // January (monthIndex 0), 14th is a Wed in 2026
    expect(payDateFor(2026, 0)).toBe("2026-01-14");
  });
});

describe("currentCycleStart", () => {
  it("returns this month's pay date when today is on or after it", () => {
    expect(currentCycleStart("2026-04-14")).toBe("2026-04-14");
    expect(currentCycleStart("2026-04-30")).toBe("2026-04-14");
    expect(currentCycleStart("2026-05-13")).toBe("2026-04-14");
  });

  it("returns this month's pay date on the boundary (today === pay date)", () => {
    expect(currentCycleStart("2026-05-14")).toBe("2026-05-14");
  });

  it("returns previous month's pay date when today is before this month's", () => {
    // 2026-05-13 is before 2026-05-14, so cycle started 2026-04-14
    expect(currentCycleStart("2026-05-13")).toBe("2026-04-14");
    // 2026-04-13 is before 2026-04-14, so cycle started 2026-03-13 (Sat → Fri)
    expect(currentCycleStart("2026-04-13")).toBe("2026-03-13");
  });

  it("handles year rollover (Jan)", () => {
    // 2027-01-13 is before 2027-01-14, so cycle started in Dec 2026
    // 2026-12-14 is a Monday → 14th
    expect(currentCycleStart("2027-01-13")).toBe("2026-12-14");
  });

  it("walks 12 months without surprises (validates 14th-rule fit)", () => {
    expect(currentCycleStart("2026-01-15")).toBe("2026-01-14"); // Wed
    expect(currentCycleStart("2026-02-15")).toBe("2026-02-13"); // Sat → Fri
    expect(currentCycleStart("2026-03-15")).toBe("2026-03-13"); // Sat → Fri
    expect(currentCycleStart("2026-04-15")).toBe("2026-04-14"); // Tue
    expect(currentCycleStart("2026-05-15")).toBe("2026-05-14"); // Thu
    expect(currentCycleStart("2026-06-15")).toBe("2026-06-12"); // Sun → Fri
    expect(currentCycleStart("2026-07-15")).toBe("2026-07-14"); // Tue
    expect(currentCycleStart("2026-08-15")).toBe("2026-08-14"); // Fri
    expect(currentCycleStart("2026-09-15")).toBe("2026-09-14"); // Mon
    expect(currentCycleStart("2026-10-15")).toBe("2026-10-14"); // Wed
    expect(currentCycleStart("2026-11-15")).toBe("2026-11-13"); // Sat → Fri
    expect(currentCycleStart("2026-12-15")).toBe("2026-12-14"); // Mon
  });
});

describe("currentCycleRange", () => {
  it("returns start = current pay date and end = day before next pay date", () => {
    // Cycle 14 Apr 2026 → next pay 14 May 2026 → end = 13 May 2026
    expect(currentCycleRange("2026-04-30")).toEqual({
      start: "2026-04-14",
      end: "2026-05-13",
    });
  });

  it("end accounts for next-month Sat/Sun shift", () => {
    // Cycle 14 Jan 2026 → next pay 13 Feb 2026 (14 Feb is Sat) → end = 12 Feb 2026
    expect(currentCycleRange("2026-01-20")).toEqual({
      start: "2026-01-14",
      end: "2026-02-12",
    });
  });

  it("handles year rollover at end of year", () => {
    // Cycle 14 Dec 2026 → next pay 14 Jan 2027 (Thu) → end = 13 Jan 2027
    expect(currentCycleRange("2026-12-20")).toEqual({
      start: "2026-12-14",
      end: "2027-01-13",
    });
  });
});

describe("daysIntoCycle", () => {
  it("returns 0 on the cycle start day", () => {
    expect(daysIntoCycle("2026-04-14")).toBe(0);
  });

  it("returns whole-day count from cycle start", () => {
    expect(daysIntoCycle("2026-04-15")).toBe(1);
    expect(daysIntoCycle("2026-04-30")).toBe(16);
    expect(daysIntoCycle("2026-05-13")).toBe(29);
  });

  it("resets to 0 on the next cycle start", () => {
    expect(daysIntoCycle("2026-05-14")).toBe(0);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/payday/cycle.test.ts
```

Expected: FAIL — `Cannot find module './cycle'` or similar.

- [ ] **Step 1.3: Implement `lib/payday/cycle.ts`**

Write `lib/payday/cycle.ts`:

```ts
// Pure pay-cycle helpers anchored to Jenny's L'Oréal monthly pay (14th-rule).
//
// All date IO is YYYY-MM-DD strings. We never expose Date objects across the
// module boundary because `transactions.posted_at` is a Postgres `date`
// (no time, no timezone) and string comparison is the right semantics.

const MS_PER_DAY = 86_400_000;

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Pay date for a given year/month, applying the 14th-rule:
 *   weekday → 14, Saturday → 13 (Fri), Sunday → 12 (Fri).
 *
 * monthIndex is 0-based (Jan = 0) to match JS Date conventions.
 */
export function payDateFor(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 14));
  const dow = d.getUTCDay(); // 0 Sun ... 6 Sat
  if (dow === 6) d.setUTCDate(13);
  else if (dow === 0) d.setUTCDate(12);
  return d.toISOString().slice(0, 10);
}

/**
 * Today's date as Sean sees it in NZ (Pacific/Auckland), regardless of server
 * timezone. Returned as YYYY-MM-DD so it composes with `posted_at` strings.
 */
export function todayInNZ(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

/**
 * Pay date that anchors the cycle currently active for `todayIso`.
 * If today is on/after this month's pay date → returns this month's.
 * Otherwise → returns the previous month's pay date.
 */
export function currentCycleStart(todayIso: string = todayInNZ()): string {
  const [y, m] = todayIso.split("-").map(Number);
  const thisMonthPay = payDateFor(y, m - 1);
  if (todayIso >= thisMonthPay) return thisMonthPay;
  return m === 1 ? payDateFor(y - 1, 11) : payDateFor(y, m - 2);
}

/**
 * Inclusive { start, end } of the current cycle. `end` is the day before the
 * next cycle starts, so [start, end] covers the whole cycle.
 */
export function currentCycleRange(
  todayIso: string = todayInNZ(),
): { start: string; end: string } {
  const start = currentCycleStart(todayIso);
  const [sy, sm] = start.split("-").map(Number);
  // sm is 1-based; next month's pay-date input is monthIndex (0-based).
  const nextStart =
    sm === 12 ? payDateFor(sy + 1, 0) : payDateFor(sy, sm);
  const endMs = isoToUtcMs(nextStart) - MS_PER_DAY;
  return { start, end: utcMsToIso(endMs) };
}

/** Whole-day count from current cycle start to `todayIso`. */
export function daysIntoCycle(todayIso: string = todayInNZ()): number {
  const start = currentCycleStart(todayIso);
  return Math.floor((isoToUtcMs(todayIso) - isoToUtcMs(start)) / MS_PER_DAY);
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/payday/cycle.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 1.5: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/payday/cycle.ts lib/payday/cycle.test.ts
git commit -m "feat(payday): pure pay-cycle helpers anchored to 14th-rule"
```

---

## Task 2: Extend `/transactions` with searchParams filters

**Files:**
- Modify: `app/transactions/page.tsx`

This task is foundational for tile click-throughs. We add four optional filter params (`type`, `category`, `since`, `uncategorised`) to the existing server-component fetch. Default behaviour (no params) is unchanged.

- [ ] **Step 2.1: Read the current page**

```bash
cd ~/Projects/finance-v2
cat app/transactions/page.tsx
```

Note: `searchParams` is already typed as `Promise<{ page?: string }>`. We just widen the type and apply additional filter clauses to the query builder.

- [ ] **Step 2.2: Apply the filter extension**

Edit `app/transactions/page.tsx`. Replace the `searchParams` type and the query builder section. The new file:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Transaction } from "@/lib/db/schema";
import { MakeRuleButton } from "./make-rule-button";

const PAGE_SIZE = 50;

type SearchParams = {
  page?: string;
  type?: string;
  category?: string;
  since?: string;
  uncategorised?: string;
};

export default async function TransactionsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await props.searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: categoriesData } = await supabase
    .from("categories")
    .select("id,name,type")
    .order("name");
  const categories = (categoriesData ?? []) as Array<{
    id: string;
    name: string;
    type: string;
  }>;

  let query = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .order("posted_at", { ascending: false });

  if (params.type === "expense" || params.type === "income" || params.type === "transfer") {
    query = query.eq("type", params.type);
  }
  if (params.category) {
    query = query.eq("category_id", params.category);
  }
  if (params.since && /^\d{4}-\d{2}-\d{2}$/.test(params.since)) {
    query = query.gte("posted_at", params.since);
  }
  if (params.uncategorised === "true") {
    query = query.is("category_id", null);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600" data-testid="transactions-error">
          Error: {error.message}
        </p>
      </main>
    );
  }

  const txns = (data ?? []) as Transaction[];
  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;

  // Preserve filter params across pagination
  const pagerQuery = new URLSearchParams();
  if (params.type) pagerQuery.set("type", params.type);
  if (params.category) pagerQuery.set("category", params.category);
  if (params.since) pagerQuery.set("since", params.since);
  if (params.uncategorised) pagerQuery.set("uncategorised", params.uncategorised);
  const pagerPrefix = pagerQuery.toString() ? `&${pagerQuery.toString()}` : "";

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1
        className="text-2xl font-semibold mb-4"
        data-testid="transactions-heading"
      >
        Transactions ({count ?? 0})
      </h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txns.map((t) => {
            const amt = Number(t.amount ?? 0);
            return (
              <TableRow key={t.id} data-testid={`txn-${t.id}`}>
                <TableCell>{t.posted_at}</TableCell>
                <TableCell>
                  {t.merchant_clean ?? t.merchant_raw ?? t.description ?? "—"}
                  {!t.category_id && (
                    <span className="ml-2 inline-flex">
                      <MakeRuleButton txn={t} categories={categories} />
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={`text-right ${
                    amt < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  ${amt.toFixed(2)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <nav
        className="mt-4 flex gap-3 items-center"
        data-testid="transactions-pager"
      >
        {page > 1 && (
          <a className="underline" href={`/transactions?page=${page - 1}${pagerPrefix}`}>
            ← Prev
          </a>
        )}
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        {page < totalPages && (
          <a className="underline" href={`/transactions?page=${page + 1}${pagerPrefix}`}>
            Next →
          </a>
        )}
      </nav>
    </main>
  );
}
```

- [ ] **Step 2.3: Smoke-test the filters locally**

```bash
cd ~/Projects/finance-v2
pnpm dev
```

In a browser, open each URL and confirm the count changes correctly:
- `http://localhost:3000/transactions` — full count (unchanged from before)
- `http://localhost:3000/transactions?type=expense` — count drops to expenses only
- `http://localhost:3000/transactions?since=2026-04-14` — only txns from cycle start onwards
- `http://localhost:3000/transactions?uncategorised=true` — only `category_id IS NULL`
- `http://localhost:3000/transactions?type=expense&since=2026-04-14` — combined filter
- Prev/Next links preserve the filter params in the URL

Stop the dev server.

- [ ] **Step 2.4: Run the existing test suite to ensure nothing broke**

```bash
cd ~/Projects/finance-v2
npx vitest run
```

Expected: all existing tests still pass (no test exists for the transactions page; we relied on smoke).

- [ ] **Step 2.5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/transactions/page.tsx
git commit -m "feat(transactions): support type/category/since/uncategorised filter params"
```

---

## Task 3: Net Position tile

**Files:**
- Create: `app/dashboard/_tiles/net-position-tile.tsx`

Pure presentational server component. Takes `{ total, accountCount }` as props and renders a Card. The fetch happens in the dashboard page.

- [ ] **Step 3.1: Create the tile**

Write `app/dashboard/_tiles/net-position-tile.tsx`:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Props = {
  total: number;
  accountCount: number;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });

export function NetPositionTile({ total, accountCount }: Props) {
  if (accountCount === 0) {
    return (
      <Card data-testid="tile-net-position">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Net Position
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/accounts" className="text-sm underline">
            Add an account to see your net position →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href="/accounts" className="block">
      <Card
        data-testid="tile-net-position"
        className="transition-colors hover:bg-muted/30"
      >
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Net Position
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums">
            {fmtMoney(total)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            across {accountCount} account{accountCount === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3.2: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/net-position-tile.tsx
git commit -m "feat(dashboard): net position tile"
```

---

## Task 4: Cycle Spend tile

**Files:**
- Create: `app/dashboard/_tiles/cycle-spend-tile.tsx`

Takes `{ totalAbs, daysIn, cycleStart }`. `totalAbs` is the absolute value of summed expense amounts. Click-through goes to `/transactions?type=expense&since=<cycleStart>`.

- [ ] **Step 4.1: Create the tile**

Write `app/dashboard/_tiles/cycle-spend-tile.tsx`:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Props = {
  totalAbs: number;
  daysIn: number;
  cycleStart: string;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });

export function CycleSpendTile({ totalAbs, daysIn, cycleStart }: Props) {
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
                {fmtMoney(totalAbs)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {daysIn} day{daysIn === 1 ? "" : "s"} into cycle
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 4.2: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/cycle-spend-tile.tsx
git commit -m "feat(dashboard): cycle spend tile"
```

---

## Task 5: Top 3 Categories tile

**Files:**
- Create: `app/dashboard/_tiles/top-categories-tile.tsx`

Takes `{ rows, cycleStart }`. `rows` is an array `{ id, name, totalAbs }` sorted descending by `totalAbs`, length ≤ 3. Each row links to `/transactions?category=<id>&since=<cycleStart>`. The bar width = `totalAbs / rows[0].totalAbs * 100%`.

- [ ] **Step 5.1: Create the tile**

Write `app/dashboard/_tiles/top-categories-tile.tsx`:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export type TopCategoryRow = {
  id: string;
  name: string;
  totalAbs: number;
};

type Props = {
  rows: TopCategoryRow[];
  cycleStart: string;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });

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
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-foreground">{r.name}</span>
                      <span className="tabular-nums">{fmtMoney(r.totalAbs)}</span>
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

- [ ] **Step 5.2: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/top-categories-tile.tsx
git commit -m "feat(dashboard): top 3 categories tile"
```

---

## Task 6: Recent Activity tile

**Files:**
- Create: `app/dashboard/_tiles/recent-activity-tile.tsx`

Takes `{ rows }` — last 5 transactions. Whole tile click-throughs to `/transactions`. Date formatted relative for last 7 days (today/yesterday/Mon/Tue/...), otherwise ISO.

- [ ] **Step 6.1: Create the tile**

Write `app/dashboard/_tiles/recent-activity-tile.tsx`:

```tsx
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { todayInNZ } from "@/lib/payday/cycle";

export type RecentRow = {
  id: string;
  posted_at: string;
  amount: number;
  merchant_clean: string | null;
  merchant_raw: string | null;
  description: string | null;
};

type Props = {
  rows: RecentRow[];
};

const fmtMoney = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${abs}`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function relativeDate(postedIso: string, todayIso: string): string {
  const diffDays = Math.floor(
    (isoToUtcMs(todayIso) - isoToUtcMs(postedIso)) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays > 1 && diffDays <= 6) {
    const dow = new Date(`${postedIso}T00:00:00Z`).getUTCDay();
    return WEEKDAYS[dow];
  }
  return postedIso;
}

export function RecentActivityTile({ rows }: Props) {
  const today = todayInNZ();
  return (
    <Link href="/transactions" className="block">
      <Card
        data-testid="tile-recent-activity"
        className="transition-colors hover:bg-muted/30"
      >
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No transactions yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const merchant =
                  r.merchant_clean ?? r.merchant_raw ?? r.description ?? "—";
                const amtClass = r.amount < 0 ? "text-red-600" : "text-green-600";
                return (
                  <li
                    key={r.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                    data-testid={`recent-${r.id}`}
                  >
                    <span className="truncate">
                      <span className="text-muted-foreground">
                        {relativeDate(r.posted_at, today)} ·{" "}
                      </span>
                      <span>{merchant}</span>
                    </span>
                    <span className={`tabular-nums ${amtClass}`}>
                      {fmtMoney(r.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 6.2: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/recent-activity-tile.tsx
git commit -m "feat(dashboard): recent activity tile"
```

---

## Task 7: Uncategorised tile (conditional)

**Files:**
- Create: `app/dashboard/_tiles/uncategorised-tile.tsx`

Takes `{ count }`. Renders nothing if `count === 0` (parent decides not to render). Click-through to `/transactions?uncategorised=true`. Slight attention-grabbing styling via left border accent.

- [ ] **Step 7.1: Create the tile**

Write `app/dashboard/_tiles/uncategorised-tile.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  count: number;
};

export function UncategorisedTile({ count }: Props) {
  if (count === 0) return null;
  return (
    <Link href="/transactions?uncategorised=true" className="block">
      <Card
        data-testid="tile-uncategorised"
        className="border-l-4 border-l-amber-500 transition-colors hover:bg-muted/30"
      >
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm">
            {count} transaction{count === 1 ? "" : "s"} need
            {count === 1 ? "s" : ""} categorising
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 7.2: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/uncategorised-tile.tsx
git commit -m "feat(dashboard): uncategorised tile (conditional)"
```

---

## Task 8: Wire `/dashboard` page

**Files:**
- Modify: `app/dashboard/page.tsx`

Replace the placeholder card with the real dashboard: cycle header + 5-tile grid. One `Promise.all` for data, then aggregate in TS for top categories. Page-level error boundary via inline check.

- [ ] **Step 8.1: Replace the page**

Overwrite `app/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  currentCycleStart,
  currentCycleRange,
  daysIntoCycle,
  todayInNZ,
} from "@/lib/payday/cycle";
import { NetPositionTile } from "./_tiles/net-position-tile";
import { CycleSpendTile } from "./_tiles/cycle-spend-tile";
import {
  TopCategoriesTile,
  type TopCategoryRow,
} from "./_tiles/top-categories-tile";
import { RecentActivityTile } from "./_tiles/recent-activity-tile";
import { UncategorisedTile } from "./_tiles/uncategorised-tile";

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
      <main className="p-8 max-w-5xl mx-auto">
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

  const [
    accountsRes,
    cycleExpensesRes,
    recentRes,
    uncatRes,
    categoriesRes,
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
  ]);

  const errored =
    accountsRes.error ||
    cycleExpensesRes.error ||
    recentRes.error ||
    uncatRes.error ||
    categoriesRes.error;

  if (errored) {
    return (
      <main className="p-8 max-w-5xl mx-auto">
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

  // Top 3 categories — TS-side aggregation
  const categoryNames = new Map<string, string>(
    (categoriesRes.data ?? []).map((c) => [c.id as string, c.name as string]),
  );
  const sumByCat = new Map<string, number>();
  for (const t of cycleExpenses) {
    if (!t.category_id) continue;
    const prev = sumByCat.get(t.category_id) ?? 0;
    sumByCat.set(t.category_id, prev + Number(t.amount ?? 0));
  }
  const topCategories: TopCategoryRow[] = Array.from(sumByCat.entries())
    .map(([id, signedSum]) => ({
      id,
      name: categoryNames.get(id) ?? "Uncategorised",
      totalAbs: Math.abs(signedSum),
    }))
    .sort((a, b) => b.totalAbs - a.totalAbs)
    .slice(0, 3);

  const recentRows = recentRes.data ?? [];
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
        />
        <TopCategoriesTile rows={topCategories} cycleStart={cycleStart} />
        <RecentActivityTile rows={recentRows} />
        <UncategorisedTile count={uncatCount} />
      </div>
    </main>
  );
}
```

- [ ] **Step 8.2: Run all tests**

```bash
cd ~/Projects/finance-v2
npx vitest run
```

Expected: all tests pass (cycle.test.ts plus pre-existing suite).

- [ ] **Step 8.3: Run typecheck and lint**

```bash
cd ~/Projects/finance-v2
pnpm typecheck && pnpm lint
```

(If those exact scripts don't exist, run `npx tsc --noEmit` and `pnpm next lint` instead. Expected: clean.)

- [ ] **Step 8.4: Smoke-test the dashboard locally**

```bash
cd ~/Projects/finance-v2
pnpm dev
```

In a browser at `http://localhost:3000/dashboard`, confirm:
- Cycle header shows `Cycle <start> — <end> · X days in`
- Net Position tile shows a dollar number + "across N accounts"
- Cycle Spend tile shows a red dollar number + "X days into cycle"
- Top 3 Categories shows up to 3 categories with bar widths
- Recent Activity shows 5 rows with relative dates
- Uncategorised tile is hidden if count is 0; visible with correct count otherwise
- Each tile click-through goes to the right `/transactions?...` URL and the txn count drops accordingly

Stop the dev server.

- [ ] **Step 8.5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): wire 5-tile cycle-anchored dashboard"
```

---

## Task 9: Completion marker + final verification

**Files:**
- Create: `docs/PHASE-4-COMPLETE.md`

Mirror the Phase 3c completion marker pattern (`docs/PHASE-3C-COMPLETE.md`). One short doc summarising what shipped and the post-deploy smoke checklist.

- [ ] **Step 9.1: Read the Phase 3c completion marker for format reference**

```bash
cd ~/Projects/finance-v2
cat docs/PHASE-3C-COMPLETE.md
```

- [ ] **Step 9.2: Create the Phase 4 completion marker**

Write `docs/PHASE-4-COMPLETE.md` (mirror the Phase 3c format Sean already uses; keep it tight). Suggested structure:

```markdown
# Phase 4 — Dashboard — Complete

## What shipped

- `lib/payday/cycle.ts` — pure pay-cycle helpers (14th-rule, NZ TZ, ISO strings) with unit tests
- `app/dashboard/page.tsx` — replaces placeholder; cycle header + 5-tile grid
- 5 tile components in `app/dashboard/_tiles/`
- `app/transactions/page.tsx` — extended with `?type`, `?category`, `?since`, `?uncategorised` filter params

## Cycle anchor

Anchored to Jenny's monthly L'Oréal pay (14th-rule: weekday → 14, Sat → 13, Sun → 12). Verified 11/11 against the last 12 months of paydates.

## Post-deploy smoke checklist

- `/dashboard` cycle header shows correct dates
- Net Position matches `SELECT SUM(balance) FROM v2.accounts`
- Cycle Spend matches manual SQL sum of `WHERE type='expense' AND posted_at >= <cycle_start>`
- Top 3 Categories matches manual aggregation
- Recent Activity = the actual last 5 txns by `posted_at DESC`
- Uncategorised tile hidden at count=0; visible+correct at count>0
- Each click-through lands on a correctly-filtered `/transactions` view

## Out of scope (deferred to Phase 5)

Cross-cycle compare, charts, savings goals, settings UI, NZ holiday handling, per-user dashboards, Suspense streaming, tile-level error boundaries, income tile, txn detail page.

## Predecessor

Phase 3c — Rules CRUD (`docs/PHASE-3C-COMPLETE.md`)
```

- [ ] **Step 9.3: Final test sweep**

```bash
cd ~/Projects/finance-v2
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 9.4: Commit**

```bash
cd ~/Projects/finance-v2
git add docs/PHASE-4-COMPLETE.md
git commit -m "docs: mark Phase 4 (dashboard) complete"
```

- [ ] **Step 9.5: Confirm tree state before deploy step (do NOT push yet)**

```bash
cd ~/Projects/finance-v2
git status -sb
git log --oneline -10
```

Expected: clean working tree, ~9 new commits ahead of origin/main on `main`.

**Stop here.** The deploy itself (push + `vercel --prod`) is a separate step taken with Sean's approval, AFTER the secret rotations called out in the resume handoff (`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`).

---

## Self-review (writing-plans skill)

**Spec coverage:**
- ✅ Pay-cycle module + TDD → Task 1
- ✅ `/transactions` filter params → Task 2
- ✅ 5 tiles → Tasks 3–7
- ✅ `/dashboard` page wire-up + cycle header + Promise.all + page-level error → Task 8
- ✅ Manual smoke checklist → Task 8 step 4 + Task 9 marker doc
- ✅ Top-categories aggregation in TS (option b from spec) → Task 8
- ✅ Hidden tile when uncategorised count = 0 → Task 7
- ✅ Mobile-first responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) → Task 8
- ✅ Auth gate via `redirect("/login")` → Task 8
- ✅ Out-of-scope items not implemented (no charts, no Suspense, no per-tile error states) — confirmed absent

**Placeholder scan:** None. Every step contains the exact code or command to run.

**Type consistency:** `TopCategoryRow` exported from `top-categories-tile.tsx` and imported in `page.tsx`. `RecentRow` named consistently. All tiles import `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`. `cycleStart` is a YYYY-MM-DD string everywhere. `daysIn` is a number everywhere.

**Decomposition check:** 9 tasks, each producing an atomic, working commit. No task depends on a later task's output. Tile tasks (3–7) can be dispatched in parallel by a subagent runner.
