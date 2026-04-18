# Finance Dashboard

## What This Is

A personal finance PWA for Sean and Jenny to track shared income, expenses, accounts, budgets, and recurring transactions. Dark UI, mobile-friendly, self-hosted with Supabase backend. Live at finance-two-jet.vercel.app.

## Core Value

At-a-glance financial position for a joint household — minimal tiles not lists, click through for detail, built specifically for Sean + Jenny rather than a generic user.

## Current Milestone: v1.1 PocketSmith Lift

**Goal:** Lift the app's feature depth toward PocketSmith-level capability while staying focused on what Sean and Jenny actually use — adding forward-looking forecasting, richer transaction handling, and proper shared-household ergonomics.

**Target features:**
- Transaction splits, labels, confirmed/unconfirmed state, and "apply to future matching" rule prompts (Phase 4)
- Dedicated Categorize page with dashboard nudges (Phase 5)
- Budget model refactor — flexible periods, budgets as scheduled events (Phase 6)
- 90-day forecast chart + calendar view of scheduled events (Phase 7)
- Sankey flow diagram on reports + launch polish (Phase 8)

**Deferred to later milestones:**
- Akahu direct bank feed integration (own milestone)
- Rollover budgeting (envelope mode) — evaluate after budget refactor ships
- Dashboard widget configurability

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ CSV import from multiple NZ banks (Kiwibank sub-accounts) — Phase 1
- ✓ Account tiles with monthly in/out totals — Phase 1
- ✓ Transaction categorisation with icons — Phase 1
- ✓ Budget tracking (monthly) — Phase 1
- ✓ Recurring transaction management — Phase 1
- ✓ Supabase auth + storage — Phase 1
- ✓ Vercel deployment + PWA service worker — Phase 1
- ✓ Account number normalisation + backfill for legacy transactions — Phase 2
- ✓ Transfer detection and labelling — Phase 2
- ✓ Service accounts + net position — Phase 2
- ✓ PWA icons (192 + 512) — Phase 3
- ✓ Toast notifications replacing `alert()` — Phase 3
- ✓ CSV export — Phase 3
- ✓ Auto transfer detection after import — Phase 3
- ✓ Account matching UX (fuzzy match, unmatched banner, bulk assign) — Phase 3
- ✓ Custom categories (add/remove in Settings) — Phase 3
- ✓ Mobile layout polish — Phase 3
- ✓ Pay-cycle spend comparison with 6-month average line — Phase 3

### Active

<!-- Milestone v1.1 scope. Full detail in REQUIREMENTS.md. -->

- [ ] Transaction splits, labels, confirmed/unconfirmed state, apply-to-future rule prompt (Phase 4)
- [ ] Dedicated Categorize page with uncategorised/unconfirmed nudges (Phase 5)
- [ ] Budget model refactor — flexible periods, scheduled events (Phase 6)
- [ ] 90-day forecast chart + monthly calendar view (Phase 7)
- [ ] Sankey diagram on reports + launch polish (Phase 8)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-currency — both users NZ-based, not needed
- Investment tracking — different app's job; KiwiSaver balance fits fine as a "Total Balance" entry
- 30-year forecast — accuracy degrades past 12 months; 90-day is more honest and just as useful
- 15-widget configurable dashboard — too much UX complexity; pick 4-5 tiles that matter
- Standalone balance alerts — AI advisor can surface these manually
- Rollover budgeting — deferred until after flexible-period budgets ship, then re-evaluate
- Akahu direct bank feed integration — deferred to separate milestone
- PocketSmith API as backend dependency — adds $20/mo cost and vendor risk; direct Akahu is the cleaner long-term path

## Context

- **Users:** Sean (builder, main user) + Jenny (partner, joint-household user starting testing soon). Both in NZ.
- **Tech stack:** Vanilla JS SPA (no framework), Chart.js for visuals, HTML5/CSS3. Backend: Supabase (Postgres + Auth). Hosting: Vercel. PWA with service worker.
- **Design philosophy:** Dashboard = at a glance only, click through for detail. Minimal tiles not lists. No cloud complexity — Supabase handles auth and storage.
- **NZ-specific:** Kiwibank sub-accounts use format `38-9020-0211287-XX` (two-digit suffix per account). Bank data pulled via CSV import today; Akahu integration is the long-term path.
- **Research source:** PocketSmith feature study lives at `~/vault/wiki/finance/pocketsmith-*.md` (7 articles). `pocketsmith-takeaways.md` is the prioritisation summary this milestone is built from.

## Constraints

- **Tech stack**: Vanilla JS SPA — no framework migration in this milestone. New UI follows existing CSS/JS patterns.
- **Storage**: All new schema goes to Supabase. No localStorage-only state for new features.
- **Deploy**: `sw.js` cache version MUST bump on every frontend deploy or users get stale app. Current: `finance-v50`.
- **Testing**: Jenny tests at milestone end (not after every phase). Phase-level testing is Sean's own.
- **Compatibility**: Existing monthly budgets must migrate cleanly to the new scheduled-event model without data loss.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stay CSV-only for this milestone; defer Akahu | Akahu is a 1–2 week integration in its own right; risks derailing feature work | — Pending |
| All new schema in Supabase, not localStorage | Shared state for Sean + Jenny requires server of truth | — Pending |
| 90-day forecast, not 30-year | Accuracy degrades fast; 90 days is honest and actionable | — Pending |
| Jenny testing only at milestone end | Reduces thrash between phases; one clean round of feedback | — Pending |
| Phases ship progressively (push per phase) | Ships value earlier, de-risks the big launch | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 after milestone v1.1 start*
