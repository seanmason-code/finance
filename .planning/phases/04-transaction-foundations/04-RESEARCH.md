# Phase 4: Transaction Foundations — Research

**Researched:** 2026-04-19
**Domain:** Vanilla JS SPA + Supabase (Postgres) transaction model extension
**Confidence:** HIGH (codebase read directly, decisions locked in CONTEXT.md)

<user_constraints>
## User Constraints (from 04-CONTEXT.md)

### Locked Decisions

**Schema (all changes in Supabase — no localStorage for new features)**

- **Splits:**
  - Add `parent_transaction_id` (nullable FK to `transactions.id`) on `transactions`.
  - Parent row is **retained** after splitting (PocketSmith model; preserves the bank-reconciliation link).
  - Parent's "split" status marked via a flag OR inferred from presence of children — **planner to choose** the cleaner representation.
  - Child `amount` values MUST sum to parent `amount` (UI-enforced at minimum; DB check optional).
  - Once split, parent's category is irrelevant; UI should hide it or show "(split)".

- **Labels:**
  - `labels` column as `text[]` (Postgres array) on `transactions`.
  - No labels table — free-form, no FK integrity.
  - UI: multi-chip input on edit modal, autocomplete from existing labels across all transactions.
  - Transaction list supports filtering by a single label (v1).

- **Confirmed state:**
  - `confirmed` boolean on `transactions`; default `false` for new imports; backfill existing rows to `true`.
  - Visual: reduced opacity + small badge ("Unconfirmed" or icon).
  - Confirm via per-row button (bulk confirm deferred to Phase 5).

- **Rules table (new):**
  - Columns: `id`, `user_id`, `merchant_keyword` (text), `category` (text), `created_at`.
  - On CSV import: for each incoming row, check rules in creation order; first match wins; set category.
  - `merchant_keyword` = **case-insensitive substring** against the bank description.
  - Per-user; RLS enforces user can only see/edit own rules.

**UX**

- **Split dialog:** Triggered from transaction row menu (three-dot/long-press). Modal: original amount + N child rows (start 2, allow adding more). Live "remaining to allocate" indicator. Save disabled until children sum == parent. Each child: category picker + amount + optional description.
- **Label input:** Available on transaction edit modal. Multi-chip, free-form, suggestions from existing labels.
- **Unconfirmed nudge:** Small badge per row. Bulk "Confirm all visible" on list is **nice-to-have** — planner discretion.
- **Apply-to-future prompt:** Fires inline after manual category change. Dialog: "Also categorise all future `<MERCHANT_KEYWORD>` transactions as `<CATEGORY>`?" Keyword is user-editable in the dialog before confirming. Accepting writes a row to `rules`. Options: **Yes / No / Never ask again for this merchant**.

**Data migration**

- New columns (`parent_transaction_id`, `labels`, `confirmed`) + new `rules` table via a Supabase migration.
- Backfill existing transactions: `confirmed = true`, `labels = '{}'::text[]`, `parent_transaction_id = null`.
- Migration must be **idempotent** (safe to re-run).

**Testing**

- Sean smoke-tests end-to-end before push.
- Jenny doesn't test this phase standalone — milestone-level only.

### Claude's Discretion

- Exact SQL migration syntax + Supabase CLI vs dashboard workflow.
- UI chip-input pattern (consistent with existing styles; vanilla JS, no new deps unless necessary).
- Whether to add a DB-level check constraint for split-sum equality, or enforce in client only.
- Rule matching order (creation-time FIFO is the PocketSmith default and recommended).
- Keyboard shortcuts / accessibility polish.

### Deferred Ideas (OUT OF SCOPE)

- Bulk confirm / bulk categorise on the transaction list (use Phase 5 Categorize page).
- Label-based filtering on **reports/charts/Sankey** (defer to Phase 8 or later).
- Full rule management UI (list/edit/delete) — minimal version only in this phase.
- Saved searches combining multiple labels/categories (PocketSmith has this; skip v1).
- Label colours / icons — **text-only labels for v1**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TXN-01 | Split one transaction into multiple child rows; children sum to original | Schema: `parent_transaction_id` on `transactions`. Implementation approach in "Splits" section; no parent flag needed — infer from children. Sum enforcement in split modal before Save enables. |
| TXN-02 | Add free-form labels (array) to transactions, independent of category | Schema: `labels text[]`. Chip input attaches to existing `#modal-transaction` form. Autocomplete source = distinct labels across all in-memory `transactions`. |
| TXN-03 | Filter transaction list by a label | New `<select id="filter-label">` in `.filters-bar`. `applyFilters()` gains a `label && !t.labels?.includes(label)` branch. |
| TXN-04 | Imported transactions land "unconfirmed" with distinct visual | `doImport()` sets `confirmed: false` per row. `.txn-item--unconfirmed` CSS class sets opacity + prepends `.unconfirmed-badge`. |
| TXN-05 | User confirms a transaction; confirmed transactions render normally | New per-row "Confirm" (✓) button in `.txn-actions`; calls `SB.upsertTransaction({...t, confirmed:true})`; `transactionHTML()` omits the class+badge when `confirmed=true`. |
| TXN-06 | After manual category change, prompt to apply to future matching merchants | Hook into existing `saveTransaction()` success path (line ~1554). Merchant keyword derived from first non-numeric token of description; user-editable in new `#modal-apply-future` dialog. |
| TXN-07 | Accepting creates a persisted rule that fires on future CSV imports | Insert into new `rules` table. On next CSV import, `doImport()` runs `applyRulesToRow(row)` BEFORE upsert — first rule whose `merchant_keyword` is a case-insensitive substring of `row.description` sets `row.category`. |
</phase_requirements>

## Summary

Phase 4 ships four interconnected features — splits, labels, confirmed state, and apply-to-future rules — on top of an existing **vanilla JS SPA** with a **single-file Supabase data layer** (`js/supabase-client.js` exposing the `SB` namespace). The good news: the codebase already has every primitive you need — a modal system (`.modal` + `.modal-backdrop` + `.hidden`), a toast helper, a chip/tag CSS pattern (`.category-tag`), a `.dup-badge` pattern for row-level badges, a row-action button pattern (`.txn-actions`), and **most importantly** a "bulk apply after categorisation" flow in `saveTransaction()` (line ~1554) that already pattern-matches merchant bases via `split(/[\/\-\d]/)[0]`. The apply-to-future rule prompt is a small, focused extension of that existing flow — not a greenfield build.

The real risk is **schema migration hygiene**: there is no `supabase/` directory and no migrations have been tracked in-repo before (all prior schema was created through the Supabase dashboard). This phase is the right moment to start a lean `supabase/migrations/` folder with a single idempotent SQL file that the planner can own; don't over-engineer with the full Supabase CLI workflow unless Sean is ready for that.

