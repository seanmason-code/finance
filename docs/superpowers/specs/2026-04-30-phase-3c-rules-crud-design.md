# Phase 3c — Rules CRUD Page — Design

**Date drafted:** 2026-04-30
**Project:** finance-v2 (Personal Finance PWA)
**Predecessor:** Phase 3b — Cron + Rules Engine (`docs/PHASE-3B-COMPLETE.md`)
**Implementation repo:** `~/Projects/finance-v2/`

---

## Context

Phase 3b shipped a pure-function rules engine (`lib/rules/apply.ts`), three API routes (`POST /api/rules`, `POST /api/rules/[id]/apply`, `POST /api/cron/sync`), and a "+ rule" modal on `/transactions` for creating rules from individual uncategorised transactions. Rules are stored in `v2.rules` (Supabase) with shape:

```
id (uuid)
household_id (uuid)
match (jsonb): { merchant_keyword, amount_min, amount_max, account_id }
actions (jsonb): { set_category_id, add_labels }
created_at (timestamptz)
```

After Phase 3b, the explicit limitation was: *"No rules CRUD page yet; rules are deletable via SQL only."* Phase 3c closes that gap with full CRUD on the rules table — list, edit, delete, plus a "re-run rule against current uncategorised transactions" action.

---

## Goal

A `/settings/rules` page where Sean can see all rules he's created, edit any field on any rule, delete rules he no longer wants (with optimistic-undo for forgiveness), and re-run a rule against currently uncategorised transactions.

---

## Page

### Route

`/settings/rules`. New `app/settings/layout.tsx` shell (heading region + slot) for future settings pages — first occupant of `/settings/*`.

### Auth

Server component. Redirects to `/login` if `supabase.auth.getUser()` returns no user. Mirrors the auth pattern in `app/transactions/page.tsx`.

### Navigation

Top-nav link added to whatever component renders the primary nav. Implementation reads the existing nav location during the plan phase; `app/layout.tsx` is the most likely host. Link label: "Rules" (sentence case, no icon required).

### Data fetch

```ts
supabase
  .from("rules")
  .select("id, match, actions, created_at, categories(name)")
  .eq("household_id", hh.id)
  .order("created_at", { ascending: false });
```

Single-page render, no pagination. At single-user scale fewer than 50 rules is a multi-year-out concern.

### List rendering

One row per rule. **English-sentence format**:

> *"When merchant contains **"PAK N SAVE"** → **Groceries**"* · *2 days ago*
>
> *"When account is **ANZ Cheque** and amount ≥ **$1000** → **Income**"* · *6 hours ago*

Stitching:

- The sentence opens with `"When"` and lists each non-null match clause separated by `" and "`. Empty match (all-null) renders as `"When any transaction"` — covers the legacy edge case from a Phase 3b bug where scope="one" used to write all-null rules.
- Clauses:
  - `merchant_keyword` → `merchant contains "<keyword>"`
  - `account_id` → `account is <account_name>` (requires accounts join — fetch separately)
  - `amount_min` → `amount ≥ $<n>`
  - `amount_max` → `amount ≤ $<n>` (note: amount_max in DB is signed and inclusive; engine treats `amount_max: -200` as `amount ≤ -200`. UI formats as the absolute value with sign — needs a tiny helper to render readably).
- Right side shows `set_category_id` resolved to category name in **bold**, prefixed with " → ".
- Tail shows `created_at` formatted as relative time (e.g. "2 days ago", "just now"). Use `Intl.RelativeTimeFormat` or a small inline helper — no `date-fns` add unless already a dep.

Right-aligned row actions per row: `Edit` / `Re-run` / `Delete`. Inline buttons or a `DropdownMenu` kebab-trigger — implementation chooses based on row visual density; default to inline text-buttons for readability and graduate to a dropdown only if the row gets crowded.

### Empty state

Centered tile with copy: *"No rules yet. Create one with `+ rule` next to any uncategorised transaction on the [Transactions page]."* Link to `/transactions`.

---

## Row actions + behaviours

### Edit

Opens a NEW component `EditRuleModal` (separate from `make-rule-modal.tsx`). The existing create modal has a 2-phase state machine (create → confirm-apply → done) that doesn't apply to edits. `EditRuleModal` is a single-phase form:

- Pre-filled fields: merchant_keyword (text), amount_min (number, optional), amount_max (number, optional), account_id (dropdown of accounts), set_category_id (dropdown of categories ordered by `type, name`)
- Save / Cancel buttons.
- Submit calls `PATCH /api/rules/[id]` with the full updated `{ match, actions }` payload (replacement, not partial).
- On success: close modal + `router.refresh()` to revalidate the list.
- On error: surface inline below the form.

