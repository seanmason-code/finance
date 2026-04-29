# Phase 3a — Akahu Connect + First Manual Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sean clicks one "Sync from Akahu" button on `/accounts`, fresh bank transactions appear in v2.

**Architecture:** A thin `BankFeedProvider` interface in `lib/bank-feed/` with a single Akahu implementation. A `/api/sync` POST route orchestrates the flow: pull accounts via the provider, hybrid-link to existing v2 accounts, prompt for unmatched ones, fetch transactions dated `>= cutover_date`, insert into v2. A new `bank_feed_state` table tracks the cutover date and last-sync timestamp per household.

**Tech Stack:** Next.js 16.2 App Router, Supabase (`v2` schema), Vitest for unit tests with `vi.fn()` for fetch mocking, Playwright for E2E. Akahu Personal API (User Token + App Token bearer auth). All tokens stored as Vercel env vars.

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-29-phase-3a-akahu-connect-design.md`

**Project notes (from `/home/seanm/Projects/finance-v2/AGENTS.md`):**
- This is Next.js 16. Read `node_modules/next/dist/docs/` before assuming familiar APIs.
- For any UI work, invoke `ui-stack` first, then `awesome-design` before writing component markup.

---

## Task 1: Sean sets up Akahu (manual logistics, no code)

**Files:** None.

This task has no code. Sean does it once. The remaining tasks all depend on the tokens captured here.

- [ ] **Step 1: Sign up at https://my.akahu.nz**

Sean opens https://my.akahu.nz, signs up with `seanmason.email@gmail.com`. Confirms email.

- [ ] **Step 2: Connect banks**

In the my.akahu.nz dashboard, Sean clicks "Connect a Bank" and walks through the OAuth flow for each bank he uses (Kiwibank, ANZ, ASB — whichever applies). Each bank requires logging into the bank's online banking through Akahu's secure widget.

Expected: at least one bank account appears under "Accounts" in the my.akahu.nz dashboard.

- [ ] **Step 3: Sign up for an Akahu developer App**

Sean opens https://developers.akahu.nz, signs in with the same email, and creates a new App. Name it `finance-v2`. The App represents the integration that will fetch his data.

After creating the App, capture two values:
- **App Token** (sometimes called `app_token` or `app_id`) — identifies the App
- **User Token** — Sean's Personal User Token that grants the App read access to his connected banks. There may be a "Create User Token" button or it may auto-generate. The Akahu docs at https://developers.akahu.nz/docs/personal-api show the current naming.

- [ ] **Step 4: Capture tokens to a scratch file (NOT committed)**

Save both tokens to `~/Projects/finance-v2/.env.local` (which is in `.gitignore` — verify with `cd ~/Projects/finance-v2 && git check-ignore .env.local`). Add lines:

```
AKAHU_APP_TOKEN=<paste app token>
AKAHU_USER_TOKEN=<paste user token>
```

- [ ] **Step 5: Verify the tokens work with curl**

```bash
cd ~/Projects/finance-v2 && \
  source .env.local && \
  curl -s -H "X-Akahu-Id: $AKAHU_APP_TOKEN" -H "Authorization: Bearer $AKAHU_USER_TOKEN" \
    https://api.akahu.io/v1/accounts | jq '.items[] | {id, name, formatted_account, type}'
```

Expected: a JSON list of Sean's connected bank accounts. Each item has `id` (Akahu's internal ID like `acc_xxx`), `name`, `formatted_account` (the account number), `type`.

If the curl returns `401 Unauthorized` or `403`, the tokens or header names are wrong — check Akahu's current API docs at https://developers.akahu.nz/docs/personal-api before continuing.

**No commit for this task** — nothing changed in the repo.

---

## Task 2: Add Akahu env vars to Vercel

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/.env.example`

Tokens captured in Task 1 must reach the deployed Vercel environment.

- [ ] **Step 1: Add placeholder lines to `.env.example`**

Open `/home/seanm/Projects/finance-v2/.env.example` and append:

```
# Akahu Personal API (Phase 3a)
AKAHU_APP_TOKEN=<paste from developers.akahu.nz/apps>
AKAHU_USER_TOKEN=<paste from developers.akahu.nz/apps>
```

- [ ] **Step 2: Push the values to Vercel for production + preview**

Run interactively (Vercel CLI prompts for the value):

```bash
cd ~/Projects/finance-v2 && \
  vercel env add AKAHU_APP_TOKEN production && \
  vercel env add AKAHU_APP_TOKEN preview && \
  vercel env add AKAHU_USER_TOKEN production && \
  vercel env add AKAHU_USER_TOKEN preview
```

For each prompt, paste the token value from `.env.local`. Confirm with `vercel env ls` after.

