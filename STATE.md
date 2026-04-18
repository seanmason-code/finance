# Finance Dashboard — State Document

*Updated: 2026-04-18*

## Where We Are
**Current version:** finance-v39  
**Status:** Feature complete. Paused for testing.

## What's Done
- Full app live on Vercel
- CSV import for multiple NZ banks (Kiwibank, ANZ, bulk multi-file)
- Account tiles with monthly in/out
- Transaction categorisation, budgets, recurring transactions
- Transfer detection — auto-labels on import + manual button
- Service accounts + net position tracking
- Account number backfill patch
- All 7 closeout tasks shipped:
  - PWA icons (192 + 512)
  - alert() → showToast() with error type styling
  - CSV export (Settings → Export Data (CSV))
  - Auto transfer detection after import
  - Account matching UX — fuzzy match, unmatched banner, bulk assign modal
  - Custom categories — add/remove in Settings, persisted in localStorage
  - Mobile layout polish — stats grid, charts, modals

## Known Issues / Watch Points
- Jenny login not yet implemented (needs separate user flow)
- See `LEARNINGS.md` for past gotchas (CSV field mapping, account allocation)

## What's Next (when returning)
- **Jenny login** — so Jenny can view her own account/budget split
- After testing period, return with a big plan based on real usage feedback

**To resume:** Open Claude from `~/Projects/finance/`, read `LEARNINGS.md` first.

## Key Files
| File | Purpose |
|------|---------|
| `js/app.js` | All app logic |
| `css/styles.css` | All styles |
| `sw.js` | Service worker — MUST bump finance-vN on every deploy |
| `index.html` | App shell + modal HTML |
| `docs/superpowers/plans/` | All implementation plans |
| `LEARNINGS.md` | Past mistakes and lessons |
