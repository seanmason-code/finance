# Phase 3c — Rules CRUD Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/settings/rules` page that lets the user list, edit, delete (with optimistic-undo), and re-run categorisation rules created via the Phase 3b "+ rule" modal.

**Architecture:** Server component lists rules in English-sentence form ordered by `created_at DESC`. Three new API routes (`PATCH /api/rules/[id]`, `DELETE /api/rules/[id]`, `POST /api/rules/[id]/preview`) handle write actions. A new `EditRuleModal` handles edits; the existing `make-rule-modal.tsx` grows a `mode: "create" | "rerun"` prop so the Re-run flow reuses its confirm-step. The DB-side find-matches logic gets extracted from `app/api/rules/route.ts` into `lib/rules/find-matches.ts` so it's testable in isolation and reused by the preview route — with the corrected guard semantics that the Phase 3b cleanup PR will eventually adopt too.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, Supabase (`v2` schema, RLS via JWT for user routes), shadcn primitives, Tailwind, vitest, and `sonner` (new dep, install in Task 1) for the optimistic-delete toast.

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-3c-rules-crud-design.md`

**Project notes (from `~/Projects/finance-v2/AGENTS.md`):**

- This is Next.js 16. Read `node_modules/next/dist/docs/` before assuming familiar APIs.
- For UI work, invoke `ui-stack` first, then `awesome-design` before writing component markup. Tasks 9–13 trigger this.

**Repo state at plan time:**

- Implementation repo: `~/Projects/finance-v2/`
- Branch: `main`, HEAD = `cd2dfe8` ("docs: mark Phase 3b (cron + rules) complete"). Up to date with origin.
- Direct-on-main workflow. **Vercel auto-deploys on push to main** — keep all 13 commits local until Phase 3c is functionally complete, then push as a single batch (Task 13).

**Phase 3b cleanup-PR coordination:** A separate scheduled remote agent fires 2026-05-06 to open `cleanup/phase-3b-followups`, which will tighten `app/api/rules/route.ts`'s keyword guard and `%`/`_` escape. Phase 3c writes the corrected semantics into the new `lib/rules/find-matches.ts` from the start (Task 3) and refactors `route.ts` to call it (Task 4). If the cleanup PR merges before Phase 3c lands → Phase 3c just inherits the corrected `route.ts` and the refactor is a smaller diff. If Phase 3c lands first → the cleanup PR will rebase against a `route.ts` that already calls `find-matches.ts` and the cleanup work shrinks to the modal a11y fixes.

---

## Task 1: Install `sonner` and mount the Toaster

**Files:**

- Modify: `~/Projects/finance-v2/package.json` (via `npm install`)
- Modify: `~/Projects/finance-v2/app/layout.tsx`

The optimistic-delete UX in Task 11 requires a toast system. shadcn currently recommends `sonner`; nothing else needs it yet, so this task is the lightest possible install + global mount.

- [ ] **Step 1: Install sonner**

```bash
cd ~/Projects/finance-v2 && npm install sonner
```

- [ ] **Step 2: Mount the Toaster in the root layout**

Read `~/Projects/finance-v2/app/layout.tsx` first. Then replace the body content to mount the Toaster alongside `{children}`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finance",
  description: "Personal finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify nothing broke**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit && npx vitest run
```

Expected: tsc clean; 27/27 vitest passed.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add package.json package-lock.json app/layout.tsx && \
  git commit -m "feat(ui): add sonner Toaster to root layout"