The two modals **may share field markup** via an extracted `RuleFormFields` component, but only if duplication during implementation is substantial. Default plan: keep them as two focused ~150-line modals; refactor to share fields if and only if the diff invites it.

**Engine semantics:** the Phase 3b engine has a hard `.is(category_id, null)` filter on inserts and bulk-updates → editing a rule does NOT retroactively recategorise existing transactions. That's correct behaviour; the separate Re-run action handles retroactive intent.

### Re-run

A row-level action that re-applies a rule to currently uncategorised transactions. Reuses the existing `make-rule-modal.tsx` confirm phase via a `mode: "create" | "rerun"` prop:

1. Click Re-run → fetches `POST /api/rules/[id]/preview` (new helper that returns matching uncategorised txns without inserting a new rule)
2. Mounts the modal in "rerun" mode showing only the confirm-step (Select all / Deselect all / checkbox list)
3. Submit calls existing `POST /api/rules/[id]/apply` (Phase 3b deliverable) with selected transaction_ids
4. Done → toast or modal-done state, plus `router.refresh()`

**Modal refactor required:** add `mode` prop. In `"rerun"` mode, skip the create-phase JSX entirely and start at the confirm-phase, populated from the preview-route response. In `"create"` mode, behaviour is unchanged.

**Alternative:** ship a separate `RerunRuleModal` that duplicates the confirm-step JSX. Rejected because the confirm-step has real complexity (Select all / Deselect all, busy state, error surface, auto-close timer) that's annoying to duplicate.

### Delete

Optimistic delete + undo toast via `sonner` (install if not already present — confirmed shadcn-recommended toast library).

Flow:

1. Click Delete → row immediately hidden in client state (filtered out of the rules array via `useState`).
2. Toast appears bottom-right: *"Rule deleted. **Undo**"*. Auto-dismisses after **8 seconds**.
3. Pending-delete state holds: the deleted rule's full data (for restore) + a `setTimeout` ref (for cancel).
4. Auto-dismiss timer fires → calls `DELETE /api/rules/[id]`. On success: no UI change (already hidden). On failure: restore row in client state + show error toast.
5. Undo click → cancel the timer, restore row in client state, no DB call ever made.
6. Component unmount before timer fires (e.g. user navigates away) → `useEffect` cleanup fires the pending DELETE so it doesn't get lost. **Edge case accepted:** browser tab close before timer is "lost" — the rule remains in DB until next manual delete. Acceptable for single-user scale.

---

## API surface

### New routes (3)

#### `PATCH /api/rules/[id]`

- Auth-gated (401 if no user)
- Body: `{ match: RuleMatch, actions: RuleAction }` — full replacement, not partial. Validation: both keys present, types match the existing `RuleMatch`/`RuleAction` definitions in `lib/rules/types.ts` (loose runtime validation; rely on TS at the call site).
- Returns: `{ rule: Rule }` (the updated rule via `.select().single()`)
- 404 if rule not found
- 500 on Supabase update error

#### `DELETE /api/rules/[id]`

- Auth-gated (401)
- Returns: `{ deleted: true }`
- 404 if rule not found (`maybeSingle()` returns null)
- 500 on Supabase delete error
- **No cascade concerns:** the Phase 3b engine never references deleted rules at sync time, and the `.is(category_id, null)` filter means already-categorised transactions retain their category after their rule is deleted.

#### `POST /api/rules/[id]/preview`

