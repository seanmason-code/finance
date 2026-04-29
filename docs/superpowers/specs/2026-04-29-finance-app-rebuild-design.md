# Finance App Rebuild — Design Spec

**Date:** 2026-04-29
**Author:** Sean (with research support)
**Status:** Draft, awaiting review
**Codename:** Finance v2

---

## 1. Vision

A personal finance PWA for Sean and Jenny that answers one question every time you open it: **"How is our financial health right now, and what's changing?"**

The app is built around a financial health score and 5 vital signs — like a Garmin Body Battery for money. Bank feeds are automatic. Service-account bills (power, water, gas) are auto-captured from email by Claude. The dashboard *is* the app — everything else is a click-through.

**Personality blend (decided in brainstorm):**
- **Health Monitor (B)** — the core. The dashboard is a score + vital signs.
- **Autopilot (C)** — the foundation. Bank feeds + auto-categorisation are baseline assumptions, not features.
- **Tracker / Forecast (A)** — feature, click-in from the score. 90-day forecast, calendar, where the money went.
- **AI Coach (D)** — feature, three modes (proactive cards, scheduled recap, on-demand chat).

**Differentiator vs the market:** every competitor still uses the dashboard as a launchpad to long lists. Nobody's built health-score-first. Combined with the auto-capture service-accounts model, this is genuinely novel.

---

## 2. Approach

**Rebuild from scratch with salvage.**

- New project at `~/Projects/finance-v2/` (rename old to `finance-legacy`).
- Keep the live old app deployed and in use until the new one is ready — zero downtime risk.
- Salvage the Supabase project (50 versions of schema tuning, all historical data, RLS already wired).
- Salvage the data models that already work: service accounts, transfer detection, pay-cycle anchor, categories.
- Throw away the 3,779-line `app.js`, the 938-line `index.html`, the 2,180-line `styles.css`, the manual-everything UX, the CSV-only assumption.

Strangler-fig migration was rejected: the old code is transaction-list-first, and the new vision is dashboard-first — keeping the old shell would drag the old mental model along.

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 16 (App Router) | Components + Server Actions kill the 3,779-line app.js |
| Language | TypeScript | Catches whole classes of bugs in money code |
| UI | shadcn/ui + Tailwind CSS | Production components, you own the code, no runtime dep |
| Database + Auth | Supabase (kept) | Already working, already has your data |
| Bank feeds | Akahu | Kiwibank + ANZ supported, read-only by default |
| AI | Claude via Vercel AI Gateway | Sonnet 4.6 default, Opus 4.7 for monthly recap, prompt caching essential |
| Email capture | Cloudflare Email Routing → Worker | Free, unlimited inbound, routes to a Worker that calls Claude |
| Scheduled jobs | Vercel Cron | Nightly Akahu sync, nightly AI cards, monthly recap |
| Charts | Recharts + d3-sankey | Recharts for everyday, d3-sankey for income→category flow |
| Hosting | Vercel | Already wired |

**Architectural rules:**
- Bank feeds behind an abstract `BankFeedProvider` interface so Akahu is replaceable.
- AI features behind a thin Claude wrapper with prompt caching.
- Server Components by default; Client Components only where interactivity demands it.
- No Redux / Zustand — Server Components handle most state.

**Deliberately NOT in scope:** native mobile apps (PWA only), receipt scanning, multi-budget scenarios, group/family beyond Sean+Jenny, custom auth, separate API service, edge runtime for primary logic.

---

## 4. Data Model