```

---

## Task 2: Build the top nav and wire the Rules link

**Files:**

- Create: `~/Projects/finance-v2/components/top-nav.tsx`
- Modify: `~/Projects/finance-v2/app/layout.tsx`

There's no existing primary nav — pages link via inline `<a>` tags. Build a minimal nav now so the Rules link has a home and we don't have to revisit this per page.

**UI gate:** before writing JSX, invoke `ui-stack` (folder/component conventions) then `awesome-design` (visual polish) per `AGENTS.md`. The nav is the canonical placement for project-wide navigation; get those skill outputs before deciding spacing/border treatments.

- [ ] **Step 1: Invoke `ui-stack` and `awesome-design`**

Use the Skill tool. Note key takeaways for: max-width container, dark-mode tokens, link styling (active vs inactive), and how to indicate the current page.

- [ ] **Step 2: Create `components/top-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings/rules", label: "Rules" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav
      className="border-b border-border bg-background"
      data-testid="top-nav"
    >
      <ul className="max-w-5xl mx-auto px-8 py-3 flex gap-6 text-sm">
        {LINKS.map((l) => {
          const active =
            pathname === l.href ||
            (l.href !== "/" && pathname.startsWith(l.href));
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

If `awesome-design` recommends different spacing/colour treatments, apply them here.

- [ ] **Step 3: Mount TopNav in `app/layout.tsx`**

Add the import and render `<TopNav />` directly above `{children}`:

```tsx
import { TopNav } from "@/components/top-nav";
// ...
<body className="min-h-full flex flex-col">
  <TopNav />
  {children}
  <Toaster position="bottom-right" richColors closeButton />
</body>
```

The login page should NOT show the nav. Two options:

- (a) Move the nav into a route-group layout (e.g. `app/(authed)/layout.tsx`) — bigger refactor.
- (b) Conditional render: in `TopNav`, return `null` when `pathname === "/login"`.

Use **(b)** — minimal change. Add at the top of the component body:

```tsx
if (pathname === "/login") return null;
```

- [ ] **Step 4: TS clean + smoke test**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit && \
  (timeout 25 npm run dev > /tmp/task2.log 2>&1 &) && sleep 8 && \
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/transactions; \
  pkill -f "next dev"
```

Expected: tsc clean; 307 unauth redirect (login still works through the redirect; nav doesn't break the auth gate).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add components/top-nav.tsx app/layout.tsx && \
  git commit -m "feat(ui): top nav with Rules link"
```

---

## Task 3: Extract `findMatchingUncategorisedTxns` helper (TDD)

**Files:**

- Create: `~/Projects/finance-v2/lib/rules/find-matches.ts`
- Create: `~/Projects/finance-v2/lib/rules/find-matches.test.ts`

Pure data helper that runs the DB-side equivalent of `applyRules`'s match logic — used by `POST /api/rules` (after insert) and `POST /api/rules/[id]/preview` (without insert). **Adopts corrected guard semantics from the start:** explicit `!== null && !== undefined` checks for keyword and account_id, plus LIKE-metacharacter escaping. The Phase 3b cleanup PR will land the same semantics in `route.ts` later; this task front-runs the cleanup for the helper layer.

- [ ] **Step 1: Write failing tests**

Write to `~/Projects/finance-v2/lib/rules/find-matches.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findMatchingUncategorisedTxns } from "./find-matches";
import type { RuleMatch } from "./types";

// Build a minimal fake supabase client matching the chained shape used by the helper.
function fakeSupabase(rows: any[]) {
  const calls: any[] = [];
  const builder: any = {
    _rows: rows,
    select(_cols: string) {
      calls.push({ method: "select", args: [_cols] });
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.push({ method: "eq", args: [col, val] });
      builder._rows = builder._rows.filter((r: any) => r[col] === val);
      return builder;
    },
    is(col: string, val: unknown) {
      calls.push({ method: "is", args: [col, val] });
      builder._rows = builder._rows.filter((r: any) => r[col] === val);
      return builder;
    },
    ilike(col: string, pattern: string) {
      calls.push({ method: "ilike", args: [col, pattern] });
      const inner = pattern.slice(1, -1).toLowerCase(); // strip surrounding %
      builder._rows = builder._rows.filter((r: any) =>
        ((r[col] ?? "") as string).toLowerCase().includes(inner)
      );
      return builder;
    },
    gte(col: string, val: number) {
      calls.push({ method: "gte", args: [col, val] });
      builder._rows = builder._rows.filter((r: any) => r[col] >= val);
      return builder;
    },
    lte(col: string, val: number) {
      calls.push({ method: "lte", args: [col, val] });
      builder._rows = builder._rows.filter((r: any) => r[col] <= val);
      return builder;
    },
    order(col: string, opts: { ascending: boolean }) {
      calls.push({ method: "order", args: [col, opts] });
      builder._rows = [...builder._rows].sort((a: any, b: any) => {
        const av = a[col];
        const bv = b[col];
        return opts.ascending ? (av < bv ? -1 : av > bv ? 1 : 0) : av < bv ? 1 : av > bv ? -1 : 0;
      });
      return Promise.resolve({ data: builder._rows, error: null });
    },
  };
  const sb: any = {
    from(_t: string) {
      calls.push({ method: "from", args: [_t] });
      return builder;
    },
    _calls: calls,
  };
  return sb;
}

const HHID = "hh-1";
const ROWS = [
  { id: "t1", household_id: HHID, posted_at: "2026-04-25", amount: -42, account_id: "a1", category_id: null, merchant_raw: "PAK N SAVE WAIRAU", merchant_clean: null, description: null },
  { id: "t2", household_id: HHID, posted_at: "2026-04-26", amount: -5,  account_id: "a1", category_id: null, merchant_raw: "DAIRY",            merchant_clean: null, description: null },
  { id: "t3", household_id: HHID, posted_at: "2026-04-27", amount: 1500,account_id: "a2", category_id: null, merchant_raw: "PAYDAY",           merchant_clean: null, description: null },
  { id: "t4", household_id: HHID, posted_at: "2026-04-20", amount: -350,account_id: "a1", category_id: "cat-x", merchant_raw: "MITRE 10",      merchant_clean: null, description: null },
];
const EMPTY: RuleMatch = { merchant_keyword: null, amount_min: null, amount_max: null, account_id: null };

describe("findMatchingUncategorisedTxns", () => {
  it("returns all uncategorised txns when match is empty", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, EMPTY);
    expect(res.map((r) => r.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("filters by keyword (case-insensitive substring)", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, { ...EMPTY, merchant_keyword: "pak n save" });
    expect(res.map((r) => r.id)).toEqual(["t1"]);
  });

  it("escapes LIKE metacharacters in keyword", async () => {
    const sb = fakeSupabase(ROWS);
    await findMatchingUncategorisedTxns(sb, HHID, { ...EMPTY, merchant_keyword: "20%" });
    const ilike = sb._calls.find((c: any) => c.method === "ilike");
    expect(ilike.args[1]).toBe("%20\\%%");
  });

  it("filters by amount_min (inclusive)", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, { ...EMPTY, amount_min: 1000 });
    expect(res.map((r) => r.id)).toEqual(["t3"]);
  });

  it("filters by amount_max (inclusive)", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, { ...EMPTY, amount_max: -10 });
    expect(res.map((r) => r.id).sort()).toEqual(["t1"]);
  });

  it("filters by account_id", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, { ...EMPTY, account_id: "a2" });
    expect(res.map((r) => r.id)).toEqual(["t3"]);
  });

  it("composes multiple filters", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, { merchant_keyword: "pak", amount_max: -10, amount_min: null, account_id: "a1" });
    expect(res.map((r) => r.id)).toEqual(["t1"]);
  });

  it("orders results by posted_at desc", async () => {
    const sb = fakeSupabase(ROWS);
    await findMatchingUncategorisedTxns(sb, HHID, EMPTY);
    const order = sb._calls.find((c: any) => c.method === "order");
    expect(order).toBeTruthy();
    expect(order.args).toEqual(["posted_at", { ascending: false }]);
  });

  it("treats empty-string keyword as 'no keyword' (engine-aligned)", async () => {
    const sb = fakeSupabase(ROWS);
    const res = await findMatchingUncategorisedTxns(sb, HHID, { ...EMPTY, merchant_keyword: "" });
    expect(res.map((r) => r.id).sort()).toEqual(["t1", "t2", "t3"]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/rules/find-matches
```

Expected: fail with `Failed to resolve import "./find-matches"`.

- [ ] **Step 3: Implement `lib/rules/find-matches.ts`**

```ts
import type { RuleMatch } from "./types";

// Mirrors the in-memory engine in lib/rules/apply.ts:
//   - case-insensitive substring keyword (LIKE metacharacters escaped)
//   - inclusive amount bounds
//   - exact account_id match
//   - only uncategorised txns
// If apply.ts changes, update this helper to match.
export type MatchedTxn = {
  id: string;
  posted_at: string;
  amount: number;
  merchant_raw: string | null;
  merchant_clean: string | null;
  description: string | null;
  category_id: string | null;
};

export async function findMatchingUncategorisedTxns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  householdId: string,
  match: RuleMatch
): Promise<MatchedTxn[]> {
  let q = supabase
    .from("transactions")
    .select("id,posted_at,amount,merchant_raw,merchant_clean,description,category_id")
    .eq("household_id", householdId)
    .is("category_id", null);

  // Keyword: explicit null/undefined check (truthy would falsely accept "" and skip filter — engine treats null as "no keyword" but "" as "match all" via String.includes; here we align to null = skip).
  if (match.merchant_keyword !== null && match.merchant_keyword !== undefined && match.merchant_keyword !== "") {
    // Escape LIKE metacharacters: %, _, and \ itself.
    const safe = match.merchant_keyword.replace(/[%_\\]/g, "\\$&");
    q = q.ilike("merchant_raw", `%${safe}%`);
  }
  if (match.amount_min !== null && match.amount_min !== undefined) {
    q = q.gte("amount", match.amount_min);
  }
  if (match.amount_max !== null && match.amount_max !== undefined) {
    q = q.lte("amount", match.amount_max);
  }
  if (match.account_id !== null && match.account_id !== undefined && match.account_id !== "") {
    q = q.eq("account_id", match.account_id);
  }

  const { data, error } = await q.order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MatchedTxn[];
}
```

- [ ] **Step 4: Run, confirm green**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/rules/find-matches
```

Expected: 9 passed.

- [ ] **Step 5: Full suite + tsc**

```bash
cd ~/Projects/finance-v2 && npx vitest run && npx tsc --noEmit
```

Expected: 36 passed (27 prior + 9 new), tsc clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/rules/find-matches.ts lib/rules/find-matches.test.ts && \
  git commit -m "feat(rules): extract findMatchingUncategorisedTxns helper"
```

---

## Task 4: Refactor `POST /api/rules` to use the helper

**Files:**

- Modify: `~/Projects/finance-v2/app/api/rules/route.ts`

Drop the inline match-query block; call `findMatchingUncategorisedTxns` instead. The existing 401 test should still pass — no test changes needed.

- [ ] **Step 1: Modify `route.ts`**

Read `~/Projects/finance-v2/app/api/rules/route.ts` first. Replace the inline query (the block from `let q = supabase.from("transactions")...` through the `matchErr` 500 return) with a single helper call.

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RuleMatch, RuleAction } from "@/lib/rules/types";
import { findMatchingUncategorisedTxns } from "@/lib/rules/find-matches";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { match: RuleMatch; actions: RuleAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.match || !body?.actions) {
    return NextResponse.json({ error: "match and actions required" }, { status: 400 });
  }

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) {
    return NextResponse.json({ error: "household not found" }, { status: 500 });
  }

  const { data: rule, error: insErr } = await supabase
    .from("rules")
    .insert({ household_id: hh.id, match: body.match, actions: body.actions })
    .select("id,match,actions")
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  let matches: Awaited<ReturnType<typeof findMatchingUncategorisedTxns>>;
  try {
    matches = await findMatchingUncategorisedTxns(supabase, hh.id, body.match);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "match query failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ rule, matchingTransactions: matches });
}
```

- [ ] **Step 2: Run existing tests**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules
```

Expected: all existing app/api/rules tests still pass.

- [ ] **Step 3: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/api/rules/route.ts && \
  git commit -m "refactor(rules): /api/rules POST uses findMatches helper"
```

---

## Task 5: `POST /api/rules/[id]/preview` route (TDD)

**Files:**

- Create: `~/Projects/finance-v2/app/api/rules/[id]/preview/route.ts`
- Create: `~/Projects/finance-v2/app/api/rules/[id]/preview/route.test.ts`

Powers the Re-run flow. Loads the rule, runs `findMatchingUncategorisedTxns`, returns matches. No DB mutations.

- [ ] **Step 1: Write the 401 + 404 tests**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { POST } from "./route";

describe("POST /api/rules/[id]/preview", () => {
  it("returns 401 when not signed in", async () => {
    const req = new Request("http://localhost/api/rules/abc/preview", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });
});
```

(404 test added in Step 4 with mocking shape that exercises a signed-in branch — keeping Step 1 minimal so the failing-test step is fast.)

- [ ] **Step 2: Run, confirm fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules/\[id\]/preview
```

Expected: `Failed to resolve import "./route"`.

- [ ] **Step 3: Implement `route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findMatchingUncategorisedTxns } from "@/lib/rules/find-matches";
import type { RuleMatch } from "@/lib/rules/types";