**Primary recommendation:** Inline one migration SQL file (`supabase/migrations/2026-04-XX_phase4_transactions.sql`) that adds the three columns + the `rules` table + backfill + RLS, written with `IF NOT EXISTS` guards so it is idempotent. Extend `SB` in `supabase-client.js` with `getRules/upsertRule/deleteRule`. Add a chip-input module + apply-future-rule modal + split modal, each wired to the existing `closeModals()` pattern. Hook rule application into `doImport()` between CSV parse and upsert. Bump `sw.js` cache to `finance-v51` **and add `csv-import.js` + `supabase-client.js` to the precache list — they're currently missing**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema (columns, `rules` table, RLS) | Database (Supabase/Postgres) | — | All shared state lives in Supabase per locked decision |
| Transaction CRUD | API/Backend (Supabase REST via `SB`) | Client (in-memory `transactions` array) | Existing pattern: write-through on save, local array mirrors DB |
| Split parent/child logic | Client (`app.js`) | Database (FK only) | Sum enforcement and UI state are client concerns; DB only stores the relation |
| Label array UI + autocomplete | Client (`app.js`) | Database (`text[]` storage) | Free-form data, no FK — client builds suggestions from in-memory state |
| Confirmed badge rendering | Client (render path in `transactionHTML()`) | Database (`confirmed` column) | Visual concern |
| Rule matching on import | Client (`doImport()` loop) | Database (`rules` table per-user with RLS) | Matching runs in-browser per imported row |
| Apply-to-future prompt | Client (modal + save hook) | Database (insert into `rules`) | Triggered inline after `saveTransaction()` success |
| Cache invalidation | Service Worker (`sw.js`) | — | Must bump `finance-vN` — known quirk |

## Existing Codebase Map

### The `transactions` table (inferred from `app.js` + `supabase-client.js` + `csv-import.js`)

Columns currently in use (order not guaranteed):

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `id` | uuid (PK) | `crypto.randomUUID()` on insert | Line 1536, 3064 |
| `date` | text (`YYYY-MM-DD`) | CSV or manual | String format, not `date` type (line 245, 285 use string `.startsWith`) |
| `description` | text | CSV description builder or manual | Post-cleaned (kiwibank `buildDescKiwibank`) |
| `amount` | numeric | Stored as positive number | Sign is carried by `type` |
| `type` | text | `'income'` or `'expense'` | Line 1540 |
| `category` | text | `EXP_CATS`/`INC_CATS` + custom (localStorage) | Free-form text (no FK to a categories table — see quirk below) |
| `account` | text | Full Kiwibank/ANZ account number like `38-9020-0211287-XX` | Line 3070 |
| `notes` | text | Manual free-form | Line 1545 |

**Columns Phase 4 adds:** `parent_transaction_id` (uuid, nullable FK), `labels` (text[], default `'{}'`), `confirmed` (bool, default `false`).

**Other Supabase tables (for RLS template reference):** `budgets`, `recurring`, `accounts`, `goals`. All are queried/upserted via `SB.*` helpers in `supabase-client.js`. None of the existing tables are referenced by the UI as having a `user_id` column explicitly — this strongly suggests the existing RLS policies use `auth.uid()` implicitly via a `user_id` column set by Supabase defaults on insert, OR the app relies on per-row RLS tied to the authenticated session. **The planner MUST verify the existing RLS pattern in the Supabase dashboard before writing the new policy for `rules`** — reuse the same template to keep behaviour identical. (See Open Questions.)

### How transactions render today

- `renderTransactionsList()` (line 1210) → `populateMonthFilter()` + `applyFilters()` (line 1228).
- `applyFilters()` filters by month, category, type, search → groups by date → calls `transactionHTML(t)` (line 1296) for each row → wires click handlers via `bindTransactionActions()` (line 1314).
- Each row is a `.txn-item` with `.txn-icon`, `.txn-description`, `.txn-meta`, `.txn-amount`, `.txn-actions` (edit + delete buttons).
- **Row data-binding:** `data-id="${t.id}"` on `.txn-item` and on `.txn-btn`. Any new button (confirm, split, apply-future) follows this exact pattern.
- Dashboard "Recent Transactions" (line 759) also uses a similar render pattern — both must be updated for the unconfirmed visual treatment.

### Transaction edit flow

- `openEditTransaction(id)` (line 1517) populates `#modal-transaction` form fields and reveals the modal.
- `saveTransaction(e)` (line 1534) builds the `t` object, calls `SB.upsertTransaction(t)`, updates in-memory array, **then at line 1554 runs the existing "apply to matching" logic**:

```js
// Existing pattern (line 1554-1579) — Phase 4 extends this
if (isEdit) {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const merchantBase = s => norm(s).split(/[\/\-\d]/)[0].trim();
  const exact = transactions.filter(/* same description, different category */);
  const partial = transactions.filter(/* same merchantBase, different description, different category */);
  if (exact.length > 0 || partial.length > 0) {
    closeModals();
    openBulkCategoryModal(t.category, exact, partial);
    return;
  }
}
```

**Key insight: `merchantBase = s => s.split(/[\/\-\d]/)[0].trim()`** is already the de-facto merchant-keyword extractor. Reuse it for the apply-to-future prompt so users get consistent behaviour, and make the keyword **editable** in the rule dialog.

### CSV import flow

- `bindCSVImport()` (line 2916) wires file input + checkbox + confirm button.
- `openImportModal()` (line 2950) parses CSVs, marks duplicates, renders a paginated table.
- `doImport()` (line 3040) is the insertion loop:
  1. Filter checked rows, loop and `SB.upsertTransaction(t)` one at a time (TODO: this is slow; 3075 `transactions.push(t)`).
  2. Patch missing `account` fields on existing duplicates (line 3084-3098) via `SB.batchUpsertTransactions()`.
  3. Update account balances from CSV closing balances (line 3107-3124).
  4. Calls `silentlyLabelTransfers()` (line 3133, defined at line 2806) — **this is the existing auto-rule** that runs per-import. The new rule engine runs **alongside** transfer detection, not replacing it.

**Rule injection point:** After `const t = { ... }` is built (line 3063) but before `SB.upsertTransaction(t)` (line 3074). Add `applyRulesToTransaction(t, rules)` which mutates `t.category` if a rule matches.

### Modals and dialogs

HTML pattern (every modal in `index.html` 441-845):

```html
<div id="modal-X" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-box">
    <div class="modal-header">
      <h2>Title</h2>
      <button class="modal-close">&times;</button>
    </div>
    <!-- content -->
    <div class="modal-actions">
      <button class="btn-ghost modal-close-btn">Cancel</button>
      <button class="btn-primary">Save</button>
    </div>
  </div>
</div>
```

CSS: `.modal` fixed overlay, `.modal-backdrop` clickable to close, `.modal.hidden { display: none }` (line 847). `.modal-box-wide` exists (line 1312) for the import modal. Backdrop/close bindings are wired via `bindTransactionModal()` (line 1472) — **every `.modal-close` + `.modal-backdrop` already calls `closeModals()` automatically** (line 1478-1484). New modals inherit this behaviour free.

