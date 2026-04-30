# Phase 5b — Transaction Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a `/transactions/[id]` detail page with editable category, labels, and notes (autosave on blur), plus a `notes text` column on `v2.transactions`.

**Architecture:** Migration adds nullable `notes` column. New API route `PATCH /api/transactions/[id]` (mirrors the existing `app/api/rules/[id]/route.ts` pattern). Server component `app/transactions/[id]/page.tsx` fetches the row + categories. Client component renders editable controls and PATCHes on blur. `/transactions` row gets wrapped in a click handler that pushes to detail.

**Tech Stack:** Next.js 16 App Router, Supabase JS, Tailwind, shadcn primitives. API routes (not server actions — matches existing rules-CRUD convention).

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-30-phase-5-dashboard-completeness-design.md` (txn detail section)
**Implementation repo:** `~/Projects/finance-v2/`

---

## File structure

**New files:**
- `supabase/migrations/0003_add_transactions_notes.sql` — `notes text` column
- `scripts/apply-migration-0003.mjs` — applies the migration via service-role key
- `app/api/transactions/[id]/route.ts` — `PATCH` for category/labels/notes
- `app/transactions/[id]/page.tsx` — server component, read-only header + edit form
- `app/transactions/[id]/edit-form.tsx` — client component, autosave-on-blur
- `app/transactions/[id]/not-found.tsx` — 404 fallback
- `docs/PHASE-5B-COMPLETE.md` — completion marker

**Modified files:**
- `lib/db/schema.ts` — add `notes: string | null` to `Transaction` type
- `app/transactions/page.tsx` — wrap each row in click-to-detail link

---

## Task 1: Notes column migration + schema type + apply script

**Files:**
- Create: `supabase/migrations/0003_add_transactions_notes.sql`
- Create: `scripts/apply-migration-0003.mjs`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1.1: Write the migration SQL**

Write `supabase/migrations/0003_add_transactions_notes.sql`:

```sql
-- Phase 5b — Transaction notes column.
-- User-editable notes on each transaction, distinct from the bank's `description`.
-- Idempotent: safe to re-run.

ALTER TABLE v2.transactions
  ADD COLUMN IF NOT EXISTS notes text;
```

- [ ] **Step 1.2: Write the apply script**

Write `scripts/apply-migration-0003.mjs`:

```js
// Apply migration 0003_add_transactions_notes via service-role key.
// Idempotent (the SQL uses ADD COLUMN IF NOT EXISTS).
//
// Usage: node scripts/apply-migration-0003.mjs

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
  resolve(process.cwd(), "supabase/migrations/0003_add_transactions_notes.sql"),
  "utf8",
);

