# Milestones: Finance Dashboard

Tracks completed and active milestones.

## v1.0 — Core App (Shipped)

**Phases 1–3.** Everything needed for Sean to track finances solo from CSV imports.

**Shipped:**
- CSV import (multi-bank, Kiwibank sub-account support)
- Account tiles, transaction list, budget tracking, recurring transactions
- Supabase auth + storage, Vercel deploy, PWA service worker
- Account number normalisation + backfill
- Transfer detection and labelling, service accounts, net position
- Closeout polish: PWA icons, toast notifications, CSV export, auto transfer detection post-import, account matching UX, custom categories, mobile layout
- Pay-cycle spend comparison with historical average line

**Completed:** 2026-04-19 (with pay-cycle ship)

## v1.1 — PocketSmith Lift (Active)

**Phases 4–8.** Feature lift inspired by PocketSmith research; adds forward-looking forecasting, richer transaction handling, and proper shared-household ergonomics.

**In scope:**
- Transaction splits, labels, confirmed/unconfirmed state, apply-to-future rule prompts
- Dedicated Categorize page with dashboard nudges
- Budget model refactor — flexible periods, scheduled events
- 90-day forecast chart + monthly calendar view
- Sankey reports + launch polish

**Started:** 2026-04-19
**Target launch:** TBD (est. 2–3 weeks of focused build)

**Research source:** `~/vault/wiki/finance/pocketsmith-takeaways.md`

## Future milestones (candidates)

- **Akahu integration** — direct NZ bank feeds, replaces CSV drudgery
- **Rollover budgeting** — opt-in envelope mode per category
- **Dashboard widget configurability** — if multi-user dashboard needs diverge

---
*Last updated: 2026-04-19 after v1.1 start*