type Params = { id: string };

export async function POST(
  _request: Request,
  ctx: { params: Promise<Params> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: ruleId } = await ctx.params;

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) {
    return NextResponse.json({ error: "household not found" }, { status: 500 });
  }

  const { data: rule, error: ruleErr } = await supabase
    .from("rules")
    .select("id,match")
    .eq("id", ruleId)
    .eq("household_id", hh.id)
    .maybeSingle();
  if (ruleErr || !rule) {
    return NextResponse.json({ error: "rule not found" }, { status: 404 });
  }

  try {
    const matches = await findMatchingUncategorisedTxns(
      supabase,
      hh.id,
      rule.match as RuleMatch
    );
    return NextResponse.json({ matchingTransactions: matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "match query failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules/\[id\]/preview
```

Expected: 1 passed (the 401 test).

- [ ] **Step 5: Full suite + tsc**

```bash
cd ~/Projects/finance-v2 && npx vitest run && npx tsc --noEmit
```

Expected: 37 passed, tsc clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/api/rules/\[id\]/preview/ && \
  git commit -m "feat(rules): /api/rules/[id]/preview returns matching uncategorised txns"
```

---

## Task 6: PATCH + DELETE handlers in `/api/rules/[id]/route.ts` (TDD)

**Files:**

- Create: `~/Projects/finance-v2/app/api/rules/[id]/route.ts`
- Create: `~/Projects/finance-v2/app/api/rules/[id]/route.test.ts`

Two HTTP verbs in one route file (Next.js App Router pattern). Both auth-gated, scoped to the household.

- [ ] **Step 1: Write the 401 tests for both verbs**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { PATCH, DELETE } from "./route";

describe("PATCH /api/rules/[id]", () => {
  it("returns 401 when not signed in", async () => {
    const req = new Request("http://localhost/api/rules/abc", {
      method: "PATCH",
      body: JSON.stringify({
        match: { merchant_keyword: "X", amount_min: null, amount_max: null, account_id: null },
        actions: { set_category_id: "c", add_labels: [] },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/rules/[id]", () => {
  it("returns 401 when not signed in", async () => {
    const req = new Request("http://localhost/api/rules/abc", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules/\[id\]/route
```

Expected: `Failed to resolve import "./route"`.

- [ ] **Step 3: Implement `route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RuleMatch, RuleAction } from "@/lib/rules/types";

type Params = { id: string };

async function authedAndScoped(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { kind: "unauth" as const };
  }

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) {
    return { kind: "no-household" as const };
  }

  return { kind: "ok" as const, supabase, household_id: hh.id };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<Params> }
) {
  const auth = await authedAndScoped(request);
  if (auth.kind === "unauth") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (auth.kind === "no-household") {
    return NextResponse.json({ error: "household not found" }, { status: 500 });
  }
  const { supabase, household_id } = auth;
  const { id: ruleId } = await ctx.params;

  let body: { match: RuleMatch; actions: RuleAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.match || !body?.actions) {
    return NextResponse.json({ error: "match and actions required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("rules")
    .select("id")
    .eq("id", ruleId)
    .eq("household_id", household_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "rule not found" }, { status: 404 });
  }

  const { data: rule, error: updErr } = await supabase
    .from("rules")
    .update({ match: body.match, actions: body.actions })
    .eq("id", ruleId)
    .eq("household_id", household_id)
    .select("id,match,actions")
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ rule });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<Params> }
) {
  const auth = await authedAndScoped(_request);
  if (auth.kind === "unauth") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (auth.kind === "no-household") {
    return NextResponse.json({ error: "household not found" }, { status: 500 });
  }
  const { supabase, household_id } = auth;
  const { id: ruleId } = await ctx.params;

  const { data: existing } = await supabase
    .from("rules")
    .select("id")
    .eq("id", ruleId)
    .eq("household_id", household_id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "rule not found" }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from("rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", household_id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules/\[id\]/route
```

Expected: 2 passed.

- [ ] **Step 5: Full suite + tsc**

```bash
cd ~/Projects/finance-v2 && npx vitest run && npx tsc --noEmit
```

Expected: 39 passed (37 + 2 new), tsc clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/api/rules/\[id\]/route.ts app/api/rules/\[id\]/route.test.ts && \
  git commit -m "feat(rules): PATCH+DELETE /api/rules/[id]"
```

---

## Task 7: Rule sentence formatter (TDD)

**Files:**

- Create: `~/Projects/finance-v2/lib/rules/format.ts`
- Create: `~/Projects/finance-v2/lib/rules/format.test.ts`

Pure helpers that turn a rule's `match` + `actions` + name lookups into the English sentence the list page renders, plus a relative-time helper for `created_at`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { formatRuleSentence, formatRelativeTime } from "./format";
import type { RuleMatch, RuleAction } from "./types";

const ACCOUNTS = new Map([
  ["a1", "ANZ Cheque"],
  ["a2", "Kiwibank Savings"],
]);
const CATEGORIES = new Map([
  ["c1", "Groceries"],
  ["c2", "Income"],
]);

describe("formatRuleSentence", () => {
  it("renders keyword-only rule", () => {
    const m: RuleMatch = { merchant_keyword: "PAK N SAVE", amount_min: null, amount_max: null, account_id: null };
    const a: RuleAction = { set_category_id: "c1", add_labels: [] };
    expect(formatRuleSentence(m, a, ACCOUNTS, CATEGORIES)).toBe(
      'When merchant contains "PAK N SAVE" → Groceries'
    );
  });

  it("renders account + amount_min rule", () => {
    const m: RuleMatch = { merchant_keyword: null, amount_min: 1000, amount_max: null, account_id: "a1" };
    const a: RuleAction = { set_category_id: "c2", add_labels: [] };
    expect(formatRuleSentence(m, a, ACCOUNTS, CATEGORIES)).toBe(
      "When account is ANZ Cheque and amount ≥ $1000 → Income"
    );
  });

  it("renders amount_max as a negative outflow threshold", () => {
    const m: RuleMatch = { merchant_keyword: null, amount_min: null, amount_max: -200, account_id: null };
    const a: RuleAction = { set_category_id: "c1", add_labels: [] };
    expect(formatRuleSentence(m, a, ACCOUNTS, CATEGORIES)).toBe(
      "When amount ≤ -$200 → Groceries"
    );
  });

  it("falls back to 'When any transaction' for all-null match", () => {
    const m: RuleMatch = { merchant_keyword: null, amount_min: null, amount_max: null, account_id: null };
    const a: RuleAction = { set_category_id: "c1", add_labels: [] };
    expect(formatRuleSentence(m, a, ACCOUNTS, CATEGORIES)).toBe(
      "When any transaction → Groceries"
    );
  });

  it("uses fallback strings for unknown account / category ids", () => {
    const m: RuleMatch = { merchant_keyword: null, amount_min: null, amount_max: null, account_id: "missing-acc" };
    const a: RuleAction = { set_category_id: "missing-cat", add_labels: [] };
    expect(formatRuleSentence(m, a, ACCOUNTS, CATEGORIES)).toBe(
      "When account is unknown account → unknown category"
    );
  });

  it("handles null set_category_id (engine-allowed but rare in UI)", () => {
    const m: RuleMatch = { merchant_keyword: "X", amount_min: null, amount_max: null, account_id: null };
    const a: RuleAction = { set_category_id: null, add_labels: [] };
    expect(formatRuleSentence(m, a, ACCOUNTS, CATEGORIES)).toBe(
      'When merchant contains "X" → (no category)'
    );
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-04-30T12:00:00Z").getTime();
  it("returns 'just now' under 60s", () => {
    expect(formatRelativeTime(new Date(now - 30_000).toISOString(), now)).toBe("just now");
  });
  it("returns minutes for < 1h", () => {
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5 minutes ago");
    expect(formatRelativeTime(new Date(now - 60_000).toISOString(), now)).toBe("1 minute ago");
  });
  it("returns hours for < 24h", () => {
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3 hours ago");
  });
  it("returns days for < 30d", () => {
    expect(formatRelativeTime(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2 days ago");
  });
  it("returns months for >= 30d", () => {
    expect(formatRelativeTime(new Date(now - 90 * 86_400_000).toISOString(), now)).toBe("3 months ago");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/rules/format
```

- [ ] **Step 3: Implement `lib/rules/format.ts`**

```ts
import type { RuleMatch, RuleAction } from "./types";

export function formatRuleSentence(
  match: RuleMatch,
  actions: RuleAction,
  accounts: Map<string, string>,
  categories: Map<string, string>
): string {
  const clauses: string[] = [];
  if (match.merchant_keyword !== null && match.merchant_keyword !== undefined && match.merchant_keyword !== "") {
    clauses.push(`merchant contains "${match.merchant_keyword}"`);
  }
  if (match.account_id !== null && match.account_id !== undefined && match.account_id !== "") {
    clauses.push(`account is ${accounts.get(match.account_id) ?? "unknown account"}`);
  }
  if (match.amount_min !== null && match.amount_min !== undefined) {
    clauses.push(`amount ≥ ${formatMoney(match.amount_min)}`);
  }
  if (match.amount_max !== null && match.amount_max !== undefined) {
    clauses.push(`amount ≤ ${formatMoney(match.amount_max)}`);
  }

  const condition = clauses.length === 0 ? "any transaction" : clauses.join(" and ");
  const target = actions.set_category_id
    ? (categories.get(actions.set_category_id) ?? "unknown category")
    : "(no category)";

  return `When ${condition} → ${target}`;
}

function formatMoney(n: number): string {
  if (n < 0) return `-$${Math.abs(n)}`;
  return `$${n}`;
}

export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, nowMs - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${day === 1 ? "day" : "days"} ago`;
  const mo = Math.floor(day / 30);
  return `${mo} ${mo === 1 ? "month" : "months"} ago`;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/rules/format
```

Expected: 11 passed.

- [ ] **Step 5: Full suite + tsc**

Expected: 50 passed, tsc clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/rules/format.ts lib/rules/format.test.ts && \
  git commit -m "feat(rules): sentence + relative-time formatters"
```

---

## Task 8: `/settings/layout.tsx` shell

**Files:**

- Create: `~/Projects/finance-v2/app/settings/layout.tsx`

Minimal settings shell. Holds a heading region and renders `{children}`. First occupant of `/settings/*`. Auth check happens in the page itself (server component pattern), not the layout, since layout components can't easily redirect.

- [ ] **Step 1: Create the layout**

```tsx
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>
      {children}
    </main>
  );
}
```

- [ ] **Step 2: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/settings/layout.tsx && \
  git commit -m "feat(settings): /settings layout shell"
```

---

## Task 9: `/settings/rules/page.tsx` server component (read-only list)

**Files:**

- Create: `~/Projects/finance-v2/app/settings/rules/page.tsx`

Server component: auth-gate, fetch rules + accounts + categories, build name maps, render via the (yet-to-be-written) `RulesList` client component. For this task render rules as plain text without action buttons — `RulesList` adds interactivity in Task 10.

**UI gate:** invoke `ui-stack` and `awesome-design` skills before writing markup. Apply spacing / table conventions / dark-mode tokens to the heading and empty-state regions consistently with `/transactions/page.tsx`.

- [ ] **Step 1: Invoke `ui-stack` and `awesome-design`**

- [ ] **Step 2: Create the page**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { RuleMatch, RuleAction } from "@/lib/rules/types";
import { RulesList } from "./rules-list";

export default async function RulesSettingsPage() {
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
      <div className="text-sm text-muted-foreground">
        No household. Sign in again or contact support.
      </div>
    );
  }

  const [{ data: rulesData }, { data: accountsData }, { data: categoriesData }] =
    await Promise.all([
      supabase
        .from("rules")
        .select("id, match, actions, created_at")
        .eq("household_id", hh.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("accounts")
        .select("id, name")
        .eq("household_id", hh.id),
      supabase
        .from("categories")
        .select("id, name, type")
        .order("type")
        .order("name"),
    ]);

  type RuleRow = {
    id: string;
    match: RuleMatch;
    actions: RuleAction;
    created_at: string;
  };
  const rules = (rulesData ?? []) as RuleRow[];
  const accounts = new Map(
    (accountsData ?? []).map((a) => [a.id as string, a.name as string])
  );
  const categories = new Map(
    (categoriesData ?? []).map((c) => [c.id as string, c.name as string])
  );
  const categoryList = (categoriesData ?? []) as Array<{ id: string; name: string; type: string }>;
  const accountList = (accountsData ?? []) as Array<{ id: string; name: string }>;

  if (rules.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-background p-8 text-center">
        <h2 className="text-lg font-medium mb-2">No rules yet</h2>
        <p className="text-sm text-muted-foreground">
          Create one with{" "}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">+ rule</code>{" "}
          next to any uncategorised transaction on the{" "}
          <Link href="/transactions" className="underline">
            Transactions page
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-medium mb-4">Rules ({rules.length})</h2>
      <RulesList
        initialRules={rules}
        accountsMap={Array.from(accounts.entries())}
        categoriesMap={Array.from(categories.entries())}
        categoryList={categoryList}
        accountList={accountList}
      />
    </section>
  );
}
```

- [ ] **Step 3: Smoke test (will fail — RulesList doesn't exist yet)**

This is expected. Confirm the only TS error is the missing `./rules-list` import.

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit 2>&1 | head -10
```

Expected: error pointing at `./rules-list`. **Do not commit yet** — Task 10 ships `rules-list.tsx` and they go in together.

---

## Task 10: `RulesList` client component with optimistic-undo delete

**Files:**

- Create: `~/Projects/finance-v2/app/settings/rules/rules-list.tsx`

Interactive list with three row actions: Edit / Re-run / Delete. Edit and Re-run mount their respective modals (Tasks 11–12). Delete is the optimistic-undo flow described in the spec.

**UI gate:** apply skill outputs from Task 9.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { RuleMatch, RuleAction } from "@/lib/rules/types";
import { formatRuleSentence, formatRelativeTime } from "@/lib/rules/format";
import { EditRuleModal } from "./edit-rule-modal";
import { MakeRuleModal } from "@/app/transactions/make-rule-modal";

const UNDO_MS = 8000;

export type RuleRow = {
  id: string;
  match: RuleMatch;
  actions: RuleAction;
  created_at: string;
};

export function RulesList(props: {
  initialRules: RuleRow[];
  accountsMap: Array<[string, string]>;
  categoriesMap: Array<[string, string]>;
  categoryList: Array<{ id: string; name: string; type: string }>;
  accountList: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleRow[]>(props.initialRules);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [rerunning, setRerunning] = useState<RuleRow | null>(null);
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingRules = useRef<Map<string, RuleRow>>(new Map());

  const accounts = new Map(props.accountsMap);
  const categories = new Map(props.categoriesMap);

  // Cleanup: fire pending deletes on unmount.
  useEffect(() => {
    const timers = pendingTimers.current;
    const pending = pendingRules.current;
    return () => {
      for (const [id, timer] of timers.entries()) {
        clearTimeout(timer);
        // Fire the delete now so it doesn't get lost.
        void fetch(`/api/rules/${id}`, { method: "DELETE" });
      }
      timers.clear();
      pending.clear();
    };
  }, []);

  function handleDelete(rule: RuleRow) {
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    pendingRules.current.set(rule.id, rule);

    const timer = setTimeout(async () => {
      pendingTimers.current.delete(rule.id);
      pendingRules.current.delete(rule.id);
      try {
        const res = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Restore + error toast
        setRules((prev) => [rule, ...prev].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        ));
        toast.error("Couldn't delete rule. Restored.");
      }
    }, UNDO_MS);
    pendingTimers.current.set(rule.id, timer);

    toast("Rule deleted.", {
      action: {
        label: "Undo",
        onClick: () => {
          const t = pendingTimers.current.get(rule.id);
          if (t) clearTimeout(t);
          pendingTimers.current.delete(rule.id);
          pendingRules.current.delete(rule.id);
          setRules((prev) => [rule, ...prev].sort((a, b) =>
            a.created_at < b.created_at ? 1 : -1
          ));
        },
      },
      duration: UNDO_MS,
    });
  }

  return (
    <>
      <ul className="divide-y divide-border border border-border rounded-lg bg-background">
        {rules.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-4 p-4"
            data-testid={`rule-${r.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                {formatRuleSentence(r.match, r.actions, accounts, categories)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatRelativeTime(r.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(r)}
                data-testid={`edit-${r.id}`}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRerunning(r)}
                data-testid={`rerun-${r.id}`}
              >
                Re-run
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(r)}
                data-testid={`delete-${r.id}`}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <EditRuleModal
          rule={editing}
          accounts={props.accountList}
          categories={props.categoryList}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {rerunning && (
        <MakeRuleModal
          mode="rerun"
          rerunRuleId={rerunning.id}
          categories={props.categoryList}
          onClose={() => setRerunning(null)}
        />
      )}
    </>
  );
}
```

The `MakeRuleModal` props above (`mode`, `rerunRuleId`) are added in Task 12. TS will fail until Task 12 lands; that is expected.

- [ ] **Step 2: Defer commit**

Tasks 9, 10, 11, 12 are tightly coupled — `tsc --noEmit` won't pass cleanly until all four are in. Continue to Task 11.

---

## Task 11: `EditRuleModal` component

**Files:**

- Create: `~/Projects/finance-v2/app/settings/rules/edit-rule-modal.tsx`

Single-phase form modal. Pre-fills from the rule, submits PATCH on Save, closes on success.

**UI gate:** apply Task 9 skill outputs. The modal styling mirrors `make-rule-modal.tsx` (Stripe-style elevation, ESC-to-close, role="dialog" on the inner panel — note: the existing make-rule-modal has known a11y issues that the Phase 3b cleanup PR addresses; build EditRuleModal with the corrected pattern from the start: `role="dialog"` on the inner panel, `aria-labelledby` referencing the heading id).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RuleMatch, RuleAction } from "@/lib/rules/types";
import type { RuleRow } from "./rules-list";

export function EditRuleModal(props: {
  rule: RuleRow;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; type: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [keyword, setKeyword] = useState(props.rule.match.merchant_keyword ?? "");
  const [amountMin, setAmountMin] = useState(
    props.rule.match.amount_min === null ? "" : String(props.rule.match.amount_min)
  );
  const [amountMax, setAmountMax] = useState(
    props.rule.match.amount_max === null ? "" : String(props.rule.match.amount_max)
  );
  const [accountId, setAccountId] = useState(props.rule.match.account_id ?? "");
  const [categoryId, setCategoryId] = useState(props.rule.actions.set_category_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC closes modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    const match: RuleMatch = {
      merchant_keyword: keyword === "" ? null : keyword,
      amount_min: amountMin === "" ? null : Number(amountMin),
      amount_max: amountMax === "" ? null : Number(amountMax),
      account_id: accountId === "" ? null : accountId,
    };
    const actions: RuleAction = {
      set_category_id: categoryId === "" ? null : categoryId,
      add_labels: props.rule.actions.add_labels ?? [],
    };
    try {
      const res = await fetch(`/api/rules/${props.rule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ match, actions }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const TITLE_ID = "edit-rule-modal-title";

  return (
    <div
      className="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-50"
      onClick={props.onClose}
      data-testid="edit-rule-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="bg-background border border-border rounded-lg p-6 max-w-md w-full"
        style={{
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={TITLE_ID} className="text-lg font-semibold mb-4">
          Edit rule
        </h2>

        <label className="block text-sm mb-3">
          Merchant keyword
          <input
            className="block mt-1 w-full border rounded px-2 py-1 bg-background"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="(blank = no keyword)"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block text-sm">
            Amount min
            <input
              type="number"
              step="0.01"
              className="block mt-1 w-full border rounded px-2 py-1 bg-background"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="(blank = none)"
            />
          </label>
          <label className="block text-sm">
            Amount max
            <input
              type="number"
              step="0.01"
              className="block mt-1 w-full border rounded px-2 py-1 bg-background"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="(blank = none)"
            />
          </label>
        </div>

        <label className="block text-sm mb-3">
          Account
          <select
            className="block mt-1 w-full border rounded px-2 py-1 bg-background"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Any account</option>
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm mb-3">
          Set category
          <select
            className="block mt-1 w-full border rounded px-2 py-1 bg-background"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">(no category)</option>
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Defer commit**

Continue to Task 12.

---

## Task 12: Extend `make-rule-modal.tsx` with `mode` prop for Re-run

**Files:**

- Modify: `~/Projects/finance-v2/app/transactions/make-rule-modal.tsx`

Add a `mode: "create" | "rerun"` prop. In `"rerun"` mode skip the create-phase JSX, fetch matches via `/api/rules/[id]/preview`, and start at the confirm phase. Apply uses the existing `/api/rules/[id]/apply` route.

- [ ] **Step 1: Modify the modal**

Read `~/Projects/finance-v2/app/transactions/make-rule-modal.tsx` end-to-end first. Then change the props type and the initial-state logic to accept either form:

The new props shape becomes a discriminated union:

```ts
type MakeRuleModalProps =
  | {
      mode?: "create";
      txn: Txn;
      categories: Category[];
      onClose: () => void;
    }
  | {
      mode: "rerun";
      rerunRuleId: string;
      categories: Category[];
      onClose: () => void;
    };
```

Update the component to destructure `props` based on `props.mode`:

- In `"create"` mode (default), behaviour is unchanged.
- In `"rerun"` mode:
  - Skip `props.txn` (not provided).
  - On mount, fetch `POST /api/rules/${props.rerunRuleId}/preview`. Store matches. Default `selected = Set` of all match IDs. Set `phase = "confirm"`.
  - Skip the `create` phase JSX entirely.
  - `applyToSelected` uses `props.rerunRuleId` (not the create-time `ruleId` state).

Concretely, replace the existing single-shape `props` typing and the `createRule` logic. Keep the existing create-flow code untouched. Add a `useEffect` that fires the preview fetch on mount in rerun mode:

```tsx
useEffect(() => {
  if (props.mode !== "rerun") return;
  let cancelled = false;
  (async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rules/${props.rerunRuleId}/preview`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (cancelled) return;
      const ms: Match[] = body.matchingTransactions ?? [];
      setMatches(ms);
      setSelected(new Set(ms.map((m) => m.id)));
      setPhase("confirm");
    } catch (e) {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      if (!cancelled) setBusy(false);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [props]);
```

In `applyToSelected`, the URL should resolve from either source:

```ts
const ruleIdForApply = props.mode === "rerun" ? props.rerunRuleId : ruleId;
if (!ruleIdForApply) return;
const res = await fetch(`/api/rules/${ruleIdForApply}/apply`, { /* ... */ });
```

Don't render the `create` phase JSX (the category dropdown, scope radio, Next button) when `mode === "rerun"` — only render the `confirm` and `done` phases.

Adjust the merchantText derivation so it doesn't crash when `props.txn` is absent:

```ts
const merchantText =
  props.mode === "rerun"
    ? "" // unused in rerun mode
    : props.txn.merchant_clean ?? props.txn.merchant_raw ?? props.txn.description ?? "—";
```

- [ ] **Step 2: TS clean across the new + modified files (Tasks 9–12 together)**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

Expected: clean. If errors remain, they should be limited to the four files added/modified in Tasks 9–12 — fix them before proceeding.

- [ ] **Step 3: Existing modal callers shouldn't break**

The existing call site is `app/transactions/make-rule-button.tsx`:

```tsx
<MakeRuleModal
  txn={props.txn}
  categories={props.categories}
  onClose={() => setOpen(false)}
/>
```

Without `mode`, this should default to `"create"` — verify the discriminated union allows omitting `mode` only when `txn` is provided. If TypeScript complains, update the call site to add `mode="create"` explicitly.

- [ ] **Step 4: Full vitest + tsc**

```bash
cd ~/Projects/finance-v2 && npx vitest run && npx tsc --noEmit
```

Expected: 50 still pass (no new tests for UI; existing ones not affected), tsc clean.

- [ ] **Step 5: Smoke test**

```bash
cd ~/Projects/finance-v2 && (timeout 25 npm run dev > /tmp/task12.log 2>&1 &) && sleep 8 && \
  curl -s -o /dev/null -w "/transactions: %{http_code}\n/settings/rules: %{http_code}\n" \
    http://localhost:3000/transactions \
    http://localhost:3000/settings/rules; \
  pkill -f "next dev"
```

Expected: both 307 (unauth redirect — proves both pages load).

- [ ] **Step 6: Commit (the four-file batch from Tasks 9–12)**

```bash
cd ~/Projects/finance-v2 && \
  git add app/settings/rules/page.tsx \
          app/settings/rules/rules-list.tsx \
          app/settings/rules/edit-rule-modal.tsx \
          app/transactions/make-rule-modal.tsx \
          app/transactions/make-rule-button.tsx && \
  git commit -m "feat(rules): /settings/rules CRUD page with edit + rerun + delete-undo"
```

(Stage `make-rule-button.tsx` only if you had to modify it for the discriminated-union typing in Step 3; otherwise omit.)

---

## Task 13: Deploy + manual end-to-end verify

**Files:** None.

- [ ] **Step 1: Push + deploy**

```bash
cd ~/Projects/finance-v2 && git push origin main && vercel --prod --yes
```

- [ ] **Step 2: Hit `/settings/rules` in prod**

- [ ] **Step 3: Verify the existing rules from Phase 3b's manual verify show in English-sentence form**

- [ ] **Step 4: Edit one rule's category. Save. Verify the list updates immediately. Verify in Supabase:**

```sql
SELECT id, actions FROM v2.rules WHERE id = '<id>';
```

`actions.set_category_id` should be the new id.

- [ ] **Step 5: Click Delete on a rule. Click Undo within 8s. Verify the row returns. Click Delete again. Wait > 8s.**

```sql
SELECT count(*) FROM v2.rules;
```

Count should drop by 1.

- [ ] **Step 6: Free up an uncategorised txn for the Re-run test:**

```sql
UPDATE v2.transactions SET category_id = NULL WHERE id IN (
  SELECT id FROM v2.transactions ORDER BY posted_at DESC LIMIT 1
);
```

Pick a rule whose match would catch that txn. Click Re-run. Confirm modal opens with the txn pre-checked. Click Apply. Verify the txn is now categorised.

- [ ] **Step 7: Top-nav check**

Confirm the "Rules" link appears in the top nav across `/dashboard`, `/transactions`, `/accounts`, `/settings/rules`. Confirm it does NOT appear on `/login`.

- [ ] **Step 8: Cron route smoke (regression check)**

```bash
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://finance-v2-five.vercel.app/api/cron/sync | head -c 200
```

Expected: `{"ok":true,...}`. Phase 3c shouldn't have touched the cron path; confirm regression-free.

---

## Task 14: Phase 3c complete marker

**Files:**

- Create: `~/Projects/finance-v2/docs/PHASE-3C-COMPLETE.md`

- [ ] **Step 1: Write the marker**

```markdown
# Phase 3c — Rules CRUD Page — Complete

**Date completed:** <YYYY-MM-DD>

## What ships

- `/settings/rules` page lists every rule in English-sentence form, ordered by created_at DESC.
- New top nav across the app (`components/top-nav.tsx`), with links to Dashboard / Transactions / Accounts / Rules. Hidden on `/login`.
- Edit a rule via inline modal — change keyword, amount range, account scope, target category. Saves via PATCH /api/rules/[id], list refreshes via router.refresh().
- Delete a rule with optimistic UI + sonner undo toast (8s window). Auto-fires DELETE /api/rules/[id] on timer expiry; cancelled on Undo. Pending deletes flush on unmount.
- Re-run a rule against currently uncategorised transactions: reuses the existing make-rule-modal's confirm phase via a new `mode: "rerun"` prop, fetching matches from POST /api/rules/[id]/preview.
- New API routes: PATCH /api/rules/[id], DELETE /api/rules/[id], POST /api/rules/[id]/preview.
- Refactor: DB-side match query extracted to `lib/rules/find-matches.ts` with corrected guard semantics (`!== null && !== undefined` instead of truthy; LIKE metacharacters escaped). `POST /api/rules` now calls the helper.
- New formatters: `lib/rules/format.ts` exports `formatRuleSentence` and `formatRelativeTime` for the list page.
- sonner installed and Toaster mounted in root layout.

## Verified by Sean

- [ ] /settings/rules renders existing rules in English form.
- [ ] Top nav shows the Rules link, hidden on /login.
- [ ] Edit a rule's category — list updates, DB reflects change.
- [ ] Delete + Undo restores the row.
- [ ] Delete + wait 8s — DB row gone.
- [ ] Re-run against an uncategorised txn — txn gets categorised.
- [ ] /api/cron/sync still returns 200 with auth (regression-free).

## Documented limitations / out-of-scope

- No rule precedence / priority UI (engine is first-match-wins).
- No bulk import/export of rules.
- No activity log / audit trail of rule edits.
- No rule duplication action.
- No search/filter on the rules list.
- No toggle enable/disable — hard-delete only. Soft-delete via `is_active` flag is deferred (would require a migration).
- No Re-run path for already-categorised transactions. The engine and the API only operate on uncategorised txns.
- The /settings/rules page itself isn't covered by vitest (server component + Supabase reads). Covered by manual smoke in Task 13. Playwright follow-up if E2E coverage is wanted.

## Phase 3b cleanup-PR coordination

The Phase 3b cleanup-PR (scheduled remote agent, 2026-05-06) tightens guard semantics in `app/api/rules/route.ts`. Phase 3c writes the corrected semantics into `lib/rules/find-matches.ts` from the start and refactors `route.ts` to call the helper. Whichever PR merges first, the resulting `route.ts` ends up at the same shape — the merge work is small.

## References

- Spec: `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-3c-rules-crud-design.md`
- Plan: `~/Projects/finance/docs/superpowers/plans/2026-04-30-phase-3c-rules-crud.md`
- Phase 3b completion: `docs/PHASE-3B-COMPLETE.md`
```

- [ ] **Step 2: Fill date, commit, push**

```bash
cd ~/Projects/finance-v2 && \
  sed -i "s/<YYYY-MM-DD>/$(date -u +%Y-%m-%d)/" docs/PHASE-3C-COMPLETE.md && \
  git add docs/PHASE-3C-COMPLETE.md && \
  git commit -m "docs: mark Phase 3c (rules CRUD) complete" && \
  git push origin main
```

---

## Self-review

**Spec coverage check (against design doc):**

- /settings/rules page + nav link → Tasks 2, 8, 9
- English-sentence list + relative-time → Task 7 (formatters), Task 9 (page)
- Empty state → Task 9
- Edit row action + EditRuleModal → Task 11, wired in Task 10
- Re-run row action + reuse make-rule-modal confirm phase via mode prop → Task 12, wired in Task 10
- Delete with optimistic + undo toast (sonner) → Task 1 (install), Task 10 (logic)
- PATCH + DELETE + Preview routes with auth + 404 → Tasks 5, 6
- find-matches helper extraction + corrected semantics → Tasks 3, 4
- TDD on routes + helpers → Tasks 3, 5, 6, 7
- Manual verify + completion marker → Tasks 13, 14

✓ Coverage complete.

**Out-of-scope items deferred (per spec):**

- Rule precedence/priority UI — not in plan ✓
- Bulk import/export — not in plan ✓
- Activity log — not in plan ✓
- Rule duplication — not in plan ✓
- Search/filter — not in plan ✓
- Toggle enable/disable — not in plan ✓
- Re-run on already-categorised txns — not in plan ✓

**Type consistency:**

- `RuleRow` shape declared in `rules-list.tsx`, exported, and imported by `EditRuleModal`. Same shape used by `page.tsx` (in-component type alias). All four uses match: `id, match, actions, created_at`.
- `RuleMatch` / `RuleAction` defined in `lib/rules/types.ts` (Phase 3b deliverable), consumed identically across Tasks 4, 5, 6, 7, 11, 12.
- `MatchedTxn` (Task 3) maps to the existing `Match` type in `make-rule-modal.tsx` — both use `{id, posted_at, amount, merchant_raw, merchant_clean, description}` plus `category_id` (engine-level). The modal's preview path consumes the route response and ignores extra fields.
- `MakeRuleModal` discriminated-union props (Task 12): `"create"` requires `txn`, `"rerun"` requires `rerunRuleId`. Both require `categories` and `onClose`.

**Placeholder scan:** The PHASE-3C-COMPLETE.md template has one `<YYYY-MM-DD>` placeholder, sed-replaced in Task 14 Step 2. Acceptable.

**Risk note:** The optimistic-undo unmount cleanup (Task 10) fires pending DELETEs as best-effort on `useEffect` teardown. If the user closes the browser tab during the 8-second window the request is lost and the rule remains. Acceptable for single-user low-frequency scale; flagged as "edge case accepted" in the spec.

**Risk note:** The MakeRuleModal discriminated union (Task 12) is the most type-fragile piece — TypeScript should enforce that `txn` is present in create mode and `rerunRuleId` in rerun mode. If the implementation drifts to optional-everywhere, the types regress to `any`-ish. Verify by looking at the call sites: both `make-rule-button.tsx` and `rules-list.tsx` should compile only with the correct prop subset.
