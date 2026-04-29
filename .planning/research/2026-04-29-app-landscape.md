# Personal Finance App Landscape — Research for the Health Monitor PWA
**Date:** 2026-04-29
**Author:** Research agent (for Sean)
**Purpose:** Map the competitive landscape, surface what's worth stealing, flag what to skip, and identify NZ-specific gotchas before Sean rebuilds his finance app.

---

## TL;DR for Sean — read this before anything else

1. **Your "dashboard IS the app" thesis is correct and underexploited.** Every app on the market still treats the dashboard as a launchpad to long lists. Copilot is closest to your vision but still drops users into transaction streams. A *true* health-score-first app does not exist.
2. **The strongest ideas to steal are:** Simple's *Safe-to-Spend* (resurrect this), Copilot's *recurring detection + AI monthly summary*, Monarch's *household model* (one budget, separate logins), PocketSmith's *daily forecast line into the future*, JPMorgan Chase Institute's *"cash buffer days"* (use this as your runway metric).
3. **Akahu is good enough to be your foundation but has two real gaps:** KiwiSaver is not on the standard plan (needs broader-coverage tier), and bank-by-bank historical depth is uneven (ASB 12 mo, Kiwibank credit cards 180 days). Plan around it.
4. **Avoid the bloat trap.** Most apps have 5x the features they need. Cut bill negotiation, cash advances, credit-builder, "AI roasts," tax filing, investment robo-advice. None of it serves your "health monitor" vision.
5. **For the score itself**, build a *blended index* of 5 metrics weighted explicitly. Don't copy the CFPB scale verbatim — it's perception-based, not behavioural. Build something behavioural with one perception question.

---

## 1. Best-in-class apps to study

### Top 5 takeaways
- **Copilot Money** is the design benchmark; its rules engine and recurring detection are the gold standard. Steal both. Skip the iOS-only constraint by going PWA from day one.
- **Monarch** wins for households: one shared budget, separate logins, per-person notification preferences, "Shared" labels on accounts. Copy this pattern wholesale for Sean + Jenny.
- **Lunch Money** is the closest indie spirit-twin to what Sean is building: small team, opinionated, public API, collaborator-per-budget pricing. Learn from how they keep scope tight.
- **YNAB** is the only app with a *philosophy* (zero-based + age-your-money). The lesson is not the philosophy itself but that a single strong opinion creates more loyalty than feature parity.
- **Cleo** is mostly gimmick (roast mode), but the *proactive* nudging model — surfacing concerns before users ask — is exactly what an AI Coach should do. Strip the personality, keep the proactivity.

### App-by-app verdict