Expected: `vercel env ls` shows `AKAHU_APP_TOKEN` and `AKAHU_USER_TOKEN` for production + preview.

- [ ] **Step 3: Commit the .env.example change**

```bash
cd ~/Projects/finance-v2 && \
  git add .env.example && \
  git commit -m "feat(akahu): document required env vars in .env.example"
```

---

## Task 3: Add `bank_feed_state` table

**Files:**
- Create: `/home/seanm/Projects/finance-v2/supabase/migrations/0002_bank_feed_state.sql`

A new table to record the per-household cutover date and last-sync timestamp.

- [ ] **Step 1: Create the migration SQL**

Write to `/home/seanm/Projects/finance-v2/supabase/migrations/0002_bank_feed_state.sql`:

```sql
-- Phase 3a — Akahu Connect — bank_feed_state table
-- Tracks the per-household cutover date for fresh bank-feed transactions
-- and the last successful sync timestamp.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS v2.bank_feed_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('akahu')),  -- room for more later
  cutover_date    date NOT NULL,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(household_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_bank_feed_state_household
  ON v2.bank_feed_state(household_id);

-- RLS — household-scoped, same pattern as the other v2 tables
ALTER TABLE v2.bank_feed_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_feed_state_household ON v2.bank_feed_state;
CREATE POLICY bank_feed_state_household ON v2.bank_feed_state
  FOR ALL
  USING (v2.is_household_member(household_id))
  WITH CHECK (v2.is_household_member(household_id));
```

- [ ] **Step 2: Apply via the Supabase SQL editor**

Open https://supabase.com/dashboard/project/caahbpkqfgwkdyobfbpe/sql/new and paste the entire contents of `0002_bank_feed_state.sql`. Click **Run**.

- [ ] **Step 3: Verify the table exists**

In the same SQL editor, run:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'v2' AND table_name = 'bank_feed_state'
ORDER BY ordinal_position;
```

Expected: 7 rows — `id`, `household_id`, `provider`, `cutover_date`, `last_synced_at`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add supabase/migrations/0002_bank_feed_state.sql && \
  git commit -m "feat(schema): add bank_feed_state table for Akahu sync"
```

---

## Task 4: Define the `BankFeedProvider` interface

**Files:**
- Create: `/home/seanm/Projects/finance-v2/lib/bank-feed/types.ts`

A small types-only file. No runtime logic, no test needed (TS compiler is the verification).

- [ ] **Step 1: Create the file**

Write to `/home/seanm/Projects/finance-v2/lib/bank-feed/types.ts`:

```ts
// Phase 3a — Akahu Connect
// Provider-agnostic bank-feed interface. Akahu is the only implementation today.
// The interface keeps Phase 11 ("provider swap") cheap: replace one file,
// not the whole sync pipeline.

export type BankFeedAccount = {
  /** Provider's internal account ID (e.g. Akahu's `acc_xxx`). */
  providerAccountId: string;
  /** Display name from the provider (e.g. "Kiwibank Everyday"). */
  name: string;
  /** Account number string as the provider exposes it (e.g. "38-9020-0211287-05"). */
  accountNumber: string | null;
  /** Provider's free-text type ("CHECKING", "SAVINGS", etc.) — unmapped. */
  type: string | null;
};

export type BankFeedTransaction = {
  /** Provider's internal transaction ID. Used as the upsert key. */
  providerTransactionId: string;
  /** Provider's account ID (foreign key to BankFeedAccount.providerAccountId). */
  providerAccountId: string;
  /** Date the transaction posted (YYYY-MM-DD). */
  postedAt: string;
  /** Signed amount: negative = outflow, positive = inflow. */
  amount: number;
  /** Raw description as provided. */
  description: string;
  /** Cleaned merchant name if the provider has one (Akahu often does). */
  merchantClean: string | null;
};

export interface BankFeedProvider {
  readonly name: 'akahu';
  listAccounts(): Promise<BankFeedAccount[]>;
  listTransactions(opts: { from: string }): Promise<BankFeedTransaction[]>;
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/bank-feed/types.ts && \
  git commit -m "feat(bank-feed): provider-agnostic interface types"
```

---

## Task 5: Implement the Akahu provider (TDD)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/lib/bank-feed/akahu.ts`
- Create: `/home/seanm/Projects/finance-v2/lib/bank-feed/akahu.test.ts`

Implements `BankFeedProvider` against Akahu's REST API. We test with `vi.spyOn(global, 'fetch')` so the test never hits the network.

- [ ] **Step 1: Write the failing tests**

