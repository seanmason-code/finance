# Phase 2 — Salvage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the v1 Supabase schema, design and create the v2 schema in a separate Postgres namespace, port all historical data (accounts, transactions, categories, budgets, recurring, goals, rules) into the v2 schema with the new household-aware shape, and prove it round-trips by displaying the data in two read-only pages in the v2 app.

**Architecture:** v1 stays untouched in the `public` schema. v2 lives in a new Postgres `v2` schema in the same Supabase project (`caahbpkqfgwkdyobfbpe`). A one-shot TypeScript migration script reads from v1 (read-only) and writes to v2 (idempotent, dry-run-capable). The v2 Next.js app is configured to default to the `v2` schema. Two new pages (`/accounts`, `/transactions`) prove data is readable end-to-end.

**Tech Stack:** Supabase (Postgres + RLS), TypeScript + tsx for the migration script, `@supabase/supabase-js` and `@supabase/ssr` (already wired in Phase 1), shadcn/ui Table component for the new pages.

**Spec reference:** `/home/seanm/Projects/finance/docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md` § 4 (data model), § 10 (migration plan), § 11 Phase 2.

---

## Pre-flight context

**Working directories:**
- Most work happens in `/home/seanm/Projects/finance-v2/` (the new app).
- v1 is `/home/seanm/Projects/finance/` (legacy, read for audit only — never modify).

**Supabase project (shared):** `caahbpkqfgwkdyobfbpe.supabase.co`
- v1 tables in `public` schema: `accounts`, `budgets`, `goals`, `recurring`, `rules`, `transactions`
- v2 tables to be created in a new `v2` schema (this phase)
- Auth users are in `auth.users` and shared between v1 and v2 — Sean and Jenny already have accounts

**Supabase CLI is NOT installed.** Plan uses `npx supabase` (no global install required) for migration commands. As a fallback, SQL can be pasted into the Supabase dashboard's SQL editor.

**Key v2 design decisions (from spec § 4):**
- Household model: one Household row, two Profile rows (Sean + Jenny), every other row links to `household_id`
- Account tagging: `tag` enum ('sean' | 'jenny' | 'shared'), default 'shared' for migrated accounts (joint by default)
- Transactions: add `household_id`, `attributed_to_profile_id` (default = account owner), `confirmed = true` for all historical, `labels = []`, `parent_transaction_id = null`
- Categories: add `household_id`, `is_fixed_cost`
- Budgets: add `period = 'monthly'` for all migrated rows
- Service accounts: handled in Phase 5 (deferred)
- Snapshots, AI cards/recaps, goals, rules: seeded fresh — except the existing `rules` and `goals` v1 tables, which need to be carried over

**This phase ships when:**
1. The `v2` schema exists in Supabase with all tables and RLS policies
2. All historical v1 rows are present in v2 with the new shape
3. Row counts and totals match between v1 and v2 (within tolerance for transformations)
4. The v2 app's `/accounts` page lists all accounts from v2
5. The v2 app's `/transactions` page lists transactions from v2 (paginated)
6. `docs/PHASE-2-COMPLETE.md` is committed

**This phase deliberately does NOT include:**
- Akahu bank feed integration (Phase 3)
- Health score / dashboard widgets (Phase 4)
- Service Account auto-capture (Phase 5)
- Any write paths beyond the migration script
- Any UI polish — the new pages can be ugly tables; the goal is provability of data round-trip

---

## File Structure

New files (all in `~/Projects/finance-v2/`):

```
finance-v2/
├── docs/
│   ├── PHASE-1-COMPLETE.md       # already exists
│   ├── PHASE-2-COMPLETE.md       # NEW — written at end
│   └── data-model-audit.md       # NEW — Task 1 output
├── supabase/
│   └── migrations/
│       └── 0001_v2_schema.sql    # NEW — creates the v2 schema, tables, RLS
├── scripts/
│   └── migrate-v1-to-v2.ts       # NEW — the migration script
├── lib/
│   ├── db/
│   │   ├── schema.ts             # NEW — TypeScript types for v2 tables
│   │   └── queries.ts            # NEW — typed query helpers (accounts, transactions)
│   └── supabase/
│       ├── client.ts             # MODIFY — pin schema to 'v2'
│       ├── server.ts             # MODIFY — pin schema to 'v2'
│       └── middleware.ts         # MODIFY — pin schema to 'v2'
└── app/
    ├── accounts/
    │   └── page.tsx              # NEW — read-only accounts list
    └── transactions/
        └── page.tsx              # NEW — read-only paginated transactions list
```

Modified files: the three `lib/supabase/*.ts` clients (add `db: { schema: 'v2' }` config).

**Why this structure:**
- `supabase/migrations/` is the convention used by the v1 project — keep it consistent
- `scripts/` is the standard Node.js convention for one-off scripts
- `lib/db/` separates database concerns from Supabase client wiring (Phase 3+ will add more queries)
- New pages live next to `app/login/`, `app/dashboard/` — follow the App Router convention

---

## Task 1: Audit v1 schema + write data-model-audit.md

**Files:**
- Create: `/home/seanm/Projects/finance-v2/docs/data-model-audit.md`

This is the schema-discovery task. Read the v1 codebase to understand the live schema and document anything the v2 spec might have missed.

- [ ] **Step 1: List the v1 tables referenced in app.js**

Run:
```bash
grep -hE "client\.from\(" /home/seanm/Projects/finance/js/*.js | grep -oE "from\('[^']+'\)" | sort -u
```
Expected: `from('accounts')`, `from('budgets')`, `from('goals')`, `from('recurring')`, `from('rules')`, `from('transactions')` — six tables.

- [ ] **Step 2: For each v1 table, list the columns referenced in app.js**

For each table in the list above, search for column references:
```bash
for t in accounts budgets goals recurring rules transactions; do
  echo "=== $t ==="
  grep -E "$t['\"]?\)\.|\.$t['\"]?\)" /home/seanm/Projects/finance/js/app.js | head -5 || true
  grep -oE "[a-z_]+: " /home/seanm/Projects/finance/js/app.js | sort -u | head -30 # rough field discovery
done
```
This is best-effort — the goal is a starting list. The authoritative source is the live Supabase project (Step 3).

- [ ] **Step 3: Inspect the live Supabase schema directly**

Use the Supabase REST endpoint to introspect each table. With the project's anon key:
```bash
cd /home/seanm/Projects/finance-v2
source .env.local
for t in accounts budgets goals recurring rules transactions; do
  echo "=== $t (one row) ==="
  curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
       -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
       "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$t?select=*&limit=1"
  echo ""
done
```
Expected: one JSON object per table showing all columns. (If any return `{"code": "42501"}` permission denied, RLS is blocking the anon key — note it and ask Sean to provide the service-role key for read access during Phase 2 only.)

- [ ] **Step 4: Cross-reference against the spec's data model (§ 4)**

