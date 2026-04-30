# Phase 5c — `/transactions` Filter UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace URL-only filtering on `/transactions` with a desktop filter UI — inline column-header controls for Date, Merchant, and Category, plus a one-click Uncategorised chip — and permanently fix the MakeRuleModal native `<select>` lag/clipping by migrating it to the new shadcn primitives.

**Architecture:** Add shadcn `Select` + `Popover` primitives. Build a `_filters/` directory of small client components (one per filter), each pushing URL changes via `next/navigation`'s router. A pure `lib/transactions/filter-params.ts` module owns the URL→SQL clause translation (TDD). The Server Component page extends its `searchParams` handling, adds a Category column, and renders a zero-state when filters narrow to no rows. MakeRuleModal swaps native `<select>` for the new shadcn `<Select>`.

**Tech Stack:** Next.js 16 App Router (server components, async `searchParams`), shadcn/ui (Radix-based primitives), Tailwind + DESIGN.md tokens, Supabase JS, Vitest.

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-30-transactions-filter-ui-design.md`
**Implementation repo:** `~/Projects/finance-v2/`

---

## File structure

**New files:**
- `components/ui/select.tsx` — shadcn raw (added by CLI)
- `components/ui/popover.tsx` — shadcn raw (added by CLI)
- `components/primitives/filter-popover.tsx` — column-header trigger + branded panel wrapper around `Popover`
- `components/blocks/transactions-filter-bar.tsx` — composes the four filter components for the page header
- `lib/transactions/filter-params.ts` — pure URL→query helpers
- `lib/transactions/filter-params.test.ts` — TDD tests
- `app/transactions/_filters/use-debounced-value.ts` — debounce hook
- `app/transactions/_filters/use-debounced-value.test.ts` — hook test
- `app/transactions/_filters/uncategorised-chip.tsx` — standalone toggle button
- `app/transactions/_filters/date-filter.tsx` — date preset popover
- `app/transactions/_filters/merchant-filter.tsx` — debounced search input
- `app/transactions/_filters/category-filter.tsx` — shadcn Select with Any / Uncategorised / category list
- `docs/PHASE-5C-COMPLETE.md` — completion marker

**Modified files:**
- `app/transactions/page.tsx` — extend `searchParams` types, add `?date_preset` + `?q` handling, add Category column to table, render filter bar above table, render zero-state when 0 rows
- `app/transactions/make-rule-modal.tsx` — replace native `<select>` (lines 238-248) with shadcn `<Select>`

---

## Task dependencies

```
1 (install primitives) ─┬→ 5 (FilterPopover) ─→ 6 (DateFilter) ──┐
                        │                                         ├→ 9 (FilterBar) → 10 (wire page)
                        │                                         │
                        ├→ 8 (CategoryFilter) ────────────────────┤
                        │                                         │
                        └→ 11 (MakeRuleModal refactor — independent of page wire-up)
2 (filter-params) ─→ 10
3 (debounce hook) ─→ 7 (MerchantFilter) ─→ 9
4 (UncategorisedChip — independent) ─→ 9
                                                                  └→ 12 (completion marker)
```

---

## Task 1: Install shadcn `select` and `popover` primitives

**Files:**
- Create: `components/ui/select.tsx` (via shadcn CLI)
- Create: `components/ui/popover.tsx` (via shadcn CLI)
- Modify: `package.json` (CLI adds `@radix-ui/react-select`, `@radix-ui/react-popover`)

- [ ] **Step 1: Run shadcn add**

```bash
npx shadcn@latest add select popover
```

If prompted "Overwrite?" for any file, answer `n` (we have button/card/table installed and don't want them touched).

Expected output: two new files in `components/ui/` and the radix-ui packages added to `package.json` + `package-lock.json` (or `bun.lockb` if Sean's on bun).

- [ ] **Step 2: Verify the files landed**

```bash
ls components/ui/select.tsx components/ui/popover.tsx
```

Expected: both files exist.

- [ ] **Step 3: Typecheck and run existing tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: typecheck passes (0 errors), all 88 existing tests still pass. If typecheck fails, the shadcn CLI may have added imports that don't resolve — check `tsconfig.json` paths.

- [ ] **Step 4: Commit**

```bash
git add components/ui/select.tsx components/ui/popover.tsx package.json package-lock.json
git commit -m "chore(ui): install shadcn Select + Popover primitives

Adds @radix-ui/react-select and @radix-ui/react-popover via shadcn
CLI. These primitives replace the native <select> (Phase 5b lag/
clipping bug) and enable the column-header filter UI in Phase 5c.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure filter-params helpers (TDD)