Write to `/home/seanm/Projects/finance-v2/lib/bank-feed/akahu.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAkahuProvider } from "./akahu";

const APP = "app_test";
const USER = "user_test";

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status })
  );
}

describe("createAkahuProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listAccounts maps Akahu /accounts to BankFeedAccount[]", async () => {
    mockFetchOnce({
      success: true,
      items: [
        {
          _id: "acc_111",
          name: "Kiwibank Everyday",
          formatted_account: "38-9020-0211287-05",
          type: "CHECKING",
        },
      ],
    });
    const provider = createAkahuProvider({ appToken: APP, userToken: USER });
    const accounts = await provider.listAccounts();
    expect(accounts).toEqual([
      {
        providerAccountId: "acc_111",
        name: "Kiwibank Everyday",
        accountNumber: "38-9020-0211287-05",
        type: "CHECKING",
      },
    ]);
  });

  it("listAccounts sends the two required Akahu auth headers", async () => {
    const spy = mockFetchOnce({ success: true, items: [] });
    const provider = createAkahuProvider({ appToken: APP, userToken: USER });
    await provider.listAccounts();
    const [, init] = spy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-akahu-id")).toBe(APP);
    expect(headers.get("authorization")).toBe(`Bearer ${USER}`);
  });

  it("listAccounts throws when Akahu returns non-2xx", async () => {
    mockFetchOnce({ message: "unauthorized" }, 401);
    const provider = createAkahuProvider({ appToken: APP, userToken: USER });
    await expect(provider.listAccounts()).rejects.toThrow(/401/);
  });

  it("listTransactions filters with ?start=<from> and maps the response", async () => {
    const spy = mockFetchOnce({
      success: true,
      items: [
        {
          _id: "tx_999",
          _account: "acc_111",
          date: "2026-04-30T00:00:00.000Z",
          amount: -42.5,
          description: "PAK N SAVE WAIRAU",
          merchant: { name: "Pak'nSave Wairau" },
        },
      ],
    });
    const provider = createAkahuProvider({ appToken: APP, userToken: USER });
    const txns = await provider.listTransactions({ from: "2026-04-29" });
    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain("start=2026-04-29");
    expect(txns).toEqual([
      {
        providerTransactionId: "tx_999",
        providerAccountId: "acc_111",
        postedAt: "2026-04-30",
        amount: -42.5,
        description: "PAK N SAVE WAIRAU",
        merchantClean: "Pak'nSave Wairau",
      },
    ]);
  });

  it("listTransactions falls back to description when merchant.name is absent", async () => {
    mockFetchOnce({
      success: true,
      items: [
        {
          _id: "tx_42",
          _account: "acc_111",
          date: "2026-04-30T00:00:00.000Z",
          amount: 100,
          description: "INTEREST PAYMENT",
        },
      ],
    });
    const provider = createAkahuProvider({ appToken: APP, userToken: USER });
    const txns = await provider.listTransactions({ from: "2026-04-29" });
    expect(txns[0].merchantClean).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/bank-feed/akahu.test.ts
```

Expected: all 5 tests fail with `Cannot find module './akahu'` or similar.

- [ ] **Step 3: Implement the provider**

Write to `/home/seanm/Projects/finance-v2/lib/bank-feed/akahu.ts`:

```ts
import type {
  BankFeedAccount,
  BankFeedProvider,
  BankFeedTransaction,
} from "./types";

const AKAHU_BASE = "https://api.akahu.io/v1";

export type AkahuConfig = {
  appToken: string;
  userToken: string;
};

export function createAkahuProvider(cfg: AkahuConfig): BankFeedProvider {
  const headers = {
    "x-akahu-id": cfg.appToken,
    authorization: `Bearer ${cfg.userToken}`,
  };

  async function call(path: string): Promise<unknown> {
    const res = await fetch(`${AKAHU_BASE}${path}`, { headers });
    if (!res.ok) {
      throw new Error(
        `Akahu ${path} returned ${res.status}: ${await res.text()}`
      );
    }
    return res.json();
  }

  return {
    name: "akahu",

    async listAccounts(): Promise<BankFeedAccount[]> {
      const body = (await call("/accounts")) as {
        items: Array<{
          _id: string;
          name: string;
          formatted_account?: string | null;
          type?: string | null;
        }>;
      };
      return body.items.map((a) => ({
        providerAccountId: a._id,
        name: a.name,
        accountNumber: a.formatted_account ?? null,
        type: a.type ?? null,
      }));
    },

    async listTransactions(opts: { from: string }): Promise<BankFeedTransaction[]> {
      const body = (await call(
        `/transactions?start=${encodeURIComponent(opts.from)}`
      )) as {
        items: Array<{
          _id: string;
          _account: string;
          date: string;
          amount: number;
          description: string;
          merchant?: { name?: string };
        }>;
      };
      return body.items.map((t) => ({
        providerTransactionId: t._id,
        providerAccountId: t._account,
        postedAt: t.date.slice(0, 10), // YYYY-MM-DD
        amount: t.amount,
        description: t.description,
        merchantClean: t.merchant?.name ?? null,
      }));
    },
  };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/bank-feed/akahu.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: TS compile check**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/bank-feed/akahu.ts lib/bank-feed/akahu.test.ts && \
  git commit -m "feat(bank-feed): Akahu provider implementation + tests"
```