For each v1 table, identify:
1. Which v1 columns map directly to v2 columns
2. Which v1 columns are missing from the v2 spec (potentially overlooked)
3. Which v2 columns are net-new (don't exist in v1, must be defaulted during migration)

Pay special attention to:
- The `created_at` and `updated_at` timestamps — keep both, don't drop history
- Any `description`, `notes`, `memo` fields — common to be lost in migrations
- The `account` field on transactions (mentioned in v1 STATE.md as a quirk)
- Service account flagging — v1 has "service accounts + net position" feature; figure out HOW it's flagged (a column? a separate table? account name pattern?)
- Pay-cycle anchor (mentioned in v1 STATE.md: `PAY_CYCLE_KEYWORD = 'LOREAL'` in app.js)

- [ ] **Step 5: Write the audit document**

Create `/home/seanm/Projects/finance-v2/docs/data-model-audit.md` with the following structure:

```markdown
# v1 → v2 Data Model Audit

**Date:** 2026-04-29

## v1 schema (as found)

### accounts
| Column | Type | Notes |
| ... | ... | ... |

(One section per v1 table.)

## v1 → v2 mapping

### accounts → v2.accounts
| v1 column | v2 column | Transform |
| ... | ... | ... |

(One section per v1 table.)

## Missing from v2 spec (PROPOSED ADDITIONS)

[Anything in v1 that the spec doesn't account for. For each item, recommend either:
- "Add to v2 schema" (with proposed column name and type)
- "Drop during migration" (with justification)]

## Net-new in v2 (DEFAULTS DURING MIGRATION)

[For each v2 column without a v1 equivalent, document the default value the migration will use.]

## Open questions for Sean

[Anything that needs his input before proceeding to schema design.]
```

- [ ] **Step 6: Commit the audit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add docs/data-model-audit.md && \
  git commit -m "docs: v1 → v2 data model audit"
```

- [ ] **Step 7: Pause for Sean's review**

If the "Open questions for Sean" section is non-empty, **stop and report status NEEDS_CONTEXT** with the questions inline. The controller answers them before Task 2 begins.

---

## Task 2: Capture v1 baseline counts + sums for verification

**Files:**
- Create: `/home/seanm/Projects/finance-v2/docs/v1-baseline.md`

Before migrating, snapshot the v1 row counts and key sum totals. After migration, the same numbers must match in v2.

- [ ] **Step 1: Query each v1 table for count + key totals**

```bash
cd /home/seanm/Projects/finance-v2
source .env.local
{
  echo "# v1 Baseline (captured before migration)"
  echo ""
  echo "**Date:** $(date -Iseconds)"
  echo ""
  echo "## Counts"
  echo ""
  for t in accounts budgets goals recurring rules transactions; do
    n=$(curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
             -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
             -H "Prefer: count=exact" \
             "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$t?select=count" | jq -r '.[0].count')
    echo "- $t: $n"
  done
  echo ""
  echo "## Transactions sum (positive + negative separately)"
  pos=$(curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
            -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
            "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/transactions?select=amount.sum()&amount=gt.0" | jq -r '.[0].sum')
  neg=$(curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
            -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
            "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/transactions?select=amount.sum()&amount=lt.0" | jq -r '.[0].sum')
  echo "- Positive sum: $pos"
  echo "- Negative sum: $neg"
} > docs/v1-baseline.md
cat docs/v1-baseline.md
```
Expected: a markdown file with row counts for all 6 tables and the sum-by-sign for transactions.

If any query returns `null` or an error, the anon key may not have read access. Fall back to running the equivalent SQL in the Supabase dashboard's SQL editor and pasting results manually.

- [ ] **Step 2: Commit baseline**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add docs/v1-baseline.md && \
  git commit -m "docs: v1 baseline counts before migration"
```

---

## Task 3: Write the v2 schema SQL migration

**Files:**
- Create: `/home/seanm/Projects/finance-v2/supabase/migrations/0001_v2_schema.sql`

This is the big one — the SQL that creates the entire `v2` schema, all tables, indexes, RLS policies. Idempotent (safe to re-run).

- [ ] **Step 1: Create the migrations directory**

```bash
cd /home/seanm/Projects/finance-v2 && mkdir -p supabase/migrations
```

- [ ] **Step 2: Write the schema migration**

Create `supabase/migrations/0001_v2_schema.sql` with the full schema below. The file contents:

```sql
-- v2 schema migration — Phase 2 of Finance v2 rebuild
-- Creates the v2 namespace and all tables defined in the design spec § 4.
-- Idempotent: safe to re-run.
-- Spec reference: docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md

CREATE SCHEMA IF NOT EXISTS v2;
GRANT USAGE ON SCHEMA v2 TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA v2
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA v2
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------
-- profiles: extends auth.users with app-specific data
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  display_name  text,
  role          text NOT NULL DEFAULT 'partner' CHECK (role IN ('owner', 'partner')),
  notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- households: the top-level container
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.households (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  owner_profile_id            uuid NOT NULL REFERENCES v2.profiles(id),
  partner_profile_ids         uuid[] NOT NULL DEFAULT '{}',
  salary_anchor_profile_id    uuid REFERENCES v2.profiles(id),
  salary_anchor_pattern       text,
  salary_anchor_min_amount    numeric(12,2),
  score_weights               jsonb NOT NULL DEFAULT '{"runway":30,"savings_rate":25,"spending_vs_baseline":10,"fixed_cost_ratio":15,"net_worth_trend":20}'::jsonb,
  felt_confidence_baseline    integer CHECK (felt_confidence_baseline BETWEEN 1 AND 7),
  felt_confidence_last_asked_at timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_households_owner ON v2.households(owner_profile_id);

-- ----------------------------------------------------------------------
-- accounts: bank, manual cash, service accounts
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  owner_profile_id      uuid NOT NULL REFERENCES v2.profiles(id),
  provider              text NOT NULL CHECK (provider IN ('akahu', 'manual_cash', 'service_account')),
  akahu_account_id      text,
  name                  text NOT NULL,
  type                  text NOT NULL CHECK (type IN ('transactional', 'savings', 'credit', 'kiwisaver', 'service')),
  tag                   text NOT NULL DEFAULT 'shared' CHECK (tag IN ('sean', 'jenny', 'shared')),
  is_locked             boolean NOT NULL DEFAULT false,
  balance               numeric(14,2) NOT NULL DEFAULT 0,
  balance_synced_at     timestamptz,
  -- Service account extension fields (NULL for non-service accounts):
  provider_email_pattern text,
  inbound_alias         text,
  avg_monthly_burn      numeric(12,2),
  last_topup_at         timestamptz,
  last_bill_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_household ON v2.accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_accounts_akahu_id ON v2.accounts(akahu_account_id) WHERE akahu_account_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  name          text NOT NULL,
  parent_id     uuid REFERENCES v2.categories(id),
  type          text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  is_fixed_cost boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(household_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_household ON v2.categories(household_id);

-- ----------------------------------------------------------------------
-- transactions
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.transactions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  household_id                uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  posted_at                   date NOT NULL,
  amount                      numeric(14,2) NOT NULL,
  merchant_raw                text,
  merchant_clean              text,
  description                 text,
  category_id                 uuid REFERENCES v2.categories(id),
  attributed_to_profile_id    uuid REFERENCES v2.profiles(id),
  confirmed                   boolean NOT NULL DEFAULT false,
  parent_transaction_id       uuid REFERENCES v2.transactions(id) ON DELETE CASCADE,
  labels                      text[] NOT NULL DEFAULT '{}',
  is_recurring_link           uuid,
  is_transfer                 boolean NOT NULL DEFAULT false,
  source                      text NOT NULL CHECK (source IN ('akahu_sync', 'csv_import', 'email_capture', 'manual')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_household ON v2.transactions(household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON v2.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_posted_at ON v2.transactions(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON v2.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_unconfirmed ON v2.transactions(confirmed) WHERE confirmed = false;
CREATE INDEX IF NOT EXISTS idx_transactions_labels ON v2.transactions USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_transactions_parent ON v2.transactions(parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- recurring (predicted recurring transactions)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.recurring (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id              uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  merchant_pattern          text NOT NULL,
  expected_amount_min       numeric(14,2),
  expected_amount_max       numeric(14,2),
  frequency                 text NOT NULL CHECK (frequency IN ('weekly', 'fortnightly', 'monthly', 'custom_days')),
  custom_frequency_days     integer,
  next_expected_at          date,
  variance_alert_threshold  numeric(5,2) DEFAULT 0.10,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_household ON v2.recurring(household_id);

-- ----------------------------------------------------------------------
-- bills (auto-captured invoices for service accounts)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.bills (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_account_id      uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  amount                  numeric(14,2) NOT NULL,
  billing_period_start    date,
  billing_period_end      date,
  due_date                date,
  source_email_id         text,
  raw_pdf_url             text,
  claude_extracted_json   jsonb,
  applied_to_balance_at   timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_service_account ON v2.bills(service_account_id);

-- ----------------------------------------------------------------------
-- rules (auto-categorisation)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  match         jsonb NOT NULL,
  actions       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_household ON v2.rules(household_id);

-- ----------------------------------------------------------------------
-- budgets
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES v2.categories(id),
  period        text NOT NULL CHECK (period IN ('weekly', 'fortnightly', 'monthly', 'custom_days')),
  custom_period_days integer,
  start_date    date NOT NULL,
  end_date      date,
  target_amount numeric(14,2) NOT NULL,
  mode          text NOT NULL DEFAULT 'cap' CHECK (mode IN ('cap', 'rollover_above', 'rollover_below')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_household ON v2.budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON v2.budgets(category_id);

-- ----------------------------------------------------------------------
-- goals (Save-Up)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.goals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  target_amount         numeric(14,2) NOT NULL,
  target_date           date,
  source_account_id     uuid REFERENCES v2.accounts(id),
  monthly_contribution  numeric(14,2),
  current_progress      numeric(14,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'achieved')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_household ON v2.goals(household_id);

-- ----------------------------------------------------------------------
-- health_snapshots (daily computed)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.health_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id                uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  taken_at                    timestamptz NOT NULL DEFAULT now(),
  score                       integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  runway_days                 integer,
  savings_rate_30d            numeric(5,4),
  spending_vs_baseline_pct    numeric(6,4),
  fixed_cost_ratio            numeric(5,4),
  net_worth_trend_90d_slope   numeric(14,4),
  net_worth_liquid            numeric(14,2),
  net_worth_locked            numeric(14,2),
  safe_to_spend_today         numeric(14,2)
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_household_taken ON v2.health_snapshots(household_id, taken_at DESC);

-- ----------------------------------------------------------------------
-- ai_cards (proactive insights)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.ai_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL CHECK (kind IN ('anomaly', 'nudge', 'celebration', 'alert')),
  title         text NOT NULL,
  body          text NOT NULL,
  severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'alert')),
  source_data_json jsonb,
  dismissed_at  timestamptz,
  expires_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_cards_household_active ON v2.ai_cards(household_id, generated_at DESC) WHERE dismissed_at IS NULL;

-- ----------------------------------------------------------------------
-- ai_recaps (monthly delivered artifact)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS v2.ai_recaps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  pay_month_anchor    date NOT NULL,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  body_markdown       text NOT NULL,
  push_sent_at        timestamptz,
  score_change        integer,
  top_3_callouts_json jsonb,
  UNIQUE(household_id, pay_month_anchor)
);

-- ----------------------------------------------------------------------
-- RLS: every v2 table is household-scoped.
-- A user can read/write rows iff their profile is in the household's
-- (owner_profile_id) or (partner_profile_ids).
-- ----------------------------------------------------------------------

-- helper function: is the current user a member of the given household?
CREATE OR REPLACE FUNCTION v2.is_household_member(h_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = v2, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM v2.households h
    WHERE h.id = h_id
      AND (h.owner_profile_id = auth.uid()
           OR auth.uid() = ANY(h.partner_profile_ids))
  );
$$;

-- profiles: a user can read any profile (needed to display partner info)
ALTER TABLE v2.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_read_all ON v2.profiles;
CREATE POLICY profiles_read_all ON v2.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS profiles_write_self ON v2.profiles;
CREATE POLICY profiles_write_self ON v2.profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- households: read/write iff member
ALTER TABLE v2.households ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS households_member ON v2.households;
CREATE POLICY households_member ON v2.households
  FOR ALL USING (
    owner_profile_id = auth.uid() OR auth.uid() = ANY(partner_profile_ids)
  )
  WITH CHECK (
    owner_profile_id = auth.uid() OR auth.uid() = ANY(partner_profile_ids)
  );

-- one policy per household-scoped table:
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'accounts','categories','transactions','recurring','bills',
    'rules','budgets','goals','health_snapshots','ai_cards','ai_recaps'
  ]) LOOP
    EXECUTE format('ALTER TABLE v2.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_household ON v2.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_household ON v2.%I FOR ALL USING (v2.is_household_member(household_id)) WITH CHECK (v2.is_household_member(household_id))',
      tbl, tbl
    );
  END LOOP;
END $$;
```

- [ ] **Step 3: TypeScript-validate the file (no SQL errors at parse time we can catch locally)**

```bash
cd /home/seanm/Projects/finance-v2 && wc -l supabase/migrations/0001_v2_schema.sql
```
Expected: ~200+ lines.

(Real syntax validation happens when applying to Supabase in Task 4.)

- [ ] **Step 4: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add supabase/migrations/0001_v2_schema.sql && \
  git commit -m "feat: v2 schema migration (tables + indexes + RLS)"
```

---

## Task 4: Apply the v2 schema to Supabase

**Files:** None — this is a remote operation against the Supabase database.

- [ ] **Step 1: Verify the schema doesn't already exist**

Tell Sean to run in the Supabase SQL editor (https://supabase.com/dashboard/project/caahbpkqfgwkdyobfbpe/sql/new):
```sql
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'v2';
```
Expected: 0 rows (schema doesn't exist). If 1 row is returned, ask Sean if he wants to drop and recreate (`DROP SCHEMA v2 CASCADE` — destructive!) before re-applying.

- [ ] **Step 2: Apply the migration**

Sean copies the entire contents of `supabase/migrations/0001_v2_schema.sql` and pastes into the SQL editor, then clicks "Run".

Expected: success message with no errors. If any errors appear, fix them in the SQL file, commit the fix, and re-run.

- [ ] **Step 3: Verify schema landed**

In the SQL editor:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'v2' ORDER BY table_name;
```
Expected: 12 rows — `accounts`, `ai_cards`, `ai_recaps`, `bills`, `budgets`, `categories`, `goals`, `health_snapshots`, `households`, `profiles`, `recurring`, `rules`, `transactions` (13 if you count both sides). Use Step 4 to count.

- [ ] **Step 4: Verify RLS is enabled on all v2 tables**

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'v2' ORDER BY tablename;
```
Expected: every row shows `rowsecurity = t` (true).

If any table shows false, the RLS portion of the migration didn't apply — re-run the `DO $$...$$` block from the migration file.

---

## Task 5: Pin the v2 app's Supabase clients to the `v2` schema

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/lib/supabase/client.ts`
- Modify: `/home/seanm/Projects/finance-v2/lib/supabase/server.ts`
- Modify: `/home/seanm/Projects/finance-v2/lib/supabase/middleware.ts`

By default, Supabase clients query the `public` schema. We need every query in the v2 app to default to `v2`. Pass `db: { schema: 'v2' }` in each `createClient` / `createBrowserClient` / `createServerClient` config.

- [ ] **Step 1: Verify `@supabase/ssr` supports the `db.schema` option**

```bash
cd /home/seanm/Projects/finance-v2
grep -rE "schema" node_modules/@supabase/ssr/dist/main/types.d.ts node_modules/@supabase/ssr/dist/types.d.ts 2>/dev/null | head -10
```
Expected: at least one match showing `schema?: string` in the options type. If `@supabase/ssr` doesn't support it directly but accepts `db: { schema }` via the underlying `@supabase/supabase-js`, that's fine — confirm in @supabase/supabase-js types.

- [ ] **Step 2: Update `lib/supabase/client.ts`**

Replace the file with:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "v2" },
    }
  );
}
```

- [ ] **Step 3: Update `lib/supabase/server.ts`**

Modify the `createServerClient` call to add the same `db: { schema: "v2" }` option (alongside the existing `cookies` option). The full file becomes:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "v2" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies can't be set here.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: Update `lib/supabase/middleware.ts`**

Add `db: { schema: "v2" }` to the `createServerClient` call inside `updateSession`. (The middleware also calls `supabase.auth.getUser()` — that goes against `auth.users`, not the v2 schema, so no breaking change.)

- [ ] **Step 5: Verify TS compiles**

```bash
cd /home/seanm/Projects/finance-v2 && npx tsc --noEmit
```
Expected: clean.

If TS errors about `db.schema` not being a valid option type, the `@supabase/ssr` version may need a typecast. As a fallback, cast the options object:
```ts
{ db: { schema: "v2" }, cookies: { ... } } as any
```
But prefer fixing the type properly first.

- [ ] **Step 6: Verify auth still works**

Run the existing E2E suite (the login/dashboard tests use `auth.getUser()` which works against the auth schema, independent of the `v2` data schema):
```bash
cd /home/seanm/Projects/finance-v2 && \
  read -s -p "Supabase password: " TEST_USER_PASSWORD && echo "" && \
  export TEST_USER_EMAIL="seanmason.email@gmail.com" && \
  export TEST_USER_PASSWORD && \
  npm run test:e2e && \
  unset TEST_USER_PASSWORD TEST_USER_EMAIL