**Files:**
- Create: `lib/transactions/filter-params.ts`
- Create: `lib/transactions/filter-params.test.ts`

This module owns URL→SQL clause translation. Three pure functions: `parseDatePreset`, `escapeIlike`, `mergeFilterPrecedence`.

- [ ] **Step 1: Write the failing test for `parseDatePreset`**

Create `lib/transactions/filter-params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDatePreset } from "./filter-params";

describe("parseDatePreset", () => {
  // All tests anchor to a fixed "today" so they're deterministic.
  // 2026-04-30 = Thursday. Cycle anchor is 14th of month.
  const today = "2026-04-30";

  it("returns null since for 'all'", () => {
    expect(parseDatePreset("all", today)).toEqual({
      preset: "all",
      since: null,
    });
  });

  it("returns this cycle's anchor for 'cycle'", () => {
    // 2026-04-30 is in the 14 Apr → 13 May cycle
    expect(parseDatePreset("cycle", today)).toEqual({
      preset: "cycle",
      since: "2026-04-14",
    });
  });

  it("returns last cycle's anchor for 'last_cycle'", () => {
    // Previous cycle: 14 Mar → 13 Apr
    expect(parseDatePreset("last_cycle", today)).toEqual({
      preset: "last_cycle",
      since: "2026-03-14",
    });
  });

  it("returns today minus 6 days for '7d'", () => {
    expect(parseDatePreset("7d", today)).toEqual({
      preset: "7d",
      since: "2026-04-24",
    });
  });

  it("returns today minus 29 days for '30d'", () => {
    expect(parseDatePreset("30d", today)).toEqual({
      preset: "30d",
      since: "2026-04-01",
    });
  });

  it("falls back to 'all' for unknown preset", () => {
    expect(parseDatePreset("garbage", today)).toEqual({
      preset: "all",
      since: null,
    });
  });

  it("falls back to 'all' for undefined preset", () => {
    expect(parseDatePreset(undefined, today)).toEqual({
      preset: "all",
      since: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/transactions/filter-params.test.ts
```

Expected: FAIL — `Cannot find module './filter-params'`.

- [ ] **Step 3: Implement `parseDatePreset`**

Create `lib/transactions/filter-params.ts`:

```ts
import { currentCycleRange, lastCycleRange } from "@/lib/payday/cycle";

export type DatePreset = "all" | "cycle" | "last_cycle" | "7d" | "30d";

const VALID_PRESETS: readonly DatePreset[] = [
  "all",
  "cycle",
  "last_cycle",
  "7d",
  "30d",
];

export type DatePresetResult = {
  preset: DatePreset;
  since: string | null; // ISO date YYYY-MM-DD, or null for "all time"
};

function isDatePreset(s: string | undefined): s is DatePreset {
  return typeof s === "string" && (VALID_PRESETS as readonly string[]).includes(s);
}

function isoDaysAgo(today: string, days: number): string {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

export function parseDatePreset(
  raw: string | undefined,
  today: string
): DatePresetResult {
  if (!isDatePreset(raw)) return { preset: "all", since: null };

  switch (raw) {
    case "all":
      return { preset: "all", since: null };
    case "cycle":
      return { preset: "cycle", since: currentCycleRange(today).start };
    case "last_cycle":
      return { preset: "last_cycle", since: lastCycleRange(today).start };
    case "7d":
      return { preset: "7d", since: isoDaysAgo(today, 6) };
    case "30d":
      return { preset: "30d", since: isoDaysAgo(today, 29) };
  }
}
```

> If `lastCycleRange` doesn't exist in `@/lib/payday/cycle`, check Phase 5a — it was added there. If it's named `lastCycleRange` use that import; if it's `previousCycleRange` rename accordingly. The test cycle math assumes 14th-rule anchor.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/transactions/filter-params.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Add tests for `escapeIlike`**

Append to `lib/transactions/filter-params.test.ts`:

```ts
import { escapeIlike } from "./filter-params";

describe("escapeIlike", () => {
  it("escapes %", () => {
    expect(escapeIlike("100%off")).toBe("100\\%off");
  });

  it("escapes _", () => {
    expect(escapeIlike("foo_bar")).toBe("foo\\_bar");
  });

  it("escapes backslash", () => {
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
  });

  it("escapes all three together", () => {
    expect(escapeIlike("100%_test\\")).toBe("100\\%\\_test\\\\");
  });

  it("returns plain text unchanged", () => {
    expect(escapeIlike("central park")).toBe("central park");
  });

  it("returns empty string unchanged", () => {
    expect(escapeIlike("")).toBe("");
  });
});
```

- [ ] **Step 6: Implement `escapeIlike`**