```
Profile (user)
  - id, email, role (owner | partner)
  - notification_prefs (per-event opt-in/out)

Household
  - id, name (e.g. "Sean & Jenny")
  - owner_profile_id
  - partner_profile_ids[]

Account
  - id, household_id, owner_profile_id
  - provider (akahu | manual_cash | service_account)
  - akahu_account_id (nullable)
  - name, type (transactional | savings | credit | kiwisaver | service)
  - tag (sean | jenny | shared)
  - is_locked (bool, true for KiwiSaver — counted in net worth, not runway)
  - balance, balance_synced_at

ServiceAccount (extends Account where type='service')
  - provider_email_pattern (e.g. "@mercury.co.nz")
  - inbound_alias (e.g. "bills.power@bills.app")
  - avg_monthly_burn (calculated)
  - last_topup_at, last_bill_at

Transaction
  - id, account_id, household_id
  - posted_at, amount (negative = outflow)
  - merchant_raw, merchant_clean, description
  - category_id, attributed_to_profile_id (defaults to account owner)
  - confirmed (bool — unconfirmed = pending/unreviewed)
  - parent_transaction_id (for splits)
  - labels[] (free-form tags: #joint, #holiday2026)
  - is_recurring_link (linked recurring_id), is_transfer
  - source (akahu_sync | csv_import | email_capture | manual)

Category
  - id, household_id, name, parent_id, type (income | expense | transfer)
  - is_fixed_cost (bool — counted toward Fixed Cost Ratio)

Recurring
  - id, household_id, merchant_pattern, expected_amount_min/max
  - frequency (weekly | fortnightly | monthly | custom_days)
  - next_expected_at, variance_alert_threshold

Bill (for service accounts — auto-captured invoices)
  - id, service_account_id
  - amount, billing_period_start/end, due_date
  - source_email_id, raw_pdf_url, claude_extracted_json
  - applied_to_balance_at

Rule
  - id, household_id
  - match (merchant pattern + amount range + date window)
  - actions (set_category | add_label | mark_transfer | attribute_to)

Budget
  - id, household_id, category_id
  - period (weekly | fortnightly | monthly | custom_days)
  - start_date, end_date (nullable)
  - target_amount, mode (cap | rollover_above | rollover_below)

Goal (Save-Up)
  - id, household_id, name, target_amount, target_date
  - source_account_id, monthly_contribution
  - current_progress, status (on_track | at_risk | achieved)

HealthSnapshot (daily)
  - id, household_id, taken_at
  - score (0–100)
  - runway_days, savings_rate_30d, spending_vs_baseline_pct,
    fixed_cost_ratio, net_worth_trend_90d_slope
  - net_worth_liquid, net_worth_locked
  - safe_to_spend_today

AICard (proactive insights surfaced on dashboard)
  - id, household_id, generated_at
  - kind (anomaly | nudge | celebration | alert)
  - title, body, severity (info | warn | alert)
  - source_data_json, dismissed_at, expires_at

AIRecap (monthly delivered artifact)
  - id, household_id, month
  - generated_at, body_markdown, push_sent_at
  - score_change, top_3_callouts_json
```

Salvaged from v1.0 schema: `Account`, `Transaction`, `Category`, `Budget` are conceptually unchanged. Migrations move the data.

New in v2: `Household`, `Profile.notification_prefs`, `ServiceAccount`, `Bill`, `Rule`, `Goal`, `HealthSnapshot`, `AICard`, `AIRecap`, `Transaction.confirmed`, `Transaction.attributed_to_profile_id`, `Transaction.labels[]`, `Transaction.parent_transaction_id`, `Account.tag`, `Account.is_locked`.

---

## 5. Screens & UX

### 5.1 Dashboard (the only screen most days)

**One scrollable page. Mobile-first. Everything else is one click away.**

Top to bottom:

1. **Hero block:**
   - Big number on the left: `Safe to Spend Today: $342`
   - Big number on the right: `Health Score: 82` with arrow trend (▲ +3 vs last week)
   - Below the score: tiny breakdown showing the 5 vital signs as a row of mini-bars (so when the score drops, you see *which* signal fell — research insists on this).

2. **Vital signs row** (5 cards, each clickable for detail):
   - **Runway:** `47 days of fuel` (cash-buffer-days framing)
   - **Savings rate (30d):** `18%`
   - **Spending vs baseline:** `+4%` (vs trailing 6-month median)
   - **Fixed-cost ratio:** `42%`
   - **Net worth trend (90d):** sparkline

