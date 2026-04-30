# Phase 5d — Demo / Test Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a fully-isolated demo household that anyone signed in as a designated demo user sees instead of Sean's real data — same app shape, synthetic NZ data, refreshed on demand via a Node script. Plus a small demo-mode guard that gracefully blocks live external actions (Akahu sync) when the demo user is signed in.

**Architecture:** Two halves. **Halve 1 — server side:** two Node scripts (`setup-demo-household.mjs` one-time, `seed-demo.mjs` repeatable) using Supabase service-role key (RLS-bypass, locally only) to create + populate a `demo` household with 12 months of synthetic transactions, 5 accounts, 6 rules. **Halve 2 — app side:** a `useDemoGuard` hook that wraps live-action button handlers; when the auth email matches `NEXT_PUBLIC_DEMO_USER_EMAIL`, clicking shows a friendly `<DemoNoticeDialog>` instead of running the action. Single touch point today is the Akahu Sync button.

**Tech Stack:** Node ESM (`.mjs`), `@supabase/supabase-js`, the project's existing `lib/payday/cycle.ts` helpers (14th-rule), Vitest for cadence-generator tests, Next.js 16 client components for the guard hook + dialog.

**Spec:** `~/Projects/finance/docs/superpowers/specs/2026-04-30-demo-test-profile-design.md`
**Implementation repo:** `~/Projects/finance-v2/`

---

## Manual setup steps NOT in this plan (Sean does these after the build ships)

The build produces code only. Sean runs these once after merge:

1. Supabase Dashboard → Authentication → Users → Add user `demo@finance.local` (Sean's demo sign-in user). Sean does NOT manually create Jenny's auth user — the setup script (Task 3) creates `demo-jenny@finance.local` programmatically with a random password (no human ever signs in as her).
2. `npm run setup:demo-household` (script written in Task 3) → creates Jenny's auth user, both profiles, household, bank_feed_state, demo categories. Prints the new household UUID.
3. Add `DEMO_HOUSEHOLD_ID=<uuid>` to `.env.local`
4. Add `NEXT_PUBLIC_DEMO_USER_EMAIL=demo@finance.local` to Vercel Production env
5. `npm run seed:demo` (script written in Task 4) → 12 months of demo data
6. Redeploy to pick up the demo guard

**Subagents writing this plan must NOT run the scripts** — there is no demo household to write to during the build. Tests on the pure cadence module are run; everything else is verified by typecheck + manual smoke after Sean's setup.

---

## File structure

**New files:**
- `scripts/_demo/merchants.ts` — typed list of NZ brand names + category hints
- `scripts/_demo/rules.ts` — typed list of starter rule definitions
- `scripts/_demo/cadence.ts` — pure cadence generator (TDD)
- `scripts/_demo/cadence.test.ts` — vitest unit tests for the generator
- `scripts/setup-demo-household.mjs` — one-time household + profiles + members + bank_feed_state setup
- `scripts/seed-demo.mjs` — rolling 12-month refresh (the main script)
- `lib/demo/is-demo-user.ts` — pure helper (email → boolean)
- `lib/demo/is-demo-user.test.ts` — vitest unit tests
- `lib/demo/use-demo-guard.ts` — client hook wrapping action handlers
- `components/demo-notice-dialog.tsx` — small reusable modal explaining demo mode
- `docs/PHASE-5D-COMPLETE.md` — completion marker

**Modified files:**
- `app/accounts/sync-button.tsx` — wrap `onClick` with `useDemoGuard`
- `package.json` — add `setup:demo-household` and `seed:demo` script entries
- `.env.example` — document `DEMO_HOUSEHOLD_ID`, `NEXT_PUBLIC_DEMO_USER_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` (required by both scripts)

**Untouched:**
- The `categories` table (already global)
- Auth flow, RLS policies, dashboard, transactions, rules CRUD, MakeRuleModal — none of it cares about which household it's serving

---

## Task dependencies

```
1 (merchants + rules) ──┐
                         ├→ 4 (seed-demo.mjs) ──┐
2 (cadence + tests) ─────┘                       │
                                                 ├→ 7 (wire SyncButton + package.json + env.example)
3 (setup-demo-household.mjs) ────────────────────┤      ─→ 8 (completion marker + push)
                                                 │
5 (is-demo-user) ─→ 6 (use-demo-guard + dialog) ─┘
```

Tasks 1, 2, 3, 5 are independent and could be parallelized. Sequential subagent dispatch keeps it simple.

---

## Task 1: Typed lists — merchants + rules

**Files:**
- Create: `scripts/_demo/merchants.ts`
- Create: `scripts/_demo/rules.ts`

Static typed data. No logic. Both files are pure module exports consumed by `seed-demo.mjs` (Task 4).

- [ ] **Step 1: Write `scripts/_demo/merchants.ts`**

```ts
// Curated list of public NZ brand names with category hints + amount ranges.
// Used by the demo seeder to generate realistic transactions. No personal data.

export type DemoMerchantCadence =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "occasional";

export type DemoMerchant = {
  raw: string;          // What appears in transactions.merchant_raw
  clean: string;        // Cleaned display name (transactions.merchant_clean)
  categoryName: string; // Default category — must match a row in v2.categories
  amountRange: [number, number];
  cadenceTag: DemoMerchantCadence;
};

export const DEMO_MERCHANTS: DemoMerchant[] = [
  // Groceries (fortnightly anchors)
  { raw: "PAK N SAVE WAIRAU", clean: "Pak N Save Wairau", categoryName: "Groceries", amountRange: [140, 220], cadenceTag: "fortnightly" },
  { raw: "NEW WORLD WAIRAU", clean: "New World Wairau", categoryName: "Groceries", amountRange: [140, 220], cadenceTag: "fortnightly" },
  { raw: "COUNTDOWN ONEHUNGA", clean: "Countdown Onehunga", categoryName: "Groceries", amountRange: [60, 130], cadenceTag: "occasional" },
  { raw: "FOUR SQUARE PONSONBY", clean: "Four Square Ponsonby", categoryName: "Groceries", amountRange: [25, 80], cadenceTag: "occasional" },

  // Fuel (monthly anchors)
  { raw: "Z ENERGY GREENLANE", clean: "Z Energy Greenlane", categoryName: "Fuel", amountRange: [75, 95], cadenceTag: "fortnightly" },
  { raw: "BP CONNECT EPSOM", clean: "BP Connect Epsom", categoryName: "Fuel", amountRange: [75, 95], cadenceTag: "fortnightly" },

  // Utilities + telco (monthly bills)
  { raw: "GENESIS ENERGY", clean: "Genesis Energy", categoryName: "Utilities", amountRange: [120, 220], cadenceTag: "monthly" },
  { raw: "MERCURY ENERGY", clean: "Mercury Energy", categoryName: "Utilities", amountRange: [120, 220], cadenceTag: "monthly" },
  { raw: "SPARK NZ", clean: "Spark NZ", categoryName: "Utilities", amountRange: [85, 95], cadenceTag: "monthly" },
  { raw: "2DEGREES", clean: "2degrees", categoryName: "Utilities", amountRange: [40, 50], cadenceTag: "monthly" },

  // Subscriptions
  { raw: "SPOTIFY P12345BF", clean: "Spotify", categoryName: "Subscriptions", amountRange: [12.99, 12.99], cadenceTag: "monthly" },
  { raw: "NETFLIX.COM", clean: "Netflix", categoryName: "Subscriptions", amountRange: [19.99, 19.99], cadenceTag: "monthly" },

  // Dining (discretionary, jittered)
  { raw: "MEXICO FELIPES", clean: "Mexico Felipes", categoryName: "Food & Dining", amountRange: [25, 80], cadenceTag: "occasional" },
  { raw: "BURGER FUEL", clean: "Burger Fuel", categoryName: "Food & Dining", amountRange: [25, 60], cadenceTag: "occasional" },
  { raw: "MR BUN BAKERY", clean: "Mr Bun Bakery", categoryName: "Food & Dining", amountRange: [12, 35], cadenceTag: "occasional" },
  { raw: "HELL PIZZA ONEHUNGA", clean: "Hell Pizza Onehunga", categoryName: "Food & Dining", amountRange: [25, 70], cadenceTag: "occasional" },
  { raw: "THE COFFEE CLUB", clean: "The Coffee Club", categoryName: "Food & Dining", amountRange: [8, 30], cadenceTag: "occasional" },

  // Household / hardware
  { raw: "MITRE 10 MEGA", clean: "Mitre 10 Mega", categoryName: "Household", amountRange: [30, 200], cadenceTag: "occasional" },
  { raw: "BRISCOES NZ", clean: "Briscoes", categoryName: "Household", amountRange: [40, 180], cadenceTag: "occasional" },
  { raw: "THE WAREHOUSE", clean: "The Warehouse", categoryName: "Household", amountRange: [20, 150], cadenceTag: "occasional" },
  { raw: "KMART NZ", clean: "Kmart", categoryName: "Household", amountRange: [25, 120], cadenceTag: "occasional" },

  // Clothing / sport
  { raw: "REBEL SPORT", clean: "Rebel Sport", categoryName: "Personal Spending", amountRange: [40, 150], cadenceTag: "occasional" },
  { raw: "HALLENSTEIN BROS", clean: "Hallenstein Bros", categoryName: "Personal Spending", amountRange: [50, 200], cadenceTag: "occasional" },
  { raw: "GLASSONS", clean: "Glassons", categoryName: "Personal Spending", amountRange: [40, 130], cadenceTag: "occasional" },

  // Entertainment / one-offs
  { raw: "WELLINGTON ZOO", clean: "Wellington Zoo", categoryName: "Entertainment", amountRange: [25, 90], cadenceTag: "occasional" },
  { raw: "TE PAPA TONGAREWA", clean: "Te Papa", categoryName: "Entertainment", amountRange: [0, 30], cadenceTag: "occasional" },
  { raw: "EVENT CINEMAS", clean: "Event Cinemas", categoryName: "Entertainment", amountRange: [20, 60], cadenceTag: "occasional" },
];

// Income source merchants (pay deposits)
export const DEMO_INCOME_SOURCES = {
  seanWeeklyPay: {
    raw: "DEMO SEAN PAY",
    clean: "Demo Sean Pay",
    categoryName: "Salary",
    amount: 1650, // ±5%
  },
  jennyMonthlyPay: {
    raw: "DEMO JENNY PAY",
    clean: "Demo Jenny Pay",
    categoryName: "Salary",
    amount: 5400, // ±3%
  },
  jennyAnnualBonus: {
    raw: "DEMO JENNY BONUS",
    clean: "Demo Jenny Bonus",
    categoryName: "Salary",
    amount: 16000,
  },
} as const;
```

- [ ] **Step 2: Write `scripts/_demo/rules.ts`**

```ts
// Starter rule pack seeded with the demo. Surfaces the rules CRUD UI immediately.
//
// Schema reference (rules table):
//   match: { merchant_keyword: string|null, amount_min: number|null,
//            amount_max: number|null, account_id: uuid|null }
//   actions: { set_category_id: uuid, add_labels: string[] }
//
// Each rule here uses a single merchant_keyword. Where the spec listed an
// "OR" condition, we split it into separate rules — the rules engine matches
// any rule, so OR-of-rules is equivalent to OR-in-one-rule for our needs.

export type DemoRule = {
  merchantKeyword: string;
  categoryName: string; // resolved at seed time to a category_id
};

export const DEMO_RULES: DemoRule[] = [
  { merchantKeyword: "PAK N SAVE", categoryName: "Groceries" },
  { merchantKeyword: "NEW WORLD", categoryName: "Groceries" },
  { merchantKeyword: "Z ENERGY", categoryName: "Fuel" },
  { merchantKeyword: "BP ", categoryName: "Fuel" },
  { merchantKeyword: "SPARK", categoryName: "Utilities" },
  { merchantKeyword: "GENESIS", categoryName: "Utilities" },
  { merchantKeyword: "MERCURY", categoryName: "Utilities" },
  { merchantKeyword: "SPOTIFY", categoryName: "Subscriptions" },
  { merchantKeyword: "NETFLIX", categoryName: "Subscriptions" },
  { merchantKeyword: "DEMO SEAN PAY", categoryName: "Salary" },
  { merchantKeyword: "DEMO JENNY PAY", categoryName: "Salary" },
];
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/_demo/merchants.ts scripts/_demo/rules.ts
git commit -m "feat(demo): typed merchant + rule data for demo seeder

Curated NZ brand list (~30 merchants) with category hints and amount
ranges, plus 11 starter rules. No logic — pure typed data consumed
by scripts/seed-demo.mjs (Task 4) and scripts/setup-demo-household.mjs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure cadence generator (TDD)

**Files:**
- Create: `scripts/_demo/cadence.ts`
- Create: `scripts/_demo/cadence.test.ts`

The cadence generator emits a list of `{ date: string, type: "income"|"expense"|"transfer", source: <merchant or income source>, amount: number }` events for 12 months ending today. Pure: takes `today` as a parameter; no `Date.now()` leakage.

- [ ] **Step 1: Write the failing tests**

Create `scripts/_demo/cadence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateCadence } from "./cadence";