Open pattern: `document.getElementById('modal-X').classList.remove('hidden')`. Close: `closeModals()` (line 3156) removes hidden-class from all modals.

### Chip / badge / toast patterns

- **Chip pattern** exists at `.category-tag` (css line 1708) — `inline-flex`, pill-shaped, with a `.tag-remove` (×) button. Used in Settings for custom categories (line 2610). **Reuse this class for labels** — zero new CSS needed for the display side.
- **Badge pattern** exists at `.dup-badge` (css line 1406) — small red pill inside the description cell. Mirror as `.unconfirmed-badge` with muted/yellow styling.
- **Toast:** `showToast(msg, type)` (line 3170) — supports `'success'` (purple) and `'error'` (red). Use for all user feedback in new flows.
- **Confirm dialogs:** Native `confirm()` is used liberally (e.g. line 1590, 2674, 2877). For the apply-to-future prompt we want a **custom modal**, not `confirm()` — it needs an editable keyword field and three options (Yes/No/Never).

### Other idioms to reuse

- `crypto.randomUUID()` for all new IDs (line 1536, 2154, 3064). Child split rows get their own UUIDs. **Do not** try to derive child IDs from parent.
- `closeModals()` then `refreshCurrentPage()` after every successful save (line 1581-1582).
- `clearAISnapshot()` called after data mutations — exists on line 1583; carry forward for new flows.
- `isExcludedCategory(c)` (line 1384) excludes `'Transfer'` and `'Work CC'` from income/expense totals. **Rules should not auto-apply a Transfer category** — that's what `silentlyLabelTransfers()` is for, and these rule types should stay separate to avoid conflicts.

## Supabase Migration Approach

**Current state:** No `supabase/` directory in the repo. All prior schema changes were done via the Supabase dashboard (inferred: no migrations, no `supabase` CLI config). `.gitignore` contains 8 bytes — likely just `node_modules`.

**Recommendation (lean, not over-engineered):**

Create one SQL file checked into the repo at `supabase/migrations/2026-04-XX_phase4_transactions.sql`. Sean runs it once via the Supabase SQL Editor in the dashboard. This gives us version control + an audit trail without adopting the full `supabase` CLI workflow (which would require installing `supabase`, logging in, linking project, shadow DB, etc — all of which is fine but deferred until Phase 6 where budget migration is higher risk).

### Migration SQL (idempotent, backfill included)

```sql
-- Phase 4: Transaction Foundations
-- Idempotent — safe to re-run.

-- 1. Add new columns to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;

-- 2. Backfill existing rows as confirmed
-- Safe because DEFAULT false only applies to future inserts;
-- existing rows take DEFAULT at column creation time but belt-and-braces this update
-- makes the intent explicit and covers any pre-existing NULL if someone reruns.
UPDATE transactions SET confirmed = true WHERE confirmed = false AND created_at < now();
-- If there is no created_at column, use: UPDATE transactions SET confirmed = true WHERE confirmed IS NULL OR confirmed = false;
-- (Planner: verify which applies — see Open Questions on whether `created_at` exists.)

-- 3. Index for rule/filter perf
CREATE INDEX IF NOT EXISTS idx_transactions_parent ON transactions(parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_confirmed ON transactions(confirmed) WHERE confirmed = false;
-- GIN index on labels for future "transactions that contain label X" queries
CREATE INDEX IF NOT EXISTS idx_transactions_labels ON transactions USING GIN (labels);

-- 4. Rules table
CREATE TABLE IF NOT EXISTS rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_keyword text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_user_created ON rules(user_id, created_at);

-- 5. RLS on rules — users see/edit only their own
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rules_select_own" ON rules;
CREATE POLICY "rules_select_own" ON rules FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rules_insert_own" ON rules;
CREATE POLICY "rules_insert_own" ON rules FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rules_update_own" ON rules;
CREATE POLICY "rules_update_own" ON rules FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rules_delete_own" ON rules;
CREATE POLICY "rules_delete_own" ON rules FOR DELETE USING (auth.uid() = user_id);
```

**Why this shape:**
- `IF NOT EXISTS` + `DROP POLICY IF EXISTS`/`CREATE POLICY` = idempotent. Running it twice produces the same state.
- `ON DELETE CASCADE` on `parent_transaction_id` so deleting a parent also deletes children (matches the mental model; if Sean wants to undo a split, delete the parent).
- GIN index on `labels` is a one-line win — Postgres array containment queries (`labels @> ARRAY['joint']`) stay fast as data grows.
- Partial index on `confirmed = false` — we'll query unconfirmed counts often (for Phase 5 nudge).
- `rules.user_id` references `auth.users(id)` directly — verify this matches how `transactions.user_id` is declared (see Open Questions).

**Planner decision:** DB-level split-sum check is NOT recommended — it requires a trigger that sums children on every insert/update, which adds complexity and a failure surface on legitimate edits. Enforce in client only; reconcile via a `removeDuplicates`-style scan tool if drift ever appears.

### SB client additions (`js/supabase-client.js`)

```js
// ===== Rules =====
async function getRules() {
  const { data, error } = await client.from('rules').select('*').order('created_at');
  if (error) throw error;
  return data;
}

async function upsertRule(r) {
  // r must include user_id for RLS — get it from getSession() before calling
  const { error } = await client.from('rules').upsert(r);
  if (error) throw error;
}

async function deleteRule(id) {
  const { error } = await client.from('rules').delete().eq('id', id);
  if (error) throw error;
}
```

Add all three to the returned `SB` object. Also update the `doImport` flow to load rules fresh from DB before applying, or cache them alongside `transactions` in `startApp()` (line 124).

## Implementation Approach per Capability

### Splits (TXN-01)

**Data shape.** Parent row retained, `parent_transaction_id` on children points back. Do **not** add a `is_split` flag — infer from children to keep schema minimal and avoid a consistency bug where the flag and the children disagree:

```js
const hasChildren = (parentId) => transactions.some(t => t.parent_transaction_id === parentId);
```

**Render.** In `applyFilters()` and `transactionHTML()`, hide rows that have `parent_transaction_id` when their parent is also visible (the default view). Render the parent with a "(split into N)" subtitle and the children indented below — OR the simpler v1: **render children as normal rows and hide the parent by default**, with a toggle in Settings / on the row to "show parent". Planner picks one; recommend **children-visible, parent-hidden** for v1 — simplest mental model, category totals are automatically correct.

**Totals.** Every computation that sums `transactions` (line 247, 285, 526, 566, 701, 1721, etc.) MUST filter out parents that have children. Add a helper:

```js
const isSplitParent = t => transactions.some(x => x.parent_transaction_id === t.id);
const spendable = transactions.filter(t => !isSplitParent(t));  // use this for totals
```