---

## Task 6: Implement the `/api/sync` route (TDD)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/api/sync/route.ts`
- Create: `/home/seanm/Projects/finance-v2/app/api/sync/route.test.ts`
- Create: `/home/seanm/Projects/finance-v2/lib/bank-feed/sync.ts` (the orchestration logic, separated for testability)
- Create: `/home/seanm/Projects/finance-v2/lib/bank-feed/sync.test.ts`

The route is a thin wrapper. The interesting logic lives in `lib/bank-feed/sync.ts` and is unit-tested with a fake provider + a mock Supabase client object.

The orchestration steps:
1. Resolve the household ID from the authenticated user.
2. Load `bank_feed_state` for `(household_id, 'akahu')`. If missing, insert with `cutover_date = today`. Use the persisted `cutover_date` as the `from` parameter.
3. Call `provider.listAccounts()`.
4. For each Akahu account: look up `v2.accounts WHERE account_number = akahu.accountNumber`.
   - 1 match → silent auto-link (set `akahu_account_id`).
   - 0 matches → add to a `prompts` array returned to the client (no insert yet).
   - >1 matches → add to `prompts` as `ambiguous`.
5. Call `provider.listTransactions({ from: cutover_date })`.
6. Filter to transactions whose `providerAccountId` resolved to a v2 account. Insert each as a new `v2.transactions` row with `source = 'akahu_sync'`. Skip any whose `providerAccountId` is in the `prompts` array.
7. Update `last_synced_at`.
8. Return `{ linkedAccounts, insertedTransactions, prompts }` JSON.

- [ ] **Step 1: Write the failing tests for `lib/bank-feed/sync.ts`**

