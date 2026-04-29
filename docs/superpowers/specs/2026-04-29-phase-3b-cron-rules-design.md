# Phase 3b — Vercel Cron + Rules Engine — Design Supplement

**Date:** 2026-04-29
**Parent spec:** `2026-04-29-finance-app-rebuild-design.md` § 11 Phase 3
**Phase 3a (already shipped):** `2026-04-29-phase-3a-akahu-connect-design.md`

This document captures the design decisions for Phase 3b. Phase 3a proved the Akahu loop end-to-end with one manual button. Phase 3b adds the automation layer on top:

1. A daily Vercel Cron that runs the same `/api/sync` flow without manual clicks.
2. An auto-categorisation rules engine that fills `transactions.category_id` based on merchant / amount / account matches.
3. A "make rule from this transaction" UX on `/transactions` plus a retroactive-apply confirmation modal.

---

## Goal of Phase 3b

Sean stops thinking about the app. Bank txns refresh themselves overnight, and recurring merchants (Pak'nSave, Z Energy, Mercury) get categorised the moment they land — without Sean lifting a finger.

When Sean DOES need to teach the system a new merchant, the flow is two clicks: "make rule from this txn" → confirm "apply to these 17 historical matches?".

Phase 3b is shippable on its own. After 3b, the only manual work left is rule creation for genuinely-new merchants.

---

## In scope

### 1. Vercel Cron daily auto-sync

- A new endpoint at `app/api/cron/sync/route.ts`. Vercel hits this once per day.
- Schedule: `0 18 * * *` (UTC) = 06:00 NZST / 06:00 NZDT (Auckland is UTC+12 standard, UTC+13 daylight). The Vercel cron runtime uses UTC; one hour drift twice a year is acceptable. Sean's spec § 13 says "Akahu sync is once per 24h; frame as synced daily" so timing precision doesn't matter.
- Auth: `CRON_SECRET` env var. The route checks `Authorization: Bearer ${process.env.CRON_SECRET}` and returns 401 if mismatched. Vercel signs cron requests with this header automatically when configured via `vercel.json` (or the new `vercel.ts`).
- Behaviour: identical to the existing `/api/sync` POST route, but iterates over **every household** rather than the current authenticated user. For now there is exactly one household, but the cron route loops to keep the future-proofing cheap.
- After sync completes: the rules engine runs over every just-inserted transaction (see §2 below).

### 2. Rules engine — Standard tier

The v2 schema already has `v2.rules` with `match` and `actions` as `jsonb`. Phase 3b defines the schemas of those columns and writes the engine that interprets them.

#### Match schema (v2.rules.match)

A single object combining match terms. **All non-null terms must match (AND).** Any term that is null/absent is ignored.

```json
{
  "merchant_keyword": "PAK N SAVE",
  "amount_min": null,
  "amount_max": null,
  "account_id": null
}
```

- `merchant_keyword`: case-insensitive substring match against `transactions.merchant_clean ?? merchant_raw ?? description`.
- `amount_min` / `amount_max`: range match against `transactions.amount` (signed). For "any expense over $200" set `amount_max = -200` (since expenses are negative).
- `account_id`: limit rule to a specific v2.accounts.id. Null = applies to all accounts in the household.

#### Action schema (v2.rules.actions)

A single object describing what to set when a match occurs.

```json
{
  "set_category_id": "<uuid>",
  "add_labels": ["takeout", "weekly"]
}
```

- `set_category_id`: if non-null, sets `transactions.category_id` to this UUID.
- `add_labels`: if non-empty, appends each string to `transactions.labels` (de-duplicated).

#### When the engine runs

- **At sync-insert time** (Cron and manual `/api/sync`): for each newly-inserted transaction, evaluate every active rule for the household; the **first** rule that matches wins (no rule precedence beyond insertion order — Sean can re-order via SQL if needed; UI for re-ordering is Phase 3c+ if it's ever wanted).
- **At rule-creation time** (the new `/api/rules` POST): after inserting the rule, the API returns the list of existing uncategorised matching txns so the client can render the confirmation modal (see §3). Application is gated on the user's confirmation, not automatic.

#### What the engine does NOT do (Phase 3b)

- No "categorise everything globally" sweep button (would risk mass-mis-categorisation).
- No regex matching on merchant_keyword (substring is enough for now).
- No conditional/branching rules ("if amount > 100 AND account = 'savings' THEN ...").
- No rule priority/ordering UI.
- No automatic re-run when a rule is edited.

### 3. "Make rule from this transaction" UX

On `/transactions`, each row gets a small "+" or "Make rule" button. Click → opens a modal:

```
+--------------------------------------------------+
| Make a rule from "PAK N SAVE WAIRAU"             |
|                                                  |
| Category: [ Food & Dining       v ]              |
|                                                  |
| Apply to:                                        |
|  ( ) Just this transaction                       |
|  (•) All transactions matching "PAK N SAVE"      |
|                                                  |
| [ Create rule ]                                  |
+--------------------------------------------------+
```

After clicking "Create rule":

- POST `/api/rules` with `{ match: { merchant_keyword: "PAK N SAVE" }, actions: { set_category_id: "<uuid>" } }`.
- The API inserts the rule, then runs a SELECT to find every uncategorised transaction in the household whose merchant matches the keyword.
- API responds with `{ rule, matchingTransactions: [...] }`.
- The client immediately replaces the modal with a **confirmation modal** matching Sean's v1 UX:

```
+--------------------------------------------------+
| Apply Category to Matches                        |
|                                                  |
| Applying category: "Food & Dining"               |
|                                                  |
| [Select all]                       [Deselect all]|
|                                                  |
| [x] PAK N SAVE WAIRAU                            |
|     2025-12-13 · NZ$18.57 · was: Other           |
| [x] PAK N SAVE WESTGATE                          |
|     2025-11-22 · NZ$92.41 · was: Other           |
|     ... (every match listed, all checked by      |
|         default; user can scroll)                |
|                                                  |
| [ Cancel ]      [ Apply to N selected ]          |
+--------------------------------------------------+
```

- "Apply" → POST `/api/rules/<id>/apply` with `{ transaction_ids: [...] }`. Server updates those rows' `category_id`.
- "Cancel" → no further action; the rule still exists for future txns.

#### Why no auto-apply

Sean's v1 UX explicitly asked the user to confirm. Mirroring that:
- Prevents mass mis-categorisation if the keyword is too broad ("CARD PAYMENT").
- Keeps the user in control of historical data, which they may have categorised intentionally.
- Cheap to implement — just a list with checkboxes.

---

## Out of scope (deferred)

- Backfill of pre-cutover Akahu data (the 516 legacy `Untagged (legacy)` orphans stay as-is unless Sean re-tags manually).
- Rules CRUD page at `/settings/rules` — for now you create rules inline via /transactions; you delete or edit them via SQL. Add the page if you outgrow this.
- Rule priority/ordering — first-match-wins by insert order.
- Manual "run rules now over all uncategorised" button — too risky without proper preview.
- Rule export/import.
- Rules that apply across households — single household for now.

---

## Data model additions

No schema migration needed. `v2.rules` already has `match jsonb` and `actions jsonb`. Phase 3b just writes a TypeScript type that pins down what JSON shape we accept and runs validation in the API route.

If the cron fails, we'll want a way to alert. Phase 3b adds **nothing** here — that's deferred to Phase 6 (AI Coach). The cron failing silently for one day isn't a critical bug; the user-triggered "Sync from Akahu →" button still works manually.

---

## Files this phase touches

```
finance-v2/
  app/
    api/
      cron/
        sync/
          route.ts            # NEW — cron-triggered version of /api/sync
      rules/
        route.ts              # NEW — POST: create rule + return matches
        [id]/
          apply/
            route.ts          # NEW — POST: apply rule to selected txn IDs
    transactions/
      page.tsx                # MODIFY — add "Make rule" button per row
      make-rule-button.tsx    # NEW — client component: small + button
      make-rule-modal.tsx     # NEW — client component: rule + confirmation modals
  lib/
    bank-feed/
      sync.ts                 # MODIFY — apply rules engine after txn insert
    rules/
      types.ts                # NEW — RuleMatch, RuleAction types
      apply.ts                # NEW — applyRulesToTransaction(txn, rules) → updated txn
      apply.test.ts           # NEW — unit tests for the engine
  vercel.ts                   # NEW — declares the cron schedule + path (preferred over vercel.json per current Vercel guidance)
```

That's roughly the same footprint as Phase 3a (~9 new files, ~3 modifications).

---

## What the implementation plan must cover

1. Add `CRON_SECRET` env var setup task (manual: Sean generates a long random string, adds to .env.local + Vercel Production).
2. Create `app/api/cron/sync/route.ts` — auth-checks `CRON_SECRET`, calls existing `runSync` for every household.
3. Create `vercel.ts` declaring the cron schedule.
4. Create `lib/rules/types.ts` and `lib/rules/apply.ts` (TDD).
5. Modify `runSync` in `lib/bank-feed/sync.ts` to apply rules to inserted transactions.
6. Create `app/api/rules/route.ts` — POST: inserts rule, returns matching uncategorised txns.
7. Create `app/api/rules/[id]/apply/route.ts` — POST: bulk-update selected txns' category_id.
8. Add `MakeRuleButton` and `MakeRuleModal` (with the two-step UX) on `/transactions`.
9. End-to-end test: deploy, wait for cron once OR trigger manually via curl with the secret, create a rule for "PAK N SAVE", confirm modal lists matches, apply, verify category_id updates.
10. Mark Phase 3b complete.

---

## References

- Phase 3a completion: `~/Projects/finance-v2/docs/PHASE-3A-COMPLETE.md`
- Parent spec: `~/Projects/finance/docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md` § 11 Phase 3
- v1 rule UX (anchor for retroactive modal): screenshot from session log, 2026-04-29
- v2 rules table: `~/Projects/finance-v2/supabase/migrations/0001_v2_schema.sql` (lines 178–187)
- Vercel Cron docs: https://vercel.com/docs/cron-jobs