Or equivalently, filter out rows WHERE there exists a child with `parent_transaction_id === t.id`. **This is the highest-risk refactor in the phase** — there are ~15 places summing transactions. Planner should extract one filter helper and thread it through.

**Split modal (`#modal-split-transaction`).**

```
Header: "Split Transaction"
Subtitle: original description + original amount
Children area: list of child rows, each with
  - amount input
  - category <select>
  - description input (defaults to parent description)
  - × remove button
+ Add Child button (min 2 children)
Remaining: "$X.XX unallocated" (red when ≠ 0)
Save button disabled until remaining === 0
```

**Save logic:**
1. Validate `children.reduce((s,c) => s+c.amount, 0) === parent.amount` to 2dp (use `Math.round(x*100)` comparison).
2. Generate UUIDs for each child; set `parent_transaction_id = parent.id`; copy `date`, `type`, `account` from parent; `confirmed = true` (splitting is an explicit user action — confirmed by doing it).
3. Batch insert children: `SB.batchUpsertTransactions(children)`.
4. Leave the parent untouched in DB; update in-memory array; `refreshCurrentPage()`.

**Trigger:** Add a "Split" button to `.txn-actions` (line 1307-1310). On mobile there's no `:hover` so `.txn-actions` needs a tap-to-reveal three-dot menu — but the existing code already has this problem (edit/delete are hover-only); scope creep to fix here. **Recommendation:** always-visible three-dot button on every row that opens a small popup menu (Edit / Split / Delete / Confirm if unconfirmed). Simpler than swipe; works on mobile and desktop.

### Labels (TXN-02, TXN-03)

**Storage.** `labels text[]` — Postgres array. Supabase JS client handles it as a plain JS array both ways: `t.labels = ['joint', 'holiday2026']` — no JSON stringify needed.

**Chip input UI.** Minimal vanilla-JS component. Skeleton:

```html
<!-- in #modal-transaction, after Notes field -->
<label>Labels</label>
<div class="chip-input" id="txn-labels-input">
  <div class="chip-list"></div>
  <input type="text" placeholder="Add label..." id="txn-label-text" autocomplete="off" />
  <div class="chip-suggestions hidden"></div>
</div>
```

Behaviour:
- Typing filters `chip-suggestions` from the union of all existing labels across `transactions`.
- Enter or comma adds the current input as a chip; backspace with empty input removes last chip.
- Each chip is a `.category-tag` (reusing existing class) with a `.tag-remove` ×.
- On modal save, collect `chips = [...container.querySelectorAll('.category-tag')].map(c => c.dataset.label)` and set `t.labels = chips`.