| App | Distinctive | Steal | Skip |
|---|---|---|---|
| **Copilot Money** ($13/mo, iOS) | Best design in category. Rules engine that filters by name/amount/date ranges. Recurring detection runs during onboarding then continuously. AI monthly summaries (plain-English, calls out subs to cancel). Amazon + Venmo deep integrations. App opened 1.4x/day vs YNAB 0.6x. | Recurring detection algorithm; rules engine UX; AI monthly summary as a *delivered artefact*, not a chat feature; haptic feedback on categorisation; "rebalance" magic wand that redistributes budget on actual spending without changing the total. | iOS lock-in (you're PWA); Plaid (no NZ coverage); category-based budgeting if you want envelope semantics. |
| **Monarch Money** ($15/mo, all platforms) | True household mode (one budget, one subscription, separate logins, separate notification prefs, "Shared" account/transaction label). AI Assistant + AI Insights (sparkle icon on cards) + Weekly Recap. MCP server for Claude Desktop already exists. Save-Up Goals with target/date/monthly-contribution + on-track/at-risk states. | Entire household model; the three-AI-feature breakdown (Assistant = Q&A, Insights = embedded, Recap = scheduled); Save-Up goals UX; "Shared" tagging vs joint accounts. | Comprehensive long-term planning dashboard (over-scope for v1); investment recommendations. |
| **Lunch Money** ($10/mo) | Per-budget pricing (collaborators don't pay). Public developer API (v2 alpha). Predicted Recurring detected after 2 months of repeats. Rollover categories for sinking funds. Highly flexible/customisable. Indie ethos. | Collaborator-without-subscription pricing model; rollover categories as the sinking-fund mechanism; public API as a way to enable power users. | Heavy customisation surface (Sean wants opinionated, not flexible). |
| **Quicken Simplifi** ($72/yr after promo) | "Spending Plan" = hybrid zero-based + pay-yourself-first. Projected cash flow showing how today's choices affect next month. Lighter than YNAB. | Hybrid budgeting model; *projected* cash-flow line (this is your 90-day forecast). | Promotional pricing trickery. |
| **Origin** ($99/yr) | All-in-one: budgeting + AI advisor (Sidekick) + index investing + tax filing + estate planning + CFP sessions. SEC-regulated AI advisor. | The Sidekick chat pattern (questions → personalised reports). | Everything else — Origin is a kitchen sink. Avoid this template. |
| **Rocket Money** | Bill negotiation as a service (35–60% of year-1 savings as fee). Subscription detection. | Subscription cancellation surfacing. | Bill negotiation as a feature you build (it's a service play, not a software play; not viable in NZ market either). |
| **Empower (formerly Personal Capital)** (free dashboard, paid wealth mgmt) | Best-in-class net-worth dashboard. Investment Fee Analyzer (shows lifetime drag of fees). Monte Carlo retirement projections. | Net-worth chart as a single trend line over time; fee analyzer as a one-shot insight. | Wealth management upsell. |
| **YNAB** ($109/yr) | Four rules: assign every dollar, embrace true expenses, roll with punches, age your money. *Philosophy-first*. Very high retention. | "Age your money" metric (= cash buffer days, basically); "true expenses" framing for sinking funds. | Zero-based budgeting as your default — too prescriptive for your vision. |
| **Cleo** (free + $14.99/mo) | Conversational AI chat as primary surface. Roast mode / Hype mode. Cash advances ($250). Haggle It. Proactive nudges ("you've splurged on takeout, here's a reminder"). | Proactive nudge model — *AI volunteers concerns before being asked*. This is the killer pattern. | Personality (roasts/hype) — gimmicky and ages badly; cash advance & credit-builder products. |
| **Cushion** (acquired by LendingClub 2025) | Calendar sync of bills (one click → Google Calendar). BNPL tracking. Free-trial alerts. | Bills-to-calendar one-click export; pre-charge alerts on free trials. | Credit-builder pivot. |
| **Tiller** ($79/yr) | Spreadsheet-native. AutoCat rule engine. Daily transaction sync into Google Sheets / Excel. Split transactions. | The mental model: *transactions are data, the dashboard is a view over them* — keep raw data accessible/exportable. | Spreadsheet as the primary surface. |
| **PocketSmith** (NZ-built, $9.95–$16.66/mo) | Built in NZ. Akahu integration. Daily balance forecast 6/12/30 years out. Read-only bank connection. Strong NZ bank coverage. | Daily-balance forecast line as the canonical "future" view; Akahu integration patterns; read-only positioning. | UI dated, app store rating only 3.3; over-reliance on forecasting as a selling point. |

---

## 2. Financial health scoring — what actually works

### Top takeaways
- **CFPB Financial Well-Being Scale is perception-based** (10 questions about how secure you *feel*). It's a research instrument, not a real-time score. Use it for one onboarding survey, not for the live dashboard.
- **Behavioural metrics beat perception metrics** for a daily dashboard. The JPMorgan Chase Institute's *cash buffer days* (≥14 days = on-par with prime credit risk) is the single most rigorous, evidence-backed health metric in the literature.
- **Common app stacks weight DTI 30% / Savings Rate 25% / Net Worth 25% / Emergency Fund 20%.** This is a reasonable starting point but doesn't include *expense volatility* or *runway*, which matter more for resilience.
- **Don't show a single number alone.** Garmin Body Battery works because it's accompanied by 5 vital signs (HR, HRV, respiration, skin temp, SpO2). Apply the same structure: one headline score + 5 underlying signals.

### Recommended 5 metrics for the dashboard (Sean's "vital signs")

| # | Metric | What it measures | Source / Inspiration | Target |
|---|---|---|---|---|
| 1 | **Runway (Cash Buffer Days)** | (Liquid cash) ÷ (avg daily essential outflow). How many days you survive with zero income. | JPMorgan Chase Institute | ≥14 days = stable, ≥90 days = strong, ≥180 days = elite |
| 2 | **Savings Rate (rolling 30-day)** | (Income − Spending) ÷ Income | Industry standard | 15–20% green, 5–15% yellow, <5% red |
| 3 | **Spending vs Baseline** | This month's spend vs trailing 6-mo median, expense category-aware | Original — closest analogue is Copilot recurring deviation | ±10% green |
| 4 | **Fixed Cost Ratio** | Fixed/recurring outflows ÷ income (rent, utilities, subs, insurance, debt) | Adapted from DTI | <50% green, 50–70% yellow, >70% red |
| 5 | **Net Worth Trend (90-day)** | Slope of net worth over last 90 days | Empower | Positive = green, flat = yellow, negative = red |

**Plus one optional perception question on first run:** "How well does this statement describe you: 'Because of my money situation, I feel like I will never have the things I want in life.'" (CFPB item 6). Store this as a baseline; re-ask quarterly. Use the delta as a "felt confidence" signal in the AI Coach.

**Headline score formula (suggested):** Weighted blend, normalised 0–100. Start at: Runway 30% / Savings Rate 25% / Net Worth Trend 20% / Fixed Cost Ratio 15% / Spending vs Baseline 10%. Tune with real data over time. **Critically: show the breakdown, not just the number.** If the number drops, the user must immediately see *which signal* fell.

**Garmin parallel to steal:** Body Battery is described as a "gas gauge for energy reserves." Frame Runway the same way: "You have 47 days of fuel." This grounds an abstract number in visceral language.

---

## 3. Bill / service tracking (no-API accounts)

### Top takeaways
- **The dominant pattern is "predicted recurring":** detect after 2 monthly repeats (Lunch Money) or during onboarding (Copilot), then track expected vs actual amount and surface deltas.
- **The killer feature for Sean's no-API problem is *amount-change alerts*, not the negotiation play.** Power went up $14? Alert. That's the value.
- **For pure no-bank-feed bills (e.g. NZ power providers without card payment), give users a 30-second "log this bill" form.** Cushion does this with calendar sync — copy the calendar export.
- **Subscription cancellation = the most-loved feature in this category.** Cushion + Rocket Money both lead with it. Surface idle subs (no use detected for X months via merchant patterns) proactively.

### Recommended pattern for Sean

1. **Auto-detect recurring transactions** from Akahu transactions after 2 repeats with similar merchant (use Copilot's filter idea: name fragment + amount range + date window).
2. **Add a "Bill" object** with: expected amount, expected date, last seen amount, variance threshold. When the next match arrives, compare and alert if outside threshold.
3. **Manual bill entry** for non-bank-feed bills (e.g. landlord rent paid via direct debit but want extra metadata, council rates, occasional contractor invoices). Form takes <30 sec: name, amount, frequency, next due, optional notes/PDF attachment.
4. **Calendar export** (Google/Apple) of all upcoming bills as a one-click action. This was Cushion's most-praised feature.
5. **Idle subscription detection**: if a recurring transaction has hit but the merchant hasn't appeared in any *non-recurring* transactions (Spotify, Netflix → look for typing patterns or just frequency), flag as candidate to cancel. Show in monthly AI summary.

**UX pattern to copy:** Copilot's "predicted spending" — at the start of the month, the budget already reflects expected recurring outflows so the user sees the *real* discretionary remainder, not a phantom one. This is the "Safe-to-Spend" core mechanic.

---

## 4. Akahu (NZ open banking) — capabilities, limits, gaps

### Top takeaways
- **Akahu is good enough to be your foundation.** Westpac-backed, Wellington-built, used by PocketSmith, Sharesies, SortMe. Pay-as-you-go pricing ($0.15/payment, free for data dev/testing on paid app).
- **Default sync is once per 24 hours** but can be more frequent if other apps refresh shared accounts ("optimistic refreshes"). Manual refresh endpoint exists. **Do not promise real-time.**
- **The two biggest gaps are KiwiSaver (not on standard integrations list) and managed funds.** Sean will need either (a) the higher Akahu tier with broader coverage, or (b) manual entry for KiwiSaver balance updates.
- **Bank-specific quirks:** ASB transactions limited to 12 months on first request. Kiwibank credit card capped at 180 days. SBS ~6 months. Plan UI around these limits — don't show a "5-year history" promise.
- **Joint accounts work fine** for data — Akahu sees each user's authorised view. Sean and Jenny both authenticate separately and Akahu treats each session independently. PocketSmith documents the pattern: each partner adds their own credentials to the same connection.

### Bank coverage (enduring access)
ANZ, ASB, BNZ, Co-operative, Heartland, Kiwibank, NZHL, Rabobank, SBS, TSB, Westpac. Sean's two banks (Kiwibank + ANZ) are both fully supported.

### Pricing (pay-as-you-go)
- Free for development/testing.
- $0.15 per successful payment request.
- $1.00 per identity/account verification.
- $5.00 per loan application data pull.
- *Data feeds for ongoing app use*: contact Akahu for tier pricing — public site doesn't list per-user-per-month rates explicitly. Plan for ~$1–3/user/month at small scale based on industry norms.

### Limitations to design around
- 24-hour minimum data freshness — frame as "synced ~daily."
- KiwiSaver not in standard integrations — show KiwiSaver as a manual-entry account by default with the option to link via expanded coverage later.
- ANZ business accounts: only goMoney-accessible accounts work; multi-signatory accounts excluded.
- $100k per-payment cap (irrelevant unless Sean adds payment initiation later).

### Alternatives
There is no real alternative for NZ retail. Banked.com (Kiwi fintech) and Volt (NZ payments) operate in payment initiation but don't offer aggregated data feeds. **Akahu is effectively a sole-source dependency.** Mitigate by keeping the data layer abstract (a `BankFeedProvider` interface) so a swap is theoretically possible.

### Investment platforms supported via Akahu
Sharesies, Hatch, Booster, Fisher Funds, and 9 others. KiwiSaver providers vary. Many lack "party data" (account-holder identity).

---

## 5. Joint-account / two-person UX

### Top takeaways
- **Monarch's "household" model is the gold standard:** one subscription, one shared budget, separate logins, separate notification settings, accounts/transactions tagged "Shared" vs personal.
- **Lunch Money's "collaborator" pattern** is also good and pricing-fair (collaborator doesn't need own subscription). Each gets their own login on the same budget.
- **The single most-praised pattern across all couple-app reviews is "who-spent-what attribution"** — even on a joint card, transactions can be tagged by person. Steal this.
- **Avoid "two separate apps that sync."** Every app that tried this (early Tally, Honeydue) had retention problems. One shared surface, two logins.

### Recommended pattern for Sean + Jenny

1. **One household, one budget, one score, two logins.** Sean and Jenny each log in with their own credentials.
2. **Account tagging**: each linked account is tagged Sean / Jenny / Shared. Default Akahu connections inherit the user who linked them.
3. **Transaction "attributed-to" tag**: optional, set per-transaction. Default to whoever's account it came from. For a joint card, allow either to claim it.
4. **Three views**: Household (default), Sean's view, Jenny's view. Score is calculated household-wide; vital signs are too. Personal views show only that person's tagged accounts/transactions.
5. **Per-person notification settings**: Sean might want bill alerts; Jenny might only want monthly recap. Independent prefs.
6. **AI Coach context**: when Jenny asks "can we afford X", the coach has full household context but answers in plural. When Sean asks a personal question, it answers in singular and only references his accounts.

**Do not** require both partners to mirror their categories or split every transaction. That's the YNAB-couple grind. Trust transaction attribution + shared categories.

---

## 6. AI integration — useful vs gimmick

### Top takeaways
- **The useful pattern is "proactive surfacing + on-demand Q&A," not chat-as-primary-UI.** Cleo's chat-only model fatigues users. Monarch's three-mode approach (Assistant / Insights / Weekly Recap) is the right architecture.
- **The single most useful AI artefact is the monthly recap** (Copilot, Monarch). Plain-English summary delivered on a schedule. Users open it, read it, feel informed. Low effort, high perceived value.
- **"Can I afford this?"** is the killer prompt. It requires the model to know your runway, upcoming bills, savings goals, and recent spending velocity. Claude is well-suited because of long-context reasoning over the full transaction set.
- **Personality is a trap.** Cleo's roasts gather press but reviews call out the *judgement errors* (roasting a user for "overspending" on their mortgage). Avoid persona-driven AI; favour neutral, calm tone.

### What to feed Claude (context)

Sean's current vision (Claude-powered AI Coach) lines up with what's working in the market. To make it shine:

- **Always-attached context** (in system prompt or via MCP-style tool call): current health score + breakdown, runway days, top 5 spending categories last 30 days, upcoming bills next 14 days, savings goals + progress, recent unusual transactions (>2σ from baseline).
- **Tools the model can call**: `getTransactions(filter)`, `getBalance(accountId)`, `simulatePurchase(amount, category)`, `forecastBalance(daysAhead)`, `findRecurring(merchant)`.
- **Three usage modes**:
  1. **Reactive (chat)**: "Can I afford a $1,200 trip in June?"
  2. **Proactive (insight cards)**: model runs nightly, surfaces 1–3 cards on the dashboard ("Power bill went up $14 from last month", "You're on pace to underspend groceries by $80").
  3. **Scheduled (weekly + monthly recap)**: pre-rendered summary, push notification, tappable.

**Prompt-caching is essential** here — the user's full financial state is mostly stable across queries, so cache the system prompt + transaction summary and only pay for the user question + recent deltas. Sean's already on the $99 plan; this matters for cost.

### What to skip
- Roast/hype personalities (Cleo).
- AI-generated "investment recommendations" (Origin) — regulatory risk, low confidence, not your scope.
- AI advisor positioning (Origin claims an SEC-regulated AI). Don't go there.
- Full-Q&A-replaces-UI patterns — chat is *an* affordance, not *the* affordance.

---

## 7. Things Sean might be missing — Top 10 punch list

These are ideas that don't fit neatly into Sean's current four buckets but could substantially raise the ceiling on the app.

1. **"Safe-to-Spend" today number on the dashboard.** Resurrect Simple Bank's killer pattern. Account balance minus reserved (for goals + upcoming bills) = a single "you can spend $X today" number. This is *the* feature former-Simple users still mourn 5 years later. Doesn't fit "score" or "tracker" buckets but belongs *next to* the score.
2. **Cash buffer days as the runway metric.** Frame in days, not dollars. "47 days of fuel" beats "$8,200 emergency fund" emotionally and is research-backed.
3. **Calendar export of bills.** Cushion's most-loved feature. One-click → Google Calendar. Cheap to build, disproportionate value.
4. **Sinking funds as rollover categories** (Lunch Money pattern, also YNAB Rule 2). Set aside $50/mo for car rego, balance accumulates, doesn't count against this month's spending.
5. **Behavioural milestones, not feature-completion badges.** "First month with positive savings rate," "30-day streak under fixed-cost budget." Tie to score breakdown, not to app actions.
6. **Net worth as a single trend line, not a list.** Empower's pattern. The number matters less than the slope.
7. **Manual cash account.** Some spending happens cash. Let users add a "Wallet" account, log withdrawals from bank as transfers in, and tag cash spending after the fact. This is the #1 friction point in any auto-feed-only app.
8. **Joint visibility without forced merging.** Sean + Jenny see each other's accounts, but neither has to re-categorise the other's transactions. Trust attribution defaults.
9. **"This month vs your normal" framing instead of "this month vs budget."** Budget is aspirational; baseline is descriptive. The latter is more honest and less guilt-inducing. Steal from anomaly-detection in observability tooling rather than from finance apps.
10. **Privacy posture as a marketing line.** Akahu is read-only by default. Lean into "we cannot move your money" — Simple Bank's death taught users to fear bank-attached apps. Make this explicit.

---

## 8. NZ-specific gotchas

### Top takeaways
- **KiwiSaver is structurally different from US 401(k)s** — locked until 65 (with carve-outs for first home, hardship). Treat KiwiSaver balance as net-worth-positive but not as "savings" for runway purposes.
- **GST kicks in at $60k self-employed turnover/12mo.** If Sean has any side income, he needs to know if/when this triggers. Hnry handles this for sole traders end-to-end.
- **Akahu doesn't connect KiwiSaver on the standard tier** — manual entry is the realistic default.
- **NZ banks have inconsistent transaction history depth via Akahu.** Don't promise "all your history forever" in onboarding.
- **No "credit score" equivalent exists casually in NZ** like in the US. Don't bother with credit-score tracking; Centrix/Equifax NZ are paid services and not part of the daily personal-finance UX.

### Specific NZ design notes

- **KiwiSaver display**: show provider, fund (e.g. Booster Balanced), balance, employer + employee + govt contribution YTD if obtainable. Most users have zero idea what their KiwiSaver is invested in — surfacing the fund name alone is a value-add.
- **KiwiSaver in net worth** but **not in runway**. KiwiSaver is locked. Make this distinction clear visually (e.g. greyed-out band on the net-worth chart).
- **GST awareness for side income**: if Sean wants to support sole-trader-style users (Jenny? freelance work?), have a "side income" tag on incoming transactions and a running 12-mo total with a soft warning at $50k ("approaching GST threshold").
- **Hnry integration is unlikely** (no public API as of 2026 search) but a manual "tax set-aside" account category covers the same need.
- **Sharesies / Hatch** are common NZ retail investment platforms. Both are supported by Akahu. Surface them as investment accounts. Don't try to compete with them on portfolio analytics — link out, show balance only.
- **Date format DD/MM/YYYY**, currency NZD with $ symbol, timezone Pacific/Auckland.
- **Two-week pay cycles** are common in NZ — don't assume monthly salary. The runway metric handles this naturally; budget views may not.

---

## 9. CUT LIST — things NOT to copy

Be opinionated. Most apps are bloated. Skip:

- **Bill negotiation as a feature.** Rocket Money's whole game. Service play, not software, and not viable in NZ.
- **Cash advances / credit-builder products.** Cleo's monetisation. Regulated, off-mission, and reputationally risky.
- **Credit score tracking.** US-centric, not part of NZ daily finance, low signal-to-noise.
- **AI personalities (roast/hype).** Cleo's gimmick. Ages badly, alienates power users, gets called out for misjudgements.
- **Tax filing.** Origin offers it. Massive regulatory surface area. Hnry / IR3 / accountants own this in NZ.
- **Investment robo-advisor / portfolio recommendations.** Empower, Origin do this. Sharesies / Smart / KiwiSaver providers own this in NZ.
- **Envelope budgeting as the default mental model.** YNAB's lock-in. Too prescriptive — fights your "dashboard is the app" thesis.
- **Heavy customisation surface.** Lunch Money's strength is also its trap. Sean wants opinionated, not configurable.
- **Multi-budget support.** One household, one budget. Don't entertain "scenarios" or "alternate budgets" in v1.
- **Gamification with badges/streaks tied to app actions** (logging in, categorising). Tie milestones to *real* financial events only.
- **Receipt scanning.** Adds enormous OCR complexity for marginal value when bank feeds cover 95% of transactions.
- **Crypto / stocks / DeFi tracking.** Out of scope. Link out to Sharesies/Hatch.
- **Cross-platform app builder thinking ("we need iOS native + Android native + web").** Stay PWA. One codebase. Sean already chose this; reinforce it.
- **Long-term retirement Monte Carlo simulations.** Empower / ProjectionLab own this. Out of scope for "today's health."
- **Group/family/multi-household.** Sean + Jenny is the spec. Don't generalise to roommates, kids, parents.

---

## 10. Top 10 things Sean might be missing — punch list (ordered by impact)

1. **Safe-to-Spend headline number** sitting next to the health score. Single most-mourned feature in the personal-finance app graveyard.
2. **Cash buffer days as the runway metric**, not dollars. Research-backed (JPMorgan Chase Institute) and emotionally legible.
3. **Proactive AI cards on the dashboard** (Monarch's Insights pattern) — model runs nightly, surfaces 1–3 things you should know without you asking.
4. **Monthly AI recap as a delivered artefact** (Copilot pattern). Plain-English summary, push notification, tappable on the 1st of each month.
5. **Calendar export of upcoming bills** (Cushion). Cheap, beloved.
6. **Manual cash "Wallet" account** for the 5% of transactions banks miss. Solves the auto-feed-only friction.
7. **"Shared" tag on accounts and transactions, not forced joint accounts** (Monarch). Sean & Jenny can run accounts however they want; the app respects that.
8. **Per-person notification preferences** (Monarch). Sean wants alerts; Jenny might want a weekly digest only.
9. **"This month vs your baseline" framing** instead of "vs budget." More honest, less guilt.
10. **Net-worth single trend-line on the dashboard** with a clear visual delineation of liquid vs locked (KiwiSaver). Empower's pattern, with NZ adaptation.

---

## Sources

- Money with Katie — [Copilot Money Review (2026 update)](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/)
- The College Investor — [Copilot Money Review 2026](https://thecollegeinvestor.com/41976/copilot-review/)
- Engadget — [Best budgeting apps for 2026](https://www.engadget.com/apps/best-budgeting-apps-120036303.html)
- Era — [Era vs Monarch vs Copilot vs YNAB 2026 comparison](https://era.app/articles/era-vs-monarch-vs-copilot-vs-ynab/)
- Lunch Money — [Collaboration features](https://lunchmoney.app/features/collaboration), [Recurring items](https://lunchmoney.app/features/recurring-expenses/), [Developer API](https://lunchmoney.dev/)
- Akahu — [Pricing](https://www.akahu.nz/pricing), [Supported Integrations](https://developers.akahu.nz/docs/integrations), [Data Refreshes](https://developers.akahu.nz/docs/data-refreshes), [2025 Open Banking report](https://static.akahu.io/reports/2025+-+Open+banking+in+New+Zealand.pdf)
- CFPB — [Financial Well-Being Scale](https://www.consumerfinance.gov/data-research/research-reports/financial-well-being-scale/), [Quick guide PDF](https://files.consumerfinance.gov/f/documents/201701_cfpb_FinancialWell-Being_Quick-Guide.pdf)
- JPMorgan Chase Institute — [Household Cash Buffer Management](https://www.jpmorganchase.com/institute/all-topics/financial-health-wealth-creation/household-cash-buffer-management-from-the-great-recession-through-covid-19), [Weathering Volatility 2.0](https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/institute/pdf/institute-volatility-cash-buffer-report.pdf)
- Rocket Money — [Bill negotiation process](https://help.rocketmoney.com/en/articles/9744501-bill-negotiation-savings-process)
- YNAB — [The YNAB Method](https://support.ynab.com/en_us/the-ynab-method-an-overview-SJmiqpi6j)
- Cleo — [Reviews](https://web.meetcleo.com/cleo-reviews), [FinanceBuzz Cleo Review 2026](https://financebuzz.com/cleo-review)
- Tiller — [How Tiller Works](https://tiller.com/how-tiller-works/)
- Origin — [Origin AI advisor announcement](https://finance.yahoo.com/news/origin-unveils-first-ai-financial-140000884.html)
- Quicken Simplifi — [Simplifi vs YNAB FinanceBuzz](https://financebuzz.com/simplifi-vs-ynab)
- Monarch — [For Couples and Households](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households), [About Monarch's AI Features](https://help.monarch.com/hc/en-us/articles/16116906962452-About-Monarch-s-AI-Features), [Save Up Goals](https://help.monarch.com/hc/en-us/articles/44373182867476-Using-Save-Up-Goals)
- PocketSmith — [NZ personal finance software](https://www.pocketsmith.com/global-personal-finance-software/new-zealand/), [Akahu data partner blog](https://www.pocketsmith.com/blog/new-data-connections-partner-akahu/)
- Empower — [Net Worth tracker](https://www.empower.com/net-worth)
- Cushion — [App overview](https://www.cushion.ai)
- Simple Bank Safe-to-Spend retrospective — [Android Police](https://www.androidpolice.com/2021/02/11/theres-no-good-replacement-for-simple/)
- Garmin — [Body Battery technology](https://www.garmin.com/en-US/garmin-technology/health-science/body-battery/)
- Hnry NZ — [KiwiSaver for sole traders](https://hnry.co.nz/product/kiwisaver/), [Pricing](https://hnry.co.nz/pricing)
