# Phase 3a — Akahu Connect + First Manual Sync — Design Supplement

**Date:** 2026-04-29
**Parent spec:** `2026-04-29-finance-app-rebuild-design.md` § 11 Phase 3
**Phase 3 split:** 3a (this doc) → 3b (cron + rules engine, separate plan)

This document captures the design decisions made during the Phase 3a brainstorm that are not in the parent spec. The parent spec describes Phase 3 as a single phase ("Live bank feeds. Daily sync via Cron. Auto-categorisation rules engine."); we have split it into 3a (prove the loop end-to-end with one manual click) and 3b (automation + rules engine).

---

## Goal of Phase 3a

Prove the Akahu loop works end-to-end. Sean clicks one button on `/accounts`, fresh bank transactions appear in v2.

Phase 3a is shippable on its own — once it works, Sean has a functioning manual-sync app. Phase 3b layers automation on top.

## Scope (in)

- Sean signs up at my.akahu.nz, connects his banks (Kiwibank, ANZ, ASB — whichever he uses).
- Sean grabs his **App Token** + **User Token** from the Akahu developer dashboard.
- Tokens stored as Vercel environment variables: `AKAHU_APP_TOKEN`, `AKAHU_USER_TOKEN`. Single shared connection — no per-user OAuth, no multi-tenant logic.
- A thin `BankFeedProvider` interface in `lib/bank-feed/` with a single Akahu implementation. Allows future swap-out (parent spec § 13).
- A new server endpoint at `app/api/sync/route.ts`. POST triggers a sync. Calls Akahu, fetches accounts + txns, runs hybrid mapping, inserts into v2.
- A new "Sync from Akahu →" button at the top of the `/accounts` page. Click → POST `/api/sync` → render result inline.

## Scope (out — deferred to 3b or later)

- Vercel Cron (daily auto-sync) → 3b
- Auto-categorisation rules engine → 3b
- Settings page for integrations / token rotation UI → later phase
- Backfill / gap-fill for the 516 legacy `Untagged (legacy)` orphan transactions → optional, post-3b
- Multi-user OAuth (different households connecting their own Akahu accounts) → out of project scope per parent spec § 13

## Account mapping — hybrid auto-match

Driven by the existing `v2.accounts.account_number` column populated during Phase 2 migration.

```
For each Akahu account returned by /accounts API:

    matches := v2.accounts WHERE account_number = akahu.account_number

    if len(matches) == 1:
        # silent auto-link
        UPDATE v2.accounts SET akahu_account_id = akahu.id WHERE id = matches[0].id

    elif len(matches) == 0:
        # render a "Create new v2 account from Akahu?" confirmation card
        # if user confirms:
        #     INSERT v2.accounts with akahu_account_id, name, account_number from Akahu
        # else: skip

    else:
        # ambiguous — multiple v2 accounts share this number
        # render "Multiple matches — pick one or skip" card
```

v2 accounts that are not present in Akahu's response (service accounts, manual cash, the `Untagged (legacy)` placeholder) are left untouched.

The `account_number` match is exact-string. NZ bank account numbers (`38-9020-0211287-05`) are unique enough that exact match is safe.

## Transaction ingestion — cutover model

- First sync stores a `cutover_date` = the date the button was first clicked. Persist this as a row in a new `v2.bank_feed_state` table (or alternatively as part of the household record — to be decided in the plan).
- Akahu txn fetch is scoped: `WHERE posted_at >= cutover_date`.
- Legacy data (migrated in Phase 2) covers everything *before* `cutover_date`. Akahu covers everything *after*. **Zero overlap → zero dedupe logic.**
- Each Akahu transaction inserts into `v2.transactions` with `source = 'akahu_sync'`, `account_id` resolved via the `akahu_account_id` link.
- Sign convention: Akahu returns signed amounts already (negative = outflow). No sign flip needed — but verify in implementation.
- Categorisation: leave `category_id = NULL`. Sean re-categorises in the UI for now. The rules engine (3b) will fill these in automatically.

## UI placement

- A single "Sync from Akahu →" button at the top of the `/accounts` page header, above the table.
- Click → calls `POST /api/sync` → renders an inline result panel:
  - Success: "Linked 4 accounts. Pulled 12 new transactions."
  - Auto-create prompts: stacked confirmation cards for unmatched Akahu accounts.
  - Failure: red text with the error from Akahu / Supabase.
- No separate `/settings` page in 3a. The button moves later if we add a settings area.

## Failure handling

Phase 3a keeps it simple:

- If Akahu API returns an error → display the error message inline; insert nothing.
- If Supabase write fails partway → the entire `/api/sync` route runs in a single Postgres transaction; rollback. Show error.
- If the user has not yet set the env vars → the route returns a clear "Akahu credentials not configured" message rather than crashing.

No retries, no queue, no partial state. The user can just click again.

## Data model additions

This phase needs minimal new schema:

- A small table or row to persist `cutover_date` per household. Two options:
  - New `v2.bank_feed_state(household_id, provider, cutover_date, last_synced_at)` table — flexible for future providers.
  - Or, add `bank_feed_cutover_date` + `bank_feed_last_synced_at` columns to `v2.households`.

Plan will pick one based on simplicity-vs-scalability tradeoff. Lean toward the table because the parent spec § 11 specifies a `BankFeedProvider` abstraction.

`v2.accounts.akahu_account_id` already exists from Phase 2 schema — used for the auto-link.

## Provider abstraction

```ts
// lib/bank-feed/types.ts
export interface BankFeedProvider {
  name: 'akahu' | string;
  listAccounts(): Promise<BankFeedAccount[]>;
  listTransactions(opts: { from: Date }): Promise<BankFeedTransaction[]>;
}
```

Sole implementation in 3a: `lib/bank-feed/akahu.ts`. Calls Akahu's REST API using `fetch` with the bearer-token header pattern.

The `/api/sync` route depends on the interface, not the Akahu implementation directly. This keeps the parent-spec § 13 promise that "Akahu is replaceable."

## What the implementation plan must cover

A non-exhaustive list of tasks the writing-plans skill should produce:

1. Sean signs up at my.akahu.nz, connects banks, captures App + User tokens
2. Add tokens as Vercel env vars (preview + production)
3. Create `lib/bank-feed/types.ts` interface
4. Create `lib/bank-feed/akahu.ts` implementation (listAccounts, listTransactions)
5. Add `bank_feed_state` schema (table or columns) via a new SQL migration
6. Create `app/api/sync/route.ts` — orchestrates the sync flow with hybrid mapping
7. Add the "Sync from Akahu" button + result panel to `/accounts/page.tsx`
8. Smoke test: click button, verify accounts auto-link, verify Akahu txns appear in `/transactions` with `source=akahu_sync`
9. Deploy to production and verify there
10. Mark Phase 3a complete with a `PHASE-3A-COMPLETE.md` doc

## References

- Parent spec: `~/Projects/finance/docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md` § 11 Phase 3, § 13
- Phase 2 completion: `~/Projects/finance-v2/docs/PHASE-2-COMPLETE.md`
- Akahu Personal API docs: https://developers.akahu.nz/
- v2 schema: `~/Projects/finance-v2/supabase/migrations/0001_v2_schema.sql`