Write to `/home/seanm/Projects/finance-v2/lib/bank-feed/sync.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runSync } from "./sync";
import type { BankFeedProvider } from "./types";

function fakeProvider(opts: {
  accounts: Awaited<ReturnType<BankFeedProvider["listAccounts"]>>;
  transactions: Awaited<ReturnType<BankFeedProvider["listTransactions"]>>;
}): BankFeedProvider {
  return {
    name: "akahu",
    listAccounts: vi.fn().mockResolvedValue(opts.accounts),
    listTransactions: vi.fn().mockResolvedValue(opts.transactions),
  };
}

// Tiny in-memory Supabase shim — only the methods runSync calls.
function fakeSupabase(seed: { accounts: Array<{ id: string; account_number: string | null; akahu_account_id: string | null }> }) {
  const accounts = [...seed.accounts];
  const insertedTxns: any[] = [];
  let bankFeedState: { cutover_date: string; last_synced_at: string | null } | null = null;
  const HH = "hh-1";

  const sb: any = {
    _state: { accounts, insertedTxns, get bankFeedState() { return bankFeedState; } },
    from(tbl: string) {
      return {
        select() { return { eq() { return this; }, maybeSingle: async () => {
          if (tbl === "bank_feed_state") return { data: bankFeedState, error: null };
          return { data: null, error: null };
        } } };
      };
    },
    // The real implementation will use a few specific calls — the test stubs each one.
  };
  return { sb, HH };
}

describe("runSync", () => {
  it("auto-links Akahu accounts to v2 accounts when account numbers match", async () => {
    const provider = fakeProvider({
      accounts: [
        { providerAccountId: "acc_111", name: "Kiwibank Everyday", accountNumber: "38-9020-0211287-05", type: "CHECKING" },
      ],
      transactions: [],
    });
    const linkCalls: Array<{ id: string; akahu: string }> = [];
    const upsertStateCalls: any[] = [];

    const sb: any = {
      from(tbl: string) {
        if (tbl === "bank_feed_state") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
            insert: (row: any) => ({ select: () => ({ single: async () => { upsertStateCalls.push(row); return { data: { ...row, last_synced_at: null }, error: null }; } }) }),
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          };
        }
        if (tbl === "accounts") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "v2-acc-1", account_number: "38-9020-0211287-05", akahu_account_id: null }, error: null }) }) }) }),
            update: (patch: any) => ({ eq: (_col: string, val: string) => { linkCalls.push({ id: val, akahu: patch.akahu_account_id }); return { error: null }; } }),
          };
        }
        if (tbl === "transactions") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error("unexpected table " + tbl);
      },
    };

    const result = await runSync({
      supabase: sb,
      householdId: "hh-1",
      provider,
      today: "2026-04-30",
    });

    expect(linkCalls).toEqual([{ id: "v2-acc-1", akahu: "acc_111" }]);
    expect(result.linkedAccounts).toBe(1);
    expect(result.insertedTransactions).toBe(0);
    expect(result.prompts).toEqual([]);
    expect(upsertStateCalls[0]).toMatchObject({ cutover_date: "2026-04-30" });
  });

  it("returns a prompt for an Akahu account with no matching v2 account", async () => {
    const provider = fakeProvider({
      accounts: [
        { providerAccountId: "acc_222", name: "ANZ Savings", accountNumber: "01-9999-9999999-00", type: "SAVINGS" },
      ],
      transactions: [],
    });

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
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          };
        }
        if (tbl === "transactions") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error("unexpected " + tbl);
      },
    };

    const result = await runSync({ supabase: sb, householdId: "hh-1", provider, today: "2026-04-30" });
    expect(result.prompts).toEqual([
      {
        kind: "no_match",
        providerAccountId: "acc_222",
        name: "ANZ Savings",
        accountNumber: "01-9999-9999999-00",
      },
    ]);
    expect(result.linkedAccounts).toBe(0);
  });

  it("inserts transactions for linked accounts only and skips ones tied to prompts", async () => {
    const provider = fakeProvider({
      accounts: [
        { providerAccountId: "acc_111", name: "Linked", accountNumber: "38-9020-0211287-05", type: "CHECKING" },
        { providerAccountId: "acc_222", name: "Unlinked", accountNumber: "01-9999-9999999-00", type: "SAVINGS" },
      ],
      transactions: [
        { providerTransactionId: "tx_a", providerAccountId: "acc_111", postedAt: "2026-04-30", amount: -10, description: "X", merchantClean: null },
        { providerTransactionId: "tx_b", providerAccountId: "acc_222", postedAt: "2026-04-30", amount: -20, description: "Y", merchantClean: null },
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
            select: () => ({
              eq: (_col: string, _v: string) => ({
                eq: (_col2: string, num: string) => ({
                  maybeSingle: async () => num === "38-9020-0211287-05"
                    ? { data: { id: "v2-acc-1", account_number: num, akahu_account_id: null }, error: null }
                    : { data: null, error: null }
                }),
              }),
            }),
            update: () => ({ eq: () => ({ error: null }) }),
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
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      account_id: "v2-acc-1",
      household_id: "hh-1",
      posted_at: "2026-04-30",
      amount: -10,
      source: "akahu_sync",
    });
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/bank-feed/sync.test.ts
```

Expected: 3 tests fail with `Cannot find module './sync'`.

- [ ] **Step 3: Implement `lib/bank-feed/sync.ts`**

Write to `/home/seanm/Projects/finance-v2/lib/bank-feed/sync.ts`:

