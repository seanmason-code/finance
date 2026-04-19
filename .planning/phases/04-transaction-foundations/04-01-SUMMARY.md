# Phase 4 / Wave 0 — Summary

**Plan:** 04-01-PLAN.md (Pre-flight housekeeping)
**Status:** Complete
**Executed:** 2026-04-19

## What Shipped

### Helpers added to `js/app.js`

Placed immediately after `isExcludedCategory` (line 1384), both scoped inside the `App` IIFE:

```js
const isSplitParent = t => transactions.some(x => x.parent_transaction_id === t.id);
const leafTransactions = () => transactions.filter(t => !isSplitParent(t));
```

Pre-schema-migration, `parent_transaction_id` is `undefined` on every row, so `isSplitParent` returns `false` universally and `leafTransactions()` returns the full `transactions` array — a no-op. Safe to reference from Wave 1–3 code before the totals refactor lands in Wave 4.

### Service worker updates in `sw.js`

- Cache bumped: `finance-v50` → `finance-v51`
- Precache list filled in with the two missing script files:
  - `/js/csv-import.js` — already loaded via `<script>` in `index.html`
  - `/js/supabase-client.js` — already loaded via `<script>` in `index.html`

Old `finance-v50` cache name is fully removed. All other SW handlers (install/activate/fetch) untouched.

## Verification

- `grep -n "const isSplitParent = t =>" js/app.js` → line 1391
- `grep -n "const leafTransactions = () =>" js/app.js` → line 1397
- `grep -c "finance-v50" sw.js` → 0
- `node --check` passes on both files
- `git diff --stat` → 13 lines added to app.js, 4 lines changed in sw.js, no other files touched

## Pending (manual smoke test — Sean)

Before moving to Wave 1:
1. Load the deployed site
2. DevTools → Console: no red errors on boot
3. Visit Dashboard, Accounts, Transactions, Budgets, Reports — numbers identical to pre-commit
4. DevTools → Application → Service Workers: `finance-v51` is active, old `finance-v50` deleted

## Handoff Notes for Downstream Waves

- Wave 4 (splits) will thread `leafTransactions()` through ~15 call sites currently using `transactions.filter(...).reduce(...)`
- Further JS files added in later waves may need appending to `sw.js` ASSETS array + a second cache bump
- No schema changes yet — the next SW cache bump (`finance-v52`) happens in Wave 5 just before the deploy