```
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add lib/supabase/ && \
  git commit -m "feat: pin Supabase clients to v2 schema"
```

---

## Task 6: Scaffold the migration script

**Files:**
- Create: `/home/seanm/Projects/finance-v2/scripts/migrate-v1-to-v2.ts`
- Create: `/home/seanm/Projects/finance-v2/scripts/README.md`
- Modify: `/home/seanm/Projects/finance-v2/package.json` (add `migrate` script)

The migration script is a one-shot TypeScript program. It reads from the v1 `public` schema and writes to the v2 schema, idempotently. Supports a `--dry-run` flag to preview without writing.

- [ ] **Step 1: Install `tsx` and `dotenv`**

```bash
cd /home/seanm/Projects/finance-v2 && npm install -D tsx dotenv
```

- [ ] **Step 2: Add the migration script entry to `package.json` `scripts`**

```json
"migrate": "tsx scripts/migrate-v1-to-v2.ts"
```

- [ ] **Step 3: Create `scripts/README.md`**

```markdown
# scripts/

One-off operational scripts. Not part of the build.

## migrate-v1-to-v2.ts

Migrates legacy v1 data from the `public` schema into the new `v2` schema in
the same Supabase project. Idempotent — safe to re-run.

```
# Dry-run (logs what would be migrated, writes nothing):
npm run migrate -- --dry-run

