# State: Finance Dashboard

*Updated: 2026-04-19 (paused mid-Phase-4)*

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19)

**Core value:** At-a-glance financial position for a joint household — built for Sean + Jenny specifically.
**Current focus:** Milestone v1.1 — Phase 4 (Transaction Foundations) at Wave 5, code shipped to master, NOT yet deployed to prod.

## Current Position

| Field | Value |
|-------|-------|
| Milestone | v1.1 PocketSmith Lift |
| Phase | 4 — Transaction Foundations |
| Wave | 5 (final) — committed, pre-deploy |
| Plan | `.planning/phases/04-transaction-foundations/04-06-PLAN.md` |
| Status | **PAUSED — pre-deploy checkpoint.** Resume by running smoke test OR `vercel --prod` |
| Last commit | `f22e216` — feat(phase-4): wave 5 — apply-to-future rules + deploy prep |
| Last activity | 2026-04-19 — Wave 5 code pushed, awaiting smoke test + deploy |

## Waves Status

| Wave | Scope | Status |
|------|-------|--------|
| 0 | leafTransactions() helper + sw.js v51 | ✓ Shipped to master |
| 1 | Supabase migration + rules data layer | ✓ Shipped; migration ran (5,345 rows backfilled) |
| 2 | Unconfirmed state UI | ✓ Shipped + smoke-tested ("works") |
| 3 | Labels + filter | ✓ Shipped + smoke-tested ("labels passed") |
| 4 | Splits + totals refactor | ✓ Shipped + Playwright-tested (split modal + Unsplit both confirmed working) |
| 5 | Apply-to-future rules + rules settings + sw.js v52 | ✓ Committed to master, NOT deployed |

**Also added:** Unsplit menu item (beyond original plan — filled UX gap Sean flagged during Wave 4 testing).

## Deployed

- **Live URL:** https://finance-two-jet.vercel.app
- **Service worker version (live):** `finance-v50` (pre-Phase-4; does NOT include Waves 0–5)
- **Service worker version (master, pre-deploy):** `finance-v52`
- **Behind live:** 6 commits (Wave 0 + Wave 1 + Wave 2 + Wave 3 + Wave 4 + Unsplit + Wave 5)

## Next Up — When Resuming

**Pre-deploy checkpoint is Wave 5 Task 5 in the plan.**

**Option A (safer) — Smoke test locally first:**
1. Ensure dev server is running: `cd ~/Projects/finance && ./dev.sh` (or check background python/browser-sync still alive)
2. Open http://localhost:4000 and hard-refresh
3. Edit a transaction's category → verify Apply-to-future modal appears → save a rule → verify it lands in Settings → Auto-categorisation Rules
4. Import a small CSV containing the matching keyword → verify auto-categorisation fires
5. Test "Never ask for this keyword" → verify localStorage key `finance_rule_never_ask` populates
6. Delete a rule from Settings → verify it's gone
7. If all works → deploy

**Option B (faster) — Ship straight to prod:**
```bash
cd ~/Projects/finance
vercel --prod
```
Then hard-refresh https://finance-two-jet.vercel.app and smoke-test there. Fix-forward if anything broken.

**Deploy command reminder:** just `vercel --prod` — git push already done.

## Accumulated Context

### From v1.0 (shipped)
- CSV import (Kiwibank sub-accounts, ANZ, bulk multi-file), transfer detection, service accounts + net position, account matching UX, custom categories, pay-cycle spend comparison.

### From Phase 4 waves (in master, pre-deploy)
- `transactions` table has new columns: `parent_transaction_id` (uuid), `labels` (text[]), `confirmed` (boolean).
- New `rules` table with `merchant_keyword`, `category`, `created_at`.
- `SB.getRules/upsertRule/deleteRule/deleteTransactionsByParent` helpers.
- `leafTransactions()` helper threaded through 19 call sites so split parents don't double-count in totals.
- `labelChipController` IIFE manages the chip input.
- Three-dot (⋮) menu on every transaction row: Edit / Split / Unsplit / Confirm / Delete.
- Apply-to-future rule modal + settings table for rule management.
- `firstTokenKeyword` + `applyRulesToRow` run on every CSV import row before upsert.
- "Never ask" list stored in localStorage `finance_rule_never_ask`.

### Known quirks (carry forward)
- Joint account model — no RLS, no user_id on any Phase 4 table.
- Kiwibank sub-accounts use format `38-9020-0211287-XX`.
- Supabase RLS is DISABLED on all tables (intentional for joint account).
- `sw.js` cache MUST bump on every deploy.
- Pre-migration rows backfilled `confirmed=true`; new imports default `confirmed=false`.
- `PAY_CYCLE_KEYWORD = 'LOREAL'` anchors the pay-cycle chart.
- Transfer labeller runs AFTER rule application in `doImport` so transfers win over generic rules.

### Jenny testing
- Still pending. Plan: full milestone test after Phase 8 launch.
- Sean is the sole tester for Waves 2–5 pre-Phase-8.

### Dev server
- Port 4000 (browser-sync) proxies to port 8090 (python3 server.py).
- Recovery app occupies 3000/3001 — finance uses 4000/4001.
- Start: `cd ~/Projects/finance && ./dev.sh`

## Once Phase 4 Is Deployed

Phase 4 is the first of 5 phases in milestone v1.1. After successful deploy:
- Mark Phase 4 complete in planning artifacts
- Write validated requirements (TXN-01..07) into PROJECT.md
- Move to Phase 5 (Categorize page) — `/gsd-plan-phase 5`

Phase 5, 6, 7, 8 are all still pending. Full roadmap in `.planning/ROADMAP.md`.