3. **AI insight cards** (1–3 cards, dismissable, generated nightly):
   - "Power bill went up $14 from last month"
   - "On pace to underspend groceries by $80"
   - "Water service account at 3 weeks runway — top up soon"

4. **Service Accounts row:** Power / Water / Gas mini-cards with balance + weeks-of-burn (the mockup we sketched).

5. **Upcoming this week:** 4 most imminent recurring bills + service-account top-ups.

6. **Recent transactions:** last 7 days, condensed. "View all" link goes to Transactions page.

### 5.2 Forecast (click-in from Runway)

90-day balance projection chart. Line goes from today forward, factoring in:
- Recurring transactions
- Predicted service-account top-ups (based on burn rate)
- Recurring bills
- Scheduled budgeted spending

Visual: red fill if projected balance dips below zero. Calendar view toggle showing the same data as a monthly grid.

### 5.3 Coach (D — AI panel)

Three tabs:
- **Insights** — full list of dashboard cards, plus dismissed history.
- **Recap** — current month + previous months' recaps.
- **Ask** — chat. Pre-baked prompts ("Can we afford a $1,200 trip in June?" "What did we overspend on last month?"). Always-attached context: current snapshot, top categories, recent transactions, goals.

### 5.4 Accounts

List of all accounts grouped by type. Tags (Sean / Jenny / Shared). Manage Akahu connections, manual cash wallet, service accounts. KiwiSaver shown but greyed (locked).

### 5.5 Transactions

Full transaction list with filters. Confirmed/unconfirmed split. Inline category, label, split, attribution. Apply-to-future prompt after manual category change.

### 5.6 Categorize

Dedicated page for unconfirmed + uncategorised. Keyboard-friendly. Same "apply to future" prompt.

### 5.7 Reports

- Sankey diagram (income sources → spending categories)
- Spending vs baseline by category (the "vs your normal" framing)
- Net-worth trend (long-form, with KiwiSaver as a separate band)

### 5.8 Settings

- Akahu connections
- Service-account email aliases + provider mappings
- Notification preferences (per person, per event)
- Categories + rules
- Budgets + goals
- Household members
- Calendar export (Google / Apple, one-click)

### 5.9 Three views

A view switcher in the top nav: **Household** (default) / **Sean** / **Jenny**. The score and vital signs always reflect the household. Personal views filter accounts and transactions to that person's tagged scope.

---

## 6. Service Accounts & Auto-Capture (the differentiator)

This is the headline feature. Most apps can't model credit-balance services. Yours will.

### 6.1 Data model behaviour

- Each service account has its own balance and burn rate.
- Balance changes via two events: top-ups (money in) and bills (money out).
- Burn rate = trailing 3-month average of bills.
- "Weeks-of-burn left" surfaced on the dashboard tile.

### 6.2 Top-ups (automated via Akahu)

- When Akahu sees a debit matching a service-account provider pattern (`MERCURY ENERGY $250`), the app prompts: "Top up Power by $250?" — one tap.
- After the first confirmation, a rule auto-applies subsequent matching transactions.

### 6.3 Bills (automated via email + Claude)

**Setup (once per provider):**
1. App generates a unique inbound alias: `bills.sean+power@bills.yourdomain.app`.
2. User adds a Gmail filter: `from:mercury.co.nz → forward to bills.sean+power@...`.
3. App stores the mapping (alias → service account).

**Per-bill flow (automated forever):**
1. Provider emails the invoice (PDF or HTML body).
2. Cloudflare Email Routing catches it at the alias.
3. Cloudflare Worker fires a webhook to the app's `/api/email-capture` endpoint with the raw email + attachments.
4. Endpoint calls Claude (Sonnet 4.6, vision-enabled) with the PDF attachment.
5. Claude returns structured JSON: `{provider, service_account, amount, due_date, billing_period, current_balance}`.
6. App creates a `Bill` record, decrements the service account balance by the amount, files the due date in the calendar, fires an alert if the balance is now under 4 weeks of burn.

