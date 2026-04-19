# Finance App — Learnings

## Account number matching: transactions imported without account field

**What happened:** Account tiles showed `—` for monthly in/out. Debug panel revealed only 4 of 13 accounts had matching transaction IDs. All CSVs had been imported previously.

**Why:** Early imports stored transactions without the `account` field (it wasn't being tracked yet, or the CSV column wasn't present). Later imports correctly set the field. The duplicate detection (`date|description|amount`) prevented re-importing existing transactions, so old ones were stuck with no account link.

**Fix:** Added a silent patch pass in `doImport()` — after importing new rows, loops over all duplicate rows and updates the `account` field on any existing transaction where it's blank. Re-importing all CSVs then backfills all the missing account links without creating duplicate transactions.

**Next time:** When adding a new field to transactions, consider a migration that backfills it from any available source rather than waiting for users to re-import.

---

## Service Worker cache must be bumped on every deploy

Every frontend change requires bumping `finance-vN` in `sw.js`. Without it, users get the cached old version. Bumped v1 → v9 across this session.

---

## Supabase auto-enables RLS on newly-created tables

**What happened:** Phase 4 migration created the `rules` table via `CREATE TABLE IF NOT EXISTS`. App then failed all inserts with `new row violates row-level security policy for table "rules"`.

**Why:** Supabase's default is RLS-enabled-by-default on any new table. With no policies defined, the default deny-all blocks every client-side insert. In the Table Editor this shows as "UNRESTRICTED" — which is misleading; it actually means RLS is ON but no policies exist.

**Fix:** Add `ALTER TABLE rules DISABLE ROW LEVEL SECURITY;` in the migration file immediately after `CREATE TABLE`. Matches the joint-account model (no per-user isolation needed).

**Next time:** When using Supabase and NOT wanting RLS (joint/shared accounts), every `CREATE TABLE` needs a matching `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;` in the same migration. Don't assume a table with "no policies" is open — it's the opposite.

---

## Supabase RLS blocks anon key queries

Direct REST queries with the anon key return `[]`, not an error. Requires a user auth token. Don't try to query Supabase directly from the browser console to debug — use the app's own authenticated client or add diagnostic output inside the app.

---

## Account number format: Kiwibank sub-accounts

Kiwibank uses a base number (`38-9020-0211287`) with a two-digit suffix (`-00`, `-01`, `-05` etc.) for different sub-accounts. Each sub-account is a separate CSV export. The `account` field in transactions stores the full number including suffix. Account cards must be set up with the exact matching suffix.

---

## Debug panel approach for diagnosing data mismatches

When transaction data isn't matching account records, the fastest diagnostic is to add a temporary div to the page that renders live data from the in-memory arrays — showing what account IDs are actually stored in transactions vs what's stored in the accounts table, with ✅/❌ match status. Much faster than trying to query Supabase directly.

---

## Don't iterate stale in-memory state when cleaning up DB rows

`loadPresetBudgets` deleted existing budgets by iterating the in-memory `budgets` array, then inserted fresh presets. Bug: if in-memory didn't match DB (partial load, RLS failure, race during load), the delete skipped rows that were in DB but not in memory — leaving leftovers. Each preset-load click then stacked 10 more rows with fresh UUIDs. Users saw duplicate categories multiplying over time. Also had `catch {}` swallowing delete errors silently.

Fixed by fetching from DB first, aborting on any delete failure before the insert loop runs.

Lesson: when a function "clears then repopulates" a DB-backed collection — (a) fetch fresh state from the source of truth, not in-memory mirrors; (b) never swallow delete errors, abort instead so you don't double up; (c) only flip in-memory state after the DB op succeeds.
