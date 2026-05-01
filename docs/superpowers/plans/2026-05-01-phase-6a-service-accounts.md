# Phase 6a — Service Accounts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full manual service-account experience: dedicated `/accounts/services` page with fixed-size mini-cards, manual top-up + bill entry, dashboard summary tile, AI advisor integration, with threshold breaches surfacing in three places.

**Architecture:** Two new tables (`v2.service_accounts` 1:1 with `v2.accounts`, `v2.bills` linked to expense transactions). Pure-function helpers under `lib/service-accounts/` for balance, burn rate, and threshold logic. Five new API routes (CRUD + topup + bill). Dedicated UI surface at `/accounts/services` with list + detail views and entry forms. Dashboard tile teases the count + breach count. AdvisorContext extended so the existing Phase 7 advisor naturally speaks about service accounts.

**Tech Stack:** Next 16 App Router, TypeScript strict, Supabase (RLS), Vitest + RTL, Tailwind, existing `authedAndScoped()` auth helper, existing `createAdminClient` for RLS-bypass writes where needed.

**Repo:** `~/Projects/finance-v2` (work on `main`, atomic commits per task — project convention).

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-05-01-phase-6a-service-accounts-design.md`.

---

## Task 1: Migration 0006 — `v2.service_accounts`

**Files:**
- Create: `supabase/migrations/0006_v2_service_accounts.sql`
- Create: `scripts/apply-migration-0006.mjs`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0006_v2_service_accounts.sql`:

```sql
-- Phase 6a — service accounts metadata + thresholds.
-- 1:1 with v2.accounts where type='service'. Service-specific fields live
-- here so the accounts table stays slim.

CREATE TABLE IF NOT EXISTS v2.service_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL UNIQUE REFERENCES v2.accounts(id) ON DELETE CASCADE,
  household_id             uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  min_balance              numeric NOT NULL,
  target_balance           numeric,
  icon_url                 text,
  provider_email_pattern   text,
  inbound_alias            text,
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

- [ ] **Step 2: Write the apply script**

Create `scripts/apply-migration-0006.mjs`:

```js
// Apply migration 0006_v2_service_accounts via service-role key.
// Idempotent (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS).
//
// Usage: node scripts/apply-migration-0006.mjs

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
  { auth: { persistSession: false } },
);

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0006_v2_service_accounts.sql"),
  "utf8",
);

console.log("Applying migration 0006_v2_service_accounts...");
const { error } = await supabase.rpc("exec_sql", { sql });
if (error) {
  console.error("RPC exec_sql failed:", error.message);
  console.error("\nTo apply manually, paste this into Supabase Dashboard → SQL Editor:");
  console.error("\n" + sql);
  process.exit(1);
}
console.log("Migration applied.");
```

- [ ] **Step 3: Apply the migration**

```bash
cd ~/Projects/finance-v2
node scripts/apply-migration-0006.mjs
```

Expected output: `Migration applied.` (the `exec_sql` RPC was registered earlier this session).

- [ ] **Step 4: Verify table is queryable with all columns**

Create `scripts/verify-tmp.mjs` (delete after):

```js
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const { error } = await sb
  .schema("v2")
  .from("service_accounts")
  .select("id, account_id, household_id, min_balance, target_balance, icon_url, provider_email_pattern, inbound_alias, archived_at, created_at, updated_at")
  .limit(0);
console.log(error ? "FAIL: " + error.message : "OK: all columns queryable");
```

Run: `npx tsx scripts/verify-tmp.mjs && rm scripts/verify-tmp.mjs`
Expected: `OK: all columns queryable`

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add supabase/migrations/0006_v2_service_accounts.sql scripts/apply-migration-0006.mjs
git commit -m "feat(schema): v2.service_accounts table for Phase 6a"
```

---

## Task 2: Migration 0007 — `v2.bills`

**Files:**
- Create: `supabase/migrations/0007_v2_bills.sql`
- Create: `scripts/apply-migration-0007.mjs`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0007_v2_bills.sql`:

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

- [ ] **Step 2: Write the apply script**

Create `scripts/apply-migration-0007.mjs` — identical structure to 0006's apply script but referencing `0007_v2_bills.sql`:

```js
// Apply migration 0007_v2_bills via service-role key. Idempotent.
//
// Usage: node scripts/apply-migration-0007.mjs

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
  { auth: { persistSession: false } },
);

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0007_v2_bills.sql"),
  "utf8",
);

console.log("Applying migration 0007_v2_bills...");
const { error } = await supabase.rpc("exec_sql", { sql });
if (error) {
  console.error("RPC exec_sql failed:", error.message);
  console.error("\nTo apply manually, paste this into Supabase Dashboard → SQL Editor:");
  console.error("\n" + sql);
  process.exit(1);
}
console.log("Migration applied.");
```

- [ ] **Step 3: Apply + verify**

```bash
cd ~/Projects/finance-v2
node scripts/apply-migration-0007.mjs
```

Verify with a one-liner script (same pattern as Task 1 step 4) selecting all columns from `v2.bills` with `.limit(0)`. Expected: `OK: all columns queryable`.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2
git add supabase/migrations/0007_v2_bills.sql scripts/apply-migration-0007.mjs
git commit -m "feat(schema): v2.bills table for Phase 6a"
```

---

## Task 3: `lib/service-accounts/balance.ts` — pure balance calc

**Files:**
- Create: `lib/service-accounts/balance.ts`
- Test: `lib/service-accounts/balance.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/service-accounts/balance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeBalance } from "./balance";

type Txn = { amount: number; type: "income" | "expense" | "transfer" };

describe("computeBalance", () => {
  it("returns 0 for empty array", () => {
    expect(computeBalance([])).toBe(0);
  });

  it("sums transfers in (positive amounts)", () => {
    const txns: Txn[] = [
      { amount: 100, type: "transfer" },
      { amount: 50, type: "transfer" },
    ];
    expect(computeBalance(txns)).toBe(150);
  });

  it("subtracts expenses (negative amounts)", () => {
    const txns: Txn[] = [
      { amount: 200, type: "transfer" },
      { amount: -75, type: "expense" },
    ];
    expect(computeBalance(txns)).toBe(125);
  });

  it("handles mixed transfer in + expense", () => {
    const txns: Txn[] = [
      { amount: 500, type: "transfer" },
      { amount: -100, type: "expense" },
      { amount: -50, type: "expense" },
      { amount: 100, type: "transfer" },
    ];
    expect(computeBalance(txns)).toBe(450);
  });

  it("handles zero amounts", () => {
    expect(computeBalance([{ amount: 0, type: "transfer" }])).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/service-accounts/balance.test.ts
```

Expected: FAIL — `Cannot find module './balance'`.

- [ ] **Step 3: Write the implementation**

Create `lib/service-accounts/balance.ts`:

```ts
type BalanceTxn = { amount: number };

export function computeBalance(transactions: BalanceTxn[]): number {
  return transactions.reduce((sum, t) => sum + Number(t.amount), 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/service-accounts/balance.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/service-accounts/balance.ts lib/service-accounts/balance.test.ts
git commit -m "feat(service-accounts): pure balance computation from transactions"
```

---

## Task 4: `lib/service-accounts/burn-rate.ts` — burn rate + weeks-of-burn

**Files:**
- Create: `lib/service-accounts/burn-rate.ts`
- Test: `lib/service-accounts/burn-rate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/service-accounts/burn-rate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeBurnRate } from "./burn-rate";

type Bill = { amount: number; applied_to_balance_at: string };

const NOW = new Date("2026-05-01T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("computeBurnRate", () => {
  it("returns nulls when no bills", () => {
    const out = computeBurnRate([], 100, NOW);
    expect(out.monthlyAverage).toBeNull();
    expect(out.weeksOfBurn).toBeNull();
  });

  it("returns nulls when only 1 bill in last 90 days", () => {
    const bills: Bill[] = [{ amount: 100, applied_to_balance_at: daysAgo(10) }];
    const out = computeBurnRate(bills, 500, NOW);
    expect(out.monthlyAverage).toBeNull();
    expect(out.weeksOfBurn).toBeNull();
  });

  it("returns nulls when only 2 bills in last 90 days", () => {
    const bills: Bill[] = [
      { amount: 100, applied_to_balance_at: daysAgo(10) },
      { amount: 120, applied_to_balance_at: daysAgo(40) },
    ];
    const out = computeBurnRate(bills, 500, NOW);
    expect(out.monthlyAverage).toBeNull();
    expect(out.weeksOfBurn).toBeNull();
  });

  it("computes monthly average and weeksOfBurn for 3 bills in window", () => {
    const bills: Bill[] = [
      { amount: 100, applied_to_balance_at: daysAgo(5) },
      { amount: 100, applied_to_balance_at: daysAgo(35) },
      { amount: 100, applied_to_balance_at: daysAgo(65) },
    ];
    const out = computeBurnRate(bills, 400, NOW);
    expect(out.monthlyAverage).toBe(100);
    // weeklyBurn = monthlyAverage / 4.345 ≈ 23.0; weeksOfBurn = 400 / 23.0 ≈ 17.39
    expect(out.weeksOfBurn).not.toBeNull();
    expect(out.weeksOfBurn!).toBeGreaterThan(17);
    expect(out.weeksOfBurn!).toBeLessThan(18);
  });

  it("ignores bills older than 90 days", () => {
    const bills: Bill[] = [
      { amount: 100, applied_to_balance_at: daysAgo(5) },
      { amount: 100, applied_to_balance_at: daysAgo(35) },
      { amount: 100, applied_to_balance_at: daysAgo(65) },
      { amount: 9999, applied_to_balance_at: daysAgo(120) },
    ];
    const out = computeBurnRate(bills, 400, NOW);
    expect(out.monthlyAverage).toBe(100); // not 2599.75
  });

  it("returns weeksOfBurn=0 when balance is 0 and burn rate is positive", () => {
    const bills: Bill[] = [
      { amount: 100, applied_to_balance_at: daysAgo(5) },
      { amount: 100, applied_to_balance_at: daysAgo(35) },
      { amount: 100, applied_to_balance_at: daysAgo(65) },
    ];
    const out = computeBurnRate(bills, 0, NOW);
    expect(out.weeksOfBurn).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/service-accounts/burn-rate.test.ts
```

