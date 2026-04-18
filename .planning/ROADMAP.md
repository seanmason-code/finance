# Roadmap: Finance Dashboard — Milestone v1.1 PocketSmith Lift

**Milestone goal:** Lift the app's feature depth toward PocketSmith-level capability while staying focused on what Sean and Jenny actually use.

**Phases:** 5 (numbered Phase 4 → Phase 8, continuing from the v1.0 roadmap).
**Launch:** After Phase 8 completes — big launch push + Jenny testing.

## Phase Overview

| # | Phase | Goal | Requirements | Ship size |
|---|-------|------|--------------|-----------|
| 4 | Transaction foundations | Richer transaction model: splits, labels, confirmed state, and organic rule-building | TXN-01..07 | 4–5 days |
| 5 | Categorize page | Dedicated bulk UX for tidy-up + dashboard nudges | TDY-01..05 | 1–2 days |
| 6 | Budget model refactor | Flexible periods + budgets as scheduled events | BDG-01..05 | 3–5 days |
| 7 | Forecast + Calendar | 90-day forecast chart + monthly calendar grid | FCT-01..06 | 4–6 days |
| 8 | Sankey + launch | Reports Sankey + final polish + launch changelog | RPT-01..04 | 1–2 days |

**Each phase ends with a push to origin + Vercel prod deploy.** Jenny tests after Phase 8 launch.

## Phase Details

### Phase 4 — Transaction Foundations

**Goal:** Extend the transaction model to support splits, labels, confirmed/unconfirmed state, and organic rule-building via the apply-to-future prompt.

**Requirements:** TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TXN-06, TXN-07

**Success criteria:**
1. User splits a $237 supermarket transaction into Groceries ($180), Alcohol ($45), Household ($12); children sum to original, parent is retained for traceability.
2. User tags a transaction `#joint` and filters the transaction list by that label to see only matching rows.
3. Newly imported transactions render with a visible "unconfirmed" badge until the user confirms them individually.
4. After user categorises a "COUNTDOWN LITTLE HIGH" transaction as Groceries, a prompt appears offering to apply Groceries to all future transactions containing "COUNTDOWN"; accepting creates a persisted rule.
5. On the next CSV import, the saved rule automatically categorises matching new transactions.

**Key risk:** Schema additions (parent_transaction_id, labels array, confirmed boolean, rules table). Supabase migrations required — plan migration script with rollback path.

**Deliverable push:** One commit group + `vercel --prod` + sw.js cache bump.

---

### Phase 5 — Categorize Page

**Goal:** Give Sean and Jenny a fast dedicated surface for tidying up uncategorised and unconfirmed transactions.

**Requirements:** TDY-01, TDY-02, TDY-03, TDY-04, TDY-05

**Success criteria:**
1. Dashboard shows "X uncategorised" and "Y unconfirmed" nudges when those counts are non-zero; clicking them deep-links to the Categorize page pre-filtered.
2. Categorize page lists every uncategorised transaction in a single scroll view.
3. User can categorise ten transactions in under a minute using the quick-edit UX (keyboard-friendly, no modal-per-row).
4. Apply-to-future prompt from Phase 4 fires inline on the Categorize page — no separate flow.

**Key risk:** Low. Mostly a new view over existing data.

**Deliverable push:** One commit group + `vercel --prod` + sw.js cache bump.

---

### Phase 6 — Budget Model Refactor

**Goal:** Replace the fixed-monthly budget model with a flexible-period, scheduled-event model that can drive the forecast in Phase 7.

**Requirements:** BDG-01, BDG-02, BDG-03, BDG-04, BDG-05

**Success criteria:**
1. User creates a fortnightly Rent budget of $600 starting 2026-05-01; next four occurrences render correctly on 2026-05-15, 2026-05-29, 2026-06-12, 2026-06-26.
2. All existing monthly budgets migrate automatically on first load of the new version — totals unchanged, UX unchanged, no data loss.
3. Budget progress on the dashboard shows correctly mid-period for a fortnightly budget (e.g. day 8 of 14 = ~57% of period elapsed).
4. A recurring transaction creates a budget event on its scheduled date in the underlying data model.

**Key risk:** **Highest in the milestone.** Touches existing budget data. Required: migration script, backup before first load, visible rollback path. Plan: write migration, test on a copy of Sean's data before production rollout.

**Deliverable push:** One commit group + `vercel --prod` + sw.js cache bump. **Do not proceed to Phase 7 until Jenny-independent Sean-only sanity check confirms existing budget data survived.**

---

### Phase 7 — Forecast + Calendar

**Goal:** Introduce the forward-looking view — a 90-day forecast chart on the dashboard and a monthly calendar grid showing scheduled events.

**Requirements:** FCT-01, FCT-02, FCT-03, FCT-04, FCT-05, FCT-06

**Success criteria:**
1. Dashboard shows a 90-day forecast line chart; current balance is the first point, projected balance on each subsequent day is the last point on that day.
2. Forecast line visibly changes appearance (colour or fill) where projected balance falls below zero.
3. Calendar view shows rent, salary, utilities, and any other scheduled events pinned to their expected dates; icons or colours distinguish income from expense.
4. Navigating forward two months shows the recurring events continuing to plot correctly.
5. Clicking a day with events opens a day-detail modal listing them.

**Key risk:** Medium. New visual + new data aggregation logic. Calendar is a new route.

**Deliverable push:** One commit group + `vercel --prod` + sw.js cache bump.

---

### Phase 8 — Sankey + Launch

**Goal:** Ship the Sankey reports view, do a final polish pass, and launch the milestone with an in-app changelog for users.

**Requirements:** RPT-01, RPT-02, RPT-03, RPT-04

**Success criteria:**
1. Reports page shows a Sankey diagram: income sources on the left flowing into spending categories on the right; widths proportional to amount.
2. Changing the Reports page date range re-renders the Sankey with the filtered totals.
3. Visual QA pass: no regressions in existing features; mobile layout intact across all new surfaces; dark theme consistent.
4. First app open after the launch deploy shows a dismissable "What's new in v1.1" panel listing the new features with one-line each.
5. **Launch push: tag `v1.1.0` in git + deploy + notify Jenny to start testing.**

**Key risk:** Low. Sankey library is well-understood (d3-sankey). Polish pass depends on what lands across earlier phases.

**Deliverable push:** One commit group + `vercel --prod` + sw.js cache bump + git tag `v1.1.0`.

---

## Launch Plan

After Phase 8 deploys:
1. Verify live site at finance-two-jet.vercel.app on desktop + mobile.
2. Bump `sw.js` cache once more and redeploy if the changelog panel doesn't appear due to cache.
3. Send Jenny the link + a short list of what's new.
4. Run `/gsd-complete-milestone` to audit PROJECT.md (validate shipped requirements, update Out of Scope if anything got descoped).
5. Start the next milestone discussion — likely Akahu integration or rollover budgeting.

## Coverage Check

All 27 v1.1 requirements mapped to exactly one phase. Coverage: 100% ✓

---
*Roadmap created: 2026-04-19*
*Last updated: 2026-04-19*
