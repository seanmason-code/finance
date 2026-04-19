# State: Finance Dashboard

*Updated: 2026-04-19 (Phase 4 complete + deployed; Phase 5 planned, ready to execute)*

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19)

**Core value:** At-a-glance financial position for a joint household — built for Sean + Jenny specifically.
**Current focus:** Milestone v1.1 — Phase 5 (Categorize Page). Plans written, ready to execute.

## Current Position

| Field | Value |
|-------|-------|
| Milestone | v1.1 PocketSmith Lift |
| Phase | 5 — Categorize Page |
| Wave | 0 — not started |
| Plan | `.planning/phases/05-categorize-page/` |
| Status | **READY — run `/gsd-execute-phase 5`** |
| Last commit | Phase 5 planning docs committed |
| Last activity | 2026-04-19 — Phase 4 smoke-tested + deployed to production; Phase 5 planned (2 plans, 2 waves) |

## To Resume

```bash
cd ~/Projects/finance
/gsd-execute-phase 5
```

Then deploy:

```bash
vercel --prod
```

## Phase 4 — COMPLETE ✓

All 6 waves shipped and deployed to https://finance-two-jet.vercel.app (`finance-v52`).

| Wave | Scope | Status |
|------|-------|--------|
| 0 | leafTransactions() helper + sw.js v51 | ✓ Deployed |
| 1 | Supabase migration + rules data layer | ✓ Deployed; 5,345 rows backfilled |
| 2 | Unconfirmed state UI | ✓ Deployed |
| 3 | Labels + filter | ✓ Deployed |
| 4 | Splits + totals refactor | ✓ Deployed |
| 5 | Apply-to-future rules + rules settings + sw.js v52 | ✓ Deployed |

**RLS fix applied:** `ALTER TABLE rules DISABLE ROW LEVEL SECURITY;` run against live DB 2026-04-19. Migration file also patched (commit `a2cedf5`) — won't repeat on fresh DB.

## Phase 5 — Categorize Page (READY TO EXECUTE)

**Goal:** Fast dedicated surface for tidying up uncategorised and unconfirmed transactions.

**Plans:**

| Wave | Plan | What it builds |
|------|------|----------------|
| 1 | 05-01-PLAN.md | HTML shell + dashboard nudge tiles ("X uncategorised / Y unconfirmed") |
| 2 | 05-02-PLAN.md | Categorize page render + inline save + apply-to-future wiring + sw.js v53 |

**Requirements:** TDY-01, TDY-02, TDY-03, TDY-04, TDY-05

## Deployed

- **Live URL:** https://finance-two-jet.vercel.app
- **Service worker version (live):** `finance-v52` (Phase 4 complete)
- **Service worker version (next deploy):** `finance-v53` (Phase 5)

## Accumulated Context

### From v1.0 (shipped)
- CSV import (Kiwibank sub-accounts, ANZ, bulk multi-file), transfer detection, service accounts + net position, account matching UX, custom categories, pay-cycle spend comparison.

### From Phase 4 (shipped, finance-v52)
- `transactions` table has new columns: `parent_transaction_id` (uuid), `labels` (text[]), `confirmed` (boolean).
- New `rules` table with `merchant_keyword`, `category`, `created_at`. RLS disabled.
- `SB.getRules/upsertRule/deleteRule/deleteTransactionsByParent` helpers.
- `leafTransactions()` helper threaded through 19 call sites so split parents don't double-count in totals.
- `labelChipController` IIFE manages the chip input.
- Three-dot (⋮) menu on every transaction row: Edit / Split / Unsplit / Confirm / Delete.
- Apply-to-future rule modal + settings table for rule management.
- `firstTokenKeyword` (with stop-word filter) + `applyRulesToRow` run on every CSV import row before upsert.
- "Never ask" list stored in localStorage `finance_rule_never_ask`.

### Known quirks (carry forward)
- Joint account model — no RLS, no user_id on any table.
- Kiwibank sub-accounts use format `38-9020-0211287-XX`.
- **Supabase DEFAULT-ENABLES RLS on newly-created tables.** Every `CREATE TABLE` in a migration needs a matching `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;` unless policies are intended. See LEARNINGS.md.
- `sw.js` cache MUST bump on every deploy.
- Pre-migration rows backfilled `confirmed=true`; new imports default `confirmed=false`.
- `PAY_CYCLE_KEYWORD = 'LOREAL'` anchors the pay-cycle chart.
- Transfer labeller runs AFTER rule application in `doImport` so transfers win over generic rules.

### Jenny testing
- Still pending. Plan: full milestone test after Phase 8 launch.
- Sean is the sole tester for Phases 5–7.

### Dev server
- Port 4000 (browser-sync) proxies to port 8090 (python3 server.py).
- Recovery app occupies 3000/3001 — finance uses 4000/4001.
- Start: `cd ~/Projects/finance && ./dev.sh`

## Milestone v1.1 Progress

| Phase | Name | Status |
|-------|------|--------|
| 4 | Transaction Foundations | ✓ Complete + deployed |
| 5 | Categorize Page | ⏳ Ready to execute |
| 6 | Budget Model Refactor | Not started |
| 7 | Forecast + Calendar | Not started |
| 8 | Sankey + Launch | Not started |