Append to `lib/transactions/filter-params.ts`:

```ts
// Escape postgres ILIKE pattern characters so user search input is treated as
// literal text rather than wildcards. Order matters: backslash first, then % and _.
export function escapeIlike(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
```

- [ ] **Step 7: Run tests to verify pass**

```bash
npx vitest run lib/transactions/filter-params.test.ts
```

Expected: 13 tests PASS.

- [ ] **Step 8: Add tests for `mergeFilterPrecedence`**

Append to `lib/transactions/filter-params.test.ts`:

```ts
import { mergeFilterPrecedence } from "./filter-params";

describe("mergeFilterPrecedence", () => {
  it("uncategorised wins over category", () => {
    expect(
      mergeFilterPrecedence({ category: "abc", uncategorised: true })
    ).toEqual({ uncategorised: true });
  });

  it("category alone passes through", () => {
    expect(mergeFilterPrecedence({ category: "abc" })).toEqual({
      category: "abc",
    });
  });

  it("uncategorised alone passes through", () => {
    expect(mergeFilterPrecedence({ uncategorised: true })).toEqual({
      uncategorised: true,
    });
  });

  it("'Any' clears category", () => {
    expect(mergeFilterPrecedence({ category: "Any" })).toEqual({});
  });

  it("'Any' clears category even with other filters", () => {
    expect(mergeFilterPrecedence({ category: "Any", uncategorised: false })).toEqual({});
  });

  it("empty input returns empty", () => {
    expect(mergeFilterPrecedence({})).toEqual({});
  });
});
```

- [ ] **Step 9: Implement `mergeFilterPrecedence`**

Append to `lib/transactions/filter-params.ts`:

```ts
type FilterInput = {
  category?: string;
  uncategorised?: boolean;
};

type FilterOutput = {
  category?: string;
  uncategorised?: true;
};

// Resolves filter precedence: uncategorised wins over category, "Any" clears.
// Output only contains keys that should be applied to the SQL query.
export function mergeFilterPrecedence(input: FilterInput): FilterOutput {
  if (input.uncategorised === true) return { uncategorised: true };
  if (input.category && input.category !== "Any") {
    return { category: input.category };
  }
  return {};
}
```

- [ ] **Step 10: Run all tests to verify**

```bash
npx vitest run lib/transactions/filter-params.test.ts
```

Expected: 19 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/transactions/filter-params.ts lib/transactions/filter-params.test.ts
git commit -m "feat(transactions): pure filter-params helpers

Three pure functions for URL→SQL filter translation:
- parseDatePreset: maps preset string to {preset, since} ISO date
- escapeIlike: escapes %, _, \\ for safe ILIKE matching
- mergeFilterPrecedence: uncategorised wins over category; Any clears

19 vitest cases covering happy paths, fallbacks, and precedence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `useDebouncedValue` hook (TDD)

**Files:**
- Create: `app/transactions/_filters/use-debounced-value.ts`
- Create: `app/transactions/_filters/use-debounced-value.test.ts`

A small generic hook used by `MerchantFilter`. ~10 LOC.

- [ ] **Step 1: Write the failing test**

Create `app/transactions/_filters/use-debounced-value.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 250));
    expect(result.current).toBe("hello");
  });

  it("does not update before delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    rerender({ value: "abc" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("a");
  });

  it("updates once after delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    rerender({ value: "abc" });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe("abc");
  });
});
```

- [ ] **Step 2: Verify `@testing-library/react` is installed**

```bash
grep '"@testing-library/react"' package.json
```

If missing, install it:

```bash
npm install --save-dev @testing-library/react
```

> If `@testing-library/react` is missing AND adding it pulls in many packages, an alternative is to skip this hook test and rely on E2E smoke. Default = install it; the hook is small but the test gives coverage proof for the debounce.

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run app/transactions/_filters/use-debounced-value.test.ts
```

Expected: FAIL — `Cannot find module './use-debounced-value'`.

- [ ] **Step 4: Implement the hook**

Create `app/transactions/_filters/use-debounced-value.ts`:

```ts
import { useEffect, useState } from "react";

// Returns `value` delayed by `delay` ms. Updates collapse — multiple changes
// within the window only emit the final value once the timer fires.
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run app/transactions/_filters/use-debounced-value.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/transactions/_filters/use-debounced-value.ts app/transactions/_filters/use-debounced-value.test.ts
git commit -m "feat(transactions): useDebouncedValue hook

Small generic hook for debouncing fast-changing values (used by
the upcoming MerchantFilter search input). 3 vitest cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `<UncategorisedChip>` component

**Files:**
- Create: `app/transactions/_filters/uncategorised-chip.tsx`

