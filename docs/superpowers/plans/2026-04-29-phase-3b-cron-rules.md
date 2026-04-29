# Phase 3b — Vercel Cron + Rules Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily auto-sync via Vercel Cron + an auto-categorisation rules engine, including a "make rule from this transaction" UX with a retroactive-apply confirmation modal.

**Architecture:** A pure-function rules engine (`lib/rules/apply.ts`) that takes a transaction and a list of rules and returns the transaction with `category_id` and `labels` updated by the first matching rule. The engine is called from two places: `runSync` (after each new Akahu txn insert) and `/api/rules/[id]/apply` (when the user confirms retroactive application from the modal). A new `/api/cron/sync` route is the daily-Cron entrypoint, gated by a `CRON_SECRET` bearer token.

**Tech Stack:** Next.js 16.2 App Router, Vercel Cron Jobs, Supabase (`v2` schema), Vitest. UI components: shadcn `Button` + `Dialog` (or Base UI equivalent already installed via `@base-ui/react`).

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-29-phase-3b-cron-rules-design.md`

**Project notes (from `/home/seanm/Projects/finance-v2/AGENTS.md`):**
- This is Next.js 16. Read `node_modules/next/dist/docs/` before assuming familiar APIs.
- For UI work, invoke `ui-stack` first, then `awesome-design` before writing component markup.

---

## Task 1: Generate `CRON_SECRET` and add env vars

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/.env.example`

Manual logistics — short.

- [ ] **Step 1: Generate a strong random secret**

```bash
openssl rand -base64 32
```

Copy the output (e.g. `a/Bcd3F...===`).

- [ ] **Step 2: Add to local `.env.local`**

Append to `~/Projects/finance-v2/.env.local`:

```
CRON_SECRET=<paste output of openssl above>
```

- [ ] **Step 3: Add to Vercel Production**

```bash
cd ~/Projects/finance-v2 && \
  echo "<paste secret>" | vercel env add CRON_SECRET production
```

Confirm with `vercel env ls`.

- [ ] **Step 4: Document in `.env.example`**

Append to `~/Projects/finance-v2/.env.example`:

```
# Phase 3b — daily Cron auth (any long random string; rotate via openssl rand -base64 32)
CRON_SECRET=replace-with-strong-random-string
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add .env.example && \
  git commit -m "feat(cron): document CRON_SECRET env var"
```

---

## Task 2: Add `vercel.ts` declaring the daily cron

**Files:**
- Create: `/home/seanm/Projects/finance-v2/vercel.ts`

Per current Vercel guidance, `vercel.ts` is the recommended config format (replaces `vercel.json`). Install the config package first.

- [ ] **Step 1: Install `@vercel/config`**

```bash
cd ~/Projects/finance-v2 && npm install --save-dev @vercel/config
```

- [ ] **Step 2: Create `vercel.ts`**

Write to `~/Projects/finance-v2/vercel.ts`:

```ts
import type { VercelConfig } from "@vercel/config/v1";

// Cron schedule is in UTC.
// 0 18 * * * UTC = 06:00 NZST (UTC+12) / 07:00 NZDT (UTC+13).
// Daily Akahu sync (Phase 3b). Runs runSync over every household.
const config: VercelConfig = {
  crons: [
    {
      path: "/api/cron/sync",
      schedule: "0 18 * * *",
    },
  ],
};

export default config;
```

- [ ] **Step 3: TS compile check**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

Expected: clean. If `@vercel/config` doesn't export `VercelConfig` from the path used above, `import type { VercelConfig } from "@vercel/config";` is the fallback. Don't proceed if TS fails — the cron won't register.