**Fallback for the rare PDF Claude can't read:** record stays in a "needs review" queue with the original PDF attached; user fixes it in 10 seconds.

**Fallback for providers that don't email:** a 30-second manual entry form (amount, date, account).

### 6.4 Why this is moat-level

No other app does this. Combines three things competitors don't have together: NZ-specific service-account model, AI-vision PDF extraction, and bank-feed top-up detection. Even PocketSmith doesn't model credit balances. This is the headline feature when explaining the app.

---

## 7. AI Integration (Claude)

Three modes, not chat-as-UI.

### 7.1 Reactive (Chat) — Coach > Ask

User asks a question. Always-attached context (cached in Anthropic prompt cache, refreshed daily):
- Current health snapshot (score + 5 vital signs)
- Top 5 spending categories last 30 days
- Upcoming bills next 14 days
- All goals + progress
- Recent unusual transactions (>2σ from baseline)
- Service-account balances + burn rates

Tools the model can call:
- `getTransactions(filter)`, `getBalance(accountId)`, `simulatePurchase(amount, category)`, `forecastBalance(daysAhead)`, `findRecurring(merchant)`.

Killer prompt: "Can we afford a $1,200 trip in June?" — model uses runway + forecast + goals to answer.

### 7.2 Proactive (Insight Cards) — Dashboard

Vercel Cron runs nightly at 6am NZST. Pipeline:
1. Compute today's `HealthSnapshot`.
2. Diff against yesterday + 7-day rolling.
3. Send the diff + recent transactions to Claude with prompt: "Surface the 1–3 most useful things this household should know today." Strict JSON output schema.
4. Store as `AICard` rows; dashboard reads top 3 undismissed.

Card kinds: anomaly (Power up $14), nudge (top up Water this week), celebration (savings rate hit 20%), alert (balance forecast dips below zero on the 25th).

### 7.3 Scheduled (Monthly Recap) — Coach > Recap

Vercel Cron runs on the 1st of each month at 7am NZST.
- Pulls last month's full transaction set + snapshots + goals.
- Calls Claude (Opus 4.7 — bigger context, better summarisation).
- Generates a markdown recap: score change, biggest wins, biggest concerns, AI's top 3 things to do this month.
- Push notification sent. Tappable opens the recap.

### 7.4 Cost control

- All inputs to Claude use prompt caching for the financial-state context (the bulky bit). Only deltas are billed.
- Sonnet 4.6 default; Opus 4.7 only for the monthly recap (1 call/month).
- Vercel AI Gateway handles routing + observability + provider fallback.

---

## 8. Health Score Formula

Headline score, 0–100, weighted blend of 5 normalised vital signs:

| # | Signal | Calculation | Weight | Bands |
|---|---|---|---|---|
| 1 | Runway (cash buffer days) | liquid_cash ÷ avg_daily_essential_outflow | 30% | <14d red, 14–90d amber, ≥90d green |
| 2 | Savings rate (30d) | (income − spending) ÷ income | 25% | <5% red, 5–15% amber, ≥15% green |
| 3 | Spending vs baseline | this_month_spend ÷ trailing_6mo_median, category-aware | 10% | ±10% green, ±10–25% amber, >25% red |
| 4 | Fixed-cost ratio | fixed_outflows ÷ income | 15% | >70% red, 50–70% amber, <50% green |
| 5 | Net-worth trend (90d) | linear-regression slope of net_worth over 90d | 20% | negative red, flat amber, positive green |

**KiwiSaver = locked.** Counted in net worth, NOT in runway.
**Show the breakdown, not just the number.** When the score drops, the dashboard must immediately show which signal moved.

**Optional onboarding question** (CFPB item 6): "Because of my money situation, I feel like I will never have the things I want in life — how true is this for you?" Stored as `felt_confidence_baseline`. Re-asked quarterly. Used by the AI Coach as a soft signal, not in the score formula.

