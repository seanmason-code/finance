# Finance Dashboard — State Document

*Updated: 2026-04-19*

> **GSD planning structure now lives in `.planning/`** — see `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/MILESTONES.md`.

## Where We Are

**Current version:** `finance-v50`
**Status:** v1.0 shipped. Milestone v1.1 (PocketSmith Lift) defined, ready for Phase 4 planning.

## What's Done (v1.0)

All of Phases 1–3 shipped. Full list in `.planning/MILESTONES.md` and `.planning/PROJECT.md` → Validated requirements.

Highlights:
- CSV import (Kiwibank sub-accounts, ANZ, bulk multi-file)
- Account tiles, transaction categorisation, budgets, recurring transactions
- Transfer detection (auto on import + manual button)
- Service accounts + net position
- Account matching UX (fuzzy match, unmatched banner, bulk assign)
- Custom categories, CSV export, toast notifications, PWA icons, mobile polish
- Pay-cycle spend comparison with 6-month average line (2026-04-19)

## What's Next

**Milestone v1.1 — PocketSmith Lift** (5 phases):
- Phase 4: Transaction foundations (splits, labels, confirmed state, apply-to-future rules)
- Phase 5: Categorize page
- Phase 6: Budget model refactor (flexible periods, scheduled events)
- Phase 7: Forecast + Calendar (90-day chart, monthly grid)
- Phase 8: Sankey + launch

Each phase deploys on completion. Jenny tests after Phase 8 launch.

**To resume:** `/gsd-plan-phase 4` from `~/Projects/finance/`.

## Known Quirks

- Kiwibank sub-accounts: `38-9020-0211287-XX` format
- Supabase RLS blocks anon key queries — authenticated client only
- `sw.js` cache MUST bump on every frontend deploy
- Old transactions without `account` field need backfill on re-import
- Pay-cycle chart anchor keyword: `PAY_CYCLE_KEYWORD = 'LOREAL'` in `js/app.js`

## Key Files

| File | Purpose |
|------|---------|
| `.planning/` | GSD planning docs (milestone, requirements, roadmap, state) |
| `docs/pocketsmith-lift-spec.md` | Human-readable milestone v1.1 spec |
| `js/app.js` | All app logic |
| `css/styles.css` | All styles |
| `sw.js` | Service worker — MUST bump `finance-vN` on every deploy |
| `index.html` | App shell + modal HTML |
| `LEARNINGS.md` | Past mistakes and lessons |

## Deferred (future milestones)

- Akahu direct bank feed integration
- Rollover budgeting (envelope mode)
- Jenny login flow (tracked separately, may slot in before/after v1.1)