const TODAY = "2026-04-30"; // Thursday

describe("generateCadence", () => {
  it("generates ~52 Demo Sean weekly pay events over 12 months", () => {
    const events = generateCadence(TODAY, /*seed*/ 1);
    const seanPays = events.filter((e) => e.source.raw === "DEMO SEAN PAY");
    // 12 months ending today ≈ 52 weeks → 50-54 weekly events accommodates edge
    expect(seanPays.length).toBeGreaterThanOrEqual(50);
    expect(seanPays.length).toBeLessThanOrEqual(54);
  });

  it("generates exactly 12 Demo Jenny monthly pay events", () => {
    const events = generateCadence(TODAY, 1);
    const jennyPays = events.filter((e) => e.source.raw === "DEMO JENNY PAY");
    expect(jennyPays.length).toBe(12);
  });

  it("Demo Jenny pay dates follow the 14th-rule (weekend → previous Friday)", () => {
    const events = generateCadence(TODAY, 1);
    const jennyPays = events.filter((e) => e.source.raw === "DEMO JENNY PAY");
    // Each pay date should be the 14th, OR Fri before if 14th is Sat/Sun
    for (const pay of jennyPays) {
      const d = new Date(`${pay.date}T00:00:00Z`);
      const dom = d.getUTCDate();
      const dow = d.getUTCDay();
      // 14th-rule: dom ∈ {12, 13, 14}; if 14, dow ∈ 1..5 (Mon-Fri); if 13, dow=5; if 12, dow=5
      const okWeekday = dom === 14 && dow >= 1 && dow <= 5;
      const okSatShifted = dom === 13 && dow === 5;
      const okSunShifted = dom === 12 && dow === 5;
      expect(okWeekday || okSatShifted || okSunShifted).toBe(true);
    }
  });

  it("generates exactly 1 Demo Jenny annual bonus in February", () => {
    const events = generateCadence(TODAY, 1);
    const bonuses = events.filter((e) => e.source.raw === "DEMO JENNY BONUS");
    expect(bonuses.length).toBe(1);
    expect(bonuses[0].date.slice(5, 7)).toBe("02");
  });

  it("total event count is in the 250-320 range", () => {
    const events = generateCadence(TODAY, 1);
    expect(events.length).toBeGreaterThanOrEqual(250);
    expect(events.length).toBeLessThanOrEqual(320);
  });

  it("all dates fall within [start, today]", () => {
    const events = generateCadence(TODAY, 1);
    for (const e of events) {
      expect(e.date <= TODAY).toBe(true);
      // Earliest event should be roughly 12 months back; accept 365±5 days
      const eDate = new Date(`${e.date}T00:00:00Z`).getTime();
      const todayDate = new Date(`${TODAY}T00:00:00Z`).getTime();
      const daysBack = (todayDate - eDate) / (1000 * 60 * 60 * 24);
      expect(daysBack).toBeLessThanOrEqual(370);
      expect(daysBack).toBeGreaterThanOrEqual(0);
    }
  });

  it("income > expenses in total (so savings grow visibly)", () => {
    const events = generateCadence(TODAY, 1);
    const totalIncome = events
      .filter((e) => e.kind === "income")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = events
      .filter((e) => e.kind === "expense")
      .reduce((sum, e) => sum + e.amount, 0);
    expect(totalIncome).toBeGreaterThan(totalExpenses);
  });

  it("is deterministic given the same seed", () => {
    const a = generateCadence(TODAY, 42);
    const b = generateCadence(TODAY, 42);
    expect(a.length).toBe(b.length);
    expect(a[0]).toEqual(b[0]);
    expect(a[a.length - 1]).toEqual(b[b.length - 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run scripts/_demo/cadence.test.ts
```

Expected: FAIL — `Cannot find module './cadence'`.

- [ ] **Step 3: Implement `cadence.ts`**

Create `scripts/_demo/cadence.ts`:

```ts
import {
  DEMO_MERCHANTS,
  DEMO_INCOME_SOURCES,
  type DemoMerchant,
} from "./merchants";

export type CadenceEvent =
  | {
      date: string; // YYYY-MM-DD
      kind: "income";
      source: { raw: string; clean: string; categoryName: string };
      amount: number;
    }
  | {
      date: string;
      kind: "expense";
      source: DemoMerchant;
      amount: number;
    };

// Mulberry32 — small deterministic PRNG. Returns [0, 1).
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDayOffset(today: string, days: number): string {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function jenny14thRulePay(year: number, monthIdx0: number): string {
  // monthIdx0: 0 = January
  const fourteenth = new Date(Date.UTC(year, monthIdx0, 14));
  const dow = fourteenth.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 6) {
    // Saturday → Friday 13
    return `${year}-${String(monthIdx0 + 1).padStart(2, "0")}-13`;
  }
  if (dow === 0) {
    // Sunday → Friday 12
    return `${year}-${String(monthIdx0 + 1).padStart(2, "0")}-12`;
  }
  return `${year}-${String(monthIdx0 + 1).padStart(2, "0")}-14`;
}

export function generateCadence(today: string, seed: number): CadenceEvent[] {
  const rand = mulberry32(seed);
  const jitter = (range: [number, number]) =>
    range[0] + rand() * (range[1] - range[0]);

  const events: CadenceEvent[] = [];
  const todayDate = new Date(`${today}T00:00:00Z`);
  const start = isoDayOffset(today, -365);
  const startDate = new Date(`${start}T00:00:00Z`);

  // Demo Sean weekly pay — every Wednesday since `start`
  // Find the first Wednesday on or after start.
  const cur = new Date(startDate);
  while (cur.getUTCDay() !== 3 /* Wednesday */) {
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  while (cur <= todayDate) {
    const amount = DEMO_INCOME_SOURCES.seanWeeklyPay.amount * (0.95 + rand() * 0.1);
    events.push({
      date: cur.toISOString().slice(0, 10),
      kind: "income",
      source: {
        raw: DEMO_INCOME_SOURCES.seanWeeklyPay.raw,
        clean: DEMO_INCOME_SOURCES.seanWeeklyPay.clean,
        categoryName: DEMO_INCOME_SOURCES.seanWeeklyPay.categoryName,
      },
      amount: Math.round(amount * 100) / 100,
    });
    cur.setUTCDate(cur.getUTCDate() + 7);
  }

  // Demo Jenny monthly pay — exactly 12 events using the 14th-rule, working
  // back from today. Skip months whose 14th-rule date is after today.
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  for (let i = 0; i < 12; i++) {
    const monthIdx = startMonth + i;
    const year = startYear + Math.floor(monthIdx / 12);
    const m0 = ((monthIdx % 12) + 12) % 12;
    const payDate = jenny14thRulePay(year, m0);
    if (payDate > today) continue;
    if (payDate < start) continue;
    const amount = DEMO_INCOME_SOURCES.jennyMonthlyPay.amount * (0.97 + rand() * 0.06);
    events.push({
      date: payDate,
      kind: "income",
      source: {
        raw: DEMO_INCOME_SOURCES.jennyMonthlyPay.raw,
        clean: DEMO_INCOME_SOURCES.jennyMonthlyPay.clean,
        categoryName: DEMO_INCOME_SOURCES.jennyMonthlyPay.categoryName,
      },
      amount: Math.round(amount * 100) / 100,
    });
  }

  // Backfill if we didn't get 12 (year boundary). Walk months backward from today.
  while (
    events.filter((e) => e.kind === "income" && e.source.raw === "DEMO JENNY PAY").length < 12
  ) {
    const last = events
      .filter((e) => e.kind === "income" && e.source.raw === "DEMO JENNY PAY")
      .map((e) => e.date)
      .sort()[0];
    const lastDate = new Date(`${last}T00:00:00Z`);
    const m0 = lastDate.getUTCMonth();
    const year = lastDate.getUTCFullYear();
    const prevMonth = m0 === 0 ? 11 : m0 - 1;
    const prevYear = m0 === 0 ? year - 1 : year;
    const payDate = jenny14thRulePay(prevYear, prevMonth);
    if (payDate < start) break;
    const amount = DEMO_INCOME_SOURCES.jennyMonthlyPay.amount * (0.97 + rand() * 0.06);
    events.push({
      date: payDate,
      kind: "income",
      source: {
        raw: DEMO_INCOME_SOURCES.jennyMonthlyPay.raw,
        clean: DEMO_INCOME_SOURCES.jennyMonthlyPay.clean,
        categoryName: DEMO_INCOME_SOURCES.jennyMonthlyPay.categoryName,
      },
      amount: Math.round(amount * 100) / 100,
    });
  }

  // Jenny annual bonus — once in Feb of whichever year falls inside [start, today]
  const febYears = new Set<number>();
  for (let y = startDate.getUTCFullYear(); y <= todayDate.getUTCFullYear(); y++) {
    const febPay = `${y}-02-15`;
    if (febPay >= start && febPay <= today) febYears.add(y);
  }
  const firstFebYear = [...febYears][0];
  if (firstFebYear !== undefined) {
    events.push({
      date: `${firstFebYear}-02-15`,
      kind: "income",
      source: {
        raw: DEMO_INCOME_SOURCES.jennyAnnualBonus.raw,
        clean: DEMO_INCOME_SOURCES.jennyAnnualBonus.clean,
        categoryName: DEMO_INCOME_SOURCES.jennyAnnualBonus.categoryName,
      },
      amount: DEMO_INCOME_SOURCES.jennyAnnualBonus.amount,
    });
  }

  // Recurring expenses — by cadenceTag
  // Fortnightly: groceries (alternating 2 merchants), fuel (alternating 2 merchants)
  const fortnightlyMerchants = DEMO_MERCHANTS.filter((m) => m.cadenceTag === "fortnightly");
  for (const m of fortnightlyMerchants) {
    let d = new Date(startDate);
    // Stagger by an offset so they don't all hit the same day
    d.setUTCDate(d.getUTCDate() + Math.floor(rand() * 14));
    while (d <= todayDate) {
      events.push({
        date: d.toISOString().slice(0, 10),
        kind: "expense",
        source: m,
        amount: Math.round(jitter(m.amountRange) * 100) / 100,
      });
      d.setUTCDate(d.getUTCDate() + 14);
    }
  }

  // Monthly bills (utilities, telco, subscriptions)
  const monthlyMerchants = DEMO_MERCHANTS.filter((m) => m.cadenceTag === "monthly");
  for (const m of monthlyMerchants) {
    const dom = 5 + Math.floor(rand() * 20); // bill day-of-month
    const cur = new Date(startDate);
    cur.setUTCDate(dom);
    while (cur <= todayDate) {
      if (cur >= startDate) {
        events.push({
          date: cur.toISOString().slice(0, 10),
          kind: "expense",
          source: m,
          amount: Math.round(jitter(m.amountRange) * 100) / 100,
        });
      }
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }

  // Occasional discretionary — 3-5 events per month, random merchants
  const occasional = DEMO_MERCHANTS.filter((m) => m.cadenceTag === "occasional");
  const monthsBack = 12;
  for (let mb = 0; mb < monthsBack; mb++) {
    const eventsThisMonth = 3 + Math.floor(rand() * 3); // 3-5
    for (let n = 0; n < eventsThisMonth; n++) {
      const dayOffset = -Math.floor(rand() * 30);
      const monthOffset = -mb * 30 + dayOffset;
      const date = isoDayOffset(today, monthOffset);
      if (date < start) continue;
      const merchant = occasional[Math.floor(rand() * occasional.length)];
      events.push({
        date,
        kind: "expense",
        source: merchant,
        amount: Math.round(jitter(merchant.amountRange) * 100) / 100,
      });
    }
  }

  // Sort by date for stability
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
```

- [ ] **Step 4: Run tests, debug as needed**

```bash
npx vitest run scripts/_demo/cadence.test.ts
```

Expected: 8 tests pass. If any fail, iterate on the generator. Common issues:
- Off-by-one on weekly count → adjust the inclusive-upper-bound in the while loop
- Jenny pay count drifting from 12 → check the year-boundary backfill
- Total count outside 250-320 → tune the occasional eventsThisMonth range

- [ ] **Step 5: Run whole suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 110 (existing) + 8 (new) = 118 tests passing across 18 files.

- [ ] **Step 6: Commit**

```bash
git add scripts/_demo/cadence.ts scripts/_demo/cadence.test.ts
git commit -m "feat(demo): pure cadence generator + tests

Generates 12 months of synthetic transaction events for the demo
seeder. Pure (today + seed in, events out — no Date.now() leakage).
Uses Mulberry32 for deterministic randomness when seed is given.

Cadence rules:
- Demo Sean weekly pay every Wednesday (~52 events)
- Demo Jenny monthly pay following the 14th-rule (12 events)
- Demo Jenny annual bonus once in February (1 event)
- Fortnightly groceries + fuel
- Monthly bills (utilities, telco, subscriptions)
- 3-5 occasional discretionary expenses per month

8 vitest cases covering counts, date constraints, 14th-rule
correctness, and seed determinism.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: One-time household setup script

**Files:**
- Create: `scripts/setup-demo-household.mjs`

This script runs ONCE per Supabase project. Sean runs it after creating the `demo@finance.local` auth user in the Supabase dashboard. It creates the household + 2 profiles + members + bank_feed_state, then prints the household UUID for `.env.local`.

- [ ] **Step 1: Write the script**

> **NOTE — heavily revised after Task 3's first dispatch escalated.** The original plan assumed a `household_members` table and a `profiles.household_id` column. Neither exists. The real schema is:
> - `profiles.id` references `auth.users(id)` — every profile must have an auth user
> - `profiles.email` is NOT NULL
> - `households.owner_profile_id` (single uuid) + `households.partner_profile_ids` (uuid array) → no separate membership table
> - `bank_feed_state.provider` is NOT NULL with CHECK ('akahu')
>
> Corrected approach: Sean manually creates ONE auth user (`demo@finance.local`). The script then programmatically creates a SECOND auth user (`demo-jenny@finance.local`) for Jenny via `supabase.auth.admin.createUser` (no human signs in as her — the auth user just exists for the FK constraint). Both profiles linked via households' owner + partner_profile_ids array.

Create `scripts/setup-demo-household.mjs`:

```js
#!/usr/bin/env node
// One-time setup for the demo household. Idempotent — safe to re-run.
//
// Required env (in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (RLS-bypass; local-only; never deploy to client)
//   NEXT_PUBLIC_DEMO_USER_EMAIL  (Sean's demo sign-in user — created in Supabase dashboard)

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;

if (!url || !serviceKey || !demoEmail) {
  console.error(
    "Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_DEMO_USER_EMAIL"
  );
  process.exit(1);
}

// Derive Jenny's email by inserting "-jenny" before the @
function jennyEmailFrom(seanEmail) {
  const at = seanEmail.indexOf("@");
  if (at < 0) throw new Error(`Invalid demo email: ${seanEmail}`);
  return `${seanEmail.slice(0, at)}-jenny${seanEmail.slice(at)}`;
}
const jennyEmail = jennyEmailFrom(demoEmail);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "v2" },
});

async function findAuthUserByEmail(email) {
  // listUsers paginates — for our scale (a handful of users) page 1 is fine.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function ensureProfile({ id, email, display_name, role }) {
  // profiles.id is FK to auth.users.id — must use the auth user's id.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, email, display_name, role")
    .eq("id", id)
    .maybeSingle();
  if (existing) {
    console.log(`Profile already exists for ${email} (${id}).`);
    return existing;
  }
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id, email, display_name, role })
    .select("id, email, display_name, role")
    .single();
  if (error) throw error;
  console.log(`Created profile for ${email} (${id}).`);
  return data;
}

async function main() {
  console.log(`Setting up demo household for ${demoEmail}...`);

  // 1. Find Sean's auth user (must already exist — manual step in Supabase dashboard)
  const seanAuth = await findAuthUserByEmail(demoEmail);
  if (!seanAuth) {
    console.error(
      `Auth user ${demoEmail} not found. Create it in the Supabase dashboard first.`
    );
    process.exit(1);
  }
  console.log(`Found Sean auth user: ${seanAuth.id}`);

  // 2. Find or create Jenny's auth user (programmatic — no human signs in as her).
  // She exists only to satisfy profiles.id FK so we can have a second profile.
  let jennyAuth = await findAuthUserByEmail(jennyEmail);
  if (!jennyAuth) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: jennyEmail,
      // Random password the human never uses — service role + admin createUser
      // doesn't require email confirmation.
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { generated: "demo-script", demo_role: "partner" },
    });
    if (createErr) throw createErr;
    jennyAuth = created.user;
    console.log(`Created Jenny auth user: ${jennyAuth.id}`);
  } else {
    console.log(`Found Jenny auth user: ${jennyAuth.id}`);
  }

  // 3. Ensure both profiles exist
  const seanProfile = await ensureProfile({
    id: seanAuth.id,
    email: seanAuth.email,
    display_name: "Demo Sean",
    role: "owner",
  });
  const jennyProfile = await ensureProfile({
    id: jennyAuth.id,
    email: jennyAuth.email,
    display_name: "Demo Jenny",
    role: "partner",
  });

  // 4. Find or create the demo household
  let { data: household } = await supabase
    .from("households")
    .select("id, owner_profile_id, partner_profile_ids")
    .eq("name", "demo")
    .maybeSingle();

  if (!household) {
    const { data: newHh, error: hhErr } = await supabase
      .from("households")
      .insert({
        name: "demo",
        owner_profile_id: seanProfile.id,
        partner_profile_ids: [jennyProfile.id],
      })
      .select("id, owner_profile_id, partner_profile_ids")
      .single();
    if (hhErr) throw hhErr;
    household = newHh;
    console.log(`Created household: ${household.id}`);
  } else {
    console.log(`Found existing household: ${household.id}`);
    // Idempotent self-heal: if Jenny's id isn't in partner_profile_ids, add it.
    const partners = household.partner_profile_ids ?? [];
    if (!partners.includes(jennyProfile.id)) {
      const updated = [...partners, jennyProfile.id];
      const { error: updErr } = await supabase
        .from("households")
        .update({ partner_profile_ids: updated })
        .eq("id", household.id);
      if (updErr) throw updErr;
      console.log(`Added Jenny to partner_profile_ids.`);
    }
  }

  // 5. Ensure bank_feed_state exists with provider='akahu' and ~12-month cutover
  const cutover = new Date();
  cutover.setUTCFullYear(cutover.getUTCFullYear() - 1);
  const cutoverISO = cutover.toISOString().slice(0, 10);

  const { data: existingState } = await supabase
    .from("bank_feed_state")
    .select("id")
    .eq("household_id", household.id)
    .eq("provider", "akahu")
    .maybeSingle();

  if (!existingState) {
    const { error: bfsErr } = await supabase
      .from("bank_feed_state")
      .insert({
        household_id: household.id,
        provider: "akahu",
        cutover_date: cutoverISO,
      });
    if (bfsErr) throw bfsErr;
    console.log(`Created bank_feed_state (akahu) with cutover ${cutoverISO}.`);
  } else {
    console.log(`bank_feed_state already exists.`);
  }

  // 6. Seed demo household categories. v2.categories has household_id NOT NULL
  // (per-household, not global as the spec mistakenly assumed). The names
  // below MUST match the categoryName strings in scripts/_demo/merchants.ts
  // and scripts/_demo/rules.ts exactly (case-sensitive).
  // Plain JS array literal — no TS annotation (this is a .mjs file).
  const DEMO_CATEGORIES = [
    { name: "Salary", type: "income" },
    { name: "Groceries", type: "expense" },
    { name: "Fuel", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Subscriptions", type: "expense" },
    { name: "Food & Dining", type: "expense" },
    { name: "Household", type: "expense" },
    { name: "Personal Spending", type: "expense" },
    { name: "Entertainment", type: "expense" },
  ];

  const { data: existingCats } = await supabase
    .from("categories")
    .select("name")
    .eq("household_id", household.id);
  const have = new Set((existingCats ?? []).map((c) => c.name));
  const toInsert = DEMO_CATEGORIES.filter((c) => !have.has(c.name));
  if (toInsert.length > 0) {
    const { error: catErr } = await supabase
      .from("categories")
      .insert(
        toInsert.map((c) => ({
          household_id: household.id,
          name: c.name,
          type: c.type,
        }))
      );
    if (catErr) throw catErr;
    console.log(`Seeded ${toInsert.length} demo categories.`);
  } else {
    console.log(`All ${DEMO_CATEGORIES.length} demo categories already exist.`);
  }

  console.log("");
  console.log("==========================================");
  console.log(`DEMO_HOUSEHOLD_ID=${household.id}`);
  console.log("==========================================");
  console.log("");
  console.log("Add the line above to .env.local, then run: npm run seed:demo");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify dotenv is available**

```bash
grep '"dotenv"' package.json
```

If missing:

```bash
npm install --save-dev dotenv
```

(Most Next.js projects already have `dotenv` transitively, but the script imports it explicitly so we need it as a real dep.)

- [ ] **Step 3: Typecheck (basic syntax check on the .mjs file)**

`.mjs` files don't run through `tsc`, but we can syntax-check:

```bash
node --check scripts/setup-demo-household.mjs
```

Expected: no output (clean parse).

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-demo-household.mjs package.json package-lock.json
git commit -m "feat(demo): one-time setup script for demo household

Idempotent script that creates (or finds) the demo household,
2 profiles (Demo Sean + Demo Jenny), links the demo auth user,
and ensures a bank_feed_state row exists. Sean runs this once per
Supabase project after creating the auth user manually.

Prints the household UUID at the end for .env.local.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Main seed script (rolling 12-month refresh)

**Files:**
- Create: `scripts/seed-demo.mjs`

This is the script Sean runs before each demo. Wipes existing demo txns/accounts/rules and re-populates from the cadence generator.

- [ ] **Step 1: Write the script**

Create `scripts/seed-demo.mjs`:

```js
#!/usr/bin/env node
// Refreshes the demo household with 12 months of synthetic transactions.
// SAFE: refuses to run if DEMO_HOUSEHOLD_ID is missing or the matching
// household doesn't have name='demo'.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { generateCadence } from "./_demo/cadence.ts";
import { DEMO_RULES } from "./_demo/rules.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoHouseholdId = process.env.DEMO_HOUSEHOLD_ID;

if (!url || !serviceKey || !demoHouseholdId) {
  console.error(
    "Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_HOUSEHOLD_ID"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const seedArg = args.find((a) => a.startsWith("--seed="));
const seed = seedArg ? parseInt(seedArg.split("=")[1], 10) : Math.floor(Math.random() * 1e9);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "v2" },
});

async function main() {
  // 1. Safety: confirm the household exists AND name === 'demo'
  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .select("id, name")
    .eq("id", demoHouseholdId)
    .maybeSingle();
  if (hhErr) throw hhErr;
  if (!hh) {
    console.error(`Household ${demoHouseholdId} not found.`);
    process.exit(1);
  }
  if (hh.name !== "demo") {
    console.error(
      `REFUSING TO SEED: household ${demoHouseholdId} has name '${hh.name}', expected 'demo'. Are you sure DEMO_HOUSEHOLD_ID is correct?`
    );
    process.exit(2);
  }

  // 2. Get the demo household's categories. v2.categories is per-household
  // (NOT global as the spec mistakenly stated); setup-demo-household.mjs
  // seeds the demo categories. Filter to the demo household_id.
  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("household_id", demoHouseholdId);
  if (catErr) throw catErr;
  const categoriesByName = new Map(categories.map((c) => [c.name, c.id]));
  if (categoriesByName.size === 0) {
    console.error(
      "No categories found for demo household. Did you run npm run setup:demo-household?"
    );
    process.exit(1);
  }

  // 3. Get profiles for the demo household. profiles has no household_id
  // column (per-household membership is tracked on households via
  // owner_profile_id + partner_profile_ids[]). Fetch the household first
  // and then look up the linked profile rows.
  const { data: hhFull, error: hhFullErr } = await supabase
    .from("households")
    .select("owner_profile_id, partner_profile_ids")
    .eq("id", demoHouseholdId)
    .single();
  if (hhFullErr) throw hhFullErr;
  const profileIds = [
    hhFull.owner_profile_id,
    ...(hhFull.partner_profile_ids ?? []),
  ];
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", profileIds);
  if (profErr) throw profErr;
  const seanProfile = profiles.find((p) => p.display_name === "Demo Sean");
  const jennyProfile = profiles.find((p) => p.display_name === "Demo Jenny");
  if (!seanProfile || !jennyProfile) {
    console.error(
      "Demo Sean or Demo Jenny profile missing. Run npm run setup:demo-household first."
    );
    process.exit(1);
  }

  // 4. Today (NZ time, but UTC-anchored for consistency with cycle helpers)
  const today = new Date().toISOString().slice(0, 10);

  // 5. Generate cadence
  const events = generateCadence(today, seed);
  console.log(`Generated ${events.length} cadence events ending ${today} (seed=${seed}).`);

  if (dryRun) {
    const incomeCount = events.filter((e) => e.kind === "income").length;
    const expenseCount = events.filter((e) => e.kind === "expense").length;
    const totalIncome = events
      .filter((e) => e.kind === "income")
      .reduce((s, e) => s + e.amount, 0);
    const totalExpense = events
      .filter((e) => e.kind === "expense")
      .reduce((s, e) => s + e.amount, 0);
    console.log(`Dry-run summary:`);
    console.log(`  ${incomeCount} income events, total $${totalIncome.toFixed(2)}`);
    console.log(`  ${expenseCount} expense events, total $${totalExpense.toFixed(2)}`);
    console.log(`  Net: $${(totalIncome - totalExpense).toFixed(2)}`);
    console.log("Aborted before writing (--dry-run).");
    return;
  }

  // 6. Wipe existing demo state
  console.log("Wiping existing demo transactions, accounts, rules...");
  await supabase.from("transactions").delete().eq("household_id", demoHouseholdId);
  await supabase.from("rules").delete().eq("household_id", demoHouseholdId);
  await supabase.from("accounts").delete().eq("household_id", demoHouseholdId);

  // 7. Insert accounts
  const accountSpecs = [
    { name: "Demo Sean Cheque", type: "transactional", tag: "sean", owner: seanProfile.id, akahu: "demo-acc-1", opening: 2400 },
    { name: "Demo Sean Savings", type: "savings", tag: "sean", owner: seanProfile.id, akahu: "demo-acc-2", opening: 8000 },
    { name: "Demo Jenny Cheque", type: "transactional", tag: "jenny", owner: jennyProfile.id, akahu: "demo-acc-3", opening: 3800 },
    { name: "Demo Jenny Savings", type: "savings", tag: "jenny", owner: jennyProfile.id, akahu: "demo-acc-4", opening: 15000 },
    { name: "Joint Credit Card", type: "credit", tag: "shared", owner: seanProfile.id, akahu: "demo-acc-5", opening: -430 },
  ];

  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .insert(
      accountSpecs.map((a) => ({
        household_id: demoHouseholdId,
        owner_profile_id: a.owner,
        provider: "akahu",
        akahu_account_id: a.akahu,
        name: a.name,
        type: a.type,
        tag: a.tag,
        balance: a.opening,
      }))
    )
    .select("id, name, tag, type");
  if (accErr) throw accErr;
  console.log(`Inserted ${accounts.length} accounts.`);

  const accByName = new Map(accounts.map((a) => [a.name, a]));
  const seanCheque = accByName.get("Demo Sean Cheque");
  const jennyCheque = accByName.get("Demo Jenny Cheque");
  const jointCC = accByName.get("Joint Credit Card");
  if (!seanCheque || !jennyCheque || !jointCC) throw new Error("Account spec mismatch");

  // 8. Insert rules
  const ruleRows = DEMO_RULES.map((r) => {
    const categoryId = categoriesByName.get(r.categoryName);
    if (!categoryId) {
      console.warn(`Skipping rule for missing category: ${r.categoryName}`);
      return null;
    }
    return {
      household_id: demoHouseholdId,
      match: {
        merchant_keyword: r.merchantKeyword,
        amount_min: null,
        amount_max: null,
        account_id: null,
      },
      actions: { set_category_id: categoryId, add_labels: [] },
    };
  }).filter(Boolean);

  const { error: rulesErr } = await supabase.from("rules").insert(ruleRows);
  if (rulesErr) throw rulesErr;
  console.log(`Inserted ${ruleRows.length} rules.`);

  // 9. Convert cadence events to transactions
  // - Income → credited to the recipient's cheque account; type="income"
  // - Recurring expenses (groceries, fuel, bills) → Jenny Cheque
  // - Discretionary → Joint Credit Card
  const txnRows = events.map((e) => {
    const categoryId = categoriesByName.get(e.source.categoryName) ?? null;
    if (e.kind === "income") {
      const accountId = e.source.raw === "DEMO SEAN PAY" ? seanCheque.id : jennyCheque.id;
      return {
        household_id: demoHouseholdId,
        account_id: accountId,
        posted_at: e.date,
        amount: e.amount,
        type: "income",
        merchant_raw: e.source.raw,
        merchant_clean: e.source.clean,
        description: null,
        category_id: categoryId,
        attributed_to_profile_id:
          e.source.raw === "DEMO SEAN PAY" ? seanProfile.id : jennyProfile.id,
        confirmed: true,
        is_transfer: false,
        labels: [],
        source: "akahu_sync",
      };
    }
    // expense
    const accountId = ["fortnightly", "monthly"].includes(e.source.cadenceTag)
      ? jennyCheque.id
      : jointCC.id;
    return {
      household_id: demoHouseholdId,
      account_id: accountId,
      posted_at: e.date,
      amount: -Math.abs(e.amount), // expenses are negative
      type: "expense",
      merchant_raw: e.source.raw,
      merchant_clean: e.source.clean,
      description: null,
      // 50% of discretionary uncategorised so the dashboard tile has a believable count
      category_id:
        e.source.cadenceTag === "occasional" && Math.random() < 0.5 ? null : categoryId,
      attributed_to_profile_id: null,
      confirmed: true,
      is_transfer: false,
      labels: [],
      source: "akahu_sync",
    };
  });

  // Insert in chunks to avoid request size limits
  const CHUNK = 200;
  for (let i = 0; i < txnRows.length; i += CHUNK) {
    const chunk = txnRows.slice(i, i + CHUNK);
    const { error } = await supabase.from("transactions").insert(chunk);
    if (error) throw error;
  }
  console.log(`Inserted ${txnRows.length} transactions.`);

  // 10. Recalc and update account balances from txn totals + opening
  for (const a of accountSpecs) {
    const acc = accByName.get(a.name);
    if (!acc) continue;
    const sum = txnRows
      .filter((r) => r.account_id === acc.id)
      .reduce((s, r) => s + Number(r.amount), 0);
    const newBalance = a.opening + sum;
    await supabase
      .from("accounts")
      .update({ balance: newBalance })
      .eq("id", acc.id);
  }

  const netHousehold = accountSpecs.reduce((sum, a) => {
    const acc = accByName.get(a.name);
    if (!acc) return sum;
    const accSum = txnRows
      .filter((r) => r.account_id === acc.id)
      .reduce((s, r) => s + Number(r.amount), 0);
    return sum + a.opening + accSum;
  }, 0);

  console.log("");
  console.log(
    `Seeded ${txnRows.length} txns across ${accounts.length} accounts, ${ruleRows.length} rules, 12 months ending ${today}. Net household: $${netHousehold.toFixed(2)}.`
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

> **Note:** This `.mjs` file imports `.ts` files (`./_demo/cadence.ts`, `./_demo/rules.ts`) — that works because Next.js projects use `tsx` for script execution. We'll wire the `seed:demo` package script as `tsx scripts/seed-demo.mjs` (Task 7).

- [ ] **Step 2: Verify the file parses**

```bash
node --check scripts/seed-demo.mjs
```

Expected: clean parse (no output). If it fails because of the `.ts` imports — that's expected for raw `node`. The actual run goes through `tsx`. The check just validates JS-syntax correctness.

- [ ] **Step 3: Typecheck the .ts dependencies**

```bash
npx tsc --noEmit
```

Should still be clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.mjs
git commit -m "feat(demo): main seed-demo refresh script

Idempotent rolling 12-month refresh:
- Safety check refuses to run unless household name='demo'
- Wipes demo txns/accounts/rules; preserves auth/profiles/household
- Inserts 5 accounts, 6+ rules, ~250-300 txns from generateCadence()
- Recalcs account balances from opening + txn sum
- --dry-run flag prints summary without writing
- --seed=<n> flag pins randomness for reproducible demos

Sean runs 'npm run seed:demo' before each demo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `isDemoUser` helper (TDD)

**Files:**
- Create: `lib/demo/is-demo-user.ts`
- Create: `lib/demo/is-demo-user.test.ts`

Tiny pure helper. Email → boolean. Tests provide the contract.

- [ ] **Step 1: Write the failing test**

Create `lib/demo/is-demo-user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isDemoUser } from "./is-demo-user";

describe("isDemoUser", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_USER_EMAIL", "demo@finance.local");
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("NEXT_PUBLIC_DEMO_USER_EMAIL", ORIGINAL);
    }
  });

  it("returns true when email matches the env var", () => {
    expect(isDemoUser("demo@finance.local")).toBe(true);
  });

  it("returns false for non-demo email", () => {
    expect(isDemoUser("real@user.com")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDemoUser(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDemoUser(undefined)).toBe(false);
  });

  it("returns false when env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_USER_EMAIL", "");
    expect(isDemoUser("demo@finance.local")).toBe(false);
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
npx vitest run lib/demo/is-demo-user.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/demo/is-demo-user.ts`:

```ts
// Returns true when the given auth email matches the configured demo user.
// Empty/missing env var means demo mode is fully disabled (returns false
// for everyone), which is the safe default.

export function isDemoUser(email: string | null | undefined): boolean {
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  if (!demoEmail) return false;
  return email === demoEmail;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npx vitest run lib/demo/is-demo-user.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 5: Whole suite**

```bash
npx vitest run
```

Expected: 118 + 5 = 123 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/demo/is-demo-user.ts lib/demo/is-demo-user.test.ts
git commit -m "feat(demo): isDemoUser helper + tests

Pure email-based check against NEXT_PUBLIC_DEMO_USER_EMAIL.
Empty/missing env disables demo mode globally (safe default).

5 vitest cases covering match, non-match, null, undefined, unset env.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Demo guard hook + notice dialog

**Files:**
- Create: `lib/demo/use-demo-guard.ts`
- Create: `components/demo-notice-dialog.tsx`

The hook + dialog primitive. `useDemoGuard` wraps an action; if the user is the demo user, clicking opens the notice dialog. Otherwise the action runs.

- [ ] **Step 1: Implement the dialog**

Create `components/demo-notice-dialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

type DemoNoticeDialogProps = {
  open: boolean;
  onClose: () => void;
  reason?: string; // e.g., "syncing from Akahu"
};

export function DemoNoticeDialog({ open, onClose, reason }: DemoNoticeDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] pb-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
      data-testid="demo-notice-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Demo mode notice"
    >
      <div
        className="bg-background border border-border rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2 text-foreground">Demo mode</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This account isn&rsquo;t connected to a real bank, so{" "}
          {reason ? <>{reason} is</> : <>this is</>} disabled here. On a real
          account, this button would pull the latest transactions from Akahu.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the hook**

Create `lib/demo/use-demo-guard.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import { isDemoUser } from "./is-demo-user";

type GuardOptions = {
  reason?: string; // shown in the demo notice dialog
};

// Wraps an action handler. When the current user matches the demo email,
// invoking the wrapped function opens the demo notice dialog instead of
// running the action. Returns:
//   - the wrapped onClick to attach to the button
//   - a `notice` object with { open, onClose, reason } to spread into <DemoNoticeDialog />
export function useDemoGuard<T extends (...args: never[]) => unknown>(
  action: T,
  options?: GuardOptions
): {
  onClick: T;
  notice: { open: boolean; onClose: () => void; reason: string | undefined };
} {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const wrapped = useCallback(
    ((...args: Parameters<T>) => {
      if (isDemoUser(email)) {
        setOpen(true);
        return undefined;
      }
      return action(...args);
    }) as T,
    [action, email]
  );

  return {
    onClick: wrapped,
    notice: {
      open,
      onClose: () => setOpen(false),
      reason: options?.reason,
    },
  };
}
```

> **Note:** This hook fetches the user once on mount via `supabase.auth.getUser()`. Alternatives considered:
> - Reading from a server context — we'd need a context provider; overkill for a single button surface
> - Using `auth.getSession()` — same end result; `getUser()` is the recommended path for auth-state checks

- [ ] **Step 3: Verify supabase/client.ts exists**

```bash
ls lib/supabase/client.ts
```

If missing, check what exists under `lib/supabase/` — there's certainly a `server.ts`; the client-side equivalent should exist. If not, escalate to NEEDS_CONTEXT.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/use-demo-guard.ts components/demo-notice-dialog.tsx
git commit -m "feat(demo): useDemoGuard hook + DemoNoticeDialog

Hook wraps an action handler; when the current auth user matches
NEXT_PUBLIC_DEMO_USER_EMAIL, clicking opens the notice dialog
instead of running the action. Otherwise it just runs the action.

Returns { onClick, notice } so the caller spreads notice into
<DemoNoticeDialog /> and attaches onClick to its button.

Reuses the same modal styling pattern as MakeRuleModal (top-anchored,
backdrop click closes, ESC handled by browser focus trap).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire SyncButton + npm scripts + .env.example

**Files:**
- Modify: `app/accounts/sync-button.tsx`
- Modify: `package.json`
- Modify: `.env.example`

Plumbing — wire the guard into the only live-action surface today, add npm scripts for the demo workflow, document env vars.

- [ ] **Step 1: Wrap SyncButton**

In `app/accounts/sync-button.tsx`, replace the `onClick` handler usage:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDemoGuard } from "@/lib/demo/use-demo-guard";
import { DemoNoticeDialog } from "@/components/demo-notice-dialog";

type Prompt = {
  kind: "no_match";
  providerAccountId: string;
  name: string;
  accountNumber: string | null;
};

type SyncResult = {
  linkedAccounts: number;
  insertedTransactions: number;
  prompts: Prompt[];
};

export function SyncButton() {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; result: SyncResult }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  async function rawOnClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "err", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "ok", result: body });
    } catch (err) {
      setState({
        kind: "err",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  const { onClick, notice } = useDemoGuard(rawOnClick, {
    reason: "syncing from Akahu",
  });

  return (
    <div className="mb-6">
      <Button
        onClick={onClick}
        disabled={state.kind === "loading"}
        data-testid="sync-button"
      >
        {state.kind === "loading" ? "Syncing…" : "Sync from Akahu →"}
      </Button>
      <DemoNoticeDialog {...notice} />
      {state.kind === "ok" && (
        <div
          className="mt-3 text-sm text-muted-foreground"
          data-testid="sync-result"
        >
          Linked {state.result.linkedAccounts} account
          {state.result.linkedAccounts === 1 ? "" : "s"} · Pulled{" "}
          {state.result.insertedTransactions} new transaction
          {state.result.insertedTransactions === 1 ? "" : "s"}.
          {state.result.prompts.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.result.prompts.map((p) => (
                <li key={p.providerAccountId} data-testid="sync-prompt">
                  {p.name} ({p.accountNumber ?? "no number"}) — no v2 account
                  match (deferred to Phase 3b).
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.kind === "err" && (
        <p
          className="mt-3 text-sm text-red-600"
          data-testid="sync-error"
        >
          Error: {state.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add npm scripts**

In `package.json`, find the `"scripts"` section and add two entries:

```json
"setup:demo-household": "tsx scripts/setup-demo-household.mjs",
"seed:demo": "tsx scripts/seed-demo.mjs",
```

Verify `tsx` is already in `devDependencies`:

```bash
grep '"tsx"' package.json
```

If missing:

```bash
npm install --save-dev tsx
```

- [ ] **Step 3: Document env vars**

Find or create `.env.example` and add:

```
# Demo / test profile (Phase 5d)
# Used by scripts/setup-demo-household.mjs and scripts/seed-demo.mjs (locally)
# and by the app to detect the demo user (NEXT_PUBLIC_DEMO_USER_EMAIL).

# Set after running setup:demo-household once. The script prints the UUID.
DEMO_HOUSEHOLD_ID=

# The auth email used for demo sign-in. Same value should be set on Vercel
# (Production env) so the SyncButton guard works on prod.
NEXT_PUBLIC_DEMO_USER_EMAIL=demo@finance.local

# Required by the seed scripts only (NEVER deploy to client).
# Get from Supabase Dashboard → Project Settings → API → service_role key.
SUPABASE_SERVICE_ROLE_KEY=
```

If the file doesn't exist, just create it.

- [ ] **Step 4: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: clean tsc, 123 tests passing.

- [ ] **Step 5: Commit**

```bash
git add app/accounts/sync-button.tsx package.json package-lock.json .env.example
git commit -m "feat(demo): wire SyncButton + add npm scripts + env docs

- SyncButton onClick wrapped in useDemoGuard. When demo user is
  signed in, clicking opens the DemoNoticeDialog instead of POSTing
  /api/sync. Real users see no behavior change.
- package.json: 'setup:demo-household' and 'seed:demo' npm scripts
  pointing to the new tsx-runnable .mjs scripts.
- .env.example: documents DEMO_HOUSEHOLD_ID, NEXT_PUBLIC_DEMO_USER_EMAIL,
  SUPABASE_SERVICE_ROLE_KEY (all required by Phase 5d).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Phase completion marker + push

**Files:**
- Create: `docs/PHASE-5D-COMPLETE.md`

- [ ] **Step 1: Write the marker**

Create `docs/PHASE-5D-COMPLETE.md`:

```markdown
# Phase 5d — Demo / Test Profile — Complete

**Date completed:** 2026-04-30 (subagent-driven build)

## What ships

**Server-side:**
- `scripts/_demo/merchants.ts` — typed list of ~30 NZ brand merchants with category hints + amount ranges
- `scripts/_demo/rules.ts` — typed list of 11 starter rules
- `scripts/_demo/cadence.ts` + tests — pure cadence generator (8 vitest cases); produces 250-320 events spanning 12 months ending today; uses Mulberry32 PRNG for seedable determinism
- `scripts/setup-demo-household.mjs` — one-time script to create the demo household, profiles, household_members link, bank_feed_state row
- `scripts/seed-demo.mjs` — main refresh script; safety-checks DEMO_HOUSEHOLD_ID and household.name='demo'; wipes + repopulates txns/accounts/rules; supports `--dry-run` and `--seed=<n>` flags

**App-side:**
- `lib/demo/is-demo-user.ts` + tests — pure email-vs-env-var check (5 vitest cases)
- `lib/demo/use-demo-guard.ts` — client hook wrapping action handlers with demo-mode awareness
- `components/demo-notice-dialog.tsx` — friendly dialog explaining demo mode
- `app/accounts/sync-button.tsx` — Sync from Akahu button now wrapped in useDemoGuard

**Plumbing:**
- `package.json` — `setup:demo-household` + `seed:demo` npm scripts
- `.env.example` — documents `DEMO_HOUSEHOLD_ID`, `NEXT_PUBLIC_DEMO_USER_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tests

- 110 → 123 passing across 19 vitest files (added 13: 8 cadence + 5 is-demo-user)
- `npx tsc --noEmit` clean

## Manual setup steps Sean still needs to do

1. Supabase Dashboard → Authentication → Users → Add user `demo@finance.local`
2. Set local env vars in `.env.local`:
   ```
   NEXT_PUBLIC_DEMO_USER_EMAIL=demo@finance.local
   SUPABASE_SERVICE_ROLE_KEY=<from Supabase project settings>
   ```
3. `npm run setup:demo-household` → prints DEMO_HOUSEHOLD_ID
4. Add `DEMO_HOUSEHOLD_ID=<uuid>` to `.env.local`
5. `npm run seed:demo` → 12 months of demo data
6. Set `NEXT_PUBLIC_DEMO_USER_EMAIL` on Vercel (Production env)
7. Redeploy to pick up the demo guard

## Manual smoke (after setup)

- Sign in to prod as `demo@finance.local`
- `/dashboard` shows cycle header anchored to Demo Jenny's last 14th
- Net Position ≈ $28k
- Recent Activity: 5 plausible-looking NZ txns
- Uncategorised tile shows a small visible number
- `/transactions` shows ~250-300 rows
- `/settings/rules` shows 11 demo rules (or however many; rules CRUD will list them)
- `/accounts` shows the "Sync from Akahu" button as normal; clicking opens the demo-notice modal instead of attempting a real sync
- Sign out, sign back in as Sean's real account → Sync button works as before

## Out of scope (deferred)

- No "reset demo" button in-app — laptop-only for now
- No rolling auto-reset (cron, middleware) — manual reset only
- No multi-tenant demo — one demo household, period
- No demo-mode toggle on real account — separate user only

## Predecessor

Phase 5c — `/transactions` Filter UI (`docs/PHASE-5C-COMPLETE.md`)
```

- [ ] **Step 2: Commit**

```bash
git add docs/PHASE-5D-COMPLETE.md
git commit -m "docs: mark Phase 5d (demo profile) complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

> **Don't deploy yet.** The app code change (SyncButton guard) needs the Vercel env var set first. Sean will deploy after he sets `NEXT_PUBLIC_DEMO_USER_EMAIL` on Vercel and after he's run the seed locally.

---

## Acceptance criteria (whole-phase)

- All 8 tasks committed; ~10-12 commits total
- Vitest green: ≥123 tests passing
- TypeScript clean: `npx tsc --noEmit` returns 0 errors
- All scripts parse cleanly via `node --check`
- The seed script's safety check is in place (refuses to run without `DEMO_HOUSEHOLD_ID` AND matching `household.name === 'demo'`)
- The `useDemoGuard` hook handles the case where the user is real (no behavior change to existing flows)
- Real-user smoke (signed in as Sean): SyncButton still works as today (clicking POSTs `/api/sync`)
- No production deploy initiated by the build (Sean controls the deploy after his manual setup)

---

## Reference paths

- Spec: `~/Projects/finance/docs/superpowers/specs/2026-04-30-demo-test-profile-design.md`
- Schema: `~/Projects/finance-v2/supabase/migrations/0001_v2_schema.sql`
- Phase 5c (predecessor): `docs/PHASE-5C-COMPLETE.md`
- Existing reference scripts (same shape as Tasks 3, 4): `scripts/detect-jenny-pay.mjs`, `scripts/show-account-tags.mjs`, `scripts/reconcile-dashboard.mjs`
