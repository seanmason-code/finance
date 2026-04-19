# State: Finance Dashboard

*Updated: 2026-04-19 (paused mid-Phase-4 — blocked on Supabase RLS fix)*

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19)

**Core value:** At-a-glance financial position for a joint household — built for Sean + Jenny specifically.
**Current focus:** Milestone v1.1 — Phase 4 (Transaction Foundations) at Wave 5. All code in master, blocked on one-line Supabase fix before rule saving works, then deploy.

## Current Position

| Field | Value |
|-------|-------|
| Milestone | v1.1 PocketSmith Lift |
| Phase | 4 — Transaction Foundations |
| Wave | 5 (final) — code complete, blocked on RLS fix in Supabase |
| Plan | `.planning/phases/04-transaction-foundations/04-06-PLAN.md` |
| Status | **BLOCKED — run one line of SQL in Supabase to unblock rule saving.** |
| Last commit | `a2cedf5` — fix(phase-4): disable RLS on rules table |
| Last activity | 2026-04-19 — Smoke test hit RLS error on rule insert; fix patched into migration SQL; Sean still needs to run the ALTER against live DB |

## 🚨 To Resume — Step 1 (MANDATORY)

**Run this ONE query in the Supabase SQL Editor** (https://supabase.com/dashboard → finance project → SQL Editor → New query):

```sql
ALTER TABLE rules DISABLE ROW LEVEL SECURITY;
```

Then verify it took:

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'rules';
```

Expected: one row, `rules | false`.

**Why this is needed:** Supabase enables RLS by default on newly-created tables. The Phase 4 migration created `rules` without explicitly disabling RLS, and with no policies defined it silently blocks every client-side insert. The app error is "new row violates row-level security policy for table 'rules'". (See LEARNINGS.md for the full write-up.)

The migration file is now patched (commit a2cedf5) so this won't repeat on a fresh DB. For the live DB, Sean must run the one-liner above once.

## To Resume — Step 2 (Smoke Test)

After the RLS fix, hard-refresh http://localhost:4000 (Ctrl+Shift+R) and:

1. Edit any transaction's category → Apply-to-future modal appears with a sensible merchant keyword (stop-words like THE / MR / ST are filtered out)
2. Click **Apply to future** → toast "Rule saved" → no red error
3. Settings page → Auto-categorisation Rules section → the saved rule is listed
4. Import a small CSV with a matching merchant keyword → the imported row gets auto-categorised
5. Test "Never ask for this keyword" on a different merchant → verify localStorage `finance_rule_never_ask` has the key
6. Delete the rule from Settings → gone from table and from Supabase

## To Resume — Step 3 (Deploy)

If smoke test passes:

```bash
cd ~/Projects/finance
vercel --prod
```

Everything is already committed + pushed. Cache version `finance-v52` is already set in `sw.js`. Just needs the deploy command. Then hard-refresh https://finance-two-jet.vercel.app and re-verify on live.

## Waves Status

| Wave | Scope | Status |
|------|-------|--------|
| 0 | leafTransactions() helper + sw.js v51 | ✓ Shipped to master |
| 1 | Supabase migration + rules data layer | ✓ Shipped; migration ran (5,345 rows backfilled) |
| 2 | Unconfirmed state UI | ✓ Shipped + smoke-tested ("works") |
| 3 | Labels + filter | ✓ Shipped + smoke-tested ("labels passed") |
| 4 | Splits + totals refactor | ✓ Shipped + Playwright-tested (split + Unsplit confirmed working) |
| 5 | Apply-to-future rules + rules settings + sw.js v52 | ⚠️ Committed to master, blocked on RLS in live DB |

**Also added:** Unsplit menu item (beyond original plan — filled UX gap Sean flagged during Wave 4 testing).

## Bug Fixes Landed This Session (post-initial-smoke)

| Commit | Fix | Why |
|--------|-----|-----|
| `c0c3dd5` | Skip stop-words in `firstTokenKeyword` | "The Cheesecake Shop" was suggesting "THE" as the rule keyword — way too generic |
| `a2cedf5` | Disable RLS on rules table in migration | Supabase default-enables RLS on new tables; blocked all rule inserts |

## Deployed

- **Live URL:** https://finance-two-jet.vercel.app
- **Service worker version (live):** `finance-v50` (pre-Phase-4; does NOT include Waves 0–5)
- **Service worker version (master, pre-deploy):** `finance-v52`
- **Behind live:** 9 commits (all of Phase 4 + Unsplit + fixes)

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
- `firstTokenKeyword` (with stop-word filter) + `applyRulesToRow` run on every CSV import row before upsert.
- "Never ask" list stored in localStorage `finance_rule_never_ask`.

### Known quirks (carry forward)
- Joint account model — no RLS, no user_id on any Phase 4 table.
- Kiwibank sub-accounts use format `38-9020-0211287-XX`.
- **Supabase DEFAULT-ENABLES RLS on newly-created tables.** Every `CREATE TABLE` in a migration needs a matching `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;` unless policies are intended. See LEARNINGS.md.
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
- If already running in background (via nohup earlier this session), just open the URL — no restart needed.

## Once Phase 4 Is Deployed

Phase 4 is the first of 5 phases in milestone v1.1. After successful deploy:
- Mark Phase 4 complete in planning artifacts
- Write validated requirements (TXN-01..07) into PROJECT.md
- Move to Phase 5 (Categorize page) — `/gsd-plan-phase 5`

Phase 5, 6, 7, 8 are all still pending. Full roadmap in `.planning/ROADMAP.md`.