# Real run:
npm run migrate
```

Required environment variables:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — required, bypasses RLS for migration

The service role key is in the Supabase dashboard at Settings → API → `service_role`.
**Never commit it.** The script reads from `.env.local` automatically.
```

- [ ] **Step 4: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Sean must paste the value)**

Add a line to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=<paste from Supabase dashboard>
```
Sean retrieves it from https://supabase.com/dashboard/project/caahbpkqfgwkdyobfbpe/settings/api — the `service_role` key. **Pause and ask Sean for this value before continuing if it's not already there.** It must NOT be committed.

Also add the same line to `.env.example` (with a placeholder value):
```
SUPABASE_SERVICE_ROLE_KEY=<paste-from-supabase-dashboard-settings-api>
```

- [ ] **Step 5: Create the script scaffolding**

Create `scripts/migrate-v1-to-v2.ts` with the following structure (this commits a runnable skeleton; Tasks 7–11 fill in the per-table migrations):

```ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

// v1 reads from public schema
const v1 = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: "public" },
});

// v2 writes to v2 schema
const v2 = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: "v2" },
});

console.log(DRY_RUN ? "🟡 DRY RUN — no writes" : "🟢 LIVE RUN");
console.log("");

async function main() {
  // Fill in per Tasks 7–11
  console.log("Migration not yet implemented — scaffolding only.");
}

main().then(
  () => {
    console.log("\n✅ Migration complete.");
    process.exit(0);
  },
  (err) => {
    console.error("\n❌ Migration failed:", err);
    process.exit(1);
  }
);
```

- [ ] **Step 6: Verify the script runs (will print "not yet implemented")**

```bash
cd /home/seanm/Projects/finance-v2 && npm run migrate -- --dry-run
```
Expected: prints "🟡 DRY RUN" and "Migration not yet implemented — scaffolding only.". No errors.

- [ ] **Step 7: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add scripts/ package.json package-lock.json .env.example && \
  git commit -m "feat: migration script scaffold (v1 → v2)"
```

---

## Task 7: Migrate household + profiles (the foundation)

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/scripts/migrate-v1-to-v2.ts`

The first thing the migration creates: one Household and the two Profile rows for Sean and Jenny. Every other v2 row references `household_id`, so this must run first.

- [ ] **Step 1: Confirm both auth user IDs**

The migration needs Sean's and Jenny's `auth.users.id` values. Tell Sean to run this in the Supabase SQL editor:
```sql
SELECT id, email FROM auth.users ORDER BY created_at;
```
Expected: 2 rows (Sean and Jenny). Capture both IDs. **If Jenny doesn't have an account yet**, she needs one before this task can proceed — pause and ask Sean to create it via the v1 app's signup or via Supabase dashboard.

- [ ] **Step 2: Add the IDs as constants in the script**

In `scripts/migrate-v1-to-v2.ts`, add (just below the imports):

```ts
const SEAN_USER_ID = process.env.SEAN_USER_ID ?? "";
const JENNY_USER_ID = process.env.JENNY_USER_ID ?? "";
const HOUSEHOLD_NAME = process.env.HOUSEHOLD_NAME ?? "Sean & Jenny";

