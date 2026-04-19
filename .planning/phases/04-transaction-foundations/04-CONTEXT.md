# Phase 4: Transaction Foundations — Context

**Gathered:** 2026-04-19
**Status:** Ready for research + planning
**Source:** Milestone v1.1 REQUIREMENTS.md + PocketSmith research (vault)

<domain>
## Phase Boundary

This phase extends the transaction model to support four concrete new capabilities, all of which share schema surface and therefore ship together:

1. **Transaction splits** — one row becomes many, each with its own category/amount, children sum to parent.
2. **Labels** — free-form multi-value tags separate from categories.
3. **Confirmed/unconfirmed state** — two-state model on each transaction; imports land unconfirmed, user confirms.
4. **Apply-to-future rule prompt** — after manual categorisation, offer to create a persisted rule by merchant keyword; rule fires on subsequent imports.

**Requirements in scope:** TXN-01 through TXN-07 (see REQUIREMENTS.md)

**NOT in scope for this phase:** the Categorize page (Phase 5), budget model changes (Phase 6), forecast/calendar (Phase 7), Sankey (Phase 8), Akahu integration (separate milestone), rollover budgets (separate milestone).

</domain>

<decisions>
## Implementation Decisions

### Schema (all changes in Supabase — no localStorage for new features)

- **Splits:**
  - Add `parent_transaction_id` (nullable foreign key to `transactions.id`) on the `transactions` table.
  - Parent row is RETAINED after splitting (per PocketSmith model — preserves the link to the bank transaction for reconciliation).
  - Parent row is marked as "split" via a flag or inferred from the presence of children — **planner to choose the cleanest representation**.
  - Child rows' `amount` MUST sum to parent `amount` (enforced in UI at minimum; DB-level check if cleanly achievable).
  - Parent row's category is irrelevant once split (children own categorisation). UI should hide the parent's category or show it as "(split)".

- **Labels:**
  - Add `labels` column as `text[]` (Postgres array) on `transactions`.
  - No `labels` table — labels are free-form, no FK integrity needed.
  - UI: multi-select / chip-style input on the transaction row. Autocomplete from existing labels across all transactions.
  - Filter by label on the transaction list (one label at a time is sufficient for v1).

- **Confirmed state:**
  - Add `confirmed` boolean column on `transactions`, default `false` for new imports, `true` for existing rows (backfill on migration).
  - Visual treatment: unconfirmed rows render with reduced opacity + a small badge ("Unconfirmed" or an icon).
  - User confirms via a button on the row or via the Categorize page (Phase 5).

- **Rules table (new):**
  - New `rules` table with columns: `id`, `user_id`, `merchant_keyword` (text), `category` (text), `created_at`.
  - On CSV import: for each incoming transaction, check rules in order of creation; first match wins; set category accordingly.
  - `merchant_keyword` match is **case-insensitive substring** against the bank's transaction description — matches PocketSmith convention and handles messy bank descriptions.
  - Rules are per-user (RLS: user can only see/edit own rules).

### UX

- **Split dialog:**
  - Triggered from the transaction row menu (three-dot / long-press on mobile).
  - Modal shows original amount + N child rows (start with 2, allow adding more).
  - Live "remaining to allocate" indicator; Save disabled until children sum exactly to parent.
  - Each child has a category picker + amount input + optional description.

- **Label input:**
  - Available on the transaction edit modal.
  - Multi-chip input with free-form text + suggestions from existing labels.

- **Unconfirmed nudge:**
  - A small badge on each unconfirmed row.
  - Bulk "Confirm all visible" button on the transaction list — low-priority nice-to-have, planner can include if time permits.

- **Apply-to-future prompt:**
  - Fires inline after user changes a transaction's category via any categorisation flow.
  - Dialog text: "Also categorise all future `<MERCHANT_KEYWORD>` transactions as `<CATEGORY>`?"
  - `MERCHANT_KEYWORD` = the transaction's description truncated to a sensible merchant prefix (planner to define — likely the first N non-numeric tokens, or a user-editable field in the dialog).
  - User can edit the keyword before confirming.
  - Accepting creates a row in the `rules` table.
  - Dialog has "Yes / No / Never ask again for this merchant" options.

### Data migration

- New columns (`parent_transaction_id`, `labels`, `confirmed`) and new `rules` table must be created via a Supabase migration.
- All existing transactions are backfilled as `confirmed = true` (they're already reviewed).
- Existing transactions have no labels (empty array) and no parent (null).
- Migration must be idempotent (safe to re-run).

### Testing

- Sean smoke-tests the phase end-to-end before pushing.
- Jenny doesn't test this phase standalone — milestone-level testing only.

### Claude's Discretion

- Exact SQL migration syntax and Supabase-CLI workflow.
- Choice of UI library pattern for chip input (consistent with existing app styles — vanilla JS, no new deps unless necessary).
- Whether to add a DB-level check constraint for split-sum equality, or enforce in client only.
- Rule matching order (creation-time FIFO is the PocketSmith default and the recommended choice).
- Keyboard shortcuts and accessibility polish.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning
- `.planning/PROJECT.md` — project context, core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — milestone v1.1 requirements with TXN-01..07 detail
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria

### Research source (external vault)
- `~/vault/wiki/finance/pocketsmith-transactions.md` — PocketSmith transaction model (splits, labels, confirmed state, rules)
- `~/vault/wiki/finance/pocketsmith-takeaways.md` — prioritisation and reasoning

### Codebase (for pattern matching)
- `js/app.js` — the entire SPA; all transaction rendering, editing, and CSV import lives here
- `css/styles.css` — established visual language (dark theme, chip/badge patterns)
- `index.html` — modal/dialog structure and where new UI attaches
- `sw.js` — service worker; cache version MUST bump on deploy

### Supabase
- Live Supabase project for finance app — planner should identify existing migration patterns (if any) or set up the first one cleanly.

</canonical_refs>

<specifics>
## Specific Ideas

- **Merchant keyword default:** Likely the first 1–2 tokens of the bank description, ignoring dates/times/suffixes. Example: `COUNTDOWN ST CLAIR 14/04/26 19:23` → suggest `COUNTDOWN`. Dialog should allow editing before save.
- **Existing `PAY_CYCLE_KEYWORD = 'LOREAL'` constant** in `js/app.js` is a hand-rolled keyword anchor for the pay-cycle chart — loosely analogous to rule matching. Planner may want to harmonise the two or leave them independent.
- **CSV import entry point:** already exists in `js/app.js` — the post-import hook is where auto-categorisation via rules should fire (after transfer detection, which already runs there).
- **Transfer detection** is an existing auto-rule — the new `rules` table should coexist with, not replace, transfer detection logic.
- **Icons for categories** are already established — splits should show the child's category icon per row.

</specifics>

<deferred>
## Deferred Ideas

Explicitly deferred from this phase:

- Bulk confirm / bulk categorise on the transaction list — use Categorize page (Phase 5) for bulk flows.
- Label-based filtering on reports (charts, Sankey) — defer to Phase 8 polish or future milestone.
- Rule management UI (list/edit/delete rules) — plan a minimal version for this phase; full admin defer to follow-up if time-constrained.
- Saved searches combining multiple labels/categories — PocketSmith has this; skip for v1.
- Label colours / icons — text-only labels for v1.

</deferred>

---

*Phase: 04-transaction-foundations*
*Context gathered: 2026-04-19*