- [ ] **Step 4: Commit (do not deploy yet — the route in Task 5 doesn't exist)**

```bash
cd ~/Projects/finance-v2 && \
  git add vercel.ts package.json package-lock.json && \
  git commit -m "feat(cron): vercel.ts with daily 06:00 NZ sync"
```

---

## Task 3: Rules engine types + `applyRules` function (TDD)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/lib/rules/types.ts`
- Create: `/home/seanm/Projects/finance-v2/lib/rules/apply.ts`
- Create: `/home/seanm/Projects/finance-v2/lib/rules/apply.test.ts`

A pure function. Easy to TDD.

- [ ] **Step 1: Write failing tests at `lib/rules/apply.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { applyRules } from "./apply";
import type { Rule } from "./types";

const RULE_GROCERIES: Rule = {
  id: "r-1",
  match: { merchant_keyword: "PAK N SAVE", amount_min: null, amount_max: null, account_id: null },
  actions: { set_category_id: "cat-groceries", add_labels: [] },
};
const RULE_BIG_SPEND: Rule = {
  id: "r-2",
  match: { merchant_keyword: null, amount_min: null, amount_max: -200, account_id: null },
  actions: { set_category_id: "cat-big-spend", add_labels: ["review"] },
};

function txn(overrides: Partial<{ id: string; merchant_clean: string | null; merchant_raw: string | null; description: string | null; amount: number; account_id: string; category_id: string | null; labels: string[] }>) {
  return {
    id: "t-1",
    merchant_clean: null,
    merchant_raw: null,
    description: null,
    amount: -10,
    account_id: "acc-1",
    category_id: null,
    labels: [],
    ...overrides,
  };
}

describe("applyRules", () => {
  it("returns the transaction unchanged when no rules match", () => {
    const t = txn({ merchant_clean: "WHATEVER", amount: -10 });
    const result = applyRules(t, [RULE_GROCERIES]);
    expect(result).toEqual(t);
  });

  it("matches merchant_keyword case-insensitively against merchant_clean", () => {
    const t = txn({ merchant_clean: "Pak N Save Wairau", amount: -42 });
    const result = applyRules(t, [RULE_GROCERIES]);
    expect(result.category_id).toBe("cat-groceries");
  });

  it("falls back to merchant_raw when merchant_clean is null", () => {
    const t = txn({ merchant_clean: null, merchant_raw: "PAK N SAVE WESTGATE", amount: -50 });
    const result = applyRules(t, [RULE_GROCERIES]);
    expect(result.category_id).toBe("cat-groceries");
  });

  it("falls back to description when both merchant fields are null", () => {
    const t = txn({ description: "card xxxx pak n save  ", amount: -5 });
    const result = applyRules(t, [RULE_GROCERIES]);
    expect(result.category_id).toBe("cat-groceries");
  });

  it("matches amount_max for outflow over a threshold (signed)", () => {
    const t = txn({ merchant_clean: "MITRE 10", amount: -350 });
    const result = applyRules(t, [RULE_BIG_SPEND]);
    expect(result.category_id).toBe("cat-big-spend");
    expect(result.labels).toContain("review");
  });

  it("does NOT match amount_max when txn is below threshold", () => {
    const t = txn({ merchant_clean: "MITRE 10", amount: -100 });
    const result = applyRules(t, [RULE_BIG_SPEND]);
    expect(result.category_id).toBeNull();
  });

  it("matches account_id when set", () => {
    const rule: Rule = {
      id: "r-3",
      match: { merchant_keyword: null, amount_min: null, amount_max: null, account_id: "acc-target" },
      actions: { set_category_id: "cat-x", add_labels: [] },
    };
    expect(applyRules(txn({ account_id: "acc-target" }), [rule]).category_id).toBe("cat-x");
    expect(applyRules(txn({ account_id: "acc-other" }), [rule]).category_id).toBeNull();
  });

  it("first matching rule wins (insert order)", () => {
    const t = txn({ merchant_clean: "PAK N SAVE", amount: -250 });
    expect(applyRules(t, [RULE_GROCERIES, RULE_BIG_SPEND]).category_id).toBe("cat-groceries");
    expect(applyRules(t, [RULE_BIG_SPEND, RULE_GROCERIES]).category_id).toBe("cat-big-spend");
  });

  it("de-duplicates labels", () => {
    const t = txn({ merchant_clean: "MITRE 10", amount: -350, labels: ["review", "tools"] });
    const result = applyRules(t, [RULE_BIG_SPEND]);
    expect(result.labels.sort()).toEqual(["review", "tools"]);
  });

  it("does not overwrite an existing category_id", () => {
    const t = txn({ merchant_clean: "PAK N SAVE", category_id: "cat-already-set" });
    const result = applyRules(t, [RULE_GROCERIES]);
    expect(result.category_id).toBe("cat-already-set");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/rules
```

Expected: fail, "Cannot find module './apply'".

- [ ] **Step 3: Implement `lib/rules/types.ts`**

```ts
export type RuleMatch = {
  merchant_keyword: string | null;
  amount_min: number | null;
  amount_max: number | null;
  account_id: string | null;
};

export type RuleAction = {
  set_category_id: string | null;
  add_labels: string[];
};

export type Rule = {
  id: string;
  match: RuleMatch;
  actions: RuleAction;
};

export type RuleApplicableTxn = {
  id: string;
  merchant_clean: string | null;
  merchant_raw: string | null;
  description: string | null;
  amount: number;
  account_id: string;
  category_id: string | null;
  labels: string[];
};
```

- [ ] **Step 4: Implement `lib/rules/apply.ts`**

```ts
import type { Rule, RuleApplicableTxn } from "./types";

export function applyRules<T extends RuleApplicableTxn>(txn: T, rules: Rule[]): T {
  // Don't overwrite an existing category.
  if (txn.category_id) return txn;

  const merchant = (txn.merchant_clean ?? txn.merchant_raw ?? txn.description ?? "").toLowerCase();

  for (const rule of rules) {
    if (matches(rule, merchant, txn)) {
      const labels = dedupe([...txn.labels, ...rule.actions.add_labels]);
      return {
        ...txn,
        category_id: rule.actions.set_category_id ?? txn.category_id,
        labels,
      };
    }
  }
  return txn;
}

function matches(rule: Rule, merchantLower: string, txn: RuleApplicableTxn): boolean {
  const m = rule.match;
  if (m.merchant_keyword !== null) {
    if (!merchantLower.includes(m.merchant_keyword.toLowerCase())) return false;
  }
  if (m.amount_min !== null && txn.amount < m.amount_min) return false;
  if (m.amount_max !== null && txn.amount > m.amount_max) return false;
  if (m.account_id !== null && txn.account_id !== m.account_id) return false;
  return true;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
```

Note on amount_max semantics: a rule with `amount_max: -200` triggers for any `amount <= -200` (i.e. outflows of $200 or more).
A rule with `amount_min: 1000` triggers for any `amount >= 1000` (inflows of $1000+).
Document this in the test comments where it's not obvious.

- [ ] **Step 5: Run, confirm pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/rules
```

Expected: 10 tests pass (or whatever count the test file ends up with — must all be green).

- [ ] **Step 6: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/rules/ && \
  git commit -m "feat(rules): rules engine with merchant/amount/account matching"
```

---

## Task 4: Wire rules engine into `runSync`

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/lib/bank-feed/sync.ts`
- Modify: `/home/seanm/Projects/finance-v2/lib/bank-feed/sync.test.ts`

After Akahu transactions are mapped to v2 row shape but BEFORE insert, run them through `applyRules` so they land already-categorised.

- [ ] **Step 1: Add a failing test to `sync.test.ts`**

Append to the existing `describe` block:

```ts
  it("applies matching rules to inserted transactions", async () => {
    const provider = fakeProvider({
      accounts: [
        { providerAccountId: "acc_111", name: "Linked", accountNumber: "38-9020-0211287-05", type: "CHECKING" },
      ],
      transactions: [
        { providerTransactionId: "tx_a", providerAccountId: "acc_111", postedAt: "2026-04-30", amount: -42.5, description: "PAK N SAVE WAIRAU", merchantClean: "Pak'nSave Wairau" },
      ],
    });
    const inserted: any[] = [];
    const sb: any = {
      from(tbl: string) {
        if (tbl === "bank_feed_state") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { cutover_date: "2026-04-30", last_synced_at: null }, error: null }) }) }) }),
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          };
        }
        if (tbl === "accounts") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "v2-acc-1", account_number: "38-9020-0211287-05", akahu_account_id: null }, error: null }) }) }) }),
            update: () => ({ eq: () => ({ error: null }) }),
          };
        }
        if (tbl === "rules") {
          return {
            select: () => ({ eq: async () => ({ data: [
              { id: "r-1", match: { merchant_keyword: "PAK N SAVE", amount_min: null, amount_max: null, account_id: null }, actions: { set_category_id: "cat-groc", add_labels: [] } },
            ], error: null }) }),
          };
        }
        if (tbl === "transactions") {
          return { insert: async (rows: any[]) => { inserted.push(...rows); return { error: null }; } };
        }
        throw new Error("unexpected " + tbl);
      },
    };
    const result = await runSync({ supabase: sb, householdId: "hh-1", provider, today: "2026-04-30" });
    expect(result.insertedTransactions).toBe(1);
    expect(inserted[0].category_id).toBe("cat-groc");
  });