if (!SEAN_USER_ID || !JENNY_USER_ID) {
  console.error("Set SEAN_USER_ID and JENNY_USER_ID in .env.local before migrating.");
  console.error("Run this SQL in the Supabase dashboard to find them:");
  console.error("  SELECT id, email FROM auth.users ORDER BY created_at;");
  process.exit(1);
}
```

Add to `.env.local`:
```
SEAN_USER_ID=<from auth.users>
JENNY_USER_ID=<from auth.users>
HOUSEHOLD_NAME=Sean & Jenny
```

(And add the same with placeholders to `.env.example`.)

- [ ] **Step 3: Add the migrateHouseholdAndProfiles function**

Above `main()` add:

```ts
async function migrateHouseholdAndProfiles(): Promise<{ householdId: string }> {
  console.log("→ Migrating household + profiles");

  // Insert / update Sean's profile
  const { data: seanAuth, error: seanErr } = await v1.auth.admin.getUserById(SEAN_USER_ID);
  if (seanErr) throw seanErr;
  const seanEmail = seanAuth.user?.email ?? "unknown@unknown";

  const { data: jennyAuth, error: jennyErr } = await v1.auth.admin.getUserById(JENNY_USER_ID);
  if (jennyErr) throw jennyErr;
  const jennyEmail = jennyAuth.user?.email ?? "unknown@unknown";

  if (DRY_RUN) {
    console.log(`  [dry-run] Would upsert profiles: ${seanEmail} (owner), ${jennyEmail} (partner)`);
    console.log(`  [dry-run] Would upsert household '${HOUSEHOLD_NAME}'`);
    return { householdId: "00000000-0000-0000-0000-000000000000" };
  }

  // Upsert profiles (idempotent on id which == auth.users.id)
  const { error: profileErr } = await v2
    .from("profiles")
    .upsert(
      [
        { id: SEAN_USER_ID, email: seanEmail, role: "owner", display_name: "Sean" },
        { id: JENNY_USER_ID, email: jennyEmail, role: "partner", display_name: "Jenny" },
      ],
      { onConflict: "id" }
    );
  if (profileErr) throw profileErr;

  // Upsert the household — find existing by name to make this idempotent
  const { data: existing, error: findErr } = await v2
    .from("households")
    .select("id")
    .eq("name", HOUSEHOLD_NAME)
    .maybeSingle();
  if (findErr) throw findErr;

  let householdId: string;
  if (existing) {
    householdId = existing.id;
    console.log(`  ✓ Household exists: ${householdId}`);
  } else {
    const { data: newHh, error: hhErr } = await v2
      .from("households")
      .insert({
        name: HOUSEHOLD_NAME,
        owner_profile_id: SEAN_USER_ID,
        partner_profile_ids: [JENNY_USER_ID],
        salary_anchor_profile_id: JENNY_USER_ID,
        salary_anchor_pattern: "LOREAL", // Sean's spec — Jenny's salary keyword
      })
      .select("id")
      .single();
    if (hhErr) throw hhErr;
    householdId = newHh.id;
    console.log(`  ✓ Household created: ${householdId}`);
  }

  return { householdId };
}
```

- [ ] **Step 4: Wire it into `main()`**

```ts
async function main() {
  const { householdId } = await migrateHouseholdAndProfiles();
  console.log(`\n📦 Household ID: ${householdId}\n`);
  // (later tasks call subsequent migrate*() functions here, all using householdId)
}
```

- [ ] **Step 5: Dry-run**

```bash
cd /home/seanm/Projects/finance-v2 && npm run migrate -- --dry-run
```
Expected: prints "Would upsert profiles" and "Would upsert household" lines. No real writes.

- [ ] **Step 6: Live run**

```bash
cd /home/seanm/Projects/finance-v2 && npm run migrate
```
Expected: prints "✓ Household created: <uuid>".

- [ ] **Step 7: Verify in the dashboard**

Run in Supabase SQL editor:
```sql
SELECT id, name, owner_profile_id, partner_profile_ids FROM v2.households;
SELECT id, email, role FROM v2.profiles;
```
Expected: 1 household, 2 profiles.

- [ ] **Step 8: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add scripts/migrate-v1-to-v2.ts .env.example && \
  git commit -m "feat(migrate): household + profiles seed"
```

---

## Task 8: Migrate accounts + categories

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/scripts/migrate-v1-to-v2.ts`

Both are small, near-1:1 mappings. Categories may not exist as a separate table in v1 — check the audit doc from Task 1 first.

- [ ] **Step 1: Check whether v1 has a categories table**

Look at `docs/data-model-audit.md`. If v1 has a `categories` table, migrate from it. If categories are stored as a string column on transactions (which the audit will reveal), the migration extracts unique category strings from `transactions.category` and creates one v2 row per unique value.

If unclear, query the live data:
```bash
source .env.local
curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
     -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
     "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/categories?select=*&limit=1"
```
If you get a 404 or "relation does not exist" error, categories are inline on transactions.

- [ ] **Step 2: Add migrateAccounts**

(Adapt the column mapping based on what the audit found — the structure below is a starting point.)

```ts
type V1Account = {
  id: string;
  name: string;
  type?: string;
  // ... fill in from audit
  created_at?: string;
  updated_at?: string;
};