```ts
import type { BankFeedProvider, BankFeedAccount } from "./types";

export type SyncPrompt =
  | { kind: "no_match"; providerAccountId: string; name: string; accountNumber: string | null };

export type SyncResult = {
  linkedAccounts: number;
  insertedTransactions: number;
  prompts: SyncPrompt[];
};

export type RunSyncArgs = {
  // Anything with `.from(table)` that mimics the supabase-js builder shape we use.
  // We accept `any` here on purpose — the tests inject a hand-rolled fake; the
  // production caller passes the real client.
  supabase: any;
  householdId: string;
  provider: BankFeedProvider;
  /** Today's date in YYYY-MM-DD. Injectable so tests are deterministic. */
  today: string;
};

export async function runSync(args: RunSyncArgs): Promise<SyncResult> {
  const { supabase, householdId, provider, today } = args;

  // 1. Get or create bank_feed_state row.
  const { data: state } = await supabase
    .from("bank_feed_state")
    .select("cutover_date,last_synced_at")
    .eq("household_id", householdId)
    .eq("provider", "akahu")
    .maybeSingle();

  let cutoverDate: string;
  if (!state) {
    const { data: created, error: createErr } = await supabase
      .from("bank_feed_state")
      .insert({
        household_id: householdId,
        provider: "akahu",
        cutover_date: today,
      })
      .select()
      .single();
    if (createErr) throw createErr;
    cutoverDate = created.cutover_date;
  } else {
    cutoverDate = state.cutover_date;
  }

  // 2. List Akahu accounts.
  const akahuAccounts = await provider.listAccounts();

  // 3. Hybrid match.
  const linked: Map<string, string> = new Map(); // akahuId -> v2AccountId
  const prompts: SyncPrompt[] = [];

  for (const a of akahuAccounts) {
    if (!a.accountNumber) {
      prompts.push({
        kind: "no_match",
        providerAccountId: a.providerAccountId,
        name: a.name,
        accountNumber: null,
      });
      continue;
    }
    const { data: match } = await supabase
      .from("accounts")
      .select("id,account_number,akahu_account_id")
      .eq("household_id", householdId)
      .eq("account_number", a.accountNumber)
      .maybeSingle();
    if (match) {
      linked.set(a.providerAccountId, match.id);
      if (match.akahu_account_id !== a.providerAccountId) {
        await supabase
          .from("accounts")
          .update({ akahu_account_id: a.providerAccountId })
          .eq("id", match.id);
      }
    } else {
      prompts.push({
        kind: "no_match",
        providerAccountId: a.providerAccountId,
        name: a.name,
        accountNumber: a.accountNumber,
      });
    }
  }

  // 4. List + insert transactions for linked accounts only.
  const akahuTxns = await provider.listTransactions({ from: cutoverDate });
  const rows = akahuTxns
    .filter((t) => linked.has(t.providerAccountId))
    .map((t) => ({
      account_id: linked.get(t.providerAccountId)!,
      household_id: householdId,
      posted_at: t.postedAt,
      amount: t.amount,
      type: t.amount < 0 ? "expense" : "income",
      merchant_raw: t.description,
      merchant_clean: t.merchantClean,
      description: null,
      source: "akahu_sync",
      confirmed: true,
    }));

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("transactions").insert(rows);
    if (insErr) throw insErr;
  }

  // 5. Update last_synced_at.
  await supabase
    .from("bank_feed_state")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("provider", "akahu");

  return {
    linkedAccounts: linked.size,
    insertedTransactions: rows.length,
    prompts,
  };
}
```

- [ ] **Step 4: Run sync.test.ts, confirm pass**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/bank-feed/sync.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Write the route file**

Write to `/home/seanm/Projects/finance-v2/app/api/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAkahuProvider } from "@/lib/bank-feed/akahu";
import { runSync } from "@/lib/bank-feed/sync";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
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

  // Resolve household. The current user is a member of exactly one household for now.
  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (hhErr || !hh) {
    return NextResponse.json(
      { error: "household not found for user" },
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
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Write a route smoke test**

Write to `/home/seanm/Projects/finance-v2/app/api/sync/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server helper to return an unauthenticated user.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { POST } from "./route";

describe("POST /api/sync", () => {
  beforeEach(() => {
    process.env.AKAHU_APP_TOKEN = "x";
    process.env.AKAHU_USER_TOKEN = "y";
  });

  it("returns 401 when user is not signed in", async () => {
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });
});
```

- [ ] **Step 7: Run all bank-feed tests**

```bash
cd ~/Projects/finance-v2 && npx vitest run lib/bank-feed app/api/sync
```

Expected: 9 passed total (5 akahu + 3 sync + 1 route).

- [ ] **Step 8: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add lib/bank-feed/sync.ts lib/bank-feed/sync.test.ts app/api/sync/ && \
  git commit -m "feat(api): /api/sync route + runSync orchestration"
```

---

## Task 7: Add the "Sync from Akahu" button to /accounts

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/app/accounts/page.tsx`
- Create: `/home/seanm/Projects/finance-v2/app/accounts/sync-button.tsx` (client component)

**Per `AGENTS.md`: invoke `ui-stack` first, then `awesome-design`** before writing this component's markup. The button should match the project's existing typography/spacing — currently using shadcn's default theme. Don't introduce new colour or font systems for one button.

The button is a small client component embedded in the (server) accounts page. It POSTs to `/api/sync`, shows a loading state while running, and renders the result inline below itself.

- [ ] **Step 1: Run the UI skills**

In a fresh chat or by spawning a subagent, request:
- `ui-stack` for the standard component patterns
- `awesome-design` for visual conventions for inline action buttons + result panels

Capture any guidance and apply it to Steps 2–3 below. If both skills agree the existing shadcn `Button` is the right primitive (likely), proceed.

- [ ] **Step 2: Add a shadcn `button` component if not already present**

```bash
cd ~/Projects/finance-v2 && ls components/ui/button.tsx
```

If `button.tsx` does not exist, run:

```bash
cd ~/Projects/finance-v2 && npx shadcn@latest add button
```

- [ ] **Step 3: Create `app/accounts/sync-button.tsx` (client component)**

Write to `/home/seanm/Projects/finance-v2/app/accounts/sync-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Prompt = {
  kind: "no_match";
  providerAccountId: string;
  name: string;
  accountNumber: string | null;
};

