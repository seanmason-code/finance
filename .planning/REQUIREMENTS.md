# Requirements: Finance Dashboard — Milestone v1.1 PocketSmith Lift

**Defined:** 2026-04-19
**Core Value:** At-a-glance financial position for a joint household — built for Sean + Jenny specifically.

## v1.1 Requirements

### Transactions (TXN) — Phase 4

- [ ] **TXN-01**: User can split one transaction into multiple child rows, each with its own category and amount; children sum to the original amount.
- [ ] **TXN-02**: User can add one or more free-form labels (e.g. `#joint`, `#holiday2026`) to a transaction, independent of its category.
- [ ] **TXN-03**: User can filter the transaction list by a label.
- [ ] **TXN-04**: Imported transactions land in an "unconfirmed" state with a distinct visual treatment (greyed, badged, or both).
- [ ] **TXN-05**: User can confirm a transaction; confirmed transactions render normally.
- [ ] **TXN-06**: After a user manually changes a transaction's category, a prompt offers to apply that category to all future transactions matching the same merchant keyword.
- [ ] **TXN-07**: Accepting the apply-to-future prompt creates a persisted rule; the rule fires automatically on subsequent CSV imports.

### Tidy / Categorize (TDY) — Phase 5

- [ ] **TDY-01**: Dashboard surfaces a count of uncategorised transactions as a clickable nudge.
- [ ] **TDY-02**: Dashboard surfaces a count of unconfirmed transactions as a clickable nudge.
- [ ] **TDY-03**: A dedicated Categorize page lists all currently uncategorised transactions.
- [ ] **TDY-04**: User can set a category on each transaction on the Categorize page with minimal clicks (inline picker or keyboard-friendly flow).
- [ ] **TDY-05**: The apply-to-future prompt (from TXN-06) is available inline on the Categorize page.

### Budget model (BDG) — Phase 6

- [ ] **BDG-01**: User can create a budget with period = weekly, fortnightly, monthly, or custom (N days).
- [ ] **BDG-02**: User can set a budget start date and optional end date.
- [ ] **BDG-03**: Budgets are stored as scheduled events in Supabase, with enough metadata to generate future occurrences on demand.
- [ ] **BDG-04**: Existing monthly budgets migrate to the new model without data loss or visible behaviour change.
- [ ] **BDG-05**: Budget progress displays correctly at any point in the period (not only calendar months).

### Forecast + Calendar (FCT) — Phase 7

- [ ] **FCT-01**: Dashboard shows a 90-day forecast chart of projected account balance.
- [ ] **FCT-02**: Forecast incorporates current balance + recurring transactions + scheduled budget events.
- [ ] **FCT-03**: Forecast renders visibly different (colour change, fill) where projected balance dips below zero.
- [ ] **FCT-04**: Calendar view shows a monthly grid with recurring transactions and scheduled budget events pinned to their dates.
- [ ] **FCT-05**: User can click a day on the calendar to see the events scheduled for that day.
- [ ] **FCT-06**: User can navigate forward/back month-by-month in the calendar.

### Reports / Sankey + Polish (RPT) — Phase 8

- [ ] **RPT-01**: Reports page includes a Sankey diagram showing income sources flowing into spending categories.
- [ ] **RPT-02**: Sankey respects the currently selected date range on the Reports page.
- [ ] **RPT-03**: Visual/UX polish pass across all new features — no regressions, mobile layout intact, consistent styling.
- [ ] **RPT-04**: A "What's new in this release" changelog is surfaced on first open after the launch deploy.

## Future Requirements (deferred)

### Rollover budgeting (ROL)

- **ROL-01**: User can opt a budget into rollover-above mode
- **ROL-02**: User can opt a budget into rollover-below mode
- **ROL-03**: User can opt a budget into rollover-both-ways mode
- **ROL-04**: Surplus from an underspent budget can be distributed to another budget

### Bank feed integration (AKH)

- **AKH-01**: User can connect a NZ bank account through Akahu
- **AKH-02**: Transactions sync automatically from connected accounts
- **AKH-03**: Sync handles pending → posted state transitions (leans on TXN-04/TXN-05)
- **AKH-04**: CSV import remains available for non-Akahu banks

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-currency | Both users NZ-based; unneeded complexity |
| Investment tracking | Different app's job; balance-only entry is sufficient |
| 30-year forecast | Accuracy degrades past ~12 months; 90-day is more honest |
| 15-widget configurable dashboard | Too much UX surface for a 2-user app |
| Standalone balance alerts | AI advisor can surface these; no scheduled-job infrastructure needed |
| PocketSmith API as backend | $20/mo vendor cost and dependency; Akahu direct is the cleaner path |
| OAuth / third-party login | Supabase email-password is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TXN-01 | Phase 4 | Pending |
| TXN-02 | Phase 4 | Pending |
| TXN-03 | Phase 4 | Pending |
| TXN-04 | Phase 4 | Pending |
| TXN-05 | Phase 4 | Pending |
| TXN-06 | Phase 4 | Pending |
| TXN-07 | Phase 4 | Pending |
| TDY-01 | Phase 5 | Pending |
| TDY-02 | Phase 5 | Pending |
| TDY-03 | Phase 5 | Pending |
| TDY-04 | Phase 5 | Pending |
| TDY-05 | Phase 5 | Pending |
| BDG-01 | Phase 6 | Pending |
| BDG-02 | Phase 6 | Pending |
| BDG-03 | Phase 6 | Pending |
| BDG-04 | Phase 6 | Pending |
| BDG-05 | Phase 6 | Pending |
| FCT-01 | Phase 7 | Pending |
| FCT-02 | Phase 7 | Pending |
| FCT-03 | Phase 7 | Pending |
| FCT-04 | Phase 7 | Pending |
| FCT-05 | Phase 7 | Pending |
| FCT-06 | Phase 7 | Pending |
| RPT-01 | Phase 8 | Pending |
| RPT-02 | Phase 8 | Pending |
| RPT-03 | Phase 8 | Pending |
| RPT-04 | Phase 8 | Pending |

**Coverage:**
- v1.1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-19 after initial definition*
