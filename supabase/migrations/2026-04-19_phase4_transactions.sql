-- Phase 4: Transaction Foundations migration
-- Date: 2026-04-19
-- Idempotent: safe to re-run. Joint account model — no RLS on new rules table,
-- no user_id column on new tables (per CONTEXT locked decision).

-- 1. Add new columns to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;

-- 2. Backfill existing rows to confirmed = true.
-- Guard on created_at so re-running AFTER phase 4 deploy does NOT mass-confirm
-- any legitimately-unconfirmed post-deploy imports. The '2026-04-19' cutoff is
-- the deploy date — anything created before the migration existed is legacy
-- data and is treated as reviewed.
UPDATE transactions
   SET confirmed = true
 WHERE confirmed = false
   AND created_at < '2026-04-19'::timestamptz;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_parent
  ON transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_confirmed
  ON transactions(confirmed)
  WHERE confirmed = false;

CREATE INDEX IF NOT EXISTS idx_transactions_labels
  ON transactions USING GIN (labels);

-- 4. Rules table (no user_id, no RLS — joint account).
CREATE TABLE IF NOT EXISTS rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_keyword text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_created_at ON rules(created_at);
