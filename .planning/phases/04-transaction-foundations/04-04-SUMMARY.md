# Phase 4 / Wave 3 — Summary

**Plan:** 04-04-PLAN.md (Labels — TXN-02, TXN-03)
**Status:** Complete (pending Sean's smoke test)
**Executed:** 2026-04-19

## What Shipped

### `index.html`
- New `#filter-label` `<select>` in `.filters-bar` between `#filter-type` and `#filter-search`.
- New Labels field block inside `#modal-transaction` form (after Notes, before modal-actions): hint text, `.chip-input` wrapper with a `.chip-list`, `#txn-label-text` input, and a hidden `.chip-suggestions` dropdown.

### `js/app.js`
- **`labelChipController`** (module-scope IIFE after `categoryIcon`) — self-contained chip controller with:
  - `sanitise(raw)` — trim + lowercase + 32-char cap
  - `getAllExistingLabels()` — union of labels across all transactions, sorted
  - `setChips(root, labels)` — replace chips, dedupe + sanitise + wire remove buttons
  - `getCurrentChips(root)` — read chip labels from DOM
  - `attach(root)` — wire keyboard (Enter/comma add, Backspace-empty pops), input autocomplete, focus/blur show/hide
  - API exposed: `{ sanitise, getAllExistingLabels, setChips, getCurrentChips, attach }`
- **`openAddTransaction`** — resets chips to empty and attaches the controller.
- **`openEditTransaction`** — sets chips from `t.labels ?? []` and attaches the controller.
- **`saveTransaction`** — after building the `t` object, appends `t.labels = labelChipController.getCurrentChips(...)` so chips round-trip through Supabase.
- **`populateLabelFilter()`** — new function beside `populateCategoryFilter()`, builds dropdown options from unique labels across transactions.
- **`bindFilters`** — includes `filter-label` in the change-listener loop and calls `populateLabelFilter()`.
- **`renderTransactionsList`** — calls `populateLabelFilter()` after `populateMonthFilter()`.
- **`applyFilters`** — reads `filter-label` and filters rows by `Array.isArray(t.labels) && t.labels.includes(label)`.
- **`transactionHTML`** — meta line appends ` · <span class="txn-label-chip">…</span>` chips when the row has labels.

### `css/styles.css`
Added after `.tag-remove:hover`:
- `.chip-input` — wrapper box with border, padding, min-height 42px.
- `.chip-input .chip-list` — flex-wrap container for pills.
- `.chip-input #txn-label-text` — borderless transparent input.
- `.chip-suggestions` — absolute-positioned dropdown beneath input; `.hidden` → `display: none`.
- `.chip-suggest` — block-level suggestion button; `:hover { background: var(--bg-2); }`.
- `.txn-label-chip` — small purple pill for inline meta-line rendering.

## Verification
- `grep -c` on all expected IDs/classes in `index.html` → 5 ✓
- `grep -c` on all expected functions and references in `app.js` → 5 ✓
- `grep -c` on all expected CSS selectors in `styles.css` → 6 ✓ (3 base + overrides)
- `node --check js/app.js` passes ✓

## Sanitisation Contract
- Labels are trimmed, lowercased, and capped at 32 chars on save.
- Empty strings are dropped.
- Duplicates on a single transaction are deduped via `new Set`.
- `maxlength="32"` on the input enforces the cap at type-time too.

## Handoff Notes for Downstream Waves
- `labelChipController` is module-scoped; Wave 5 (rules) doesn't need labels but Wave 4 (splits) should propagate labels from parent to children if we want children to inherit labels (not currently specified — planner to confirm when Wave 4 runs).
- The filter dropdown is populated on every `renderTransactionsList` call, so adding/removing labels refreshes the filter without manual work.
- `.txn-label-chip` is the inline row chip; reuse for any other places chips should appear on a row.

## Pending — Sean's Smoke Test (13 steps)
See Task 4 checkpoint in 04-04-PLAN.md.
