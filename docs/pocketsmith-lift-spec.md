# Milestone v1.1 — PocketSmith Lift

**Date created:** 2026-04-19
**Status:** Defined, ready to plan Phase 4
**Source research:** `~/vault/wiki/finance/pocketsmith-takeaways.md`
**Canonical planning docs:** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`

---

## The Goal (in plain English)

Lift the finance app's feature depth toward PocketSmith-level capability — but only the 5–6 things that actually matter for Sean + Jenny. Keep what's unique (free, joint, AI-native) and stop doing backward-looking-only reporting.

**The shift:** Today the app answers "what did I spend?" After v1.1 it answers "what am I going to spend, and where is the money actually flowing?"

---

## The Five Phases

Each phase ends with a `git push` + `vercel --prod` + `sw.js` cache bump. One big launch after Phase 8.

### Phase 4 — Transaction Foundations

Make transactions smarter. Four things, all in one phase because they share the same part of the schema.

1. **Splits** — a supermarket receipt can become Groceries + Alcohol + Household with amounts summing to the original.
2. **Labels** — free-form tags like `#joint`, `#holiday2026`, independent of categories. Filter the transaction list by label.
3. **Confirmed/unconfirmed state** — imported transactions land as unconfirmed (greyed/badged) until you review them. Solves duplicate and revision problems at the root.
4. **Apply-to-future prompt** — when you manually categorise a transaction, the app offers to apply that category to all future matches from the same merchant. Accepting creates a persisted rule.

Size: 4–5 days. Risk: low — additive schema.

### Phase 5 — Categorize Page

A dedicated surface for tidying up. Small phase but high impact because bulk categorisation is currently painful.

- Dashboard shows "X uncategorised" and "Y unconfirmed" nudges.
- Clicking either opens the Categorize page filtered to those transactions.
- Quick-edit UX — keyboard-friendly, no modal-per-row.
- The apply-to-future prompt from Phase 4 fires inline here too.

Size: 1–2 days. Risk: low — new view over existing data.

### Phase 6 — Budget Model Refactor

The big structural change. Current budgets are fixed-monthly. New model: budgets live as scheduled events on a timeline, with any period (weekly, fortnightly, monthly, custom).

Why it matters: it's the prerequisite for Phase 7. Forecasts need budgets that live on dates, not month buckets.

- Any period (weekly/fortnightly/monthly/custom N-days).
- Start date + optional end date per budget.
- Old monthly budgets migrate automatically on first load — no data loss.
- Budget progress reads correctly mid-period.

Size: 3–5 days. **Risk: medium** — this is the one that can break existing data. Plan: migration script with rollback path; Sean-only sanity check before marking the phase done.

### Phase 7 — Forecast + Calendar

The "wow" phase. The reason for doing Phase 6 in the first place.

- **90-day forecast chart** on the dashboard. Current balance + scheduled recurring items + scheduled budget events = projected line forward 90 days. Colour changes (orange/red) where the line dips below zero.
- **Calendar view** — a new monthly grid route. Recurring transactions and scheduled budget events appear as chips on their expected dates. Click a day to see events. Navigate forward/back month-by-month.

Size: 4–6 days. Risk: medium — new visuals, new aggregation logic, new route.

### Phase 8 — Sankey + Launch

Final phase. Polish pass, Sankey diagram, launch changelog.

- **Sankey diagram** on the Reports page — income sources on the left flowing into spending categories on the right, respecting the selected date range. Answers "where did my money actually go?" more intuitively than a pie chart.
- **Polish pass** — visual QA, no regressions, mobile-clean across all new surfaces.
- **Changelog panel** — dismissable "What's new in v1.1" on first open after the launch deploy. Tells Sean and Jenny what changed.
- **Launch push** — git tag `v1.1.0` + deploy + tell Jenny to start testing.

Size: 1–2 days. Risk: low.

---

## What's NOT in this milestone

Deliberately excluded, documented so we don't re-add them mid-flight:

| Feature | Why not now |
|---------|-------------|
| Akahu bank feed integration | 1–2 week integration in its own right; own milestone |
| Rollover budgeting (envelope mode) | Evaluate after flexible-period budgets ship in Phase 6 |
| 15-widget configurable dashboard | Too much UX surface for a 2-user app |
| 30-year forecast | Accuracy degrades fast; 90 days is honest and actionable |
| Multi-currency | Both users NZ-based |
| Investment tracking | Different app's job |
| Standalone balance alerts | AI advisor can cover it |
| Jenny login flow | Separate concern — slots in before/after this milestone |

---

## Decisions Taken

| Decision | Why |
|----------|-----|
| All 5 phases in scope | Full PocketSmith lift, not a partial one |
| Order as listed (4 → 8) | Dependencies flow naturally; Phase 6 must come before Phase 7 |
| Jenny tests at milestone end (not per phase) | Reduces thrash; one clean round of feedback |
| Defer Akahu to its own milestone | Stays focused; Akahu is a ~1–2 week engineering effort on its own |
| All new schema → Supabase, not localStorage | Shared state across Sean + Jenny needs server truth |
| 90-day forecast (not 30-year) | Honest and actionable; degradation past 12 months is real |

---

## How Execution Will Work

1. Phase 4 starts with `/gsd-plan-phase 4` (or `/gsd-discuss-phase 4` first for context).
2. Each phase ends with a commit + push + deploy + cache bump.
3. STATE.md in `.planning/` tracks current position across sessions.
4. At milestone end, `/gsd-complete-milestone` audits PROJECT.md — moves validated requirements to the shipped list, updates Out of Scope if anything got descoped in flight.

---

## Reference

All seven PocketSmith research articles live at:
- `~/vault/wiki/finance/pocketsmith-overview.md`
- `~/vault/wiki/finance/pocketsmith-forecasting.md`
- `~/vault/wiki/finance/pocketsmith-dashboards.md`
- `~/vault/wiki/finance/pocketsmith-transactions.md`
- `~/vault/wiki/finance/pocketsmith-budgeting.md`
- `~/vault/wiki/finance/pocketsmith-api-and-bank-feeds.md`
- `~/vault/wiki/finance/pocketsmith-takeaways.md`  ← prioritisation summary

Living planning docs:
- `.planning/PROJECT.md` — context, core value, constraints, decisions
- `.planning/REQUIREMENTS.md` — all 27 REQ-IDs across 5 phases
- `.planning/ROADMAP.md` — phases with success criteria
- `.planning/STATE.md` — current position
- `.planning/MILESTONES.md` — v1.0 shipped, v1.1 active

---
*Last updated: 2026-04-19*