Standalone toggle. Independent of the column-header dropdowns — simplest filter component.

- [ ] **Step 1: Implement the component**

Create `app/transactions/_filters/uncategorised-chip.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function UncategorisedChip({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete("uncategorised");
    } else {
      params.set("uncategorised", "true");
      params.delete("category"); // uncategorised wins
    }
    params.delete("page"); // any filter change resets pagination
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="uncategorised-chip"
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          : "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      }
    >
      <span aria-hidden="true">{active ? "✓" : "☐"}</span>
      Uncategorised only
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/transactions/_filters/uncategorised-chip.tsx
git commit -m "feat(transactions): UncategorisedChip toggle

Standalone client component that toggles ?uncategorised=true on
the URL and clears any conflicting ?category. Uses next/navigation
router.replace so back-button history isn't spammed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `<FilterPopover>` primitive

**Files:**
- Create: `components/primitives/filter-popover.tsx`

Wraps shadcn `Popover` with a column-header trigger style + a branded panel. Reused by `DateFilter` (and later by other column-header dropdowns).

- [ ] **Step 1: Implement the primitive**

Create `components/primitives/filter-popover.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type FilterPopoverProps = {
  label: string;
  active?: boolean; // when true, label gets an accent colour to show a filter is applied
  children: React.ReactNode; // panel content (typically a list of items)
};