```

- [ ] **Step 2: Run, confirm fail (no rules table query yet, no engine wired)**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/bank-feed/sync.test.ts
```

Expected: this new test fails (other tests still pass).

- [ ] **Step 3: Modify `lib/bank-feed/sync.ts` to load rules and apply them**

Add the import at the top:

```ts
import { applyRules } from "@/lib/rules/apply";
import type { Rule } from "@/lib/rules/types";
```

After the line that fetches `akahuTxns` and BEFORE `const rows = akahuTxns.filter(...)`, add:

```ts
  // Load active rules for this household.
  const { data: rulesData, error: rulesErr } = await supabase
    .from("rules")
    .select("id,match,actions")
    .eq("household_id", householdId);
  if (rulesErr) throw rulesErr;
  const rules = (rulesData ?? []) as Rule[];
```

Then in the `.map((t) => (...))` block where rows are built, AFTER the `source: "akahu_sync"` line, the row already has `category_id: null` implicitly. Apply rules just before pushing the row. The cleanest refactor: change the `.map` into a loop that builds the row, runs `applyRules` on it (in `RuleApplicableTxn` shape), then keeps the result. Or: build the row, then map it through applyRules adapter.

Simplest: after the `.map`, do another pass:

```ts
  const rowsWithRules = rows.map((r) => {
    const applied = applyRules(
      {
        id: "pending", // ignored by engine
        merchant_clean: r.merchant_clean,
        merchant_raw: r.merchant_raw,
        description: r.description,
        amount: r.amount,
        account_id: r.account_id,
        category_id: null,
        labels: r.labels ?? [],
      },
      rules
    );
    return {
      ...r,
      category_id: applied.category_id,
      labels: applied.labels,
    };
  });
```