type SyncResult = {
  linkedAccounts: number;
  insertedTransactions: number;
  prompts: Prompt[];
};

export function SyncButton() {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; result: SyncResult }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  async function onClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "err", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "ok", result: body });
    } catch (err) {
      setState({
        kind: "err",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="mb-6">
      <Button
        onClick={onClick}
        disabled={state.kind === "loading"}
        data-testid="sync-button"
      >
        {state.kind === "loading" ? "Syncing…" : "Sync from Akahu →"}
      </Button>
      {state.kind === "ok" && (
        <div
          className="mt-3 text-sm text-muted-foreground"
          data-testid="sync-result"
        >
          Linked {state.result.linkedAccounts} account
          {state.result.linkedAccounts === 1 ? "" : "s"} · Pulled{" "}
          {state.result.insertedTransactions} new transaction
          {state.result.insertedTransactions === 1 ? "" : "s"}.
          {state.result.prompts.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.result.prompts.map((p) => (
                <li key={p.providerAccountId} data-testid="sync-prompt">
                  {p.name} ({p.accountNumber ?? "no number"}) — no v2 account
                  match (deferred to Phase 3b).
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.kind === "err" && (
        <p
          className="mt-3 text-sm text-red-600"
          data-testid="sync-error"
        >
          Error: {state.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Embed the button in `/accounts/page.tsx`**

Open `/home/seanm/Projects/finance-v2/app/accounts/page.tsx` and add the import + render. Replace:

```tsx
      <h1 className="text-2xl font-semibold mb-4" data-testid="accounts-heading">
        Accounts ({accounts.length})
      </h1>
```

with:

```tsx
      <h1 className="text-2xl font-semibold mb-4" data-testid="accounts-heading">
        Accounts ({accounts.length})
      </h1>
      <SyncButton />
```

And add this import alongside the others at the top of the file:

```tsx
import { SyncButton } from "./sync-button";
```

- [ ] **Step 5: TS clean**

```bash
cd ~/Projects/finance-v2 && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Local smoke test**

```bash
cd ~/Projects/finance-v2 && (timeout 25 npm run dev > /tmp/dev-task7.log 2>&1 &) && sleep 8 && curl -s -o /dev/null -w "/accounts: %{http_code}\n" -H "Cookie: stub" http://localhost:3000/accounts; pkill -f "next dev"
```

Expected: 307 (unauthenticated redirect — proves the page still renders without crashing).

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/finance-v2 && \
  git add app/accounts/ && \
  git commit -m "feat(ui): Sync from Akahu button on /accounts"
```

---

## Task 8: Deploy + first real sync (manual verification)

**Files:** None.

The whole point of Phase 3a — Sean clicks the button on the deployed site and confirms real bank txns appear.

- [ ] **Step 1: Deploy to production**

```bash
cd ~/Projects/finance-v2 && git push origin main && vercel --prod --yes
```

Wait for the deployment to report `READY`.

- [ ] **Step 2: Sean visits the site and signs in**

Open https://finance-v2-five.vercel.app/accounts. Hard-refresh (Ctrl+Shift+R) to bust the SW cache. Sign in if prompted.

- [ ] **Step 3: Click "Sync from Akahu →"**

Expected outcomes (in order of likelihood):
- **Best case:** "Linked N accounts. Pulled M new transactions." where N matches the count of bank accounts you connected at my.akahu.nz.
- **Partial:** Some accounts linked, some "no v2 account match" prompts shown for accounts whose `account_number` doesn't appear in your migrated v2 data. Note them — they'll be handled in 3b.
- **Failure:** Red error text. Capture the error message and the request ID from Vercel logs. Common causes: env vars not set on production, Akahu tokens expired, Akahu API rate-limited.

- [ ] **Step 4: Verify the data landed**

Open https://finance-v2-five.vercel.app/transactions. The most recent page should now show today's date entries with merchant text from your bank (e.g. "Pak'nSave Wairau", "Z ENERGY"). These are the Akahu txns.

In the Supabase SQL editor, run:

```sql
SELECT count(*) AS akahu_count, min(posted_at), max(posted_at)
FROM v2.transactions WHERE source = 'akahu_sync';

SELECT id, name, akahu_account_id FROM v2.accounts WHERE akahu_account_id IS NOT NULL;
```

Expected: `akahu_count > 0`, accounts table shows the auto-linked rows with `akahu_account_id` set.

- [ ] **Step 5: Click the button a second time**

Expected: "Linked N accounts. Pulled 0 new transactions." (Akahu hasn't reported anything new since the first sync since cutover_date hasn't moved). No duplicates appear in `/transactions`.

If duplicates DO appear → 3a is not idempotent. File this as a bug to fix before Phase 3b (the cron will re-run daily and we cannot have duplicates).

**No commit for this task.** It's a verification step. If a bug is found, fix it via a follow-up commit before moving on.

---

## Task 9: Mark Phase 3a complete

**Files:**
- Create: `/home/seanm/Projects/finance-v2/docs/PHASE-3A-COMPLETE.md`

- [ ] **Step 1: Write the completion marker**

Write to `/home/seanm/Projects/finance-v2/docs/PHASE-3A-COMPLETE.md`:

```markdown
# Phase 3a — Akahu Connect + Manual Sync — Complete

**Date completed:** <YYYY-MM-DD>

## What ships

- Akahu Personal API integration via `BankFeedProvider` interface (`lib/bank-feed/`).
- New `/api/sync` endpoint that orchestrates: hybrid account auto-link, fetch transactions from cutover date forward, insert into v2 with `source = 'akahu_sync'`.
- "Sync from Akahu →" button on `/accounts` with inline result panel (linked-count, txn-count, unmatched-account prompts).
- New `v2.bank_feed_state` table tracking per-household cutover date and last-sync timestamp.
- Tokens (`AKAHU_APP_TOKEN`, `AKAHU_USER_TOKEN`) stored as Vercel env vars in production + preview.
- Test coverage: 9 unit tests across the Akahu provider, sync orchestration, and route.

## Verified by Sean

- [ ] Connected at least one bank at my.akahu.nz.
- [ ] First sync linked v2 accounts to Akahu accounts via account_number match.
- [ ] First sync pulled today's transactions (count > 0 if bank had today's data).
- [ ] Second sync was idempotent — no duplicate transactions.

## What's deferred to 3b

- Vercel Cron daily auto-sync.
- Auto-categorisation rules engine.
- UI to handle the "no_match" prompts (creating new v2 accounts from unmatched Akahu accounts).
- Backfill / gap-fill for the 516 legacy `Untagged (legacy)` orphan transactions.

## References

- Spec: `~/Projects/finance/docs/superpowers/specs/2026-04-29-phase-3a-akahu-connect-design.md`
- Plan: `~/Projects/finance/docs/superpowers/plans/2026-04-29-phase-3a-akahu-connect.md`
- Phase 2 completion: `docs/PHASE-2-COMPLETE.md`
- Akahu Personal API: https://developers.akahu.nz/docs/personal-api
```

- [ ] **Step 2: Fill the date and commit**

```bash
cd ~/Projects/finance-v2 && \
  sed -i "s/<YYYY-MM-DD>/$(date -u +%Y-%m-%d)/" docs/PHASE-3A-COMPLETE.md && \
  git add docs/PHASE-3A-COMPLETE.md && \
  git commit -m "docs: mark Phase 3a (Akahu connect) complete" && \
  git push origin main
```

---

## Self-review

**Spec coverage check (against Phase 3a design supplement):**
- Akahu sign-up + token capture → Task 1
- Tokens in Vercel env vars → Task 2
- `bank_feed_state` table → Task 3
- `BankFeedProvider` interface → Task 4
- Akahu provider implementation → Task 5
- `/api/sync` route + hybrid mapping + cutover model → Task 6
- "Sync from Akahu" button on `/accounts` → Task 7
- First real sync verification + idempotency check → Task 8
- Phase complete marker → Task 9
✓ Coverage complete.

**Out-of-scope items correctly deferred:**
- Vercel Cron → 3b ✓
- Rules engine → 3b ✓
- Auto-create UI for "no_match" prompts → 3b (the array is returned but not rendered as actionable cards) ✓
- Backfill orphans → 3b/optional ✓

**Placeholder scan:** One `<YYYY-MM-DD>` in PHASE-3A-COMPLETE.md, replaced via `sed` in Task 9 Step 2. Acceptable.

**Type consistency:** `BankFeedProvider` shape is defined in Task 4 and consumed identically in Tasks 5 and 6. `SyncResult` shape returned by `runSync` (Task 6) matches the `SyncResult` type used by the client component (Task 7). Field name `linkedAccounts` consistent across server and client.

**Idempotency note:** Task 8 Step 5 explicitly tests the second-click case. If duplicates appear there, the cause will be that Akahu re-returned today's transactions and we did not upsert by `provider_transaction_id`. A follow-up tightening (add `provider_transaction_id` column to `v2.transactions` + use as the upsert key) is the natural fix. The plan deliberately defers this — current Phase 3a depends on the cutover_date excluding overlap, but there is a 1-day window where today's date is the cutover and the provider returns ongoing data. If observed: file as a bug, fix before merging Task 9.
