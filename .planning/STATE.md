# State: Finance Dashboard

*Updated: 2026-04-19*

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19)

**Core value:** At-a-glance financial position for a joint household — built for Sean + Jenny specifically.
**Current focus:** Milestone v1.1 PocketSmith Lift — defining requirements complete, ready for Phase 4 planning.

## Current Position

| Field | Value |
|-------|-------|
| Milestone | v1.1 PocketSmith Lift |
| Phase | Not started (defining requirements complete, ready to plan Phase 4) |
| Plan | — |
| Status | Ready for `/gsd-plan-phase 4` |
| Last activity | 2026-04-19 — Milestone v1.1 defined (27 requirements across 5 phases) |

## Deployed

- **Live URL:** https://finance-two-jet.vercel.app
- **Service worker version:** `finance-v50`
- **Last commit on main:** feat: pay-cycle spend comparison with historical average line (2026-04-19)

## Accumulated Context

### From v1.0 (shipped)
- CSV import works reliably for Kiwibank (including sub-accounts), ANZ, and multi-file bulk imports.
- Transfer detection runs automatically post-import and via manual button.
- Service accounts + net position tracking operational.
- Account matching UX (fuzzy match, unmatched banner, bulk assign) is in place.
- Custom categories ship via Settings, persisted to Supabase.
- Pay-cycle spend comparison (LOREAL-anchored) shipped 2026-04-19 — replaces the calendar-month comparison on dashboard.

### Known quirks (carry forward)
- Kiwibank sub-accounts use format `38-9020-0211287-XX`.
- Supabase RLS blocks anon key queries — always use authenticated client.
- `sw.js` cache MUST bump on every frontend deploy or users get stale app.
- Old transactions imported before `account` field existed need backfill on re-import.
- `PAY_CYCLE_KEYWORD = 'LOREAL'` anchors the pay-cycle chart; change if Jenny's employer keyword shifts on the bank feed.

### Jenny testing
- Not started yet. Jenny login flow is pending implementation (separate concern — not in this milestone).
- Plan: Jenny tests the entire milestone end-to-end after Phase 8 launch, not per-phase.

## Next Up

**Phase 4: Transaction Foundations** — TXN-01 through TXN-07.

Run:
- `/gsd-discuss-phase 4` to gather context and clarify approach, OR
- `/gsd-plan-phase 4` to skip discussion and plan directly.