Then change the insert line from `rows` to `rowsWithRules`. Also update the existing rows shape to include `labels: []` and `category_id: null` so the engine has all the inputs it needs.

If this refactor feels noisy, the implementer can refactor the row build into a single pass — the tests are the contract.

- [ ] **Step 4: Run, confirm all pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run
```

Expected: 11+ passed (all previous + the new one).

- [ ] **Step 5: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/bank-feed/sync.ts lib/bank-feed/sync.test.ts && \
  git commit -m "feat(sync): apply rules engine to incoming Akahu txns"
```

---

## Task 5: Cron sync route

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/api/cron/sync/route.ts`
- Create: `/home/seanm/Projects/finance-v2/app/api/cron/sync/route.test.ts`

The cron-triggered version of `/api/sync`. Identical logic, but: (a) auth via `CRON_SECRET` instead of user session; (b) iterates over every household in the DB; (c) uses `service_role` (or just regular client — for now there's one household and one user, RLS won't bite).

For Phase 3b we keep it simple: use the regular createClient + a serviceRoleKey-backed admin client. Since we only have one household and the cron runs as a system role, RLS bypass is needed.

For now, keep it ALSO simple: skip the household-loop and just call `runSync` once with the single household ID, found by `households.select('id').limit(1)`. Multi-household support is genuinely out of scope.

- [ ] **Step 1: Test for unauthorized request**

Write `app/api/cron/sync/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { POST } from "./route";