---

## 9. Household Model (Sean + Jenny)

- One household, one budget, one score.
- Two `Profile` rows under one `Household`.
- Each `Account` is tagged Sean / Jenny / Shared.
- Each `Transaction` has `attributed_to_profile_id`, defaulting to whoever owns the account.
- Three views: Household (default), Sean, Jenny.
- Independent notification preferences per profile (Sean wants bill alerts, Jenny wants weekly digest only).
- The AI Coach, when one user is logged in, knows whose context to use ("can I afford" = personal; "can we afford" = household).

Jenny does NOT have to mirror Sean's categorisation work or split every transaction. Trust attribution defaults.

---

## 10. Migration Plan (data + cutover)

### 10.1 Data migration (one-shot script)

A migration script reads from the live Supabase project and writes to the new schema.

| Old | New | Notes |
|---|---|---|
| accounts | accounts | Add `household_id`, `tag`, `is_locked`. KiwiSaver entries get `is_locked=true`. |
| transactions | transactions | Add `household_id`, `attributed_to_profile_id` (default = account owner), `confirmed=true` for all historical, `labels=[]`. |
| categories | categories | Add `household_id`, `is_fixed_cost`. |
| budgets | budgets | Add `period='monthly'` for existing rows. |
| service_accounts (existing) | accounts where type='service' | Plus new `service_account` extension fields. |

Rules, recurring detection, snapshots, AI cards, AI recaps, goals, household, profiles → seeded fresh.

### 10.2 Cutover sequence

1. Build new app to "feature-equivalent" milestone (Phases 1–4 below).
2. Run migration in dry-run mode against a Supabase fork; verify counts and totals match.
3. Run migration for real; new app reads/writes the new schema.
4. Deploy new app under a new Vercel domain (e.g. `finance-v2.vercel.app`).
5. Use both apps in parallel for ~1 week. Confirm no drift.
6. Switch the production domain to point at v2. Old app becomes archive.
7. After 2 weeks of stable use, decommission old app.

---

## 11. Build Phases

Each phase is independently shippable. Order matters: foundation → core score → automation → coach.

| Phase | Theme | Outputs | Shipped =? |
|---|---|---|---|
| **1. Bones** | New project scaffolded | Next.js + Supabase + auth working. Empty schema. Login → empty dashboard. | Sean can log in. Nothing else. |
| **2. Salvage migration** | Data ported | Run the migration script. New app reads existing data with new schema. | All historical accounts + transactions + categories visible. |
| **3. Akahu** | Foundation (C) | Live bank feeds. Daily sync via Cron. Auto-categorisation rules engine. | Manual CSV import is no longer required. |
| **4. Health Score** | Core (B) | The dashboard. Score + 5 vital signs + Safe-to-Spend + Service Account row. Daily snapshot job. | Sean opens app, sees the answer to "how are we?" |
| **5. Service Account auto-capture** | The differentiator | Cloudflare Email Routing wired. Worker → Claude vision pipeline. Bills auto-applied. Top-up detection. | Sean and Jenny stop entering bills manually. |
| **6. AI Coach v1** | Feature (D-1) | Proactive nightly cards on the dashboard. Coach > Ask chat with full context + tools. | Useful insights appear without asking. |
| **7. Forecast + Calendar** | Feature (A) | 90-day forecast chart, calendar view, one-click Google Calendar export of bills. | Sean and Jenny can see "what's coming." |
| **8. Reports** | Feature | Sankey diagram, spending vs baseline by category, net-worth trend long-form. | Drill-downs available. |
| **9. AI Coach v2** | Feature (D-2) | Monthly recap. Push notifications. Behavioural milestones. | First monthly recap lands on the 1st. |
| **10. Household polish** | Two-user UX | Three-view switcher. Per-person notif prefs. Manual cash wallet. KiwiSaver-as-locked visualisation. | Jenny logs in and feels at home. |
| **11. Cutover** | Production handoff | Domain switched. Old app retired. | Sean uses only v2. |