Expected: FAIL — `Cannot find module './burn-rate'`.

- [ ] **Step 3: Write the implementation**

Create `lib/service-accounts/burn-rate.ts`:

```ts
type BurnBill = { amount: number; applied_to_balance_at: string };

const WINDOW_DAYS = 90;
const MIN_BILLS_FOR_BURN_RATE = 3;
const WEEKS_PER_MONTH = 4.345; // average

export function computeBurnRate(
  bills: BurnBill[],
  balance: number,
  now: Date = new Date(),
): { monthlyAverage: number | null; weeksOfBurn: number | null } {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).getTime();
  const recent = bills.filter((b) => new Date(b.applied_to_balance_at).getTime() >= cutoff);

  if (recent.length < MIN_BILLS_FOR_BURN_RATE) {
    return { monthlyAverage: null, weeksOfBurn: null };
  }

  const totalAmount = recent.reduce((s, b) => s + Number(b.amount), 0);
  // 90-day window of N bills → monthly average = total / 3 months
  const monthlyAverage = totalAmount / (WINDOW_DAYS / 30);
  const weeklyBurn = monthlyAverage / WEEKS_PER_MONTH;
  const weeksOfBurn = weeklyBurn > 0 ? Math.max(0, balance / weeklyBurn) : null;

  return { monthlyAverage, weeksOfBurn };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/service-accounts/burn-rate.test.ts
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/service-accounts/burn-rate.ts lib/service-accounts/burn-rate.test.ts
git commit -m "feat(service-accounts): burn rate calc with 3-bill minimum"
```

---

## Task 5: `lib/service-accounts/threshold.ts` — breach check

**Files:**
- Create: `lib/service-accounts/threshold.ts`
- Test: `lib/service-accounts/threshold.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/service-accounts/threshold.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBreaching } from "./threshold";

describe("isBreaching", () => {
  it("returns false when balance > min_balance", () => {
    expect(isBreaching(600, 500)).toBe(false);
  });

  it("returns false when balance == min_balance (boundary is 'ok', not breach)", () => {
    expect(isBreaching(500, 500)).toBe(false);
  });

  it("returns true when balance < min_balance", () => {
    expect(isBreaching(499, 500)).toBe(true);
  });

  it("returns true when balance is 0 and min_balance is positive", () => {
    expect(isBreaching(0, 100)).toBe(true);
  });

  it("returns true when balance is negative", () => {
    expect(isBreaching(-50, 0)).toBe(true);
  });

  it("returns false when both are 0", () => {
    expect(isBreaching(0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/service-accounts/threshold.test.ts
```

Expected: FAIL — `Cannot find module './threshold'`.

- [ ] **Step 3: Write the implementation**

Create `lib/service-accounts/threshold.ts`:

```ts
export function isBreaching(balance: number, minBalance: number): boolean {
  return Number(balance) < Number(minBalance);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/service-accounts/threshold.test.ts
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/service-accounts/threshold.ts lib/service-accounts/threshold.test.ts
git commit -m "feat(service-accounts): threshold breach check (strict less-than)"
```

---

## Task 6: `app/api/service-accounts/route.ts` — list + create (GET + POST)

**Files:**
- Create: `app/api/service-accounts/route.ts`
- Test: `app/api/service-accounts/route.test.ts`

The POST creates BOTH the underlying `v2.accounts` row (with `type='service'`, `provider='service_account'`) AND the `v2.service_accounts` row in a single transaction (via the admin client to bypass RLS where needed). The GET returns the service accounts joined with their underlying accounts (for name/balance/etc.).

- [ ] **Step 1: Write failing tests**

Create `app/api/service-accounts/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelectServiceAccounts = vi.fn(async () => ({ data: [], error: null }));
const mockInsertAccount = vi.fn(async () => ({ data: { id: "acc-1" }, error: null }));
const mockInsertServiceAccount = vi.fn(async () => ({ data: { id: "sa-1" }, error: null }));

vi.mock("@/lib/api/auth", () => ({
  authedAndScoped: vi.fn(async () => ({
    kind: "ok",
    supabase: {
      schema: () => ({
        from: (table: string) => {
          if (table === "service_accounts") {
            return { select: () => ({ eq: () => ({ is: () => mockSelectServiceAccounts() }) }) };
          }
          return {};
        },
      }),
    },
    household_id: "h1",
    user: { id: "u1" },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "accounts") {
          return { insert: () => ({ select: () => ({ single: () => mockInsertAccount() }) }) };
        }
        if (table === "service_accounts") {
          return { insert: () => ({ select: () => ({ single: () => mockInsertServiceAccount() }) }) };
        }
        return {};
      },
    }),
  })),
}));

import { GET, POST } from "./route";
import { authedAndScoped } from "@/lib/api/auth";

const post = (body: unknown) =>
  new Request("http://localhost/api/service-accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });

const get = () => new Request("http://localhost/api/service-accounts");

beforeEach(() => {
  vi.clearAllMocks();
  (authedAndScoped as any).mockResolvedValue({
    kind: "ok",
    supabase: {
      schema: () => ({
        from: () => ({ select: () => ({ eq: () => ({ is: () => mockSelectServiceAccounts() }) }) }),
      }),
    },
    household_id: "h1",
    user: { id: "u1" },
  });
  mockSelectServiceAccounts.mockResolvedValue({ data: [], error: null });
  mockInsertAccount.mockResolvedValue({ data: { id: "acc-1" }, error: null });
  mockInsertServiceAccount.mockResolvedValue({ data: { id: "sa-1" }, error: null });
});

describe("GET /api/service-accounts", () => {
  it("returns 401 when unauth", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "unauth" });
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("returns 403 when no household", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "no-household" });
    const res = await GET(get());
    expect(res.status).toBe(403);
  });

  it("returns 200 with empty array on happy path", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serviceAccounts).toEqual([]);
  });
});

describe("POST /api/service-accounts", () => {
  it("returns 401 when unauth", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "unauth" });
    const res = await POST(post({ name: "Power", min_balance: 500 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name missing", async () => {
    const res = await POST(post({ min_balance: 500 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when min_balance missing", async () => {
    const res = await POST(post({ name: "Power" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when min_balance negative", async () => {
    const res = await POST(post({ name: "Power", min_balance: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 200 + creates both rows on happy path", async () => {
    const res = await POST(post({
      name: "Power",
      min_balance: 500,
      target_balance: 1000,
      icon_url: "https://example.com/mercury.png",
    }));
    expect(res.status).toBe(200);
    expect(mockInsertAccount).toHaveBeenCalledTimes(1);
    expect(mockInsertServiceAccount).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.serviceAccount.id).toBe("sa-1");
  });

  it("returns 200 with optional fields omitted (target_balance, icon_url null)", async () => {
    const res = await POST(post({ name: "Water", min_balance: 200 }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/service-accounts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authedAndScoped } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  min_balance: z.number().nonnegative(),
  target_balance: z.number().nonnegative().optional().nullable(),
  icon_url: z.string().url().max(2048).optional().nullable(),
});

export async function GET(_req: Request) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (auth.kind === "no-household") return NextResponse.json({ error: "no-household" }, { status: 403 });

  const { data, error } = await auth.supabase
    .schema("v2")
    .from("service_accounts")
    .select("id, account_id, min_balance, target_balance, icon_url, created_at, updated_at, accounts:account_id(name, balance, type)")
    .eq("household_id", auth.household_id)
    .is("archived_at", null);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  return NextResponse.json({ serviceAccounts: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (auth.kind === "no-household") return NextResponse.json({ error: "no-household" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { name, min_balance, target_balance, icon_url } = parsed.data;
  const admin = createAdminClient();

  // 1) Create the underlying v2.accounts row (type='service')
  const { data: accRow, error: accErr } = await admin
    .schema("v2")
    .from("accounts")
    .insert({
      household_id: auth.household_id,
      owner_profile_id: auth.user.id,
      provider: "service_account",
      name,
      type: "service",
      tag: "shared",
      balance: 0,
    })
    .select("id")
    .single();
  if (accErr || !accRow) return NextResponse.json({ error: "account_insert_failed" }, { status: 500 });

  // 2) Create the v2.service_accounts row
  const { data: saRow, error: saErr } = await admin
    .schema("v2")
    .from("service_accounts")
    .insert({
      account_id: (accRow as { id: string }).id,
      household_id: auth.household_id,
      min_balance,
      target_balance: target_balance ?? null,
      icon_url: icon_url ?? null,
    })
    .select("id")
    .single();
  if (saErr || !saRow) return NextResponse.json({ error: "service_account_insert_failed" }, { status: 500 });

  return NextResponse.json({ serviceAccount: saRow });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/route.test.ts
```

Expected: 9 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/api/service-accounts/route.ts app/api/service-accounts/route.test.ts
git commit -m "feat(api): /api/service-accounts GET + POST (list + create)"
```

---

## Task 7: `app/api/service-accounts/[id]/route.ts` — PATCH + DELETE (soft)

**Files:**
- Create: `app/api/service-accounts/[id]/route.ts`
- Test: `app/api/service-accounts/[id]/route.test.ts`

PATCH allows editing `name` (writes through to v2.accounts), `min_balance`, `target_balance`, `icon_url`. DELETE is soft — sets `archived_at = now()`.

- [ ] **Step 1: Write failing tests**

Create `app/api/service-accounts/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateServiceAccount = vi.fn(async () => ({ error: null }));
const mockUpdateAccount = vi.fn(async () => ({ error: null }));
const mockSelectExisting = vi.fn(async () => ({
  data: { account_id: "acc-1", household_id: "h1" },
  error: null,
}));