async function migrateAccounts(householdId: string): Promise<Map<string, string>> {
  console.log("→ Migrating accounts");

  const { data: v1Accounts, error } = await v1.from("accounts").select("*");
  if (error) throw error;
  if (!v1Accounts) return new Map();

  console.log(`  Found ${v1Accounts.length} v1 accounts`);

  const oldToNewId = new Map<string, string>();

  for (const acc of v1Accounts as V1Account[]) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would migrate account: ${acc.name}`);
      oldToNewId.set(acc.id, "<dry-run-id>");
      continue;
    }

    const v2Row = {
      id: acc.id, // preserve UUID — makes idempotent re-runs trivial
      household_id: householdId,
      owner_profile_id: SEAN_USER_ID, // default owner; Sean can re-tag in UI later
      provider: "akahu" as const, // legacy data is treated as if it came from Akahu (Phase 3 will overwrite)
      name: acc.name,
      type: mapV1AccountType(acc.type),
      tag: "shared" as const,
      is_locked: mapV1AccountType(acc.type) === "kiwisaver",
      created_at: acc.created_at,
      updated_at: acc.updated_at,
    };

    const { error: insErr } = await v2.from("accounts").upsert(v2Row, { onConflict: "id" });
    if (insErr) throw insErr;
    oldToNewId.set(acc.id, acc.id);
  }

  console.log(`  ✓ ${v1Accounts.length} accounts migrated`);
  return oldToNewId;
}

function mapV1AccountType(t: string | undefined): "transactional" | "savings" | "credit" | "kiwisaver" | "service" {
  // Adapt based on what types the v1 audit found.
  switch ((t ?? "").toLowerCase()) {
    case "savings": return "savings";
    case "credit": case "credit_card": return "credit";
    case "kiwisaver": return "kiwisaver";
    case "service": return "service";
    default: return "transactional";
  }
}
```

**IMPORTANT:** Adapt this based on the actual v1 columns from Task 1's audit. If v1 has columns like `description`, `account_number`, etc., decide per-column to migrate or drop. Note any drops in the audit doc.

- [ ] **Step 3: Add migrateCategories (if v1 has them)**

If categories live in `public.categories`:
```ts
async function migrateCategories(householdId: string): Promise<Map<string, string>> {
  console.log("→ Migrating categories");

  const { data: v1Cats, error } = await v1.from("categories").select("*");
  if (error) throw error;
  if (!v1Cats || v1Cats.length === 0) return new Map();

  // ... similar shape to migrateAccounts
}
```

If categories are inline (string column on transactions):
```ts
async function migrateCategories(householdId: string): Promise<Map<string, string>> {
  console.log("→ Extracting unique categories from transactions");

  const { data: txns, error } = await v1
    .from("transactions")
    .select("category")
    .not("category", "is", null);
  if (error) throw error;

  const uniqueNames = new Set((txns ?? []).map((t: any) => t.category as string));
  console.log(`  Found ${uniqueNames.size} unique categories`);

  const nameToId = new Map<string, string>();

  for (const name of uniqueNames) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would create category: ${name}`);
      nameToId.set(name, "<dry-run-id>");
      continue;
    }

    const { data: existing } = await v2
      .from("categories")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      nameToId.set(name, existing.id);
      continue;
    }

    const { data: created, error: insErr } = await v2
      .from("categories")
      .insert({
        household_id: householdId,
        name,
        type: "expense", // default — Sean will fix income categories in UI
        is_fixed_cost: false, // default — Sean will fix in UI
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    nameToId.set(name, created.id);
  }

  console.log(`  ✓ ${nameToId.size} categories migrated`);
  return nameToId;
}
```

- [ ] **Step 4: Wire into main()**

```ts
async function main() {
  const { householdId } = await migrateHouseholdAndProfiles();
  const accountIdMap = await migrateAccounts(householdId);
  const categoryIdMap = await migrateCategories(householdId);
  console.log(`\nAccounts: ${accountIdMap.size}, Categories: ${categoryIdMap.size}`);
}
```

- [ ] **Step 5: Dry-run, then real run, then verify**

```bash
cd /home/seanm/Projects/finance-v2 && npm run migrate -- --dry-run
# Confirm output looks right, then:
cd /home/seanm/Projects/finance-v2 && npm run migrate
```

In Supabase SQL editor verify counts:
```sql
SELECT count(*) FROM v2.accounts;
SELECT count(*) FROM v2.categories;
SELECT count(*) FROM public.accounts;
```
Expected: v2.accounts count == public.accounts count. v2.categories count is "reasonable" (not zero unless v1 has no transactions).

- [ ] **Step 6: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add scripts/migrate-v1-to-v2.ts && \
  git commit -m "feat(migrate): accounts + categories"
```

---

## Task 9: Migrate transactions (the largest table)

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/scripts/migrate-v1-to-v2.ts`

This is the biggest migration step. Could be tens of thousands of rows. Page through them in batches.

- [ ] **Step 1: Add migrateTransactions**

```ts
async function migrateTransactions(
  householdId: string,
  accountIdMap: Map<string, string>,
  categoryNameToId: Map<string, string>
) {
  console.log("→ Migrating transactions");

  const PAGE_SIZE = 1000;
  let from = 0;
  let total = 0;

  while (true) {
    const { data: page, error } = await v1
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;

    const v2Rows = page
      .map((t: any) => {
        const accountId = accountIdMap.get(t.account_id) ?? null;
        if (!accountId) {
          console.warn(`  ⚠ skipping txn ${t.id} — account_id ${t.account_id} not in v1`);
          return null;
        }
        const categoryId = t.category ? categoryNameToId.get(t.category) ?? null : null;

        return {
          id: t.id,
          account_id: accountId,
          household_id: householdId,
          posted_at: t.date ?? t.posted_at,
          amount: t.amount,
          merchant_raw: t.description ?? t.merchant_raw ?? null,
          merchant_clean: t.merchant_clean ?? null,
          description: t.description ?? null,
          category_id: categoryId,
          attributed_to_profile_id: SEAN_USER_ID, // default — Sean can re-attribute later
          confirmed: t.confirmed ?? true, // legacy data is reviewed
          parent_transaction_id: t.parent_transaction_id ?? null,
          labels: t.labels ?? [],
          is_transfer: t.is_transfer ?? false,
          source: "csv_import" as const, // legacy data came from CSV imports
          created_at: t.created_at,
          updated_at: t.updated_at,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (DRY_RUN) {
      console.log(`  [dry-run] Would upsert ${v2Rows.length} transactions (page ${from / PAGE_SIZE + 1})`);
    } else {
      const { error: insErr } = await v2.from("transactions").upsert(v2Rows, { onConflict: "id" });
      if (insErr) throw insErr;
      console.log(`  ✓ Upserted ${v2Rows.length} (page ${from / PAGE_SIZE + 1})`);
    }

    total += page.length;
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`  ✓ ${total} transactions migrated`);
}
```

- [ ] **Step 2: Wire into main()**

```ts
const accountIdMap = await migrateAccounts(householdId);
const categoryIdMap = await migrateCategories(householdId);
await migrateTransactions(householdId, accountIdMap, categoryIdMap);
```

- [ ] **Step 3: Dry-run, real run, verify counts and sums match v1 baseline**

```bash
cd /home/seanm/Projects/finance-v2 && npm run migrate -- --dry-run
# If output looks good:
cd /home/seanm/Projects/finance-v2 && npm run migrate
```

In Supabase SQL editor:
```sql
SELECT count(*) FROM v2.transactions;
SELECT sum(amount) FILTER (WHERE amount > 0) AS pos,
       sum(amount) FILTER (WHERE amount < 0) AS neg
  FROM v2.transactions;
```
Expected: counts match the v1 baseline from Task 2 (within rows skipped due to missing account references — note any).

- [ ] **Step 4: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add scripts/migrate-v1-to-v2.ts && \
  git commit -m "feat(migrate): transactions (paginated)"
```

---

## Task 10: Migrate budgets, recurring, goals, rules

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/scripts/migrate-v1-to-v2.ts`

Smaller tables, all 1:1 with light transformations.

- [ ] **Step 1: Add migrateBudgets**

```ts
async function migrateBudgets(householdId: string, categoryNameToId: Map<string, string>) {
  console.log("→ Migrating budgets");
  const { data, error } = await v1.from("budgets").select("*");
  if (error) throw error;
  if (!data) return;

  for (const b of data as any[]) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would migrate budget for category: ${b.category}`);
      continue;
    }
    const categoryId = categoryNameToId.get(b.category);
    if (!categoryId) {
      console.warn(`  ⚠ skipping budget for unknown category: ${b.category}`);
      continue;
    }
    const { error: insErr } = await v2.from("budgets").upsert(
      {
        id: b.id,
        household_id: householdId,
        category_id: categoryId,
        period: "monthly",
        start_date: b.start_date ?? "2026-01-01",
        target_amount: b.amount,
        mode: "cap",
        created_at: b.created_at,
      },
      { onConflict: "id" }
    );
    if (insErr) throw insErr;
  }
  console.log(`  ✓ ${data.length} budgets migrated`);
}
```

- [ ] **Step 2: Add migrateRecurring**

```ts
async function migrateRecurring(householdId: string) {
  console.log("→ Migrating recurring");
  const { data, error } = await v1.from("recurring").select("*");
  if (error) throw error;
  if (!data) return;

  for (const r of data as any[]) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would migrate recurring: ${r.description}`);
      continue;
    }
    const { error: insErr } = await v2.from("recurring").upsert(
      {
        id: r.id,
        household_id: householdId,
        merchant_pattern: r.description ?? r.merchant_pattern ?? "unknown",
        expected_amount_min: r.amount,
        expected_amount_max: r.amount,
        frequency: r.frequency ?? "monthly",
        next_expected_at: r.next_date ?? null,
        created_at: r.created_at,
      },
      { onConflict: "id" }
    );
    if (insErr) throw insErr;
  }
  console.log(`  ✓ ${data.length} recurring items migrated`);
}
```

- [ ] **Step 3: Add migrateGoals**

```ts
async function migrateGoals(householdId: string, accountIdMap: Map<string, string>) {
  console.log("→ Migrating goals");
  const { data, error } = await v1.from("goals").select("*");
  if (error) throw error;
  if (!data) return;

  for (const g of data as any[]) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would migrate goal: ${g.name}`);
      continue;
    }
    const { error: insErr } = await v2.from("goals").upsert(
      {
        id: g.id,
        household_id: householdId,
        name: g.name,
        target_amount: g.target_amount ?? g.target ?? 0,
        target_date: g.target_date ?? null,
        source_account_id: g.source_account_id ? accountIdMap.get(g.source_account_id) ?? null : null,
        current_progress: g.current_progress ?? 0,
        status: "on_track",
        created_at: g.created_at,
        updated_at: g.updated_at,
      },
      { onConflict: "id" }
    );
    if (insErr) throw insErr;
  }
  console.log(`  ✓ ${data.length} goals migrated`);
}
```

- [ ] **Step 4: Add migrateRules**

```ts
async function migrateRules(householdId: string, categoryNameToId: Map<string, string>) {
  console.log("→ Migrating rules");
  const { data, error } = await v1.from("rules").select("*");
  if (error) throw error;
  if (!data) return;

  for (const r of data as any[]) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would migrate rule: ${r.merchant_keyword}`);
      continue;
    }
    const categoryId = categoryNameToId.get(r.category);
    if (!categoryId) {
      console.warn(`  ⚠ skipping rule for unknown category: ${r.category}`);
      continue;
    }
    const { error: insErr } = await v2.from("rules").upsert(
      {
        id: r.id,
        household_id: householdId,
        match: { merchant: r.merchant_keyword },
        actions: { set_category: categoryId },
        created_at: r.created_at,
      },
      { onConflict: "id" }
    );
    if (insErr) throw insErr;
  }
  console.log(`  ✓ ${data.length} rules migrated`);
}
```

- [ ] **Step 5: Wire into main()**

```ts
await migrateBudgets(householdId, categoryIdMap);
await migrateRecurring(householdId);
await migrateGoals(householdId, accountIdMap);
await migrateRules(householdId, categoryIdMap);
```

- [ ] **Step 6: Dry-run + real run**

```bash
cd /home/seanm/Projects/finance-v2 && npm run migrate -- --dry-run
cd /home/seanm/Projects/finance-v2 && npm run migrate
```

- [ ] **Step 7: Verify all counts match the v1 baseline**

In Supabase SQL editor:
```sql
SELECT 'budgets' AS t, count(*) FROM v2.budgets
UNION ALL SELECT 'recurring', count(*) FROM v2.recurring
UNION ALL SELECT 'goals', count(*) FROM v2.goals
UNION ALL SELECT 'rules', count(*) FROM v2.rules;
```
Expected: each count matches `docs/v1-baseline.md` (within skipped rows due to FK references).

- [ ] **Step 8: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add scripts/migrate-v1-to-v2.ts && \
  git commit -m "feat(migrate): budgets + recurring + goals + rules"
```

