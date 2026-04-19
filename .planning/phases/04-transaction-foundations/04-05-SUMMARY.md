# Phase 4 / Wave 4 — Summary

**Plan:** 04-05-PLAN.md (Splits — TXN-01)
**Status:** Complete (pending Sean's smoke test)
**Executed:** 2026-04-19

## What Shipped

### `index.html`
- `#modal-split-transaction` modal (wide-box) with parent summary block, dynamic children container, "+ Add another split" button, live "Remaining to allocate" readout, Save button (disabled until remaining === 0 and children ≥ 2).
- `#txn-row-menu` popover shared by Edit / Split / Confirm / Delete actions.

### `js/app.js`
- **`transactionHTML`** — added ⋮ "More" button to `.txn-actions`.
- **`bindTransactionActions`** — wires `.txn-btn.more` to `showRowMenu(btn, id)`.
- **`showRowMenu(anchor, id)`** — positions menu near button, rebinds each open, dismisses on outside click. Hides "Confirm" item when row is already confirmed.
- **`confirmTransaction(id)`** — standalone version of the per-row confirm, wired from the menu.
- **`openSplitModal(parentId)`** — guards (no split-children, no already-split), renders summary, starts with 2 pre-filled children (half each), allows + more, recalcs remaining live using cent-precision, enables Save when remaining cents === 0.
- **`saveSplit(parent)`** — builds children with `parent_transaction_id`, `confirmed: true`, `labels: []`, copied date/type/account, sanity-checks cent-sum against parent, batch-upserts, pushes to in-memory `transactions`, closes modal, refreshes page.
- **Parent hidden from list rendering:** `applyFilters` and `renderRecentTransactions` now use `leafTransactions()` (which filters out any row with children).
- **`populateCategoryFilter` + `populateLabelFilter`** — iterate `leafTransactions()` so parent categories/labels don't clutter dropdowns.

### leafTransactions threaded through all totals sites
| Site | Result |
|------|--------|
| renderDashboard → monthTxns | ✓ |
| renderPaceCard → rolling | ✓ |
| findPaydays → salary | ✓ |
| buildCycleCumulative → expense + income branches | ✓ (both) |
| historical cycle loop → expense + income branches | ✓ (both) |
| buildActualCumulative | ✓ |
| renderAccounts → monthIncome, monthExpense | ✓ |
| accountCardHTML → per-account monthly txns | ✓ |
| getSpendForCategory → month + rolling | ✓ |
| renderBudgets → actualByCategory | ✓ |
| renderIncome → incomeTxns | ✓ |
| applyFilters → transaction list | ✓ |
| renderRecentTransactions → dashboard recent | ✓ |

**Total: 19 call sites using `leafTransactions()` after the refactor** (13 totals sites + 4 filter/render sites + 1 helper definition + 1 each in populate filters).

### Intentionally LEFT on `transactions` (not totals)
- `unmatched account` detection — wants all rows, including children, so children can be account-assigned if needed.
- `populateMonthFilter` — months come from all rows.
- `saveTransaction` bulk-apply matches — existing behaviour for category-apply-to-matching.
- `deleteTransaction` splicing.
- `toFix` remediation tool.
- Transfer labeller candidates (both sites).
- CSV import dupe detection.
- Unlinked count.
- `labelChipController.getAllExistingLabels` — labels come from the full corpus intentionally.

### `css/styles.css`
Phase 4 block appended:
- `.txn-btn.more` — always-visible three-dot button.
- `.txn-row-menu` + `.txn-row-menu-item` + `.danger` — absolute-positioned popover with item styles.
- `.split-parent-summary` — muted info block at modal top.
- `.split-child-row` — grid layout (desc | amount+cat | remove), `.btn-split-remove`.
- `.split-remaining-row` — flex row with `.ok` (green) / `.over` (red) state classes.

## Verification
- All 4 new functions present ✓
- 19 `leafTransactions()` call sites (plan expected ≥ 15) ✓
- 0 missed `transactions.filter(t => t.type === 'expense' && !isExcludedCategory...)` sites ✓
- `node --check` passes ✓
- HTML IDs + CSS selectors all present ✓

## Pending — Sean's 19-step smoke test
Pre-snapshot Dashboard/Budgets/Accounts totals, split a $237 row into 3 categories, verify totals unchanged everywhere.
