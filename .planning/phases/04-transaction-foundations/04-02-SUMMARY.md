# Phase 4 / Wave 1 — Summary

**Plan:** 04-02-PLAN.md (Schema migration + data layer)
**Status:** Complete
**Executed:** 2026-04-19

## What Shipped

### Migration SQL
Path: `supabase/migrations/2026-04-19_phase4_transactions.sql`

Sean ran it through the Supabase dashboard SQL Editor. Verification query returned:
- Total rows: 5,345
- Confirmed after backfill: 5,345
- Empty labels: 5,345

All three new columns (`parent_transaction_id`, `labels`, `confirmed`) added to `transactions`. New `rules` table created with columns `id`, `merchant_keyword`, `category`, `created_at`. Four indexes added (parent FK, confirmed partial, labels GIN, rules created_at).

No RLS. No `user_id` column (both mentions in the SQL are negation comments). Joint account model respected.

### Data layer
- `js/supabase-client.js` lines 141–154: `getRules()`, `upsertRule(r)`, `deleteRule(id)` added following the same pattern as Recurring/Goals.
- `js/supabase-client.js` line 165: `getRules, upsertRule, deleteRule` exported from the SB module.
- `js/app.js` line 9: module-scope `let rules = [];` added beside other state.
- `js/app.js` line 141: `rules = await SB.getRules().catch(() => []);` loaded in `startApp()` after goals.
- `js/app.js` line 150: `rules = [];` reset in the catch block.

## Verification
- `node --check` passes on both files.
- `grep -c "async function getRules" js/supabase-client.js` → 1
- `grep -c "rules = await SB.getRules" js/app.js` → 1
- Migration verified live via dashboard SQL query (5,345 total/confirmed/empty-labels counts matched).

## Handoff Notes for Downstream Waves
- Wave 2–5 can assume all three new columns exist, all existing rows are `confirmed=true` with `labels='{}'`, and the `rules` table is available.
- `rules` array is loaded at app start and kept in memory — downstream waves read/mutate it and persist via `SB.upsertRule` / `SB.deleteRule`.
- Re-running the migration SQL is safe — idempotence proven because Sean ran it twice without errors (once by accident, once deliberate). `IF NOT EXISTS` clauses and the `created_at < '2026-04-19'` guard mean the second run is a no-op.