**Sanitise on save:** lowercase + trim + dedupe. No `#` prefix stored (display layer adds it if desired, but simpler: store raw and don't display `#`). **Decision to make:** store with or without `#` — recommend **without**, display without — consistent with the UX pattern already used in the filter dropdown for categories.

**Filter by label (TXN-03).** Add to `.filters-bar` in `index.html` line 227:

```html
<select id="filter-label">
  <option value="">All Labels</option>
</select>
```

Populate on `renderTransactionsList()` with distinct labels flattened from all transactions. In `applyFilters()` (line 1234), add:

```js
if (label && !(Array.isArray(t.labels) && t.labels.includes(label))) return false;
```

### Confirmed state (TXN-04, TXN-05)

**Default on new imports.** In `doImport()` at line 3063, add `confirmed: false` to the `t` object. (Manual add-transaction via `saveTransaction()` should default `confirmed: true` — the user literally typed it in, so it's confirmed by definition.)

**Render.** In `transactionHTML()` (line 1296), conditionally add a class and a badge:

```js
const unconfirmed = t.confirmed === false;
const cls = unconfirmed ? 'txn-item--unconfirmed' : '';
const badge = unconfirmed ? '<span class="unconfirmed-badge">Unconfirmed</span>' : '';
return `<div class="txn-item ${cls}" data-id="${t.id}">
  ...
  <div class="txn-description">${escHtml(t.description)}${badge}</div>
  ...
</div>`;
```

CSS to add (mirrors `.dup-badge`):

```css
.txn-item--unconfirmed .txn-description,
.txn-item--unconfirmed .txn-meta,
.txn-item--unconfirmed .txn-amount {
  opacity: 0.55;
}
.unconfirmed-badge {
  display: inline-block;
  font-size: 10px;
  background: rgba(250, 204, 21, 0.18); /* amber-400 @ 18% */
  color: var(--yellow);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 6px;
  vertical-align: middle;
  opacity: 1;  /* override the row dim */
}
```

**Confirm button.** Add to `.txn-actions` only when `unconfirmed`:

```js
const confirmBtn = unconfirmed ? `<button class="txn-btn confirm" data-id="${t.id}" title="Confirm">✓</button>` : '';
```

In `bindTransactionActions()` (line 1314) add a `.txn-btn.confirm` handler that runs:

```js
const t = transactions.find(x => x.id === id);
const updated = { ...t, confirmed: true };
await SB.upsertTransaction(updated);
// update in-memory + refresh
```

**Dashboard "Recent Transactions" (line 759)** also renders transactions — give it the same treatment for visual consistency.

**Do NOT** auto-confirm during `silentlyLabelTransfers()`. Auto-labelling a transfer still leaves the row "pending Sean's review" — the confirmed flag is a separate signal from whether auto-categorisation ran.

### Apply-to-future rules (TXN-06, TXN-07)

This is an extension of the existing `openBulkCategoryModal` flow, not a replacement.

**Merchant keyword derivation.** Reuse the existing `merchantBase` helper from line 1557:

```js
const merchantBase = s => norm(s).split(/[\/\-\d]/)[0].trim();
// "COUNTDOWN ST CLAIR 14/04/26 19:23" → "countdown st clair "
// Trim to "countdown st clair" — already done by .trim()
```

Then uppercase for display in the prompt. The user should be able to **edit it to just "COUNTDOWN"** before confirming — which is exactly the PocketSmith guidance from `pocketsmith-transactions.md`.

**Prompt trigger point.** In `saveTransaction()` (line 1554), the current flow offers to re-apply to existing matching transactions (`openBulkCategoryModal`). Extend as follows:

```js
if (isEdit) {
  // (existing) Bulk-apply to existing matches
  const exact = /* ... */;
  const partial = /* ... */;

  // NEW (Phase 4): Offer to create a rule for future transactions
  const keywordSuggestion = merchantBase(t.description).toUpperCase();
  const existingRule = rules.find(r =>
    r.merchant_keyword.toLowerCase() === keywordSuggestion.toLowerCase()
  );
  const neverAsk = JSON.parse(localStorage.getItem('finance_rule_never_ask') || '{}');
  const shouldPrompt = !existingRule && !neverAsk[keywordSuggestion];

  // Show both in sequence: bulk modal first (for past), then rule modal (for future).
  // OR combine into one modal with two sections (recommended — less click fatigue).
  if (exact.length > 0 || partial.length > 0 || shouldPrompt) {
    closeModals();
    openApplyModal({ category: t.category, exact, partial, keywordSuggestion, shouldPrompt });
    return;
  }
}
```

**Modal design (`#modal-apply-category`).** Combine the existing bulk-apply (for past transactions) with the new rule prompt (for future):

```
Header: Apply category "Groceries"
Section 1 (if matches exist): [existing bulk-apply checklist]
Section 2 (if not already a rule):
  [×] Also categorise all future transactions matching this keyword
  Keyword: [COUNTDOWN___________] (editable text input)
  [small] First match wins — case-insensitive substring against description.

Footer:
  [Cancel] [Never ask for COUNTDOWN] [Apply]
```

On Apply: run existing bulk upsert; if rule checkbox on, insert rule.
On "Never ask": set `localStorage.finance_rule_never_ask[keywordSuggestion] = true` (per-user client-side; no DB needed for this — it's a lightweight preference).

**Rule application in `doImport()`.** Insert between line 3062 (row loop start) and line 3074 (`SB.upsertTransaction(t)`):

```js
// Load rules once before the loop
const rules = await SB.getRules().catch(() => []);

// For each row:
const matched = rules.find(r =>
  t.description.toLowerCase().includes(r.merchant_keyword.toLowerCase())
);
if (matched) t.category = matched.category;
// (and then: confirmed is still false — rules auto-categorise but don't auto-confirm)
```

**Rule matching ordering.** Creation-time FIFO (first-created wins). Query ordered `.order('created_at')` — already in the `getRules()` example above.

**Conflict with `silentlyLabelTransfers()`.** The transfer labeller runs AFTER the import loop (line 3133) and overrides category to `'Transfer'`. Transfer detection should win over rule detection for bank-internal transfers because it prevents double-counting. **Keep the order:** rules → import upsert → `silentlyLabelTransfers()`. If a transaction matched a rule but is actually a transfer, the transfer labeller re-categorises it. Acceptable for v1.

**Minimal rule management UI (per CONTEXT "plan a minimal version").** One new Settings section:

```
Rules
[table of rules: keyword | category | created | ×]
(No edit — delete + re-create. Fine for v1.)
```

## Pitfalls to Avoid

### 1. Service worker precache list is stale

**What goes wrong:** `sw.js` line 2 precaches only `/`, `/index.html`, `/css/styles.css`, `/js/db.js`, `/js/charts.js`, `/js/ai.js`, `/js/app.js`. It does **NOT** include `/js/csv-import.js` or `/js/supabase-client.js`. These are loaded via `<script>` tags at runtime — the fetch handler at line 21 falls back to network for any uncached asset, which masks the bug on every reload but means first-install offline might be broken today.

**How to avoid:** Add both files to `ASSETS` in `sw.js`. Bump cache to `finance-v51` (or higher). This is a Phase 4 housekeeping step — do it even though it's not strictly a Phase 4 requirement, because cache misses in Phase 4 will blame Phase 4.

### 2. Transaction summation ignoring split parents

**What goes wrong:** ~15 sites in `app.js` do `transactions.filter(t => t.type === 'expense' ...).reduce(...)`. If a parent stays in the array after splitting, categorised totals double-count: the parent's category AND each child's category both contribute. Dashboard tiles, budget progress, pay-cycle chart, reports, and AI snapshot all pull from the same `transactions` array — all are affected.

**How to avoid:** Extract one helper `const leafTransactions = () => transactions.filter(t => !isSplitParent(t))` and systematically replace every totals call site. Grep for `transactions.filter(t => t.type` and audit each match. Write a unit-style smoke function (console-based, called from DevTools) that asserts `sum(leaf) === old sum` for a known month before splits exist.

### 3. Postgres `text[]` gotchas

**What goes wrong:**
- **Empty array vs NULL.** `DEFAULT '{}'` means new rows get `[]` not `null`. But any pre-existing row (before the column was added) would be `NULL` in absence of backfill — handle `Array.isArray(t.labels) ? t.labels : []` defensively in JS render paths.
- **Equality comparison.** `labels = '{joint}'` works, but `labels @> ARRAY['joint']` is the containment operator you want for "transactions that have this label." Use `@>` not `=` in any future SQL.
- **Client → server serialisation.** Supabase-js handles JS arrays fine, but **empty strings inside the array are truthy** — filter empty/whitespace entries before save: `labels.map(s => s.trim().toLowerCase()).filter(Boolean)`.

**How to avoid:** The backfill `DEFAULT '{}'` handles new-column rows automatically. Still add `t.labels ?? []` at every read site.

### 4. Case-insensitive substring matching

**Decision:** Do it **in JavaScript** (`t.description.toLowerCase().includes(r.merchant_keyword.toLowerCase())`) rather than Postgres `ILIKE` because rule matching happens in the browser during import anyway (we already hold all rules and all import rows in memory). No query overhead, no index complexity, no `%` escaping.

**Pitfall avoided by choosing JS:** `ILIKE '%' || keyword || '%'` in SQL requires escaping `%`, `_`, and `\` in the keyword — a user entering "50%" in a keyword would match everything. Sidestep entirely by matching client-side.

### 5. Idempotent migration edge cases

**What goes wrong:**
- If Sean partially runs the migration (adds columns but fails mid-backfill), re-running naive `UPDATE transactions SET confirmed = true` would also confirm any newly-imported unconfirmed rows from Phase 4+ — overwriting the user's intent.
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` is available from Postgres 9.6+, Supabase is on 15+ so fine. But `DROP POLICY IF EXISTS` is what makes RLS re-runnable — omit it and re-running fails with "policy already exists."

**How to avoid:** Use a one-shot backfill guard. Option A (no `created_at`): `UPDATE transactions SET confirmed = true WHERE confirmed = false` — safe on first run but dangerous if re-run after Phase 4 imports exist. Option B (with `created_at`): `WHERE confirmed = false AND created_at < '2026-04-19'::timestamptz`. **Recommendation:** gate the backfill with the deploy date to make re-runs idempotent in the strong sense. Planner locks the date at plan-write time.

### 6. Accidentally confirming during transfer detection

**What goes wrong:** `silentlyLabelTransfers()` spreads `...t` into `updatedTxn` and `upserts`. Post-migration, `confirmed` will be part of the spread. If an imported row is `confirmed: false` and a transfer pattern matches, the upsert writes `confirmed: false` back (correct). But if we naively add `confirmed: true` in that function, we'd be silently confirming rows the user hasn't reviewed. **Don't.** The transfer labeller only sets category, never `confirmed`.

### 7. Rules that never match (keyword too specific)

**What goes wrong:** A user clicks "Apply to future" without editing the suggestion, which is `"COUNTDOWN ST CLAIR 14/04/26 19:23".split(/[\/\-\d]/)[0].trim()` → `"COUNTDOWN ST CLAIR "` → trim → `"COUNTDOWN ST CLAIR"`. Future rows `"COUNTDOWN NEWMARKET 15/04/26"` would NOT match. Silent failure.

**How to avoid:** The merchant-keyword suggestion in the prompt should **pre-shorten to the first token only** for more resilient matches, and then let the user extend if they want. Change the derivation to `merchantBase(s).split(' ')[0]` for the rule dialog (vs the existing `merchantBase` which is used for past-match grouping where more specificity is fine).

### 8. PWA cache MUST bump

**Already called out in CLAUDE.md and STATE.md.** Current: `finance-v50`. After Phase 4 deploy: `finance-v51` minimum. Forgetting = Sean and Jenny see old code until they hard-refresh. Add to the deploy checklist in the plan.

### 9. RLS policy template mismatch

**What goes wrong:** If existing `transactions` uses RLS keyed on a different column name (`owner_id` not `user_id`, or uses `auth.jwt()->>'email'` rather than `auth.uid()`), the new `rules` policies won't behave consistently — e.g. a second user (Jenny) might see Sean's rules or vice versa.

**How to avoid:** Planner reads the existing policy from the Supabase dashboard (SQL editor → "Policies") and mirrors it for `rules` exactly, rather than assuming `auth.uid() = user_id`. Flagged in Open Questions.

### 10. Child rows leaking into category filters

**What goes wrong:** `populateCategoryFilter()` (line 1285) builds the dropdown from `transactions.map(t => t.category).filter(Boolean)`. After splits, child categories show up — correct. But parent's original category (now effectively hidden) might also show up if we keep the parent visible — wastes a slot, confuses the filter.

**How to avoid:** If the decision is "hide parents with children," filter them out of `populateCategoryFilter` too: `transactions.filter(t => !isSplitParent(t)).map(t => t.category)`.

## Build Order Recommendation

Sequential with clear dependency:

1. **Wave 0 — Pre-flight** (≤0.5 day)
   - Verify existing RLS pattern on `transactions` / `budgets` in Supabase dashboard. Document what `user_id` column looks like + what `auth.*` call is used. Unblocks migration SQL correctness.
   - Add a `leafTransactions()` helper and unit-smoke it against current totals (expect same value because no splits exist yet). This is the refactor net for every other change.
   - Bump `sw.js` cache + add missing files to `ASSETS`. Ship this first as a standalone commit so any subsequent visual regressions aren't masked by cache.

2. **Wave 1 — Schema + data layer** (0.5 day)
   - Write and run `supabase/migrations/2026-04-XX_phase4_transactions.sql`.
   - Extend `SB` (`supabase-client.js`) with `getRules/upsertRule/deleteRule`.
   - Load `rules` in `startApp()` alongside transactions.
   - **Deploy test:** Open the app, confirm no breakage; verify via DB console that new columns exist and existing rows are backfilled to `confirmed=true`, `labels='{}'`.

3. **Wave 2 — Confirmed state + visual** (0.5 day)
   - Set `confirmed: false` in `doImport()`; set `confirmed: true` in manual `saveTransaction()` new-row path.
   - Add `.txn-item--unconfirmed` CSS + badge.
   - Render logic in `transactionHTML()` (transactions page + dashboard recent).
   - Add per-row Confirm button.
   - **Smoke test:** import a tiny CSV, see unconfirmed rows, click Confirm, see them render normal.

4. **Wave 3 — Labels** (1 day)
   - Build chip-input component + autocomplete.
   - Wire into `#modal-transaction` (add Labels field after Notes).
   - Save/load `labels` array on transactions.
   - Add `#filter-label` to filter bar; extend `applyFilters()` + `populateLabelFilter()`.
   - **Smoke test:** add `joint` to 3 transactions, filter by `joint`, see only those 3. Reload page, labels persist.

5. **Wave 4 — Splits** (1–1.5 days — **highest client-side complexity**)
   - Add three-dot menu to `.txn-actions` (fixes hover-only-on-desktop problem at the same time).
   - Build `#modal-split-transaction`.
   - Wire Save: insert children, leave parent, refresh.
   - Thread `leafTransactions()` through every totals call site. This is the refactor moment.
   - Update `applyFilters()` to hide split-parent rows.
   - **Smoke test:** split a $237 row into $180/$45/$12; verify budget totals unchanged; verify dashboard tiles unchanged; verify reports unchanged.

6. **Wave 5 — Apply-to-future rules** (0.5–1 day)
   - Build `#modal-apply-category` combining bulk-apply + rule prompt.
   - Hook into `saveTransaction()` after success.
   - Store rules via `SB.upsertRule`.
   - Inject rule application into `doImport()` per-row.
   - Minimal rule list in Settings (read-only table + delete).
   - **Smoke test:** categorise a "COUNTDOWN" row, accept rule creation with keyword "COUNTDOWN", import another CSV with COUNTDOWN rows → auto-categorised.

7. **Wave 6 — Deploy** (0.25 day)
   - Final `sw.js` cache bump if additional JS files added.
   - `git commit` + `git push` + `vercel --prod`.
   - Hard-refresh test on Sean's phone + desktop.

**Why this order:**
- Schema first = every client change can assume the DB is correct.
- Confirmed state is the smallest isolated UI change — quick confidence win.
- Labels and splits are independent — could swap order. Labels is simpler, so ship second.
- Splits requires the totals refactor — biggest risk, needs dedicated attention.
- Apply-to-future is last because it builds on confirmed (new rows are unconfirmed, rule-categorised; user still needs to confirm).

## Validation Architecture

Nyquist validation is enabled in `.planning/config.json`. There is **no existing test framework** in the project — no Jest, no Mocha, no pytest, no test directory. Prior Phase 1–3 work has been validated by manual smoke tests documented in PROJECT.md and STATE.md.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed; **recommend: no framework for this phase**. Use **browser DevTools console smoke-checks + structured manual steps**. |
| Config file | none |
| Quick run command | Open the deployed URL + open DevTools console; paste smoke snippets (below). |
| Full suite command | Manual walkthrough of the 7 smoke scenarios in the Phase Requirements → Test Map. |
| Phase gate | Sean signs off the manual suite before running `/gsd-verify-work`. |

**Rationale for not adding a test framework in this phase:** Introducing Jest/Vitest into a no-build vanilla JS SPA with Supabase as the source of truth would require either (a) a Playwright harness hitting a test Supabase project, or (b) a mocked `SB` client. Both are more infra than Phase 4 is worth. Phase 4 is a small, visually-verifiable feature set. Save the test-harness investment for Phase 6 (budget refactor) where data-migration risk genuinely warrants it. **Planner: if Sean wants a lightweight check, add one `window.__smoke__` helper object with ~5 assertion functions that read from `App` state and log PASS/FAIL — no framework.**

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Manual Step / Automated Command | Exists? |
|--------|----------|-----------|-------------------------------|---------|
| TXN-01 | Split sums to parent; children render, parent hidden; totals unchanged | manual smoke + console assert | (1) Pre-record: `const before = [...document.querySelectorAll('.bh-tile-amount')].map(e=>e.textContent)`. (2) Edit a $237 row, Split into $180/$45/$12. (3) Verify list shows 3 children, not the parent. (4) Re-run the tile snapshot; assert `before` equals after except for reshuffled categories (manually verify category-by-category). | ❌ Wave 0 — add `__smoke__.splitIntegrityCheck()` |
| TXN-02 | Labels persist; multi-chip input works; autocomplete suggests existing labels | manual | Add `joint`, `holiday2026` to a row → save → close modal → reopen → chips render. Reload page → chips still there. | ❌ manual |
| TXN-03 | Filter by label shows only matching rows | manual | Tag 3 rows with `joint`; select `joint` in filter; count list → 3. Clear → full list returns. | ❌ manual |
| TXN-04 | Imported rows land `confirmed: false` with visible badge + reduced opacity | manual | Import a small test CSV (2–3 rows); observe `Unconfirmed` badge + dim opacity. DevTools: `App.transactions.filter(t=>!t.confirmed).length > 0`. | ❌ Wave 0 — add `__smoke__.importSetsUnconfirmed()` |
| TXN-05 | Clicking Confirm flips state, badge disappears, opacity restores | manual | Click ✓ on an unconfirmed row. Badge gone, opacity restored. Supabase dashboard: row shows `confirmed=true`. | ❌ manual |
| TXN-06 | Apply-to-future prompt fires after manual category change with editable keyword | manual | Edit a "COUNTDOWN ST CLAIR" row to Groceries; observe modal with keyword field pre-filled `COUNTDOWN`; edit to `COUNTDOWN`; Apply. | ❌ manual |
| TXN-07 | Rule fires on next import | manual | After creating rule in TXN-06, import a CSV containing `COUNTDOWN NEWMARKET 15/04/26`. Verify the imported row has `category = Groceries` (not auto-categorised by `autoCategory`'s own regex). | ❌ Wave 0 — add `__smoke__.ruleApplied(rule, imported)` |

### Sampling Rate

- **Per-task commit:** Skim the page for rendering regressions. Open DevTools → `App.transactions.length` → confirm matches expected.
- **Per-wave merge:** Run that wave's smoke scenario end-to-end.
- **Phase gate:** All 7 TXN-XX manual scenarios pass. Sean commits `docs($PHASE): Phase 4 validation sign-off` before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] Create `js/__smoke__.js` with ~5 console-runnable assertions (see Req Map). Loaded only in dev via a `?smoke=1` URL flag to avoid shipping test code to prod.
- [ ] Add a "Smoke checks" section to `LEARNINGS.md` documenting what Sean runs before each deploy.
- [ ] Document the manual 7-step smoke walkthrough in `docs/pocketsmith-lift-spec.md` or a sibling file.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existing Supabase tables (`transactions`, `budgets`, etc.) already have a `user_id uuid references auth.users(id)` column and an RLS policy `auth.uid() = user_id` | Migration, RLS | [ASSUMED] If they use a different pattern, the new `rules` policy won't be consistent — Jenny might see Sean's rules or vice versa. **Planner must verify before running migration.** |
| A2 | `transactions` has a `created_at timestamptz` column | Migration backfill guard | [ASSUMED] If not, the backfill guard `WHERE created_at < '...'` fails. Fallback: use `WHERE confirmed IS DISTINCT FROM true` which is safer but less readable. |
| A3 | Supabase Postgres is version 15+ | Migration syntax | [VERIFIED via Supabase public docs: new projects use 15+; `gen_random_uuid()` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` both available since long before that.] |
| A4 | Sean prefers SQL-file-in-repo over adopting the `supabase` CLI for this phase | Migration workflow | [ASSUMED] If he wants the CLI, plan swaps to `supabase migration new phase4_transactions` + `supabase db push`. Same SQL, different driver. |
| A5 | `merchantBase` regex `split(/[\/\-\d]/)` is a fine default keyword extractor | TXN-06 | [VERIFIED: the code at line 1557 uses this today for bulk-apply and it's been working on Sean's real data. Pocketsmith research (`pocketsmith-transactions.md` line 34) confirms "use the base merchant name" is the correct approach.] |
| A6 | Current `transactions.amount` is stored as a positive `numeric` with sign implied by `type` | Splits | [VERIFIED in code: line 88 (CSV import) stores `Math.abs(amount)`; line 1541 reads `parseFloat(amount)` without sign handling.] |
| A7 | Vanilla `supabase` JS client handles `text[]` round-trip as JS Array natively | Labels | [CITED: Supabase JS client docs — PostgREST serialises Postgres arrays as JSON arrays. Verified by the fact that other apps use this pattern without custom serialisation.] |
| A8 | `.txn-actions` hover-reveal is a pre-existing UX issue on mobile, not a Phase 4 regression | Split menu | [VERIFIED in CSS line 387-388: `.txn-actions { opacity: 0; }` with `:hover` reveal — this is already on mobile where `:hover` is sticky. Replacing with always-visible three-dot fixes it for free.] |

## Open Questions for Planner

1. **RLS policy template on existing tables**
   - What we know: `transactions`/`budgets` work for Sean, will need to work for Jenny when she logs in. They must have some per-user isolation.
   - What's unclear: whether isolation is via an implicit `user_id` column + `auth.uid()` RLS, or some other scheme (possibly none, with Sean being the sole allowed user today). STATE.md only says "Supabase RLS blocks anon key queries — always use authenticated client."
   - Recommendation: **planner opens the Supabase dashboard → Authentication → Policies → Tables → transactions**, reads the existing policy verbatim, and mirrors it for `rules`. Do NOT assume. This is the one blocking check before Wave 1 runs.

2. **Parent row representation after split: hide or show?**
   - Two valid approaches: (A) hide parent by default, render only children — mental model: "the transaction became these 3 transactions"; (B) show parent as a grouping row with children indented under it — mental model: "this transaction was split into these 3 parts."
   - PocketSmith does (B) (cards with children underneath). Our codebase's simpler render model leans toward (A).
   - Recommendation: **(A) for v1** — less code change, automatic totals correctness, no new grouping UI needed. (B) becomes a later enhancement if Sean asks for traceability view.

3. **Merchant keyword shortening — first token or first phrase?**
   - Two options: (A) first word only (`"COUNTDOWN"`); (B) everything before the first digit or slash (`"COUNTDOWN ST CLAIR"`).
   - Tradeoff: (A) matches more future rows but risks over-matching (e.g. `"BP"` would match "BP Connect" which could be Fuel OR Food & Dining depending on store); (B) is precise but brittle to branch variance.
   - Recommendation: **(A) first token, editable in the dialog.** The editable field is the real safety net — let users type `"COUNTDOWN"` or `"BP "` themselves. Default to most permissive (shortest) because users are more likely to tighten than loosen.

4. **Should rules also apply to historical unconfirmed transactions?**
   - Scenario: user accepts an apply-to-future rule for `COUNTDOWN → Groceries`. There are 4 existing unconfirmed `COUNTDOWN` rows from a prior import. Should the new rule back-apply to them?
   - The existing `openBulkCategoryModal` already handles this case (historical matches). Plus the new rule will fire on *future* imports.
   - Recommendation: **keep them separate** — the existing bulk modal handles "past matches" in the same dialog; the rule only fires on `doImport()`. Don't run the rule engine over in-memory state retroactively. Simpler, predictable, already how PocketSmith works per `pocketsmith-transactions.md`.

5. **Split child `confirmed` default: inherit from parent or always true?**
   - When a user splits, they're making an explicit decision → the children are implicitly confirmed.
   - Recommendation: **always `confirmed: true` on split children**, regardless of parent. The parent row's `confirmed` is moot once hidden.

6. **Data migration for pre-existing transactions without a `user_id` (Sean's only)**
   - If existing rows have `user_id = null` (because only Sean has used the app), adding RLS on `rules` is easy (new table, all new rows have user_id). But if Phase 4 is the first time anyone tightens RLS, Sean should verify no row becomes invisible after Jenny logs in.
   - Recommendation: **out of scope for Phase 4** — this is Jenny-login phase territory. Add a note to STATE.md for tracking.

7. **Do we need a `rules.rank`/`order` column for user-driven rule priority?**
   - CONTEXT locks creation-time FIFO. If Sean later wants to reorder rules (move a more specific one above a more general one), we'd need to add `rank INT` and a reorder UI.
   - Recommendation: **defer**. FIFO is fine for v1. Add an open question to STATE.md at phase end if Sean wants rule priority in Phase 5.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase SQL Editor (dashboard) | Running the migration | ✓ (via browser) | live | — |
| `supabase` CLI | Optional — alt migration workflow | Not tested; probably not installed | — | Use dashboard SQL editor (recommended) |
| Node/npm | Nothing in this phase requires a build step | N/A for Phase 4 | — | Not needed |
| Vercel CLI (`vercel`) | Prod deploy | ✓ (per MEMORY) | latest | — |
| Browser (modern PWA) | Runtime | ✓ | — | — |
| Git | Commit + push | ✓ | — | — |

**Missing dependencies with no fallback:** None — Phase 4 is code+config+SQL only.

**Missing dependencies with fallback:** `supabase` CLI — dashboard SQL editor is the recommended path.

## Security Domain

Security enforcement is not explicitly disabled in `.planning/config.json`, so standard ASVS applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Reuse | Existing Supabase email/password auth — unchanged this phase |
| V3 Session Management | Reuse | Supabase session via `SB.getSession()` — unchanged |
| V4 Access Control | **Yes** | New `rules` table MUST have RLS mirroring existing tables (`auth.uid() = user_id`) |
| V5 Input Validation | **Yes** | Labels: trim/lowercase/dedupe + length cap (recommend 32 chars). Merchant keyword: trim + length cap (recommend 64). Both passed to Supabase as parameters — not string-concatenated into SQL (the client handles parameterisation). |
| V6 Cryptography | N/A | No new crypto — `crypto.randomUUID()` is already in use and correct. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection in keyword/label | Tampering | Use parameterised client (already — `supabase-js` handles this) |
| XSS via label/keyword rendering | Tampering | `escHtml()` (line 3187) is already used everywhere; ensure new render paths use it. Chips **especially** — the chip's text content must be `escHtml`'d because it's user-controlled. |
| Rule cross-user leak | Information Disclosure | RLS policy on `rules` — the most important single security control this phase. Verify it by signing in as Jenny (when available) and checking `SB.getRules()` returns only her rows. |
| localStorage tampering (`finance_rule_never_ask`) | Tampering (low impact) | Not a security concern — worst case user sees an extra prompt. No action required. |
| Transfer labeller and rule labeller conflict | Integrity | Ordering in `doImport()` — rules → upsert → transfer detection. Document the precedence clearly in a code comment. |

## Sources

### Primary (HIGH confidence — read directly in this research)
- `/home/seanm/Projects/finance/js/app.js` (lines 1-3196) — all transaction rendering, editing, import, transfer detection
- `/home/seanm/Projects/finance/js/supabase-client.js` (1-149) — `SB` namespace, exact signatures to extend
- `/home/seanm/Projects/finance/js/csv-import.js` (1-258) — CSV parsing, auto-categorisation, per-bank row processing
- `/home/seanm/Projects/finance/js/db.js` (1-89) — IndexedDB wrapper (note: used for settings only; Supabase is source of truth for data)
- `/home/seanm/Projects/finance/index.html` (218-845) — page layout + modal patterns
- `/home/seanm/Projects/finance/css/styles.css` (352-402, 838-1000, 1406-1415, 1708-1727) — txn rows, modals, badges, chips
- `/home/seanm/Projects/finance/sw.js` (1-25) — service worker precache list (currently missing `csv-import.js` and `supabase-client.js`)
- `/home/seanm/Projects/finance/.planning/phases/04-transaction-foundations/04-CONTEXT.md` — all locked decisions
- `/home/seanm/Projects/finance/.planning/REQUIREMENTS.md` — TXN-01..07 verbatim
- `/home/seanm/Projects/finance/LEARNINGS.md` — prior mistakes (account backfill, SW cache bumps, RLS with anon key)
- `/home/seanm/vault/wiki/finance/pocketsmith-transactions.md` — PocketSmith model (splits, labels, confirmed, rules)
- `/home/seanm/vault/wiki/finance/pocketsmith-takeaways.md` — prioritisation + suggested approach

### Secondary (MEDIUM confidence — general ecosystem knowledge)
- Supabase JS client `text[]` handling — confirmed via multiple Supabase community examples; no edge case observed.
- Postgres `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` available since 9.6 — Supabase runs 15+.

### Tertiary (LOW confidence — verify in Supabase dashboard)
- Exact existing RLS policy shape on `transactions` and other tables — **must be read from the Supabase dashboard before writing the migration** (Open Question 1).
- Whether `transactions` has a `created_at timestamptz` column — affects the backfill guard (Assumption A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tech is locked (vanilla JS + Supabase); existing patterns are concrete and read directly.
- Architecture: HIGH — every new piece maps to an existing primitive in the codebase.
- Schema: MEDIUM-HIGH — SQL is standard Postgres/Supabase; RLS policy shape pending verification (Open Question 1).
- Pitfalls: HIGH — derived from reading the actual code paths, not training knowledge.

**Research date:** 2026-04-19
**Valid until:** 2026-06-19 (2 months — stable codebase + stable Supabase docs). Re-check if Sean upgrades Supabase-js major version or migrates off vanilla JS.

## RESEARCH COMPLETE