export function FilterPopover({ label, active, children }: FilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            active
              ? "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-primary hover:opacity-80"
              : "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-foreground hover:opacity-70"
          }
        >
          {label}
          <span className="text-[10px]" aria-hidden="true">⏷</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If the import paths are wrong (`@/components/ui/popover` doesn't resolve), check Task 1 actually created the file.

- [ ] **Step 3: Commit**

```bash
git add components/primitives/filter-popover.tsx
git commit -m "feat(ui): FilterPopover primitive

Lightly-customised wrapper around shadcn Popover for column-header
filter dropdowns. Provides a small uppercase-label trigger and a
narrow panel; accent colour when a filter is active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `<DateFilter>` component

**Files:**
- Create: `app/transactions/_filters/date-filter.tsx`

Uses `<FilterPopover>` + a list of preset items. Click → URL update.

- [ ] **Step 1: Implement**

Create `app/transactions/_filters/date-filter.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FilterPopover } from "@/components/primitives/filter-popover";
import type { DatePreset } from "@/lib/transactions/filter-params";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "cycle", label: "This cycle" },
  { value: "last_cycle", label: "Last cycle" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function DateFilter({ active }: { active: DatePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(preset: DatePreset) {
    const params = new URLSearchParams(searchParams.toString());
    if (preset === "all") {
      params.delete("date_preset");
      params.delete("since");
    } else {
      params.set("date_preset", preset);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const isActive = active !== "all";

  return (
    <FilterPopover label="Date" active={isActive}>
      <ul role="listbox" aria-label="Date preset">
        {PRESETS.map((p) => (
          <li key={p.value}>
            <button
              type="button"
              role="option"
              aria-selected={p.value === active}
              onClick={() => pick(p.value)}
              className={
                p.value === active
                  ? "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-primary bg-primary/10"
                  : "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground hover:bg-accent"
              }
            >
              <span className="w-3" aria-hidden="true">
                {p.value === active ? "✓" : ""}
              </span>
              {p.label}
            </button>
          </li>
        ))}
      </ul>
    </FilterPopover>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/transactions/_filters/date-filter.tsx
git commit -m "feat(transactions): DateFilter (column-header preset popover)

Five presets (All / This cycle / Last cycle / Last 7d / Last 30d).
Selecting a preset writes ?date_preset=… to the URL; \"all\" clears
both ?date_preset and ?since. Page resets to 1 on filter change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `<MerchantFilter>` component

**Files:**
- Create: `app/transactions/_filters/merchant-filter.tsx`

Inline `<input>` in the Merchant column header. Local state + debounced URL update.

- [ ] **Step 1: Implement**

Create `app/transactions/_filters/merchant-filter.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useDebouncedValue } from "./use-debounced-value";

export function MerchantFilter({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);
  const debounced = useDebouncedValue(value, 250);

  // Sync debounced value to URL — but only when it actually changes vs. what's
  // in the URL (otherwise we'd re-render the page on every mount).
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (debounced === current) return;

    const params = new URLSearchParams(searchParams.toString());
    if (debounced) {
      params.set("q", debounced);
    } else {
      params.delete("q");
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [debounced, pathname, router, searchParams]);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
        Merchant
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search…"
        className="rounded border border-border bg-background px-2 py-0.5 text-xs font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Filter by merchant"
        data-testid="merchant-filter"
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/transactions/_filters/merchant-filter.tsx
git commit -m "feat(transactions): MerchantFilter (debounced search input)

Inline search box in the Merchant column header. Uses the local
useDebouncedValue hook (250ms) so typing 'central park' fires one
URL update, not eleven. Page resets to 1 on change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `<CategoryFilter>` component

**Files:**
- Create: `app/transactions/_filters/category-filter.tsx`

Uses shadcn `<Select>` from Task 1. Lists "Any" / "Uncategorised" / all categories alphabetically.

- [ ] **Step 1: Implement**

Create `app/transactions/_filters/category-filter.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CategoryOption = { id: string; name: string; type: string };

type CategoryFilterProps = {
  categories: CategoryOption[];
  // Current selection: a category id, "uncat" for uncategorised, or "any".
  current: string;
};

const ANY = "any";
const UNCAT = "uncat";

export function CategoryFilter({ categories, current }: CategoryFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ANY) {
      params.delete("category");
      params.delete("uncategorised");
    } else if (value === UNCAT) {
      params.set("uncategorised", "true");
      params.delete("category");
    } else {
      params.set("category", value);
      params.delete("uncategorised");
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
        Category
      </span>
      <Select value={current} onValueChange={pick}>
        <SelectTrigger
          className="h-7 px-2 text-xs"
          data-testid="category-filter"
          aria-label="Filter by category"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          <SelectItem value={UNCAT}>Uncategorised</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name} ({c.type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/transactions/_filters/category-filter.tsx
git commit -m "feat(transactions): CategoryFilter (shadcn Select dropdown)

Column-header dropdown listing 'Any' / 'Uncategorised' / all
categories. Uses shadcn Select primitive (Radix-based) — no native
<select> clipping or compositor lag.

Selecting 'Uncategorised' sets ?uncategorised=true (synonym for
the chip); 'Any' clears both ?category and ?uncategorised.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `<TransactionsFilterBar>` block

**Files:**
- Create: `components/blocks/transactions-filter-bar.tsx`

Composes the four filter components. Stateless — receives current params and category list, hands them to children.

- [ ] **Step 1: Implement**

Create `components/blocks/transactions-filter-bar.tsx`:

```tsx
import { UncategorisedChip } from "@/app/transactions/_filters/uncategorised-chip";
import type { DatePreset } from "@/lib/transactions/filter-params";
import type { CategoryOption } from "@/app/transactions/_filters/category-filter";

type Props = {
  uncategorised: boolean;
  // The category-column dropdown current value: a uuid, "uncat", or "any".
  categoryCurrent: string;
  // Date preset current selection.
  datePreset: DatePreset;
  // Merchant search current value (server-passed; client component owns input state).
  merchantQuery: string;
  categories: CategoryOption[];
};

export function TransactionsFilterBar(_props: Props) {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2"
      data-testid="transactions-filter-bar"
    >
      <UncategorisedChip active={_props.uncategorised} />
    </div>
  );
}
```

> The bar currently only renders the chip — the column-header filters live inside the table header (rendered by `app/transactions/page.tsx` in Task 10). This block owns the *standalone* filter row above the table; column-header filters wire directly into the `<TableHead>` cells in the page.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/blocks/transactions-filter-bar.tsx
git commit -m "feat(transactions): TransactionsFilterBar block

Hosts the standalone filter row above the table. Currently only
renders the Uncategorised chip; the column-header dropdowns are
rendered inline in the table header by the page itself (closer to
where they visually live).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wire filters into `/transactions` page

**Files:**
- Modify: `app/transactions/page.tsx`

This is the integration step. Extends `searchParams` parsing, computes the resolved filter state, renders the filter bar + column-header filters, adds the Category column, renders zero-state.

- [ ] **Step 1: Read current page**

```bash
cat app/transactions/page.tsx | head -40
```

Confirm the current `SearchParams` type and query-building lines. (Reference: `searchParams` type at lines 17-23, query builder at 49-65, render at 90+.)

- [ ] **Step 2: Update `SearchParams` type and imports**

In `app/transactions/page.tsx`, replace the imports block (lines 1-13) and `SearchParams` type (lines 17-23) with:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoneySigned } from "@/lib/format/money";
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
import { TransactionsFilterBar } from "@/components/blocks/transactions-filter-bar";
import { DateFilter } from "./_filters/date-filter";
import { MerchantFilter } from "./_filters/merchant-filter";
import { CategoryFilter } from "./_filters/category-filter";
import {
  parseDatePreset,
  escapeIlike,
  mergeFilterPrecedence,
  type DatePreset,
} from "@/lib/transactions/filter-params";
import { todayInNZ } from "@/lib/payday/cycle";

const PAGE_SIZE = 50;

type SearchParams = {
  page?: string;
  type?: string;
  category?: string;
  since?: string;
  uncategorised?: string;
  date_preset?: string;
  q?: string;
};
```

- [ ] **Step 3: Replace the query-building block**

Replace lines ~49-65 (the existing query/filter code) with:

```tsx
  const today = todayInNZ();
  const datePreset = parseDatePreset(params.date_preset, today);
  const resolved = mergeFilterPrecedence({
    category: params.category,
    uncategorised: params.uncategorised === "true",
  });
  const merchantQuery = (params.q ?? "").trim();

  let query = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .order("posted_at", { ascending: false });

  if (params.type === "expense" || params.type === "income" || params.type === "transfer") {
    query = query.eq("type", params.type);
  }
  if ("category" in resolved && resolved.category) {
    query = query.eq("category_id", resolved.category);
  }
  if ("uncategorised" in resolved) {
    query = query.is("category_id", null);
  }
  // Date: prefer date_preset if set, else fall back to raw ?since for back-compat
  // with old dashboard tile click-throughs.
  const sinceISO =
    datePreset.preset !== "all"
      ? datePreset.since
      : params.since && /^\d{4}-\d{2}-\d{2}$/.test(params.since)
      ? params.since
      : null;
  if (sinceISO) {
    query = query.gte("posted_at", sinceISO);
  }
  if (merchantQuery) {
    query = query.ilike("merchant_clean", `%${escapeIlike(merchantQuery)}%`);
  }
```

- [ ] **Step 4: Build the category-current value**

Just below the query block, derive the `<CategoryFilter>` "current" value:

```tsx
  const categoryCurrent =
    "uncategorised" in resolved
      ? "uncat"
      : "category" in resolved && resolved.category
      ? resolved.category
      : "any";
```

- [ ] **Step 5: Update `pagerQuery` to include new params**

Find the existing `pagerQuery` block (around line 80-90) and update it:

```tsx
  const pagerQuery = new URLSearchParams();
  if (params.type) pagerQuery.set("type", params.type);
  if (params.category) pagerQuery.set("category", params.category);
  if (params.since) pagerQuery.set("since", params.since);
  if (params.uncategorised) pagerQuery.set("uncategorised", params.uncategorised);
  if (params.date_preset) pagerQuery.set("date_preset", params.date_preset);
  if (params.q) pagerQuery.set("q", params.q);
  const pagerPrefix = pagerQuery.toString() ? `&${pagerQuery.toString()}` : "";
```

- [ ] **Step 6: Replace the render block — add filter bar, Category column, zero-state**

Replace the `return (...)` block starting at `<main ...>` with:

```tsx
  const isFiltered =
    "uncategorised" in resolved ||
    ("category" in resolved && resolved.category) ||
    sinceISO !== null ||
    merchantQuery !== "" ||
    Boolean(params.type);

  const hasResults = txns.length > 0;

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1
        className="text-2xl font-semibold mb-4"
        data-testid="transactions-heading"
      >
        Transactions ({count ?? 0})
      </h1>

      <TransactionsFilterBar
        uncategorised={"uncategorised" in resolved}
        categoryCurrent={categoryCurrent}
        datePreset={datePreset.preset}
        merchantQuery={merchantQuery}
        categories={categories}
      />

      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px]">
              <DateFilter active={datePreset.preset} />
            </TableHead>
            <TableHead>
              <MerchantFilter initial={merchantQuery} />
            </TableHead>
            <TableHead className="w-[200px]">
              <CategoryFilter
                categories={categories}
                current={categoryCurrent}
              />
            </TableHead>
            <TableHead className="w-[110px] text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!hasResults && (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                No transactions match these filters.{" "}
                {isFiltered && (
                  <Link
                    href="/transactions"
                    className="underline text-primary hover:opacity-80"
                  >
                    Clear filters
                  </Link>
                )}
              </TableCell>
            </TableRow>
          )}
          {txns.map((t) => {
            const amt = Number(t.amount ?? 0);
            const cat = categories.find((c) => c.id === t.category_id);
            return (
              <TableRow key={t.id} data-testid={`txn-${t.id}`}>
                <TableCell className="whitespace-nowrap">
                  <Link
                    href={`/transactions/${t.id}`}
                    className="block hover:underline"
                  >
                    {t.posted_at}
                  </Link>
                </TableCell>
                <TableCell className="min-w-0">
                  <Link
                    href={`/transactions/${t.id}`}
                    className="block min-w-0 truncate hover:underline"
                  >
                    {t.merchant_clean ?? t.merchant_raw ?? t.description ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {cat ? (
                      <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {cat.name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                        Uncategorised
                      </span>
                    )}
                    {!t.category_id && (
                      <span className="inline-flex shrink-0">
                        <MakeRuleButton txn={t} categories={categories} />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell
                  className={`text-right whitespace-nowrap ${
                    amt < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  <Link
                    href={`/transactions/${t.id}`}
                    className="block hover:underline"
                  >
                    {fmtMoneySigned(amt)}
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {hasResults && (
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
      )}
    </main>
  );
```

> Note: the `+ rule` button moved into the Category cell beside the Uncategorised pill. This is intentional — it's where the action belongs (the row's category state is right there).

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If `todayInNZ` doesn't exist in `@/lib/payday/cycle`, import the right helper (it was added in Phase 4). If `currentCycleRange` / `lastCycleRange` shapes differ from the assumption in Task 2, fix the helpers in Task 2 first.

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (88 + 22 from this phase = ~110).

- [ ] **Step 9: Manual local smoke**

```bash
npm run dev
```

Visit `http://localhost:3000/transactions`. Verify:
- Page renders with filter bar (Uncategorised chip), column-header filter controls, and Amount column
- No filters → all rows show, Category column shows pills/Uncategorised pill + + rule
- Click chip → URL gets `?uncategorised=true`, table refilters
- Click Date column ⏷ → preset list opens, click "This cycle" → URL gets `?date_preset=cycle&since=…`
- Type in Merchant box → after 250ms, URL gets `?q=…`
- Pick a category from the Category dropdown → URL gets `?category=<uuid>`
- Filter to nothing → "No transactions match" + "Clear filters" link; click clears all params

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add app/transactions/page.tsx
git commit -m "feat(transactions): wire filter UI into page

Extends /transactions Server Component with:
- New search params: ?date_preset, ?q
- TransactionsFilterBar above the table (Uncategorised chip)
- Column-header filters: Date / Merchant / Category dropdowns
- Category column with pill (set) or Uncategorised pill (unset)
- + rule button now lives next to the Uncategorised pill in the
  Category cell rather than the Merchant cell — closer to the
  category action it triggers
- Zero-state row with 'Clear filters' link when no rows match
- Pagination preserves all new params; resets page on filter change

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Refactor `MakeRuleModal` to use shadcn `<Select>`

**Files:**
- Modify: `app/transactions/make-rule-modal.tsx` (replace native `<select>` at lines 238-248)

Independent of the page wire-up — fixes the lag/clipping bug from Phase 5b.

- [ ] **Step 1: Replace the native select**

In `app/transactions/make-rule-modal.tsx`, replace the native `<select>` block (around lines 235-248) with:

```tsx
            <label className="block text-sm font-medium text-foreground mb-1">
              Category
            </label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mb-4 w-full">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {props.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
```

- [ ] **Step 2: Add the imports at the top of the file**

In the imports block (around lines 1-5), add:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 5: Manual local smoke**

```bash
npm run dev
```

Visit `http://localhost:3000/transactions`. Click `+ rule` on an uncategorised row. Verify:
- Modal opens
- Category dropdown opens cleanly (no clipping at top of viewport)
- Click an option → option is applied to the field; dropdown closes immediately (no ~5s lag)
- "Next →" advances to confirm phase as before
- Cancel works

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add app/transactions/make-rule-modal.tsx
git commit -m "refactor(make-rule-modal): native select → shadcn Select

Permanently fixes the ~5s lag and viewport-clipping bugs from
Phase 5b smoke. Radix-backed Select handles positioning, keyboard
nav, focus trap, and dark-mode tokens through DESIGN.md vars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Phase completion marker + ship

**Files:**
- Create: `docs/PHASE-5C-COMPLETE.md`

Document what shipped, plus the post-deploy smoke checklist.

- [ ] **Step 1: Write the marker**

Create `docs/PHASE-5C-COMPLETE.md`:

```markdown
# Phase 5c — `/transactions` Filter UI — Complete

**Date completed:** 2026-04-30

## What ships

- `components/ui/select.tsx`, `components/ui/popover.tsx` — shadcn primitives (Radix-based)
- `components/primitives/filter-popover.tsx` — column-header filter trigger wrapper
- `components/blocks/transactions-filter-bar.tsx` — standalone Uncategorised-chip row
- `lib/transactions/filter-params.ts` + tests — pure URL→SQL helpers (parseDatePreset, escapeIlike, mergeFilterPrecedence)
- `app/transactions/_filters/use-debounced-value.ts` + test — generic debounce hook
- `app/transactions/_filters/uncategorised-chip.tsx` — toggle button
- `app/transactions/_filters/date-filter.tsx` — preset popover
- `app/transactions/_filters/merchant-filter.tsx` — debounced search
- `app/transactions/_filters/category-filter.tsx` — shadcn Select dropdown
- `app/transactions/page.tsx` — extended with new params, Category column, zero-state
- `app/transactions/make-rule-modal.tsx` — native select replaced with shadcn Select (kills Phase 5b lag/clipping)

## Post-deploy smoke checklist

- [ ] Page loads with no filters → identical to pre-Phase 5c behavior (same row count, latest first)
- [ ] Category column visible with pills (set categories) and Uncategorised pill (unset rows)
- [ ] Click `+ rule` button (now next to Uncategorised pill) → modal still opens correctly
- [ ] Click Uncategorised chip → URL gets `?uncategorised=true`, table shows only uncategorised
- [ ] Click Date column ⏷ → popover opens, click "This cycle" → URL gets `?date_preset=cycle&since=YYYY-MM-DD`, table reflects
- [ ] Type in Merchant box → after 250ms, URL gets `?q=…`, table refilters
- [ ] Pick category from dropdown → URL gets `?category=<uuid>`, table refilters
- [ ] Combine: Uncategorised + merchant "central" + date "Last 30d" → all compose, count drops correctly
- [ ] Filter to nothing → zero-state row + "Clear filters" link works
- [ ] Pagination preserves all filters
- [ ] Existing dashboard tile click-throughs still work (`?type=expense`, `?since=…`, `?uncategorised=true`)
- [ ] MakeRuleModal Category dropdown opens/closes cleanly (no clipping, no ~5s lag)

## Documented limitations / out-of-scope (deferred)

- Mobile view (bottom-sheet "Filter" button on narrow viewports) — small follow-up phase
- Type chips (Expense / Income / Transfer) UI — `?type=` already in URL, just no UI
- Amount range filter
- Custom calendar widget for Date — v1 ships presets only
- Saved filter views / multi-select categories / column sorting — Phase 8+
- Spotify merchant cleanup — own phase

## Predecessor

Phase 5b — Txn detail + notes + autosave (`docs/PHASE-5B-COMPLETE.md`)
```

- [ ] **Step 2: Commit**

```bash
git add docs/PHASE-5C-COMPLETE.md
git commit -m "docs: mark Phase 5c (transactions filter UI) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push and deploy**

```bash
git push origin main
vercel --prod --yes
```

Expected: deployment lands on production, smoke checklist above is the next session's first task.

- [ ] **Step 4: Update PROJECT-STATE.md (post-deploy)**

After deploy succeeds, in a separate commit, update `PROJECT-STATE.md`:
- Bump `**Last updated:**` line to reflect Phase 5c shipped
- Update `**Currently deployed:**` commit + state
- Add Phase 5c row to the Phase status table (state ✅ shipped, marker `docs/PHASE-5C-COMPLETE.md`)
- Update `## Today's commits` block with the Phase 5c commits
- Move Phase 5c items from "Next-session checklist" to "Verified working" once smoke passes

```bash
git add PROJECT-STATE.md
git commit -m "docs: update PROJECT-STATE for Phase 5c ship

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Acceptance criteria (whole-phase, post-deploy)

- All 12 tasks committed, ~24-30 commits total (TDD per task)
- Vitest green: ≥110 tests passing
- TypeScript clean: `npx tsc --noEmit` returns 0 errors
- Production deploy serves the new `/transactions` UI
- Manual post-deploy smoke checklist (Task 12 marker doc) all pass
- Existing dashboard tile click-throughs unchanged (`?type=expense`, `?since=YYYY-MM-DD`, `?uncategorised=true` all still produce filtered views)
- MakeRuleModal native-select bug from Phase 5b smoke is permanently fixed
- No mobile-specific work (deferred); mobile users see the desktop layout — not pretty but not broken

---

## Reference paths

- Spec: `~/Projects/finance/docs/superpowers/specs/2026-04-30-transactions-filter-ui-design.md`
- DESIGN.md: `~/Projects/finance-v2/DESIGN.md` (Stripe-inspired)
- ui-stack guidance: `~/.claude/skills/ui-stack/SKILL.md`
- Phase 5a (cycle helpers used by `parseDatePreset`): `docs/PHASE-5A-COMPLETE.md`
- Phase 5b (MakeRuleModal source): `docs/PHASE-5B-COMPLETE.md`
- Brainstorm artefacts: `~/Projects/finance-v2/.superpowers/brainstorm/1666776-1777541877/`