Phases 1–4 = MVP. Sean could dogfood from Phase 4.
Phases 5–6 = the magic that makes it different.
Phases 7–11 = polish + the second 80%.

---

## 12. Out of Scope (cut list — research-backed)

Don't build:
- Bill negotiation as a feature
- Cash advances / credit-builder products
- Credit-score tracking
- AI personalities (roast/hype)
- Tax filing (Hnry / IR3 own this in NZ)
- Investment robo-advice / portfolio recommendations
- Envelope budgeting as the default mental model
- Heavy customisation surface (opinionated > configurable)
- Multi-budget scenarios
- Receipt scanning OCR
- Crypto / DeFi tracking
- Native iOS / Android (PWA only)
- Long-term retirement Monte Carlo
- Group / family beyond Sean + Jenny
- Edge runtime for primary logic
- Custom auth (Supabase covers it)

---

## 13. NZ-Specific Notes

- **Akahu sync is once per 24h.** Frame as "synced daily," not real-time.
- **KiwiSaver isn't on Akahu's standard tier.** Default to manual entry; offer Akahu integration as an upgrade later.
- **Bank history depth varies** — ASB 12 months, Kiwibank credit cards 180 days, SBS ~6 months. Don't promise "all your history forever."
- **Two-week pay cycles are common.** Runway metric handles this naturally; budget views must.
- **Date format DD/MM/YYYY**, currency NZD with $ symbol, timezone Pacific/Auckland.
- **GST awareness** — if Sean or Jenny has side income and approaches $60k/12mo, surface a soft warning ("approaching GST threshold").
- **No NZ credit-score equivalent** — don't bother building it.
- **Sharesies / Hatch** are common — link out, don't compete.
- **Akahu is sole-source for NZ.** Keep the data layer abstract behind a `BankFeedProvider` interface.

---

## 14. Success Criteria

The rebuild is a success when:

1. Sean opens the app and within 5 seconds knows whether things are healthy or off.
2. He hasn't manually entered a bill or a transaction in 60 days. The system runs itself.
3. The monthly recap is something he actually reads (vs the v1.0 reports which felt like work).
4. Jenny logs in and feels equally at home, not like a guest in Sean's app.
5. Score breakdown is honest enough that a drop from 82 → 76 immediately tells you which vital sign moved and why.
6. The 90-day forecast has been wrong by less than 10% over a 3-month real-world test.
7. v1.0 has been retired and Sean has not asked for it back.

---

## 15. Open Questions (for review)

- **Domain name for inbound bill aliases.** `bills.yourdomain.app`? Reuse the existing `finance-two-jet.vercel.app` or buy a proper domain (`finance.sean.nz`, etc.)?
- **Should Jenny's onboarding require a separate Akahu connection or share Sean's?** Akahu allows both — research recommends both partners authenticate separately for a complete view.
- **Onboarding "felt confidence" question** — include in v1, or defer? It's optional but useful for the AI Coach.
- **Which Claude tier for monthly recap?** Spec says Opus 4.7. Sonnet 4.6 might be sufficient. Pick after testing.
- **Migration timing.** All-at-once before Phase 3 (Akahu), or run dual-schema for safety? Spec assumes the former.
- **Should manual cash wallet (Phase 10) move earlier?** Some couples spend a lot of cash. If you do, move it forward.

---

## 16. Appendix — References

- Research report: `.planning/research/2026-04-29-app-landscape.md`
- Old app state: `STATE.md`, `.planning/REQUIREMENTS.md`
- PocketSmith competitive research: `~/vault/wiki/finance/pocketsmith-takeaways.md`
- v1.0 design system (kept as a starting point): `DESIGN.md`
- Memory: `feedback_use_resources.md`, `project_finance_dashboard_philosophy.md`, `feedback_deploy.md`, `feedback_sw_cache.md`