describe("POST /api/cron/sync", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "the-secret";
    process.env.AKAHU_APP_TOKEN = "x";
    process.env.AKAHU_USER_TOKEN = "y";
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = new Request("http://localhost/api/cron/sync", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token doesn't match CRON_SECRET", async () => {
    const req = new Request("http://localhost/api/cron/sync", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, confirm fail (route doesn't exist)**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/cron
```

- [ ] **Step 3: Implement the route**

Write `app/api/cron/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAkahuProvider } from "@/lib/bank-feed/akahu";
import { runSync } from "@/lib/bank-feed/sync";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appToken = process.env.AKAHU_APP_TOKEN;
  const userToken = process.env.AKAHU_USER_TOKEN;
  if (!appToken || !userToken) {
    return NextResponse.json(
      { error: "Akahu credentials not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();

  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (hhErr || !hh) {
    return NextResponse.json(
      { error: "household not found" },
      { status: 500 }
    );
  }

  try {
    const result = await runSync({
      supabase,
      householdId: hh.id,
      provider: createAkahuProvider({ appToken, userToken }),
      today: new Date().toISOString().slice(0, 10),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/cron
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/api/cron/ && \
  git commit -m "feat(cron): /api/cron/sync route gated by CRON_SECRET"
```

---

## Task 6: Rule create route + matching txns lookup

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/api/rules/route.ts`
- Create: `/home/seanm/Projects/finance-v2/app/api/rules/route.test.ts`

POST `/api/rules` with body `{ match: RuleMatch, actions: RuleAction }`. Server inserts the rule, then SELECTs every uncategorised txn whose merchant matches the keyword (and other match terms), returns both.

- [ ] **Step 1: Test the unauthenticated path**

Write `app/api/rules/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { POST } from "./route";

describe("POST /api/rules", () => {
  it("returns 401 when not signed in", async () => {
    const req = new Request("http://localhost/api/rules", {
      method: "POST",
      body: JSON.stringify({ match: { merchant_keyword: "X" }, actions: { set_category_id: "c" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Implement the route**

Write `app/api/rules/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RuleMatch, RuleAction } from "@/lib/rules/types";

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

  // Insert the rule.
  const { data: rule, error: insErr } = await supabase
    .from("rules")
    .insert({ household_id: hh.id, match: body.match, actions: body.actions })
    .select("id,match,actions")
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Find uncategorised matching txns.
  let q = supabase
    .from("transactions")
    .select("id,posted_at,amount,merchant_raw,merchant_clean,description,category_id")
    .eq("household_id", hh.id)
    .is("category_id", null);

  if (body.match.merchant_keyword) {
    // Use ilike on merchant_raw for now; merchant_clean is null on legacy data.
    q = q.ilike("merchant_raw", `%${body.match.merchant_keyword}%`);
  }
  if (body.match.amount_min !== null && body.match.amount_min !== undefined) {
    q = q.gte("amount", body.match.amount_min);
  }
  if (body.match.amount_max !== null && body.match.amount_max !== undefined) {
    q = q.lte("amount", body.match.amount_max);
  }
  if (body.match.account_id) {
    q = q.eq("account_id", body.match.account_id);
  }

  const { data: matches, error: matchErr } = await q.order("posted_at", { ascending: false });
  if (matchErr) {
    return NextResponse.json({ error: matchErr.message }, { status: 500 });
  }

  return NextResponse.json({ rule, matchingTransactions: matches ?? [] });
}
```

Note: this uses the database for the match (efficient + correct for substring), not the in-memory `applyRules` engine. The engine and the DB query must stay semantically aligned. Add a short comment to that effect in the code.

- [ ] **Step 3: Run tests**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules
```

- [ ] **Step 4: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/api/rules/ && \
  git commit -m "feat(rules): /api/rules POST creates rule + returns matches"
```

---

## Task 7: Rule apply route (bulk update)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/api/rules/[id]/apply/route.ts`
- Create: `/home/seanm/Projects/finance-v2/app/api/rules/[id]/apply/route.test.ts`

POST with body `{ transaction_ids: string[] }`. Server loads the rule, applies its `set_category_id` + `add_labels` to the selected transactions, returns count updated.

- [ ] **Step 1: Test 401**

Write `app/api/rules/[id]/apply/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { POST } from "./route";

describe("POST /api/rules/[id]/apply", () => {
  it("returns 401 when not signed in", async () => {
    const req = new Request("http://localhost/api/rules/abc/apply", {
      method: "POST",
      body: JSON.stringify({ transaction_ids: ["t1"] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Implement**

Write `app/api/rules/[id]/apply/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { id: string };

export async function POST(
  request: Request,
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
  const body = (await request.json().catch(() => null)) as { transaction_ids?: string[] } | null;
  const ids = body?.transaction_ids ?? [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Load the rule.
  const { data: rule, error: ruleErr } = await supabase
    .from("rules")
    .select("id,actions")
    .eq("id", ruleId)
    .maybeSingle();
  if (ruleErr || !rule) {
    return NextResponse.json({ error: "rule not found" }, { status: 404 });
  }

  const setCat: string | null = rule.actions?.set_category_id ?? null;
  const addLabels: string[] = rule.actions?.add_labels ?? [];

  // Bulk update the selected txns. Only update fields the rule actually sets.
  const patch: Record<string, unknown> = {};
  if (setCat) patch.category_id = setCat;
  if (Object.keys(patch).length === 0 && addLabels.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Labels need a per-row read-modify-write because we're appending unique values.
  // For simplicity in 3b we ignore labels in retroactive apply — only category_id is set.
  // (Sync-time apply still adds labels; this is a documented Phase 3b limitation.)
  const { count, error: updErr } = await supabase
    .from("transactions")
    .update(patch, { count: "exact" })
    .in("id", ids)
    .is("category_id", null);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ updated: count ?? 0 });
}
```

- [ ] **Step 3: Run tests + tsc**

```bash
cd ~/Projects/finance-v2 && npx vitest run app/api/rules && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/api/rules/ && \
  git commit -m "feat(rules): /api/rules/[id]/apply bulk-updates txns"
```

---

## Task 8: "Make rule" button + two-step modal on /transactions

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/app/transactions/page.tsx`
- Create: `/home/seanm/Projects/finance-v2/app/transactions/make-rule-button.tsx`
- Create: `/home/seanm/Projects/finance-v2/app/transactions/make-rule-modal.tsx`

Per AGENTS.md note: invoke `ui-stack` then `awesome-design` before writing the component markup. Default to existing shadcn primitives: `Button`, `Dialog` (or Base UI Dialog from `@base-ui/react`).

The flow:
1. New "+" button on each transaction row (visible when category_id is null) → opens **MakeRuleModal**
2. MakeRuleModal step 1 — "Make rule from 'PAK N SAVE WAIRAU'": category dropdown, scope radio (just this txn / all matches). Submit → POST /api/rules.
3. MakeRuleModal step 2 — render the matchingTransactions list with checkboxes + Select all / Deselect all. Submit → POST /api/rules/[id]/apply.

Categories must be loaded for the dropdown. The page currently doesn't fetch categories — fetch them as part of the page's server load and pass to the client component.

- [ ] **Step 1: Add category fetch to `app/transactions/page.tsx`**

Read the file first. Add a categories query alongside the transactions query:

```tsx
const { data: categoriesData } = await supabase
  .from("categories")
  .select("id,name,type")
  .order("name");
const categories = (categoriesData ?? []) as Array<{ id: string; name: string; type: string }>;
```

Pass `categories` and the txn details to `MakeRuleButton` in each row.

- [ ] **Step 2: Create `app/transactions/make-rule-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MakeRuleModal } from "./make-rule-modal";

export type Category = { id: string; name: string; type: string };

export function MakeRuleButton(props: {
  txn: {
    id: string;
    merchant_clean: string | null;
    merchant_raw: string | null;
    description: string | null;
    amount: number;
  };
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-xs underline text-muted-foreground"
        onClick={() => setOpen(true)}
        data-testid={`make-rule-${props.txn.id}`}
      >
        + rule
      </button>
      {open && (
        <MakeRuleModal
          txn={props.txn}
          categories={props.categories}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Create `app/transactions/make-rule-modal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Category = { id: string; name: string; type: string };
type Txn = {
  id: string;
  merchant_clean: string | null;
  merchant_raw: string | null;
  description: string | null;
  amount: number;
};
type Match = {
  id: string;
  posted_at: string;
  amount: number;
  merchant_raw: string | null;
  merchant_clean: string | null;
  description: string | null;
};

export function MakeRuleModal(props: {
  txn: Txn;
  categories: Category[];
  onClose: () => void;
}) {
  const merchantText =
    props.txn.merchant_clean ?? props.txn.merchant_raw ?? props.txn.description ?? "—";

  const [phase, setPhase] = useState<"create" | "confirm" | "done">("create");
  const [categoryId, setCategoryId] = useState(props.categories[0]?.id ?? "");
  const [scope, setScope] = useState<"one" | "all">("all");
  const [keyword, setKeyword] = useState(merchantText);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // After step 1
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Step 1 submit
  async function createRule() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          match: {
            merchant_keyword: scope === "all" ? keyword : null,
            amount_min: null,
            amount_max: null,
            account_id: null,
          },
          actions: { set_category_id: categoryId, add_labels: [] },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRuleId(body.rule.id);
      setMatches(body.matchingTransactions ?? []);
      setSelected(new Set((body.matchingTransactions ?? []).map((m: Match) => m.id)));
      // For "just this txn" scope, also include this txn id as a match.
      if (scope === "one") {
        setMatches([
          {
            id: props.txn.id,
            posted_at: "",
            amount: props.txn.amount,
            merchant_raw: props.txn.merchant_raw,
            merchant_clean: props.txn.merchant_clean,
            description: props.txn.description,
          },
        ]);
        setSelected(new Set([props.txn.id]));
      }
      setPhase("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  // Step 2 submit
  async function applyToSelected() {
    if (!ruleId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rules/${ruleId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transaction_ids: [...selected] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPhase("done");
      setTimeout(props.onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const categoryName = props.categories.find((c) => c.id === categoryId)?.name ?? "—";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={props.onClose}
      data-testid="make-rule-modal"
    >
      <div
        className="bg-background border rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "create" && (
          <>
            <h2 className="text-lg font-semibold mb-4">
              Make a rule from "{merchantText}"
            </h2>
            <label className="block text-sm mb-2">
              Category
              <select
                className="block mt-1 w-full border rounded px-2 py-1 bg-background"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {props.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="mt-4 text-sm">
              <legend className="mb-2">Apply to:</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} />
                Just this transaction
              </label>
              <label className="flex items-center gap-2 mt-1">
                <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
                All transactions matching:
                <input
                  className="border rounded px-1 py-0.5 ml-1 text-sm bg-background flex-1"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  disabled={scope === "one"}
                />
              </label>
            </fieldset>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={props.onClose}>
                Cancel
              </Button>
              <Button onClick={createRule} disabled={busy || !categoryId}>
                {busy ? "Working…" : "Next"}
              </Button>
            </div>
          </>
        )}

        {phase === "confirm" && (
          <>
            <h2 className="text-lg font-semibold mb-1">Apply Category to Matches</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Applying category: "{categoryName}"
            </p>
            <div className="flex gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(matches.map((m) => m.id)))}
              >
                Select all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Deselect all
              </Button>
            </div>
            <ul className="space-y-1">
              {matches.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm" data-testid={`match-${m.id}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                  />
                  <span>{m.merchant_clean ?? m.merchant_raw ?? m.description ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.posted_at} · ${Number(m.amount).toFixed(2)}
                  </span>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No matching uncategorised transactions found. The rule still
                  applies to future transactions.
                </li>
              )}
            </ul>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                onClick={applyToSelected}
                disabled={busy || selected.size === 0}
              >
                Apply to {selected.size} selected
              </Button>
            </div>
          </>
        )}

        {phase === "done" && (
          <p className="text-sm">Done. Refresh the page to see updates.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `MakeRuleButton` into `/transactions/page.tsx`**

In the row map:

```tsx
<TableCell>
  {t.merchant_clean ?? t.merchant_raw ?? t.description ?? "—"}
  {!t.category_id && (
    <span className="ml-2">
      <MakeRuleButton txn={t} categories={categories} />
    </span>
  )}
</TableCell>
```

Add the import: `import { MakeRuleButton } from "./make-rule-button";`

- [ ] **Step 5: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 6: Smoke test (unauth redirect)**

```bash
cd ~/Projects/finance-v2 && (timeout 25 npm run dev > /tmp/dev-task8b.log 2>&1 &) && sleep 8 && curl -s -o /dev/null -w "/transactions: %{http_code}\n" http://localhost:3000/transactions; pkill -f "next dev"
```

Expected: 307.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/transactions/ && \
  git commit -m "feat(ui): make-rule button + retroactive-apply modal on /transactions"
```

---

## Task 9: Deploy + manual end-to-end verification

**Files:** None.

- [ ] **Step 1: Push + deploy**

```bash
cd ~/Projects/finance-v2 && git push origin main && vercel --prod --yes
```

- [ ] **Step 2: Hit /transactions in prod, find a recent uncategorised txn, click "+ rule"**

- [ ] **Step 3: Pick a category (e.g. "Food & Dining"), keep "All transactions matching: <merchant>", click Next**

- [ ] **Step 4: Verify the confirmation modal shows N historical matches with checkboxes, all checked**

- [ ] **Step 5: Click "Apply to N selected", verify Done state, refresh page, verify those rows now show category in the database**

In Supabase SQL editor:

```sql
SELECT count(*) FROM v2.transactions WHERE category_id IS NOT NULL;
SELECT * FROM v2.rules ORDER BY created_at DESC LIMIT 5;
```

- [ ] **Step 6: Trigger the cron manually with curl to verify auth + flow**

```bash
source ~/Projects/finance-v2/.env.local
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://finance-v2-five.vercel.app/api/cron/sync | jq
```

Expected: `{ "ok": true, "linkedAccounts": 13, "insertedTransactions": 0, "prompts": [] }` (or however many new txns Akahu has since last sync).

Without auth:

```bash
curl -sS -X POST https://finance-v2-five.vercel.app/api/cron/sync | jq
```

Expected: `{ "error": "unauthorized" }` with HTTP 401.

---

## Task 10: Phase 3b complete marker

**Files:**
- Create: `/home/seanm/Projects/finance-v2/docs/PHASE-3B-COMPLETE.md`

- [ ] **Step 1: Write the marker**

```markdown
# Phase 3b — Cron + Rules Engine — Complete

**Date completed:** <YYYY-MM-DD>

## What ships

- Daily Vercel Cron at 06:00 NZ (`vercel.ts`) hits `/api/cron/sync`. Runs the same `runSync` flow as the manual button.
- `CRON_SECRET` bearer token gates the cron route.
- Rules engine (`lib/rules/apply.ts`) applies `merchant_keyword` / `amount_min` / `amount_max` / `account_id` matches; sets `category_id` and appends `labels`. First match wins.
- Sync-time auto-categorisation: every Akahu txn lands with category_id pre-set if any rule matches.
- "+ rule" button on uncategorised /transactions rows. Two-step modal: create rule → confirm-apply with checkbox list of all uncategorised matches.
- New API routes: POST /api/rules, POST /api/rules/[id]/apply, POST /api/cron/sync.

## Verified by Sean

- [ ] Created at least one rule via the UI.
- [ ] Confirmed retroactive apply via the modal.
- [ ] curl -H "Authorization: Bearer $CRON_SECRET" against /api/cron/sync returned 200.
- [ ] Same curl WITHOUT auth returned 401.

## Documented limitations

- `add_labels` only applies at sync-insert time; retroactive `/apply` route updates `category_id` but not labels.
- No rules CRUD page yet; rules are deletable via SQL only.
- First-match-wins; no precedence UI.
- No retro-apply for txns that already have a `category_id` set.

## References

- Spec: `~/Projects/finance/docs/superpowers/specs/2026-04-29-phase-3b-cron-rules-design.md`
- Plan: `~/Projects/finance/docs/superpowers/plans/2026-04-29-phase-3b-cron-rules.md`
- Phase 3a completion: `docs/PHASE-3A-COMPLETE.md`
```

- [ ] **Step 2: Fill date, commit, push**

```bash
cd ~/Projects/finance-v2 && \
  sed -i "s/<YYYY-MM-DD>/$(date -u +%Y-%m-%d)/" docs/PHASE-3B-COMPLETE.md && \
  git add docs/PHASE-3B-COMPLETE.md && \
  git commit -m "docs: mark Phase 3b (cron + rules) complete" && \
  git push origin main
```

---

## Self-review

**Spec coverage check (against design supplement):**
- CRON_SECRET env var → Task 1
- Daily cron at 06:00 NZ via vercel.ts → Task 2 + Task 5
- Rules engine (Standard tier: merchant + amount + account match) → Task 3 + Task 4
- "Make rule from this txn" UX → Task 8
- Retroactive apply with confirmation modal (mirrors v1 UX) → Task 6 + Task 7 + Task 8
- First-match-wins → Task 3
- E2E verification → Task 9
- Completion marker → Task 10
✓ Coverage complete.

**Out-of-scope items deferred:**
- Backfill of pre-cutover Akahu data → not in plan ✓
- /settings/rules CRUD page → not in plan ✓
- Rule priority UI → not in plan ✓
- Retroactive labels → explicitly noted as a Phase 3b limitation in PHASE-3B-COMPLETE ✓

**Placeholder scan:** One `<YYYY-MM-DD>` in PHASE-3B-COMPLETE.md, sed-replaced in Task 10. Acceptable.

**Type consistency:** `Rule`, `RuleMatch`, `RuleAction` defined in Task 3 and consumed identically in Tasks 4, 6, 7, 8. `RuleApplicableTxn` shape used in Task 3's tests matches what Task 4 builds before calling `applyRules`. The DB column `transactions.amount` is `numeric(14,2)` — `applyRules` treats it as a JS number; bigint precision loss is not a concern at NZ household amounts.

**Risk note:** Task 8 introduces a hand-rolled modal rather than installing a Dialog primitive. This keeps the dependency footprint small but means the modal misses focus-trapping and ESC-to-close. If Sean cares, swap to `@base-ui/react` Dialog (already a dependency) — small refactor, save for after Task 9 verifies the flow works.