vi.mock("@/lib/api/auth", () => ({
  authedAndScoped: vi.fn(async () => ({
    kind: "ok",
    supabase: {
      schema: () => ({
        from: (table: string) => {
          if (table === "service_accounts") {
            return {
              select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => mockSelectExisting() }) }) }),
            };
          }
          return {};
        },
      }),
    },
    household_id: "h1",
    user: { id: "u1" },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "service_accounts") {
          return { update: () => ({ eq: () => mockUpdateServiceAccount() }) };
        }
        if (table === "accounts") {
          return { update: () => ({ eq: () => mockUpdateAccount() }) };
        }
        return {};
      },
    }),
  })),
}));

import { PATCH, DELETE } from "./route";
import { authedAndScoped } from "@/lib/api/auth";

const params = (id = "sa-1") => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/service-accounts/sa-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
const del = () => new Request("http://localhost/api/service-accounts/sa-1", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectExisting.mockResolvedValue({
    data: { account_id: "acc-1", household_id: "h1" },
    error: null,
  });
  mockUpdateServiceAccount.mockResolvedValue({ error: null });
  mockUpdateAccount.mockResolvedValue({ error: null });
});

describe("PATCH /api/service-accounts/[id]", () => {
  it("returns 401 when unauth", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "unauth" });
    const res = await PATCH(patch({ name: "X" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when service account not found", async () => {
    mockSelectExisting.mockResolvedValueOnce({ data: null, error: null });
    const res = await PATCH(patch({ name: "X" }), params());
    expect(res.status).toBe(404);
  });

  it("returns 400 with empty body", async () => {
    const res = await PATCH(patch({}), params());
    expect(res.status).toBe(400);
  });

  it("returns 400 with negative min_balance", async () => {
    const res = await PATCH(patch({ min_balance: -1 }), params());
    expect(res.status).toBe(400);
  });

  it("updates name on accounts table when name provided", async () => {
    const res = await PATCH(patch({ name: "Renamed" }), params());
    expect(res.status).toBe(200);
    expect(mockUpdateAccount).toHaveBeenCalledTimes(1);
  });

  it("updates min_balance on service_accounts table", async () => {
    const res = await PATCH(patch({ min_balance: 600 }), params());
    expect(res.status).toBe(200);
    expect(mockUpdateServiceAccount).toHaveBeenCalledTimes(1);
  });

  it("updates icon_url", async () => {
    const res = await PATCH(patch({ icon_url: "https://example.com/x.png" }), params());
    expect(res.status).toBe(200);
    expect(mockUpdateServiceAccount).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/service-accounts/[id]", () => {
  it("returns 401 when unauth", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "unauth" });
    const res = await DELETE(del(), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when service account not found", async () => {
    mockSelectExisting.mockResolvedValueOnce({ data: null, error: null });
    const res = await DELETE(del(), params());
    expect(res.status).toBe(404);
  });

  it("soft-deletes by setting archived_at", async () => {
    const res = await DELETE(del(), params());
    expect(res.status).toBe(200);
    expect(mockUpdateServiceAccount).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/\[id\]/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/service-accounts/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authedAndScoped } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  min_balance: z.number().nonnegative().optional(),
  target_balance: z.number().nonnegative().nullable().optional(),
  icon_url: z.string().url().max(2048).nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "at_least_one_field_required" },
);

type Params = { id: string };

export async function PATCH(req: Request, ctx: { params: Promise<Params> }) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (auth.kind === "no-household") return NextResponse.json({ error: "no-household" }, { status: 403 });

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // Confirm the row exists and belongs to this household (RLS would also enforce, but we want a clean 404)
  const { data: existing } = await auth.supabase
    .schema("v2")
    .from("service_accounts")
    .select("account_id, household_id")
    .eq("id", id)
    .eq("household_id", auth.household_id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  const { name, ...serviceAccountUpdates } = parsed.data;

  // Update the v2.accounts row if name changed
  if (name !== undefined) {
    const { error } = await admin
      .schema("v2")
      .from("accounts")
      .update({ name })
      .eq("id", (existing as { account_id: string }).account_id);
    if (error) return NextResponse.json({ error: "account_update_failed" }, { status: 500 });
  }

  // Update v2.service_accounts row if any service-specific field changed
  if (Object.keys(serviceAccountUpdates).length > 0) {
    const { error } = await admin
      .schema("v2")
      .from("service_accounts")
      .update({ ...serviceAccountUpdates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "service_account_update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (auth.kind === "no-household") return NextResponse.json({ error: "no-household" }, { status: 403 });

  const { id } = await ctx.params;

  const { data: existing } = await auth.supabase
    .schema("v2")
    .from("service_accounts")
    .select("account_id, household_id")
    .eq("id", id)
    .eq("household_id", auth.household_id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin
    .schema("v2")
    .from("service_accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/\[id\]/route.test.ts
```

Expected: 10 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add 'app/api/service-accounts/[id]/route.ts' 'app/api/service-accounts/[id]/route.test.ts'
git commit -m "feat(api): /api/service-accounts/[id] PATCH + DELETE (soft)"
```

---

## Task 8: `app/api/service-accounts/[id]/topup/route.ts`

**Files:**
- Create: `app/api/service-accounts/[id]/topup/route.ts`
- Test: `app/api/service-accounts/[id]/topup/route.test.ts`

POST creates a transfer pair: debit on `source_account_id`, credit on the service account's underlying `account_id`, linked via `parent_transaction_id`.

- [ ] **Step 1: Write failing tests**

Create `app/api/service-accounts/[id]/topup/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelectServiceAccount = vi.fn();
const mockSelectSourceAccount = vi.fn();
const mockInsertDebit = vi.fn();
const mockUpdateChild = vi.fn();
const mockInsertCredit = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  authedAndScoped: vi.fn(async () => ({
    kind: "ok",
    supabase: {
      schema: () => ({
        from: (table: string) => {
          if (table === "service_accounts") {
            return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => mockSelectServiceAccount() }) }) }) };
          }
          if (table === "accounts") {
            return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => mockSelectSourceAccount() }) }) }) };
          }
          return {};
        },
      }),
    },
    household_id: "h1",
    user: { id: "u1" },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "transactions") {
          return {
            insert: (rows: unknown) => {
              // First call: debit (single object or first item of array)
              // Second call: credit
              if (mockInsertDebit.mock.calls.length === 0) {
                return { select: () => ({ single: () => mockInsertDebit(rows) }) };
              }
              return { select: () => ({ single: () => mockInsertCredit(rows) }) };
            },
            update: () => ({ eq: () => mockUpdateChild() }),
          };
        }
        return {};
      },
    }),
  })),
}));

import { POST } from "./route";
import { authedAndScoped } from "@/lib/api/auth";

const params = (id = "sa-1") => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/api/service-accounts/sa-1/topup", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectServiceAccount.mockResolvedValue({
    data: { id: "sa-1", account_id: "service-acc-1", household_id: "h1" },
    error: null,
  });
  mockSelectSourceAccount.mockResolvedValue({
    data: { id: "src-acc-1", household_id: "h1" },
    error: null,
  });
  mockInsertDebit.mockResolvedValue({ data: { id: "txn-debit" }, error: null });
  mockInsertCredit.mockResolvedValue({ data: { id: "txn-credit" }, error: null });
  mockUpdateChild.mockResolvedValue({ error: null });
});

describe("POST /api/service-accounts/[id]/topup", () => {
  it("returns 401 when unauth", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "unauth" });
    const res = await POST(post({ amount: 100, source_account_id: "src-acc-1", date: "2026-05-01" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when service account not found", async () => {
    mockSelectServiceAccount.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(post({ amount: 100, source_account_id: "src-acc-1", date: "2026-05-01" }), params());
    expect(res.status).toBe(404);
  });

  it("returns 400 when amount missing or non-positive", async () => {
    const res = await POST(post({ source_account_id: "src-acc-1", date: "2026-05-01" }), params());
    expect(res.status).toBe(400);
    const res2 = await POST(post({ amount: 0, source_account_id: "src-acc-1", date: "2026-05-01" }), params());
    expect(res2.status).toBe(400);
    const res3 = await POST(post({ amount: -10, source_account_id: "src-acc-1", date: "2026-05-01" }), params());
    expect(res3.status).toBe(400);
  });

  it("returns 400 when source_account_id missing", async () => {
    const res = await POST(post({ amount: 100, date: "2026-05-01" }), params());
    expect(res.status).toBe(400);
  });

  it("returns 400 when source_account_id doesn't belong to household", async () => {
    mockSelectSourceAccount.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(post({ amount: 100, source_account_id: "evil-acc", date: "2026-05-01" }), params());
    expect(res.status).toBe(400);
  });

  it("returns 200 + creates two transfer transactions on happy path", async () => {
    const res = await POST(post({
      amount: 250,
      source_account_id: "src-acc-1",
      date: "2026-05-01",
    }), params());
    expect(res.status).toBe(200);
    expect(mockInsertDebit).toHaveBeenCalledTimes(1);
    expect(mockInsertCredit).toHaveBeenCalledTimes(1);
    expect(mockUpdateChild).toHaveBeenCalledTimes(1); // sets parent_transaction_id on credit
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/\[id\]/topup/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/service-accounts/[id]/topup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authedAndScoped } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  amount: z.number().positive(),
  source_account_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

type Params = { id: string };

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (auth.kind === "no-household") return NextResponse.json({ error: "no-household" }, { status: 403 });

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { amount, source_account_id, date } = parsed.data;

  // Verify the service account belongs to this household
  const { data: sa } = await auth.supabase
    .schema("v2")
    .from("service_accounts")
    .select("id, account_id, household_id")
    .eq("id", id)
    .eq("household_id", auth.household_id)
    .maybeSingle();
  if (!sa) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Verify source account belongs to this household
  const { data: src } = await auth.supabase
    .schema("v2")
    .from("accounts")
    .select("id, household_id")
    .eq("id", source_account_id)
    .eq("household_id", auth.household_id)
    .maybeSingle();
  if (!src) return NextResponse.json({ error: "invalid_source_account" }, { status: 400 });

  const admin = createAdminClient();

  // 1) Insert debit on source account
  const { data: debit, error: debitErr } = await admin
    .schema("v2")
    .from("transactions")
    .insert({
      household_id: auth.household_id,
      account_id: source_account_id,
      attributed_to_profile_id: auth.user.id,
      posted_at: date,
      amount: -amount,
      type: "transfer",
      merchant_raw: "Service top-up (debit)",
      merchant_clean: "Service top-up",
      is_transfer: true,
      confirmed: true,
      source: "manual",
    })
    .select("id")
    .single();
  if (debitErr || !debit) return NextResponse.json({ error: "debit_insert_failed" }, { status: 500 });

  // 2) Insert credit on service account, linked via parent_transaction_id
  const { data: credit, error: creditErr } = await admin
    .schema("v2")
    .from("transactions")
    .insert({
      household_id: auth.household_id,
      account_id: (sa as { account_id: string }).account_id,
      attributed_to_profile_id: auth.user.id,
      posted_at: date,
      amount: amount,
      type: "transfer",
      merchant_raw: "Service top-up (credit)",
      merchant_clean: "Service top-up",
      is_transfer: true,
      confirmed: true,
      source: "manual",
      parent_transaction_id: (debit as { id: string }).id,
    })
    .select("id")
    .single();
  if (creditErr || !credit) return NextResponse.json({ error: "credit_insert_failed" }, { status: 500 });

  // 3) Update the debit's parent_transaction_id to point to the credit
  // (so the pair is bidirectionally linked — Phase 3a's transfer pattern)
  const { error: updErr } = await admin
    .schema("v2")
    .from("transactions")
    .update({ parent_transaction_id: (credit as { id: string }).id })
    .eq("id", (debit as { id: string }).id);
  if (updErr) return NextResponse.json({ error: "link_update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, debit_id: (debit as { id: string }).id, credit_id: (credit as { id: string }).id });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/\[id\]/topup/route.test.ts
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add 'app/api/service-accounts/[id]/topup/route.ts' 'app/api/service-accounts/[id]/topup/route.test.ts'
git commit -m "feat(api): /api/service-accounts/[id]/topup POST — transfer pair"
```

---

## Task 9: `app/api/service-accounts/[id]/bill/route.ts`

**Files:**
- Create: `app/api/service-accounts/[id]/bill/route.ts`
- Test: `app/api/service-accounts/[id]/bill/route.test.ts`

POST inserts an expense transaction on the service account, then creates a paired bill row in `v2.bills`.

- [ ] **Step 1: Write failing tests**

Create `app/api/service-accounts/[id]/bill/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelectServiceAccount = vi.fn();
const mockInsertTxn = vi.fn();
const mockInsertBill = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  authedAndScoped: vi.fn(async () => ({
    kind: "ok",
    supabase: {
      schema: () => ({
        from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => mockSelectServiceAccount() }) }) }) }),
      }),
    },
    household_id: "h1",
    user: { id: "u1" },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "transactions") {
          return { insert: () => ({ select: () => ({ single: () => mockInsertTxn() }) }) };
        }
        if (table === "bills") {
          return { insert: () => ({ select: () => ({ single: () => mockInsertBill() }) }) };
        }
        return {};
      },
    }),
  })),
}));

import { POST } from "./route";
import { authedAndScoped } from "@/lib/api/auth";

const params = (id = "sa-1") => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/api/service-accounts/sa-1/bill", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectServiceAccount.mockResolvedValue({
    data: { id: "sa-1", account_id: "service-acc-1", household_id: "h1" },
    error: null,
  });
  mockInsertTxn.mockResolvedValue({ data: { id: "txn-bill" }, error: null });
  mockInsertBill.mockResolvedValue({ data: { id: "bill-1" }, error: null });
});

describe("POST /api/service-accounts/[id]/bill", () => {
  it("returns 401 when unauth", async () => {
    (authedAndScoped as any).mockResolvedValueOnce({ kind: "unauth" });
    const res = await POST(post({ amount: 100, due_date: "2026-05-15" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when service account not found", async () => {
    mockSelectServiceAccount.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(post({ amount: 100, due_date: "2026-05-15" }), params());
    expect(res.status).toBe(404);
  });

  it("returns 400 when amount missing/non-positive", async () => {
    const res = await POST(post({ due_date: "2026-05-15" }), params());
    expect(res.status).toBe(400);
    const res2 = await POST(post({ amount: 0, due_date: "2026-05-15" }), params());
    expect(res2.status).toBe(400);
  });

  it("returns 400 when due_date missing or wrong format", async () => {
    const res = await POST(post({ amount: 100 }), params());
    expect(res.status).toBe(400);
    const res2 = await POST(post({ amount: 100, due_date: "tomorrow" }), params());
    expect(res2.status).toBe(400);
  });

  it("returns 400 when billing_period_start > billing_period_end", async () => {
    const res = await POST(post({
      amount: 100,
      due_date: "2026-05-15",
      billing_period_start: "2026-04-30",
      billing_period_end: "2026-04-01",
    }), params());
    expect(res.status).toBe(400);
  });

  it("returns 200 + creates expense txn + bill row on minimal happy path", async () => {
    const res = await POST(post({ amount: 250, due_date: "2026-05-15" }), params());
    expect(res.status).toBe(200);
    expect(mockInsertTxn).toHaveBeenCalledTimes(1);
    expect(mockInsertBill).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with optional billing_period fields", async () => {
    const res = await POST(post({
      amount: 250,
      due_date: "2026-05-15",
      billing_period_start: "2026-04-15",
      billing_period_end: "2026-05-14",
    }), params());
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/\[id\]/bill/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/service-accounts/[id]/bill/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authedAndScoped } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({
  amount: z.number().positive(),
  due_date: z.string().regex(dateRegex, "due_date must be YYYY-MM-DD"),
  billing_period_start: z.string().regex(dateRegex).optional().nullable(),
  billing_period_end: z.string().regex(dateRegex).optional().nullable(),
}).refine(
  (data) => {
    if (data.billing_period_start && data.billing_period_end) {
      return data.billing_period_start <= data.billing_period_end;
    }
    return true;
  },
  { message: "billing_period_start_must_be_le_end" },
);

type Params = { id: string };

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (auth.kind === "no-household") return NextResponse.json({ error: "no-household" }, { status: 403 });

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { amount, due_date, billing_period_start, billing_period_end } = parsed.data;

  const { data: sa } = await auth.supabase
    .schema("v2")
    .from("service_accounts")
    .select("id, account_id, household_id")
    .eq("id", id)
    .eq("household_id", auth.household_id)
    .maybeSingle();
  if (!sa) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createAdminClient();

  // 1) Insert expense transaction on the service account
  const { data: txn, error: txnErr } = await admin
    .schema("v2")
    .from("transactions")
    .insert({
      household_id: auth.household_id,
      account_id: (sa as { account_id: string }).account_id,
      attributed_to_profile_id: auth.user.id,
      posted_at: due_date,
      amount: -amount,
      type: "expense",
      merchant_raw: "Bill",
      merchant_clean: "Bill",
      is_transfer: false,
      confirmed: true,
      source: "manual",
    })
    .select("id")
    .single();
  if (txnErr || !txn) return NextResponse.json({ error: "txn_insert_failed" }, { status: 500 });

  // 2) Insert bill row paired to that transaction
  const { data: bill, error: billErr } = await admin
    .schema("v2")
    .from("bills")
    .insert({
      service_account_id: id,
      household_id: auth.household_id,
      transaction_id: (txn as { id: string }).id,
      amount,
      due_date,
      billing_period_start: billing_period_start ?? null,
      billing_period_end: billing_period_end ?? null,
    })
    .select("id")
    .single();
  if (billErr || !bill) return NextResponse.json({ error: "bill_insert_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, transaction_id: (txn as { id: string }).id, bill_id: (bill as { id: string }).id });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/api/service-accounts/\[id\]/bill/route.test.ts
```

Expected: 7 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add 'app/api/service-accounts/[id]/bill/route.ts' 'app/api/service-accounts/[id]/bill/route.test.ts'
git commit -m "feat(api): /api/service-accounts/[id]/bill POST — expense + bill row"
```

---

## Task 10: `service-mini-card.tsx` — fixed-size mini-card component

**Files:**
- Create: `app/accounts/services/_components/service-mini-card.tsx`
- Test: `app/accounts/services/_components/service-mini-card.test.tsx`

Fixed-size square card with icon top + details below. All cards same dimensions for grid alignment.

- [ ] **Step 1: Write failing tests**

Create `app/accounts/services/_components/service-mini-card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceMiniCard } from "./service-mini-card";

const baseProps = {
  id: "sa-1",
  name: "Power",
  balance: 600,
  minBalance: 500,
  weeksOfBurn: 12 as number | null,
  iconUrl: "https://example.com/mercury.png",
};

describe("ServiceMiniCard", () => {
  it("renders name + balance + threshold + icon", () => {
    render(<ServiceMiniCard {...baseProps} />);
    expect(screen.getByText("Power")).toBeTruthy();
    expect(screen.getByText(/\$600/)).toBeTruthy();
    expect(screen.getByText(/\$500 floor/i)).toBeTruthy();
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("mercury.png");
  });

  it("renders weeks-of-burn when provided", () => {
    render(<ServiceMiniCard {...baseProps} weeksOfBurn={12} />);
    expect(screen.getByText(/12 weeks/i)).toBeTruthy();
  });

  it("renders '—' when weeksOfBurn is null", () => {
    render(<ServiceMiniCard {...baseProps} weeksOfBurn={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows breach badge when balance < minBalance", () => {
    render(<ServiceMiniCard {...baseProps} balance={400} minBalance={500} />);
    expect(screen.getByText(/below threshold/i)).toBeTruthy();
  });

  it("does NOT show breach badge when balance >= minBalance", () => {
    render(<ServiceMiniCard {...baseProps} balance={500} minBalance={500} />);
    expect(screen.queryByText(/below threshold/i)).toBeNull();
  });

  it("renders placeholder when iconUrl is null", () => {
    render(<ServiceMiniCard {...baseProps} iconUrl={null} />);
    // Placeholder uses a div with role=presentation or similar; we just check no <img> with empty src
    const imgs = screen.queryAllByRole("img");
    if (imgs.length > 0) {
      expect((imgs[0] as HTMLImageElement).src).not.toBe("");
    }
  });

  it("links to the detail page", () => {
    render(<ServiceMiniCard {...baseProps} />);
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.href).toContain("/accounts/services/sa-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run app/accounts/services/_components/service-mini-card.test.tsx
```

Expected: FAIL — `Cannot find module './service-mini-card'`.

- [ ] **Step 3: Write the implementation**

Create `app/accounts/services/_components/service-mini-card.tsx`:

```tsx
import Link from "next/link";
import { isBreaching } from "@/lib/service-accounts/threshold";

type Props = {
  id: string;
  name: string;
  balance: number;
  minBalance: number;
  weeksOfBurn: number | null;
  iconUrl: string | null;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });

export function ServiceMiniCard(props: Props) {
  const breach = isBreaching(props.balance, props.minBalance);

  return (
    <Link
      href={`/accounts/services/${props.id}`}
      className={`block w-full aspect-square rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors ${
        breach ? "border-destructive" : "border-border"
      }`}
      data-testid={`service-card-${props.id}`}
    >
      <div className="flex flex-col h-full">
        {/* Icon area — fixed height */}
        <div className="flex items-center justify-center h-16 mb-2">
          {props.iconUrl ? (
            <img
              src={props.iconUrl}
              alt={`${props.name} logo`}
              className="max-h-12 max-w-12 object-contain"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
              {props.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="font-semibold text-sm text-center mb-1 truncate">{props.name}</div>

        {/* Balance */}
        <div className="text-2xl font-bold text-center mb-1">{fmtMoney(props.balance)}</div>

        {/* Threshold + weeks of burn */}
        <div className="text-xs text-muted-foreground text-center mt-auto">
          <div>{fmtMoney(props.minBalance)} floor</div>
          <div className="mt-0.5">
            {props.weeksOfBurn === null ? "—" : `${Math.floor(props.weeksOfBurn)} weeks of burn`}
          </div>
        </div>

        {breach && (
          <div className="mt-2 text-xs font-medium text-destructive text-center">
            Below threshold
          </div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/accounts/services/_components/service-mini-card.test.tsx
```

Expected: 7 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/accounts/services/_components/service-mini-card.tsx app/accounts/services/_components/service-mini-card.test.tsx
git commit -m "feat(service-accounts): ServiceMiniCard — fixed-size square with icon + breach badge"
```

---

## Task 11: `service-account-form.tsx` — create/edit form

**Files:**
- Create: `app/accounts/services/_components/service-account-form.tsx`
- Test: `app/accounts/services/_components/service-account-form.test.tsx`

Client component for creating or editing a service account. Submits to the API routes from Task 6 (POST) or Task 7 (PATCH).

- [ ] **Step 1: Write failing tests**

Create `app/accounts/services/_components/service-account-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceAccountForm } from "./service-account-form";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ serviceAccount: { id: "sa-new" } }), { status: 200 })
  ));
});

describe("ServiceAccountForm — create mode", () => {
  it("renders all required fields", () => {
    render(<ServiceAccountForm mode="create" />);
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/min.*balance/i)).toBeTruthy();
    expect(screen.getByLabelText(/target.*balance/i)).toBeTruthy();
    expect(screen.getByLabelText(/icon url/i)).toBeTruthy();
  });

  it("submits POST with right body shape", async () => {
    render(<ServiceAccountForm mode="create" />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Power" } });
    fireEvent.change(screen.getByLabelText(/min.*balance/i), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/target.*balance/i), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/icon url/i), { target: { value: "https://example.com/mercury.png" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe("/api/service-accounts");
      expect(calls[0][1].method).toBe("POST");
      const body = JSON.parse(calls[0][1].body);
      expect(body.name).toBe("Power");
      expect(body.min_balance).toBe(500);
      expect(body.target_balance).toBe(1000);
      expect(body.icon_url).toBe("https://example.com/mercury.png");
    });
  });

  it("blocks submit when name is empty", async () => {
    render(<ServiceAccountForm mode="create" />);
    fireEvent.change(screen.getByLabelText(/min.*balance/i), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeTruthy();
    });
    expect((global.fetch as any).mock.calls.length).toBe(0);
  });

  it("blocks submit when min_balance is negative", async () => {
    render(<ServiceAccountForm mode="create" />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Power" } });
    fireEvent.change(screen.getByLabelText(/min.*balance/i), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/min.*must be 0 or more/i)).toBeTruthy();
    });
  });
});

describe("ServiceAccountForm — edit mode", () => {
  it("pre-fills form with existing values", () => {
    render(<ServiceAccountForm mode="edit" id="sa-1" initial={{
      name: "Existing",
      min_balance: 300,
      target_balance: 800,
      icon_url: "https://example.com/x.png",
    }} />);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe("Existing");
    expect((screen.getByLabelText(/min.*balance/i) as HTMLInputElement).value).toBe("300");
  });

  it("submits PATCH on edit", async () => {
    render(<ServiceAccountForm mode="edit" id="sa-1" initial={{
      name: "Existing",
      min_balance: 300,
      target_balance: null,
      icon_url: null,
    }} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(calls[0][0]).toBe("/api/service-accounts/sa-1");
      expect(calls[0][1].method).toBe("PATCH");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Projects/finance-v2
npx vitest run app/accounts/services/_components/service-account-form.test.tsx
```

Expected: FAIL — `Cannot find module './service-account-form'`.

- [ ] **Step 3: Write the implementation**

Create `app/accounts/services/_components/service-account-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Initial = {
  name: string;
  min_balance: number;
  target_balance: number | null;
  icon_url: string | null;
};

type Props =
  | { mode: "create"; initial?: undefined; id?: undefined }
  | { mode: "edit"; id: string; initial: Initial };

export function ServiceAccountForm(props: Props) {
  const router = useRouter();
  const [name, setName] = useState(props.mode === "edit" ? props.initial.name : "");
  const [minBalance, setMinBalance] = useState(
    props.mode === "edit" ? String(props.initial.min_balance) : "",
  );
  const [targetBalance, setTargetBalance] = useState(
    props.mode === "edit" && props.initial.target_balance !== null
      ? String(props.initial.target_balance)
      : "",
  );
  const [iconUrl, setIconUrl] = useState(
    props.mode === "edit" && props.initial.icon_url !== null
      ? props.initial.icon_url
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const min = Number(minBalance);
    if (!Number.isFinite(min) || min < 0) {
      setError("Min balance must be 0 or more.");
      return;
    }
    const target = targetBalance.trim() === "" ? null : Number(targetBalance);
    if (target !== null && (!Number.isFinite(target) || target < 0)) {
      setError("Target balance must be 0 or more.");
      return;
    }

    const body = {
      name: name.trim(),
      min_balance: min,
      target_balance: target,
      icon_url: iconUrl.trim() || null,
    };

    setBusy(true);
    try {
      const url = props.mode === "create"
        ? "/api/service-accounts"
        : `/api/service-accounts/${props.id}`;
      const res = await fetch(url, {
        method: props.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Couldn't save. Try again.");
        return;
      }
      router.push("/accounts/services");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-md">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">Name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="min-balance" className="block text-sm font-medium mb-1">
          Min balance (alert threshold)
        </label>
        <input
          id="min-balance"
          type="number"
          step="0.01"
          value={minBalance}
          onChange={(e) => setMinBalance(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="target-balance" className="block text-sm font-medium mb-1">
          Target balance (top-up goal, optional)
        </label>
        <input
          id="target-balance"
          type="number"
          step="0.01"
          value={targetBalance}
          onChange={(e) => setTargetBalance(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="icon-url" className="block text-sm font-medium mb-1">
          Icon URL (optional)
        </label>
        <input
          id="icon-url"
          type="url"
          value={iconUrl}
          onChange={(e) => setIconUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/accounts/services/_components/service-account-form.test.tsx
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/accounts/services/_components/service-account-form.tsx app/accounts/services/_components/service-account-form.test.tsx
git commit -m "feat(service-accounts): ServiceAccountForm with create + edit modes"
```

---

## Task 12: `/accounts/services/page.tsx` — list page

**Files:**
- Create: `app/accounts/services/page.tsx`
- Create: `app/accounts/services/new/page.tsx`

Server component that lists service accounts as mini-cards. New page hosts the create form.

- [ ] **Step 1: Write `/accounts/services/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ServiceMiniCard } from "./_components/service-mini-card";
import { computeBalance } from "@/lib/service-accounts/balance";
import { computeBurnRate } from "@/lib/service-accounts/burn-rate";

export default async function ServicesListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) {
    return (
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground">No household. Sign in again.</p>
      </main>
    );
  }

  const { data: serviceRows } = await supabase
    .schema("v2")
    .from("service_accounts")
    .select("id, account_id, min_balance, target_balance, icon_url, accounts:account_id(name)")
    .eq("household_id", hh.id)
    .is("archived_at", null);

  const services = (serviceRows ?? []) as Array<{
    id: string;
    account_id: string;
    min_balance: number;
    target_balance: number | null;
    icon_url: string | null;
    accounts: { name: string } | null;
  }>;

  // Fetch transactions and bills for each service account in one Promise.all
  const enriched = await Promise.all(
    services.map(async (s) => {
      const [{ data: txns }, { data: bills }] = await Promise.all([
        supabase
          .schema("v2")
          .from("transactions")
          .select("amount, type")
          .eq("household_id", hh.id)
          .eq("account_id", s.account_id),
        supabase
          .schema("v2")
          .from("bills")
          .select("amount, applied_to_balance_at")
          .eq("service_account_id", s.id),
      ]);
      const balance = computeBalance(txns ?? []);
      const { weeksOfBurn } = computeBurnRate(bills ?? [], balance);
      return {
        id: s.id,
        name: s.accounts?.name ?? "—",
        balance,
        minBalance: Number(s.min_balance),
        weeksOfBurn,
        iconUrl: s.icon_url,
      };
    }),
  );

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service accounts</h1>
        <Link
          href="/accounts/services/new"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          + Add service account
        </Link>
      </header>

      {enriched.length === 0 ? (
        <p className="text-sm text-muted-foreground">No service accounts yet. Add one to get started.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {enriched.map((s) => (
            <ServiceMiniCard key={s.id} {...s} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write `/accounts/services/new/page.tsx`**

Create `app/accounts/services/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServiceAccountForm } from "../_components/service-account-form";

export default async function NewServiceAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New service account</h1>
      <ServiceAccountForm mode="create" />
    </main>
  );
}
```

- [ ] **Step 3: Verify the pages compile + dev server renders them**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit 2>&1 | grep -E "^app/accounts/services" || echo "(clean)"
```

Then start dev server, sign in as demo user, navigate to `/accounts/services` — should render an empty-state message. Navigate to `/accounts/services/new` — form renders.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2
git add app/accounts/services/page.tsx app/accounts/services/new/page.tsx
git commit -m "feat(service-accounts): list page (mini-cards) + new page"
```

---

## Task 13: `topup-form.tsx` + `bill-form.tsx`

**Files:**
- Create: `app/accounts/services/[id]/_components/topup-form.tsx`
- Test: `app/accounts/services/[id]/_components/topup-form.test.tsx`
- Create: `app/accounts/services/[id]/_components/bill-form.tsx`
- Test: `app/accounts/services/[id]/_components/bill-form.test.tsx`

- [ ] **Step 1: Write topup-form failing tests**

Create `app/accounts/services/[id]/_components/topup-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TopupForm } from "./topup-form";

const sourceAccounts = [
  { id: "src-acc-1", name: "Everyday" },
  { id: "src-acc-2", name: "Bills" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })
  ));
});

describe("TopupForm", () => {
  it("renders amount, source, date inputs", () => {
    render(<TopupForm serviceAccountId="sa-1" sourceAccounts={sourceAccounts} />);
    expect(screen.getByLabelText(/amount/i)).toBeTruthy();
    expect(screen.getByLabelText(/source/i)).toBeTruthy();
    expect(screen.getByLabelText(/date/i)).toBeTruthy();
  });

  it("submits with right body", async () => {
    render(<TopupForm serviceAccountId="sa-1" sourceAccounts={sourceAccounts} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: "src-acc-1" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-01" } });
    fireEvent.click(screen.getByRole("button", { name: /add top-up/i }));
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(calls[0][0]).toBe("/api/service-accounts/sa-1/topup");
      const body = JSON.parse(calls[0][1].body);
      expect(body.amount).toBe(250);
      expect(body.source_account_id).toBe("src-acc-1");
      expect(body.date).toBe("2026-05-01");
    });
  });

  it("blocks submit when amount missing", async () => {
    render(<TopupForm serviceAccountId="sa-1" sourceAccounts={sourceAccounts} />);
    fireEvent.click(screen.getByRole("button", { name: /add top-up/i }));
    await waitFor(() => {
      expect(screen.getByText(/amount.*required/i)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Write bill-form failing tests**

Create `app/accounts/services/[id]/_components/bill-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BillForm } from "./bill-form";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })
  ));
});

describe("BillForm", () => {
  it("renders amount, due_date, billing_period inputs", () => {
    render(<BillForm serviceAccountId="sa-1" />);
    expect(screen.getByLabelText(/amount/i)).toBeTruthy();
    expect(screen.getByLabelText(/due date/i)).toBeTruthy();
    expect(screen.getByLabelText(/period start/i)).toBeTruthy();
    expect(screen.getByLabelText(/period end/i)).toBeTruthy();
  });

  it("submits with required fields", async () => {
    render(<BillForm serviceAccountId="sa-1" />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2026-05-15" } });
    fireEvent.click(screen.getByRole("button", { name: /add bill/i }));
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(calls[0][0]).toBe("/api/service-accounts/sa-1/bill");
      const body = JSON.parse(calls[0][1].body);
      expect(body.amount).toBe(120);
      expect(body.due_date).toBe("2026-05-15");
    });
  });

  it("blocks submit when amount or due_date missing", async () => {
    render(<BillForm serviceAccountId="sa-1" />);
    fireEvent.click(screen.getByRole("button", { name: /add bill/i }));
    await waitFor(() => {
      expect(screen.getByText(/required/i)).toBeTruthy();
    });
  });

  it("submits with optional billing_period fields", async () => {
    render(<BillForm serviceAccountId="sa-1" />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2026-05-15" } });
    fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-04-15" } });
    fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-05-14" } });
    fireEvent.click(screen.getByRole("button", { name: /add bill/i }));
    await waitFor(() => {
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.billing_period_start).toBe("2026-04-15");
      expect(body.billing_period_end).toBe("2026-05-14");
    });
  });
});
```

- [ ] **Step 3: Run both test files — fail expected**

```bash
cd ~/Projects/finance-v2
npx vitest run 'app/accounts/services/[id]/_components/'
```

Expected: FAIL on both — modules not found.

- [ ] **Step 4: Implement topup-form.tsx**

Create `app/accounts/services/[id]/_components/topup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SourceAccount = { id: string; name: string };

type Props = {
  serviceAccountId: string;
  sourceAccounts: SourceAccount[];
};

export function TopupForm({ serviceAccountId, sourceAccounts }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState(sourceAccounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) {
      setError("Amount is required and must be positive.");
      return;
    }
    if (!sourceId) {
      setError("Pick a source account.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/service-accounts/${serviceAccountId}/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: a, source_account_id: sourceId, date }),
      });
      if (!res.ok) {
        setError("Couldn't add top-up. Try again.");
        return;
      }
      setAmount("");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md">
      <div>
        <label htmlFor="topup-amount" className="block text-sm font-medium mb-1">Amount</label>
        <input
          id="topup-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="topup-source" className="block text-sm font-medium mb-1">Source account</label>
        <select
          id="topup-source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {sourceAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="topup-date" className="block text-sm font-medium mb-1">Date</label>
        <input
          id="topup-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add top-up"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Implement bill-form.tsx**

Create `app/accounts/services/[id]/_components/bill-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { serviceAccountId: string };

export function BillForm({ serviceAccountId }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) {
      setError("Amount is required and must be positive.");
      return;
    }
    if (!dueDate) {
      setError("Due date is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/service-accounts/${serviceAccountId}/bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: a,
          due_date: dueDate,
          billing_period_start: periodStart || null,
          billing_period_end: periodEnd || null,
        }),
      });
      if (!res.ok) {
        setError("Couldn't add bill. Try again.");
        return;
      }
      setAmount("");
      setDueDate("");
      setPeriodStart("");
      setPeriodEnd("");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md">
      <div>
        <label htmlFor="bill-amount" className="block text-sm font-medium mb-1">Amount</label>
        <input
          id="bill-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="bill-due-date" className="block text-sm font-medium mb-1">Due date</label>
        <input
          id="bill-due-date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="bill-period-start" className="block text-sm font-medium mb-1">Period start (optional)</label>
        <input
          id="bill-period-start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="bill-period-end" className="block text-sm font-medium mb-1">Period end (optional)</label>
        <input
          id="bill-period-end"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add bill"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd ~/Projects/finance-v2
npx vitest run 'app/accounts/services/[id]/_components/'
```

Expected: 7 tests passing total (3 topup + 4 bill).

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/finance-v2
git add 'app/accounts/services/[id]/_components/'
git commit -m "feat(service-accounts): TopupForm + BillForm with validation"
```

---

## Task 14: `/accounts/services/[id]/page.tsx` — detail view

**Files:**
- Create: `app/accounts/services/[id]/page.tsx`

Server component showing balance + threshold + weeks-of-burn + recent top-ups + recent bills + the two entry forms.

- [ ] **Step 1: Write the page**

Create `app/accounts/services/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeBalance } from "@/lib/service-accounts/balance";
import { computeBurnRate } from "@/lib/service-accounts/burn-rate";
import { isBreaching } from "@/lib/service-accounts/threshold";
import { TopupForm } from "./_components/topup-form";
import { BillForm } from "./_components/bill-form";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 2 });

type Params = { id: string };

export default async function ServiceDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) redirect("/login");

  const { data: saRow } = await supabase
    .schema("v2")
    .from("service_accounts")
    .select("id, account_id, min_balance, target_balance, icon_url, accounts:account_id(name)")
    .eq("id", id)
    .eq("household_id", hh.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!saRow) notFound();

  const sa = saRow as {
    id: string;
    account_id: string;
    min_balance: number;
    target_balance: number | null;
    icon_url: string | null;
    accounts: { name: string } | null;
  };

  const [{ data: txns }, { data: bills }, { data: sources }] = await Promise.all([
    supabase
      .schema("v2")
      .from("transactions")
      .select("id, posted_at, amount, type, merchant_clean")
      .eq("household_id", hh.id)
      .eq("account_id", sa.account_id)
      .order("posted_at", { ascending: false })
      .limit(10),
    supabase
      .schema("v2")
      .from("bills")
      .select("id, amount, due_date, billing_period_start, billing_period_end, applied_to_balance_at")
      .eq("service_account_id", sa.id)
      .order("applied_to_balance_at", { ascending: false })
      .limit(10),
    supabase
      .schema("v2")
      .from("accounts")
      .select("id, name, type")
      .eq("household_id", hh.id)
      .neq("type", "service"),
  ]);

  // Compute balance from ALL txns of this account, not just the limited 10
  const { data: allTxns } = await supabase
    .schema("v2")
    .from("transactions")
    .select("amount, type")
    .eq("household_id", hh.id)
    .eq("account_id", sa.account_id);
  const balance = computeBalance(allTxns ?? []);

  const { data: allBills } = await supabase
    .schema("v2")
    .from("bills")
    .select("amount, applied_to_balance_at")
    .eq("service_account_id", sa.id);
  const { weeksOfBurn, monthlyAverage } = computeBurnRate(allBills ?? [], balance);

  const breach = isBreaching(balance, Number(sa.min_balance));
  const sourceAccounts = (sources ?? []) as Array<{ id: string; name: string }>;

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center gap-4">
        {sa.icon_url ? (
          <img src={sa.icon_url} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{sa.accounts?.name ?? "—"}</h1>
          <p className="text-sm text-muted-foreground">Service account</p>
        </div>
      </header>

      <section className={`rounded-lg border p-4 mb-6 ${breach ? "border-destructive" : "border-border"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="text-2xl font-bold">{fmtMoney(balance)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Min balance</div>
            <div className="text-2xl font-bold">{fmtMoney(Number(sa.min_balance))}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Target balance</div>
            <div className="text-2xl font-bold">{sa.target_balance !== null ? fmtMoney(Number(sa.target_balance)) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Weeks of burn</div>
            <div className="text-2xl font-bold">
              {weeksOfBurn === null ? "—" : Math.floor(weeksOfBurn)}
            </div>
            {monthlyAverage !== null && (
              <div className="text-xs text-muted-foreground">
                avg {fmtMoney(monthlyAverage)}/mo
              </div>
            )}
          </div>
        </div>
        {breach && (
          <div className="mt-4 text-sm font-medium text-destructive">
            ⚠ Below threshold — balance is under the {fmtMoney(Number(sa.min_balance))} floor.
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <section>
          <h2 className="text-lg font-semibold mb-2">Add top-up</h2>
          <TopupForm serviceAccountId={sa.id} sourceAccounts={sourceAccounts} />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-2">Add bill</h2>
          <BillForm serviceAccountId={sa.id} />
        </section>
      </div>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Recent transactions</h2>
        {(txns ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(txns ?? []).map((t: { id: string; posted_at: string; amount: number; type: string; merchant_clean: string | null }) => (
              <li key={t.id} className="flex justify-between border-b border-border py-1.5">
                <span>{t.posted_at} · {t.merchant_clean ?? t.type}</span>
                <span className={Number(t.amount) < 0 ? "text-destructive" : "text-foreground"}>
                  {fmtMoney(Number(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Recent bills</h2>
        {(bills ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(bills ?? []).map((b: { id: string; amount: number; due_date: string; billing_period_start: string | null; billing_period_end: string | null }) => (
              <li key={b.id} className="flex justify-between border-b border-border py-1.5">
                <span>
                  Due {b.due_date}
                  {b.billing_period_start && b.billing_period_end &&
                    ` · ${b.billing_period_start} → ${b.billing_period_end}`}
                </span>
                <span>{fmtMoney(Number(b.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit 2>&1 | grep -E "^app/accounts/services" || echo "(clean)"
```

Expected: clean.

- [ ] **Step 3: Smoke in dev server**

Start dev server, sign in as demo, create a service account at `/accounts/services/new`, navigate to its detail page, add a top-up, add a bill, verify they appear in lists.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2
git add 'app/accounts/services/[id]/page.tsx'
git commit -m "feat(service-accounts): detail page with balance, forms, recent activity"
```

---

## Task 15: Dashboard summary tile + wiring

**Files:**
- Create: `app/dashboard/_tiles/service-accounts-tile.tsx`
- Test: `app/dashboard/_tiles/service-accounts-tile.test.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Write failing tests**

Create `app/dashboard/_tiles/service-accounts-tile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceAccountsTile } from "./service-accounts-tile";

describe("ServiceAccountsTile", () => {
  it("renders count + 'no breaches' when breachCount=0", () => {
    render(<ServiceAccountsTile count={3} breachCount={0} />);
    expect(screen.getByText(/3.*service accounts/i)).toBeTruthy();
    expect(screen.queryByText(/need attention/i)).toBeNull();
  });

  it("renders breach count when breachCount>0", () => {
    render(<ServiceAccountsTile count={3} breachCount={1} />);
    expect(screen.getByText(/1.*need.*attention/i)).toBeTruthy();
  });

  it("links to /accounts/services", () => {
    render(<ServiceAccountsTile count={3} breachCount={0} />);
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.href).toContain("/accounts/services");
  });

  it("renders empty state when count=0", () => {
    render(<ServiceAccountsTile count={0} breachCount={0} />);
    expect(screen.getByText(/no service accounts/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — fail expected**

```bash
cd ~/Projects/finance-v2
npx vitest run app/dashboard/_tiles/service-accounts-tile.test.tsx
```

- [ ] **Step 3: Write the component**

Create `app/dashboard/_tiles/service-accounts-tile.tsx`:

```tsx
import Link from "next/link";

type Props = { count: number; breachCount: number };

export function ServiceAccountsTile({ count, breachCount }: Props) {
  return (
    <Link
      href="/accounts/services"
      className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
      data-testid="service-accounts-tile"
    >
      <div className="text-xs text-muted-foreground mb-1">Service accounts</div>
      {count === 0 ? (
        <div className="text-sm text-muted-foreground">No service accounts yet.</div>
      ) : (
        <>
          <div className="text-2xl font-bold">{count} service accounts</div>
          {breachCount > 0 ? (
            <div className="mt-1 text-xs text-destructive font-medium">
              {breachCount} need attention
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">All within thresholds</div>
          )}
        </>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
cd ~/Projects/finance-v2
npx vitest run app/dashboard/_tiles/service-accounts-tile.test.tsx
```

Expected: 4 passing.

- [ ] **Step 5: Wire into dashboard**

Edit `app/dashboard/page.tsx`:

1. Add imports:
```ts
import { ServiceAccountsTile } from "./_tiles/service-accounts-tile";
import { computeBalance } from "@/lib/service-accounts/balance";
import { isBreaching } from "@/lib/service-accounts/threshold";
```

2. Inside the component, after existing data fetches, add:
```ts
const { data: serviceAccountsRows } = await supabase
  .schema("v2")
  .from("service_accounts")
  .select("id, account_id, min_balance")
  .eq("household_id", hh.id)
  .is("archived_at", null);

const saRows = (serviceAccountsRows ?? []) as Array<{ id: string; account_id: string; min_balance: number }>;
let serviceAccountBreachCount = 0;

if (saRows.length > 0) {
  const accountIds = saRows.map((s) => s.account_id);
  const { data: saTxns } = await supabase
    .schema("v2")
    .from("transactions")
    .select("account_id, amount, type")
    .eq("household_id", hh.id)
    .in("account_id", accountIds);

  const balanceByAccount = new Map<string, number>();
  for (const t of (saTxns ?? []) as Array<{ account_id: string; amount: number; type: string }>) {
    const prev = balanceByAccount.get(t.account_id) ?? 0;
    balanceByAccount.set(t.account_id, prev + Number(t.amount));
  }
  for (const s of saRows) {
    const bal = balanceByAccount.get(s.account_id) ?? 0;
    if (isBreaching(bal, Number(s.min_balance))) serviceAccountBreachCount++;
  }
}
```

3. In the JSX, add the tile in the grid (existing `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` block):
```tsx
<ServiceAccountsTile count={saRows.length} breachCount={serviceAccountBreachCount} />
```

- [ ] **Step 6: Type-check + smoke**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit 2>&1 | grep -E "^app/dashboard" || echo "(clean)"
```

Then start dev server, sign in as demo, navigate to `/dashboard`, verify the tile renders with count + breach state, click it → lands on `/accounts/services`.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/finance-v2
git add app/dashboard/_tiles/service-accounts-tile.tsx app/dashboard/_tiles/service-accounts-tile.test.tsx app/dashboard/page.tsx
git commit -m "feat(dashboard): ServiceAccountsTile with count + breach summary"
```

---

## Task 16: Extend `AdvisorContext` + system prompt

**Files:**
- Modify: `lib/advisor/build-context.ts`
- Modify: `lib/advisor/build-context.test.ts`
- Modify: `lib/advisor/system-prompt.ts`

- [ ] **Step 1: Add failing test for serviceAccounts in AdvisorContext**

Append to `lib/advisor/build-context.test.ts`:

```ts
describe("buildAdvisorContext — service accounts", () => {
  it("returns empty serviceAccounts when household has none", async () => {
    const sb = fakeSupabase({
      transactions: [],
      rules: [],
      categories: [],
      accounts: [],
      service_accounts: [],
      bills: [],
    });
    const ctx = await buildAdvisorContext(sb as any, "h1", "2026-04-14");
    expect(ctx.serviceAccounts).toEqual([]);
  });

  it("populates serviceAccounts with balance + threshold + weeksOfBurn", async () => {
    const sb = fakeSupabase({
      transactions: [
        // Service account credit (top-up)
        { posted_at: "2026-04-15", amount: 600, type: "transfer", account_id: "svc-acc-1", category_id: null },
        // Service account expense (bill)
        { posted_at: "2026-04-20", amount: -100, type: "expense", account_id: "svc-acc-1", category_id: null },
      ],
      rules: [],
      categories: [],
      accounts: [{ id: "svc-acc-1", name: "Power", balance: 0 }],
      service_accounts: [
        { id: "sa-1", account_id: "svc-acc-1", min_balance: 300, target_balance: 800 },
      ],
      bills: [], // <3 bills → weeksOfBurn null
    });
    const ctx = await buildAdvisorContext(sb as any, "h1", "2026-04-14");
    expect(ctx.serviceAccounts.length).toBe(1);
    expect(ctx.serviceAccounts[0].name).toBe("Power");
    expect(ctx.serviceAccounts[0].balance).toBe(500); // 600 - 100
    expect(ctx.serviceAccounts[0].minBalance).toBe(300);
    expect(ctx.serviceAccounts[0].targetBalance).toBe(800);
    expect(ctx.serviceAccounts[0].weeksOfBurn).toBeNull();
    expect(ctx.serviceAccounts[0].isBreaching).toBe(false);
  });

  it("flags isBreaching=true when balance < min_balance", async () => {
    const sb = fakeSupabase({
      transactions: [
        { posted_at: "2026-04-15", amount: 100, type: "transfer", account_id: "svc-acc-1", category_id: null },
      ],
      rules: [],
      categories: [],
      accounts: [{ id: "svc-acc-1", name: "Power", balance: 0 }],
      service_accounts: [
        { id: "sa-1", account_id: "svc-acc-1", min_balance: 300, target_balance: null },
      ],
      bills: [],
    });
    const ctx = await buildAdvisorContext(sb as any, "h1", "2026-04-14");
    expect(ctx.serviceAccounts[0].isBreaching).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — fail expected**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/advisor/build-context.test.ts
```

Expected: NEW tests fail; existing tests still pass.

- [ ] **Step 3: Extend `lib/advisor/build-context.ts`**

In `lib/advisor/build-context.ts`:

1. Add to the `AdvisorContext` type:
```ts
serviceAccounts: Array<{
  name: string;
  balance: number;
  minBalance: number;
  targetBalance: number | null;
  weeksOfBurn: number | null;
  isBreaching: boolean;
}>;
```

2. Add imports at top:
```ts
import { computeBalance } from "@/lib/service-accounts/balance";
import { computeBurnRate } from "@/lib/service-accounts/burn-rate";
import { isBreaching as isBreachingFn } from "@/lib/service-accounts/threshold";
```

3. Inside `buildAdvisorContext`, add fetches to the existing Promise.all:
```ts
const [
  /* existing 5 fetches */,
  serviceAccountsRes,
  billsRes,
] = await Promise.all([
  /* existing 5 fetches */,
  sb.schema("v2").from("service_accounts")
    .select("id, account_id, min_balance, target_balance")
    .eq("household_id", householdId),
  sb.schema("v2").from("bills")
    .select("amount, applied_to_balance_at, service_account_id")
    .eq("household_id", householdId),
]);
```

4. After existing computations, add:
```ts
const saRows = (serviceAccountsRes.data ?? []) as Array<{ id: string; account_id: string; min_balance: number; target_balance: number | null }>;
const allBills = (billsRes.data ?? []) as Array<{ amount: number; applied_to_balance_at: string; service_account_id: string }>;
const allTxns = (txnsThis.data ?? []).concat(/* you may also want to query all-time txns; for advisor cycle context, this cycle's txns suffice */);
// For simplicity, compute service account balance from ALL transactions in v2.transactions for that account_id.
// We'll do a separate query:
const accountIds = saRows.map((s) => s.account_id);
let txnsByAccount: Map<string, Array<{ amount: number; type: string }>> = new Map();
if (accountIds.length > 0) {
  const { data: saTxnsAll } = await sb
    .schema("v2")
    .from("transactions")
    .select("account_id, amount, type")
    .eq("household_id", householdId)
    .in("account_id", accountIds);
  for (const t of (saTxnsAll ?? []) as Array<{ account_id: string; amount: number; type: string }>) {
    const arr = txnsByAccount.get(t.account_id) ?? [];
    arr.push(t);
    txnsByAccount.set(t.account_id, arr);
  }
}

const serviceAccounts = saRows.map((s) => {
  const txns = txnsByAccount.get(s.account_id) ?? [];
  const balance = computeBalance(txns);
  const billsForSa = allBills.filter((b) => b.service_account_id === s.id);
  const { weeksOfBurn } = computeBurnRate(billsForSa, balance);
  const name = accountById.get(s.account_id)?.name ?? "—";
  return {
    name,
    balance,
    minBalance: Number(s.min_balance),
    targetBalance: s.target_balance !== null ? Number(s.target_balance) : null,
    weeksOfBurn,
    isBreaching: isBreachingFn(balance, Number(s.min_balance)),
  };
});
```

5. Include `serviceAccounts` in the returned `AdvisorContext`.

- [ ] **Step 4: Update `lib/advisor/system-prompt.ts`**

Append a new paragraph to `ADVISOR_SYSTEM_PROMPT` (above the "Output:" line):

```
Service accounts: serviceAccounts is a list of household-managed bills accounts (Power, Water, etc.) each with a balance, min_balance threshold, and optional weeks_of_burn metric. When isBreaching is true, surface that account in items[] with priority "high" framed as "<name> below the $X floor". When weeks_of_burn is non-null and ≤ 6, surface as priority "medium". Don't speculate about service accounts that aren't breaching or running low. Don't suggest rules for service-account top-ups (they're transfers, not categorisable expenses).
```

- [ ] **Step 5: Run tests**

```bash
cd ~/Projects/finance-v2
npx vitest run lib/advisor/
```

Expected: all advisor tests pass (existing + new). The `fakeSupabase` Proxy in `build-context.test.ts` may need extending to handle `.in()` chains — if the new tests fail because the proxy doesn't return data for `service_accounts`/`bills`, extend the helper to route those tables. Update test fixtures as needed.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2
git add lib/advisor/build-context.ts lib/advisor/build-context.test.ts lib/advisor/system-prompt.ts
git commit -m "feat(advisor): include service accounts + thresholds in context"
```

---

## Task 17: PHASE-6A-COMPLETE marker + smoke checklist

**Files:**
- Create: `docs/PHASE-6A-COMPLETE.md`

- [ ] **Step 1: Write the marker**

Create `docs/PHASE-6A-COMPLETE.md`:

```markdown
# Phase 6a — Service Accounts (foundation) — Complete

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-05-01-phase-6a-service-accounts-design.md`
**Plan:** `~/Projects/finance/docs/superpowers/plans/2026-05-01-phase-6a-service-accounts.md`

## What shipped

- Two new tables: `v2.service_accounts` (1:1 with `v2.accounts`, holds `min_balance`, `target_balance`, `icon_url`, archive flag, future-6c fields), `v2.bills` (1:1 with expense transactions, holds billing period + due date + 6c fields)
- Pure-function helpers: `lib/service-accounts/balance.ts`, `burn-rate.ts`, `threshold.ts`
- Five new API routes: GET/POST `/api/service-accounts`, PATCH/DELETE `/api/service-accounts/[id]`, POST `/api/service-accounts/[id]/topup`, POST `/api/service-accounts/[id]/bill`
- Dedicated UI: `/accounts/services` (list page with mini-cards), `/accounts/services/new` (create), `/accounts/services/[id]` (detail with both entry forms)
- Dashboard summary tile: `ServiceAccountsTile` (count + breach count, links to list)
- AI advisor integration: `serviceAccounts[]` in `AdvisorContext`, system prompt extended for breach + low-burn framing
- Threshold breaches surface in 3 places: mini-card badge + dashboard tile counter + advisor context

## Manual smoke (after first deploy)

- Sign in as demo
- Visit `/accounts/services` → empty state
- Click "+ Add service account" → fill form (name "Test Power", min_balance 500, target_balance 1000, icon URL of any provider) → save → land back on list
- Verify mini-card shows "Test Power", balance $0, $500 floor, "—" for weeks of burn
- Mini-card has red border + "Below threshold" badge (since balance $0 < $500)
- Click the card → detail page renders
- Add a top-up of $600 from a regular account → balance updates to $600
- Refresh list page → mini-card now shows green (no breach)
- Add a bill of $150 → balance drops to $450 → mini-card now shows breach again
- Visit `/dashboard` → ServiceAccountsTile shows "1 service accounts" + "1 need attention"
- Click advisor "How's it looking?" → response should mention the breaching account

## Out of scope (deferred)

- AP recommendation flow + Akahu top-up auto-detection — Phase 6b
- Email + Claude vision bill capture — Phase 6c
- Recurring bill awareness / forecasting — Phase 8
- Multi-currency — never
```

- [ ] **Step 2: Commit**

```bash
cd ~/Projects/finance-v2
git add docs/PHASE-6A-COMPLETE.md
git commit -m "docs: PHASE-6A-COMPLETE marker + smoke checklist"
```

---

## Final integration check

- [ ] **Step 1: Full vitest suite**

```bash
cd ~/Projects/finance-v2
npx vitest run
```

Expected: all tests pass. Phase 6a adds ~50+ new tests; total should be ~240+ across ~35 files.

- [ ] **Step 2: Type check**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit
```

Expected: clean (other than pre-existing make-rule-modal mock errors which are unrelated to 6a).

- [ ] **Step 3: Push**

```bash
cd ~/Projects/finance-v2
git push origin main
```

- [ ] **Step 4: Deploy**

```bash
cd ~/Projects/finance-v2
vercel --prod
```

Expected: build succeeds, status READY. Then walk the manual smoke checklist in `docs/PHASE-6A-COMPLETE.md`.
