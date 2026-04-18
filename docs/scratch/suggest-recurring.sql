-- Detect recurring merchants with 3+ consecutive monthly transactions
-- and insert them into the `recurring` table as inactive.
-- Run in Supabase → SQL Editor. Safe to re-run (skips anything already in recurring).

WITH normalized AS (
  SELECT
    t.type,
    t.description,
    t.amount,
    t.category,
    t.date::date AS txn_date,
    -- normalize: lowercase, strip digit runs, strip punctuation, first 3 words
    trim(
      array_to_string(
        (string_to_array(
          regexp_replace(
            regexp_replace(lower(t.description), '[0-9]{2,}', ' ', 'g'),
            '[^a-z0-9 ]', ' ', 'g'
          ),
          ' '
        ))[1:3],
        ' '
      )
    ) AS norm
  FROM transactions t
  WHERE t.category IS DISTINCT FROM 'Transfer'
    AND t.description IS NOT NULL
    AND length(trim(t.description)) > 0
),
by_merchant AS (
  SELECT
    type,
    norm,
    description,
    amount,
    category,
    txn_date,
    date_trunc('month', txn_date)::date AS month_key
  FROM normalized
  WHERE norm IS NOT NULL
    AND length(regexp_replace(norm, '\s+', '', 'g')) >= 3
),
months_per_merchant AS (
  SELECT
    type,
    norm,
    month_key,
    row_number() OVER (PARTITION BY type, norm ORDER BY month_key) AS rn
  FROM (SELECT DISTINCT type, norm, month_key FROM by_merchant) m
),
runs AS (
  SELECT
    type,
    norm,
    month_key,
    (extract(year FROM month_key)::int * 12 + extract(month FROM month_key)::int) - rn AS run_group
  FROM months_per_merchant
),
consecutive_runs AS (
  SELECT type, norm, run_group, count(*) AS consec
  FROM runs
  GROUP BY type, norm, run_group
),
eligible AS (
  SELECT type, norm, max(consec) AS max_consec
  FROM consecutive_runs
  GROUP BY type, norm
  HAVING max(consec) >= 3
),
stats AS (
  SELECT
    b.type,
    b.norm,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(b.amount)) AS median_amount,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(day FROM b.txn_date)) AS median_day,
    mode() WITHIN GROUP (ORDER BY b.description) AS top_description,
    mode() WITHIN GROUP (ORDER BY b.category) AS top_category,
    count(*) AS sample_count
  FROM by_merchant b
  JOIN eligible e USING (type, norm)
  GROUP BY b.type, b.norm
),
consistent AS (
  -- keep only merchants whose amounts cluster: >=66% of txns within 15% of median
  SELECT s.*
  FROM stats s
  WHERE s.median_amount > 0
    AND (
      SELECT count(*)
      FROM by_merchant b
      WHERE b.type = s.type AND b.norm = s.norm
        AND abs(abs(b.amount) - s.median_amount) / s.median_amount < 0.15
    ) >= ceil(s.sample_count * 2.0 / 3)
)
INSERT INTO recurring (id, type, description, amount, category, frequency, day_of_month, active)
SELECT
  gen_random_uuid(),
  c.type,
  c.top_description,
  round(c.median_amount::numeric, 2),
  coalesce(c.top_category, 'Uncategorised'),
  'monthly',
  greatest(1, least(31, round(c.median_day)::int)),
  false
FROM consistent c
WHERE NOT EXISTS (
  SELECT 1 FROM recurring r
  WHERE r.type = c.type
    AND lower(trim(r.description)) = lower(trim(c.top_description))
);

-- See what just got inserted:
SELECT type, description, amount, category, day_of_month
FROM recurring
WHERE active = false
ORDER BY type, description;