- Auth-gated (401)
- Returns matching uncategorised transactions for an existing rule, without inserting any new rule
- Returns: `{ matchingTransactions: Match[] }` (same shape as the existing `POST /api/rules` response's `matchingTransactions` field)
- 404 if rule not found
- 500 on Supabase query error

### Refactor

`POST /api/rules/route.ts` currently does both *insert rule* and *find matching uncategorised txns* inline. Extract the find logic into a shared helper:

**`lib/rules/find-matches.ts`**

```ts
export async function findMatchingUncategorisedTxns(
  supabase: SupabaseClient,
  householdId: string,
  match: RuleMatch
): Promise<Match[]>
```

This is a pure-data helper (no auth, no insert) used by:
- `POST /api/rules` (after inserting the rule)
- `POST /api/rules/[id]/preview` (without inserting)

Implementation mirrors the existing query: `.from("transactions").select(...).eq("household_id", ...).is("category_id", null)` plus conditional `.ilike(...)`, `.gte(...)`, `.lte(...)`, `.eq(...)` clauses, plus `.order("posted_at", { ascending: false })`.

**Important consistency note:** the **Phase 3b** cleanup PR (scheduled for 2026-05-06 via remote agent) will tighten the keyword guard in `app/api/rules/route.ts` to `!== null && !== undefined` and escape `%`/`_`/`\`. **Phase 3c** implementation should adopt those same semantics in the new `find-matches.ts` helper from the start, NOT replicate the pre-cleanup truthy-check pattern. If the cleanup PR has already merged when 3c is built, refactor `route.ts` to call the new helper. If not, build the helper with corrected semantics and let the 3b cleanup PR converge on the same shape — minor merge work either way.

### No `GET /api/rules`

The `/settings/rules/page.tsx` server component fetches directly via Supabase. No need for a JSON list endpoint — server components are the simpler path for read-once-on-mount.

---

## Tests

TDD per existing pattern: vitest + `vi.mock("@/lib/supabase/server", ...)` for routes. Pure-function helpers tested directly.

### New test files

- **`app/api/rules/[id]/route.test.ts`** — for both PATCH and DELETE handlers in the same file:
  - 401 unauth on each verb
  - 404 not-found on each verb
  - 200 happy-path on each verb (mocked update / delete chain)

- **`app/api/rules/[id]/preview/route.test.ts`**:
  - 401 unauth
  - 404 not-found
  - 200 with mocked matches

- **`lib/rules/find-matches.test.ts`** — pure function, no mocks needed (pass a fake supabase chain):
  - empty match (all nulls) returns all uncategorised txns
  - keyword-only filter
  - amount_min only
  - amount_max only
  - account_id only
  - combinations (keyword + amount_max, account + amount range, etc.)
  - ordering: posted_at DESC

### Out of test scope

- The `/settings/rules` page itself (server component + Supabase queries don't lend to vitest cleanly). Manual smoke during verify phase. Playwright follow-up PR if/when E2E coverage is wanted.
- The modal interactions (delete-undo timing, edit-save flow). Manual smoke. Same Playwright follow-up.

---

## Out of scope (explicit)

- **Rule precedence / priority UI** — engine is first-match-wins, no ordering needed yet
- **Bulk import / export of rules** (CSV, JSON)
- **Activity log / audit trail** of rule edits or applications
- **Rule duplication** ("clone rule" action)
- **Search / filter on the rules list** — you'll have <50 rules
- **Toggle enable / disable** — Phase 3c is hard-delete only; soft-delete via `is_active` flag is deferred (would require a migration)
- **Re-run UI for already-categorised transactions** — the engine and the API only operate on uncategorised txns. To recategorise an already-categorised txn, the user clears `category_id` manually first
- **Account-name resolution batching** — the list joins `categories(name)` but accounts are fetched separately for sentence rendering. If account lookup gets slow with many rules, pre-load accounts into a Map at page load. Optimisation, not a Phase 3c gate.

---

## Verification (Phase 3c manual smoke)

After implementation, manual checks:

- [ ] `/settings/rules` renders with all existing rules in English-sentence form
- [ ] Top-nav has a "Rules" link that routes there
- [ ] Edit a rule's category — verify modal pre-fills, save closes modal, list reflects new category. Existing categorised txns remain unchanged (engine semantics).
- [ ] Delete a rule + click Undo — row returns
- [ ] Delete a rule + let toast expire — verify row is gone permanently in DB (`SELECT * FROM v2.rules WHERE id = ...` returns nothing)
- [ ] Re-run a rule against uncategorised transactions — verify confirm-modal opens with matches, Apply categorises selected
- [ ] PATCH/DELETE/preview routes return 401 without auth
- [ ] vitest: all new tests pass; full suite still green
- [ ] `npx tsc --noEmit` clean

---

## References

- Phase 3b spec: `docs/superpowers/specs/2026-04-29-phase-3b-cron-rules-design.md`
- Phase 3b plan: `docs/superpowers/plans/2026-04-29-phase-3b-cron-rules.md`
- Phase 3b completion: `~/Projects/finance-v2/docs/PHASE-3B-COMPLETE.md`
- Existing modal: `~/Projects/finance-v2/app/transactions/make-rule-modal.tsx`
- Existing rules engine: `~/Projects/finance-v2/lib/rules/apply.ts` + `types.ts`
- Existing API routes: `~/Projects/finance-v2/app/api/rules/route.ts` + `app/api/rules/[id]/apply/route.ts`