console.log("Applying migration 0003_add_transactions_notes...");
const { error } = await supabase.rpc("exec_sql", { sql });
if (error) {
  // Fallback: try via PostgREST direct query if exec_sql RPC isn't available.
  // For most Supabase projects, the SQL editor in the dashboard is the simpler path.
  console.error("RPC exec_sql failed:", error.message);
  console.error("\nTo apply manually, paste this into Supabase Dashboard → SQL Editor:");
  console.error("\n" + sql);
  process.exit(1);
}
console.log("Migration applied.");
```

**Note:** Supabase doesn't expose a generic SQL-execution RPC by default. If the script fails, the implementer should fall back to running the SQL manually via Supabase Dashboard → SQL Editor (the migration is 2 lines). The script's failure path prints the SQL for easy copy-paste.

- [ ] **Step 1.3: Add notes to schema type**

Read `lib/db/schema.ts` first. Find the `Transaction` type. Add `notes: string | null;` between `description` and `category_id` (keeping schema-column order). The result should match the schema column order from the migration.

```ts
export type Transaction = {
  id: string;
  account_id: string;
  household_id: string;
  posted_at: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  merchant_raw: string | null;
  merchant_clean: string | null;
  description: string | null;
  notes: string | null;
  category_id: string | null;
  attributed_to_profile_id: string | null;
  confirmed: boolean;
  parent_transaction_id: string | null;
  labels: string[];
  is_recurring_link: string | null;
  is_transfer: boolean;
  source: "akahu_sync" | "csv_import" | "email_capture" | "manual";
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 1.4: Apply the migration**

Try the script:
```bash
cd ~/Projects/finance-v2
node scripts/apply-migration-0003.mjs
```

If RPC fails, the script prints the SQL — paste it into Supabase Dashboard → SQL Editor and run there. Confirm `\d v2.transactions` (or `SELECT column_name FROM information_schema.columns WHERE table_schema='v2' AND table_name='transactions' AND column_name='notes';`) returns the new column.

- [ ] **Step 1.5: Run typecheck + tests**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit && npx vitest run
```

Expected: clean.

- [ ] **Step 1.6: Commit**

```bash
cd ~/Projects/finance-v2
git add supabase/migrations/0003_add_transactions_notes.sql scripts/apply-migration-0003.mjs lib/db/schema.ts
git commit -m "feat(schema): add transactions.notes column + apply script"
```

---

## Task 2: PATCH /api/transactions/[id] route

**Files:**
- Create: `app/api/transactions/[id]/route.ts`

API route mirroring `app/api/rules/[id]/route.ts`. Accepts JSON body with optional `category_id`, `labels`, `notes` fields. Updates only the provided fields. Returns 200 with updated row or 4xx on auth/validation failure.

- [ ] **Step 2.1: Read the rules API route for reference**

```bash
cd ~/Projects/finance-v2
cat app/api/rules/[id]/route.ts
```

Mirror the auth + scoping pattern.

- [ ] **Step 2.2: Write the route**

Write `app/api/transactions/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { id: string };

type PatchBody = {
  category_id?: string | null;
  labels?: string[];
  notes?: string | null;
};

async function authedAndScoped() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauth" as const };

  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!hh) return { kind: "no-household" as const };

  return { kind: "ok" as const, supabase, household_id: hh.id };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<Params> },
) {
  const auth = await authedAndScoped();
  if (auth.kind === "unauth") {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  if (auth.kind === "no-household") {
    return NextResponse.json({ error: "no-household" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const update: Record<string, unknown> = {};
  if ("category_id" in body) update.category_id = body.category_id;
  if ("labels" in body) {
    if (!Array.isArray(body.labels)) {
      return NextResponse.json({ error: "labels must be array" }, { status: 400 });
    }
    update.labels = body.labels;
  }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "notes must be string or null" }, { status: 400 });
    }
    update.notes = body.notes;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("transactions")
    .update(update)
    .eq("id", id)
    .eq("household_id", auth.household_id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, transaction: data });
}
```

- [ ] **Step 2.3: Typecheck**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2.4: Commit**

```bash
cd ~/Projects/finance-v2
git add app/api/transactions/[id]/route.ts
git commit -m "feat(api): PATCH /api/transactions/[id] for category/labels/notes"
```

---

## Task 3: Transaction detail page (server + edit form client)

**Files:**
- Create: `app/transactions/[id]/page.tsx`
- Create: `app/transactions/[id]/edit-form.tsx`
- Create: `app/transactions/[id]/not-found.tsx`

- [ ] **Step 3.1: Write the not-found fallback**

Write `app/transactions/[id]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Transaction not found</h1>
      <p className="text-sm text-muted-foreground mb-4">
        The transaction may have been deleted or doesn&rsquo;t belong to your household.
      </p>
      <Link href="/transactions" className="text-sm underline">
        ← Back to transactions
      </Link>
    </main>
  );
}
```

- [ ] **Step 3.2: Write the server-component page**

Write `app/transactions/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoneySigned } from "@/lib/format/money";
import type { Transaction } from "@/lib/db/schema";
import { EditForm } from "./edit-form";

type Params = { id: string };

export default async function TransactionDetailPage(props: {
  params: Promise<Params>;
}) {
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
      <main className="p-4 md:p-8 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">No household.</p>
      </main>
    );
  }

  const { id } = await props.params;

  const [{ data: txn }, { data: cats }, { data: accountsData }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .eq("household_id", hh.id)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, type")
      .order("name"),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("household_id", hh.id),
  ]);

  if (!txn) notFound();

  const t = txn as Transaction;
  const categories = (cats ?? []) as Array<{ id: string; name: string; type: string }>;
  const accountName =
    (accountsData ?? []).find((a) => a.id === t.account_id)?.name ?? "—";
  const merchant = t.merchant_clean ?? t.merchant_raw ?? t.description ?? "—";
  const amtClass = t.amount < 0 ? "text-red-600" : "text-green-600";

  return (
    <main className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link href="/transactions" className="text-sm underline text-muted-foreground">
          ← All transactions
        </Link>
      </div>

      <h1 className="text-2xl font-semibold mb-4" data-testid="txn-detail-heading">
        Transaction
      </h1>

      <section className="mb-6 rounded-lg border border-border bg-background p-4 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-muted-foreground">Amount</span>
          <span className={`text-2xl font-semibold tabular-nums ${amtClass}`}>
            {fmtMoneySigned(Number(t.amount))}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Date</span>
          <span>{t.posted_at}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Account</span>
          <span>{accountName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Merchant</span>
          <span className="text-right">{merchant}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Type</span>
          <span>{t.type}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Source</span>
          <span>{t.source}</span>
        </div>
      </section>

      <EditForm
        txnId={t.id}
        initialCategoryId={t.category_id}
        initialLabels={t.labels ?? []}
        initialNotes={t.notes ?? ""}
        categories={categories}
      />
    </main>
  );
}
```

- [ ] **Step 3.3: Write the client edit form**

Write `app/transactions/[id]/edit-form.tsx`:

```tsx
"use client";

