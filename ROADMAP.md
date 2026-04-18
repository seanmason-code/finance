# Finance Dashboard — Roadmap

## Phase 1: Core App ✅
- CSV import (multi-bank, Kiwibank sub-account support)
- Transaction list with categories and icons
- Account tiles with in/out totals
- Budget tracking
- Recurring transactions
- Supabase auth + storage
- Vercel deployment
- Service worker / PWA

## Phase 2: Account Matching & Data Quality ✅
- Account number normalisation
- Backfill patch for old transactions missing account field
- Transfer detection and labelling
- Service accounts + net position

## Phase 3: Closeout — IN PROGRESS
Plan: `docs/superpowers/plans/2026-04-16-finance-app-closeout.md`

7 tasks to close out the app:

- [ ] Task 1: PWA icons (icon-192.png, icon-512.png)
- [ ] Task 2: Replace alert() with showToast()
- [ ] Task 3: CSV export
- [ ] Task 4: Auto-run transfer detection after CSV import
- [ ] Task 5: Account matching UX (fuzzy match + unmatched banner + bulk assign)
- [ ] Task 6: Custom categories
- [ ] Task 7: Mobile layout polish

## Phase 4: Future (Backlog)
- Garmin health data overlay
- Year-over-year comparison views
- Savings goals tracking