---

## Task 11: Build the read-only Accounts page

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/accounts/page.tsx`
- Create: `/home/seanm/Projects/finance-v2/lib/db/schema.ts` (TypeScript types)
- Modify: `/home/seanm/Projects/finance-v2/app/dashboard/page.tsx` (add nav link)

A simple table listing all accounts in the household. Server-rendered. Proves v2 reads work end-to-end.

- [ ] **Step 1: Create the schema types**

Create `lib/db/schema.ts`:

```ts
export type Account = {
  id: string;
  household_id: string;
  owner_profile_id: string;
  provider: "akahu" | "manual_cash" | "service_account";
  akahu_account_id: string | null;
  name: string;
  type: "transactional" | "savings" | "credit" | "kiwisaver" | "service";
  tag: "sean" | "jenny" | "shared";
  is_locked: boolean;
  balance: number;
  balance_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  account_id: string;
  household_id: string;
  posted_at: string;
  amount: number;
  merchant_raw: string | null;
  merchant_clean: string | null;
  description: string | null;
  category_id: string | null;
  attributed_to_profile_id: string | null;
  confirmed: boolean;
  labels: string[];
  is_transfer: boolean;
  source: "akahu_sync" | "csv_import" | "email_capture" | "manual";
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Add the shadcn `table` component**

```bash
cd /home/seanm/Projects/finance-v2 && npx shadcn@latest add table
```

- [ ] **Step 3: Create the accounts page**

Create `app/accounts/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Account } from "@/lib/db/schema";

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("name");

  if (error) {
    return <main className="p-8"><p>Error: {error.message}</p></main>;
  }

  const accounts = (data ?? []) as Account[];

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Accounts ({accounts.length})</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Tag</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id} data-testid={`account-${a.id}`}>
              <TableCell>{a.name}</TableCell>
              <TableCell>{a.type}{a.is_locked ? " (locked)" : ""}</TableCell>
              <TableCell>{a.tag}</TableCell>
              <TableCell className="text-right">${a.balance.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
```

- [ ] **Step 4: Add a link from the dashboard**

Modify `app/dashboard/page.tsx` — inside the `<CardContent>`, before the `<form action="/auth/logout">`, add:
```tsx
<p className="text-sm">
  <a href="/accounts" className="underline">Accounts</a>
  {" · "}
  <a href="/transactions" className="underline">Transactions</a>
</p>
```

- [ ] **Step 5: Update the proxy.ts matcher** (if needed)

Inspect `proxy.ts` — confirm the matcher protects `/accounts` and `/transactions` (it should, since the matcher excludes only static assets).

- [ ] **Step 6: Verify TS clean**

```bash
cd /home/seanm/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 7: Smoke test (server-side render)**

```bash
cd /home/seanm/Projects/finance-v2 && timeout 15 npm run dev > /tmp/dev-task11.log 2>&1 &
sleep 6
# Hitting /accounts unauthenticated should redirect:
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/accounts
wait
```
Expected: `307 http://localhost:3000/login`. Manual login + visit will be the real test.

- [ ] **Step 8: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add app/accounts/ app/dashboard/page.tsx lib/db/ components/ui/table.tsx && \
  git commit -m "feat: read-only accounts page"
```

---

## Task 12: Build the read-only Transactions page (paginated)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/transactions/page.tsx`

Paginated list of all transactions. Most recent first. URL query param `?page=N` for navigation.

- [ ] **Step 1: Create the transactions page**

Create `app/transactions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Transaction } from "@/lib/db/schema";

const PAGE_SIZE = 50;

export default async function TransactionsPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await props.searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .order("posted_at", { ascending: false })
    .range(from, to);

  if (error) {
    return <main className="p-8"><p>Error: {error.message}</p></main>;
  }

  const txns = (data ?? []) as Transaction[];
  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Transactions ({count ?? 0})</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txns.map((t) => (
            <TableRow key={t.id} data-testid={`txn-${t.id}`}>
              <TableCell>{t.posted_at}</TableCell>
              <TableCell>{t.merchant_clean ?? t.merchant_raw ?? t.description ?? "—"}</TableCell>
              <TableCell className={`text-right ${t.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                ${t.amount.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav className="mt-4 flex gap-3 items-center">
        {page > 1 && <a className="underline" href={`/transactions?page=${page - 1}`}>← Prev</a>}
        <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
        {page < totalPages && <a className="underline" href={`/transactions?page=${page + 1}`}>Next →</a>}
      </nav>
    </main>
  );
}
```

- [ ] **Step 2: TS clean check**

```bash
cd /home/seanm/Projects/finance-v2 && npx tsc --noEmit
```

- [ ] **Step 3: Smoke test (unauth redirect)**

```bash
cd /home/seanm/Projects/finance-v2 && timeout 15 npm run dev > /tmp/dev-task12.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/transactions
wait
```
Expected: `307 http://localhost:3000/login`.

- [ ] **Step 4: Commit**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add app/transactions/ && \
  git commit -m "feat: read-only paginated transactions page"
```

---

## Task 13: End-to-end verification + production deploy

**Files:** None (verification + deploy).

- [ ] **Step 1: Sean logs in locally and verifies data is visible**

```bash
cd /home/seanm/Projects/finance-v2 && npm run dev
```

Sean opens http://localhost:3000, logs in, navigates from `/dashboard` to `/accounts` and `/transactions`. Verify:
- Accounts page shows the same accounts that appear in v1 (count matches `docs/v1-baseline.md`)
- Transactions page shows the most recent transactions, paginated
- Random spot-check: pick an old transaction in v1 and find it in v2

If anything is off, debug before deploying.

- [ ] **Step 2: Deploy to production**

```bash
cd /home/seanm/Projects/finance-v2 && vercel --prod
```

- [ ] **Step 3: Sean verifies the production deploy**

Open https://finance-v2-five.vercel.app, log in, visit `/accounts` and `/transactions`. Same checks as Step 1.

- [ ] **Step 4: Push to GitHub** (auto-deploys if Git integration is wired; safe even if not — just records progress)

```bash
cd /home/seanm/Projects/finance-v2 && git push origin main
```

---

## Task 14: Mark Phase 2 complete

**Files:**
- Create: `/home/seanm/Projects/finance-v2/docs/PHASE-2-COMPLETE.md`

- [ ] **Step 1: Write the completion marker**

```markdown
# Phase 2 — Salvage Migration — Complete

**Date completed:** <YYYY-MM-DD>

## What ships

- v2 schema lives in Postgres `v2` schema in the same Supabase project (`caahbpkqfgwkdyobfbpe`)
- 13 v2 tables created with full RLS (household-scoped policies on all data tables)
- All historical v1 data migrated: <N> accounts, <N> categories, <N> transactions, <N> budgets, <N> recurring, <N> goals, <N> rules
- v2 app's Supabase clients pinned to `db.schema = 'v2'`
- Two read-only pages: `/accounts` and `/transactions` (paginated)
- Migration script (`scripts/migrate-v1-to-v2.ts`) is idempotent and re-runnable
- v1 schema (`public`) is untouched and still serves the legacy app

## Verified by Sean

- [ ] Local: log in → /accounts shows full historical accounts list
- [ ] Local: /transactions shows historical transactions, paginated
- [ ] Production: same checks pass on the live URL
- [ ] Counts match v1 baseline (see `docs/v1-baseline.md`)

## What's deferred

- Phase 3: Akahu bank feed integration (replaces CSV import)
- Phase 4: Health score dashboard
- All other features per the design spec § 11

## References

- Spec: `~/Projects/finance/docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md` § 4, § 10, § 11 Phase 2
- Plan: `~/Projects/finance/docs/superpowers/plans/2026-04-29-phase-2-salvage-migration.md`
- v1 baseline: `docs/v1-baseline.md`
- Data audit: `docs/data-model-audit.md`
```

- [ ] **Step 2: Commit + push**

```bash
cd /home/seanm/Projects/finance-v2 && \
  git add docs/PHASE-2-COMPLETE.md && \
  git commit -m "docs: mark Phase 2 (Salvage migration) complete" && \
  git push origin main
```

---

## Self-review of this plan

**Spec coverage check (against § 11 Phase 2):**
- "Run the migration script" — Tasks 6–10
- "New app reads existing data with new schema" — Tasks 5, 11, 12
- "All historical accounts + transactions + categories visible" — Tasks 11, 12, 13
- "Schema review committed to a 'data-model-audit' doc" — Task 1
✓ Coverage complete.

**Placeholder scan:**
- One `<YYYY-MM-DD>` in PHASE-2-COMPLETE.md — meant to be filled in at task completion. Acceptable.
- One `<N>` in PHASE-2-COMPLETE.md — same.
- Several `// adapt based on what the v1 audit found` notes — these are explicit guidance to the implementer because the column shapes can't be known until the audit runs. Acceptable.

**Type / name consistency:**
- `accountIdMap` is a `Map<string, string>` returned from `migrateAccounts`, consumed by `migrateTransactions` and `migrateGoals`. ✓
- `categoryNameToId` is `Map<string, string>`, consumed by `migrateTransactions`, `migrateBudgets`, `migrateRules`. ✓
- `householdId` is propagated as a `string` from `migrateHouseholdAndProfiles` through every other migration function. ✓
- `Account` and `Transaction` types in `lib/db/schema.ts` are referenced in `app/accounts/page.tsx` and `app/transactions/page.tsx`. ✓

**Scope check:** This phase is bounded — schema + migration + 2 read-only pages. No write paths beyond the migration. No features beyond what the spec § 11 Phase 2 specifies. ✓

**Adaptation note:** Tasks 8–10 contain placeholder column mappings that MUST be adapted based on the audit output from Task 1. The implementer should treat the example code as a starting template, not a final answer. The plan structure is what's locked in.

---

## Done definition for Phase 2

Phase 2 is complete when ALL of the following are true:

1. `docs/data-model-audit.md` is committed and reviewed.
2. `docs/v1-baseline.md` is committed.
3. `supabase/migrations/0001_v2_schema.sql` is committed and applied to Supabase.
4. `scripts/migrate-v1-to-v2.ts` is committed and has been run successfully.
5. v2 row counts match v1 baseline (within documented skipped rows).
6. v2 app's Supabase clients are pinned to `schema: 'v2'`.
7. `/accounts` and `/transactions` pages render historical data on production.
8. Sean and Jenny can both log in to the production app and see their historical data.
9. `docs/PHASE-2-COMPLETE.md` is committed.

Phase 3 begins **only after** all 9 are true.