import { useState } from "react";

type Props = {
  txnId: string;
  initialCategoryId: string | null;
  initialLabels: string[];
  initialNotes: string;
  categories: Array<{ id: string; name: string; type: string }>;
};

async function patchTxn(
  txnId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/transactions/${txnId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

export function EditForm({
  txnId,
  initialCategoryId,
  initialLabels,
  initialNotes,
  categories,
}: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [labels, setLabels] = useState<string[]>(initialLabels);
  const [labelDraft, setLabelDraft] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState<null | "category" | "labels" | "notes">(null);
  const [error, setError] = useState<string | null>(null);

  async function saveCategory(value: string) {
    setSaving("category");
    setError(null);
    const next = value === "" ? null : value;
    const res = await patchTxn(txnId, { category_id: next });
    setSaving(null);
    if (!res.ok) {
      setError(res.error ?? "save failed");
      return;
    }
    setCategoryId(next);
  }

  async function saveLabels(next: string[]) {
    setSaving("labels");
    setError(null);
    const res = await patchTxn(txnId, { labels: next });
    setSaving(null);
    if (!res.ok) {
      setError(res.error ?? "save failed");
      return;
    }
    setLabels(next);
  }

  async function saveNotes() {
    setSaving("notes");
    setError(null);
    const res = await patchTxn(txnId, { notes: notes.trim() === "" ? null : notes });
    setSaving(null);
    if (!res.ok) setError(res.error ?? "save failed");
  }

  function addLabel() {
    const v = labelDraft.trim();
    if (!v || labels.includes(v)) {
      setLabelDraft("");
      return;
    }
    const next = [...labels, v];
    setLabelDraft("");
    saveLabels(next);
  }

  function removeLabel(label: string) {
    saveLabels(labels.filter((l) => l !== label));
  }

  return (
    <section className="space-y-6">
      <div>
        <label
          htmlFor="category-select"
          className="block text-sm font-medium mb-1"
        >
          Category
        </label>
        <select
          id="category-select"
          data-testid="txn-category-select"
          value={categoryId ?? ""}
          onChange={(e) => saveCategory(e.target.value)}
          disabled={saving === "category"}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">— Uncategorised —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Labels</label>
        <div className="flex flex-wrap gap-2 mb-2" data-testid="txn-labels">
          {labels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
            >
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                onClick={() => removeLabel(l)}
                className="ml-1 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={labelDraft}
            placeholder="Add a label..."
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLabel();
              }
            }}
            onBlur={() => labelDraft.trim() && addLabel()}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            data-testid="txn-label-input"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="notes-textarea"
          className="block text-sm font-medium mb-1"
        >
          Notes
        </label>
        <textarea
          id="notes-textarea"
          data-testid="txn-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          disabled={saving === "notes"}
          rows={3}
          placeholder="Add a note about this transaction..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {saving && (
        <p className="text-xs text-muted-foreground" data-testid="txn-saving">
          Saving…
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600" data-testid="txn-error">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3.4: Typecheck**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3.5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/transactions/[id]/
git commit -m "feat(transactions): detail page with autosave-on-blur edit form"
```

---

## Task 4: /transactions row link + completion marker

**Files:**
- Modify: `app/transactions/page.tsx`
- Create: `docs/PHASE-5B-COMPLETE.md`

- [ ] **Step 4.1: Read current page**

```bash
cd ~/Projects/finance-v2
cat app/transactions/page.tsx
```

- [ ] **Step 4.2: Add row links**

The challenge: each `<TableRow>` needs to be clickable, but the existing `<MakeRuleButton>` inside it must keep its own click semantics.

Approach: wrap the row's main cells (Date + Merchant + Amount) in a click handler that pushes to detail; keep MakeRuleButton click semantics by stop-propagation. Since `app/transactions/page.tsx` is a server component, we can't use `onClick`. The cleanest approach is to add a `<Link>` overlay via the `data-href` pattern or convert to a "row-as-link" using a wrapping `<a>` for the main cells.

The simplest path: replace each `<TableCell>` content for Date and Merchant (NOT the MakeRuleButton's inline span) with `<Link>`-wrapped content. Amount cell also wrapped. The MakeRuleButton sits in a `<span>` that's outside any Link.

Edit `app/transactions/page.tsx`. Find the existing `<TableRow key={t.id} data-testid={\`txn-${t.id}\`}>` block (around line 79-98). Replace the inner `<TableCell>` content as follows:

Find:

```tsx
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
```

Replace with:

```tsx
              <TableRow key={t.id} data-testid={`txn-${t.id}`}>
                <TableCell>
                  <Link
                    href={`/transactions/${t.id}`}
                    className="block hover:underline"
                  >
                    {t.posted_at}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Link
                      href={`/transactions/${t.id}`}
                      className="flex-1 hover:underline"
                    >
                      {t.merchant_clean ?? t.merchant_raw ?? t.description ?? "—"}
                    </Link>
                    {!t.category_id && (
                      <span className="inline-flex">
                        <MakeRuleButton txn={t} categories={categories} />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell
                  className={`text-right ${
                    amt < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  <Link
                    href={`/transactions/${t.id}`}
                    className="block hover:underline"
                  >
                    ${amt.toFixed(2)}
                  </Link>
                </TableCell>
              </TableRow>
```

Also add `import Link from "next/link";` to the imports at the top of the file if it's not already there.

- [ ] **Step 4.3: Typecheck + tests**

```bash
cd ~/Projects/finance-v2
npx tsc --noEmit && npx vitest run
```

Expected: clean, all tests pass.

- [ ] **Step 4.4: Write the completion marker**

Write `docs/PHASE-5B-COMPLETE.md`:

```markdown
# Phase 5b — Transaction Detail — Complete

**Date completed:** 2026-04-30

## What ships

- `supabase/migrations/0003_add_transactions_notes.sql` — `notes text` column on `v2.transactions`
- `scripts/apply-migration-0003.mjs` — idempotent apply script (with manual SQL-paste fallback)
- `lib/db/schema.ts` — `Transaction.notes: string | null` added
- `app/api/transactions/[id]/route.ts` — `PATCH` endpoint for category/labels/notes (mirrors rules-CRUD pattern)
- `app/transactions/[id]/page.tsx` — server-component detail page, read-only header + editable section
- `app/transactions/[id]/edit-form.tsx` — client component, autosave-on-blur for category, labels, notes
- `app/transactions/[id]/not-found.tsx` — 404 fallback
- `app/transactions/page.tsx` — each row's Date / Merchant / Amount cells now link to the detail page

## Post-deploy smoke checklist

- [ ] Migration applied (column exists in v2.transactions)
- [ ] Click a row in `/transactions` → lands on `/transactions/<id>`
- [ ] Detail page renders amount, date, account, merchant, type, source
- [ ] Change category → blur → reload → category persists
- [ ] Add a label → enter → reload → label persists
- [ ] Remove a label → reload → label gone
- [ ] Edit notes → blur → reload → notes persist
- [ ] Make Rule button on `/transactions` rows still works (separate click target)

## Documented limitations / out-of-scope

- No delete-transaction button (deferred — confirmation flow needs a dialog primitive that's out of scope here)
- No optimistic UI on saves — server round-trip on each blur (sub-200ms expected, no need for optimism)
- No edit history / audit trail
- AI anomaly advisor still queued — Phase 7

## Predecessor

Phase 5a — Cross-Cycle Compare + Income Tile + Reconcile (`docs/PHASE-5A-COMPLETE.md`)
```

- [ ] **Step 4.5: Commit**

```bash
cd ~/Projects/finance-v2
git add app/transactions/page.tsx docs/PHASE-5B-COMPLETE.md
git commit -m "feat(transactions): row link to detail page + Phase 5b complete marker"
```

---

## Self-review

**Spec coverage:**
- ✅ `notes text` column migration → Task 1
- ✅ Transaction type updated → Task 1
- ✅ PATCH route for category/labels/notes → Task 2
- ✅ Detail page (server component, read-only header) → Task 3
- ✅ Edit form (client, autosave-on-blur) → Task 3
- ✅ /transactions row link → Task 4
- ✅ Completion marker → Task 4
- ❌ Delete button — deferred per spec ("If the dialog primitive doesn't trivially support a confirm flow, defer delete to Phase 6"). Acceptable, documented.

**Placeholder scan:** None. Each task has full code.

**Type consistency:** `Transaction` type updated in Task 1, used in Task 3 page. `PATCH` body shape in Task 2 matches the form's outgoing JSON in Task 3 edit form. `categories` array shape consistent between page and form props.

**Decomposition:** 4 tasks, each atomic. Migration must run before Task 3 (the form writes to `notes`), but Task 2 (API route) doesn't actually fail without the column — it just 500s on insert. Sequential execution is correct.
