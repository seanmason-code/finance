# Phase 7 — AI Sanity Advisor — Design

**Date drafted:** 2026-05-01
**Project:** finance-v2 (Personal Finance PWA)
**Predecessor:** Phase 5d — Demo profile (`docs/PHASE-5D-COMPLETE.md`)
**Implementation repo:** `~/Projects/finance-v2/`
**Roadmap context:** Originally promoted from Phase 5b deferred. This phase delivers the active "AI advisor" surface; the scheduled monthly recap is its own future phase. Phase 6 (Service Account auto-capture) is a separate stream and not blocked by this.

---

## Context

The dashboard answers cycle-level questions in numbers — "how much this cycle?", "what's my net position?", "is this cycle pacing higher than last?". What it doesn't answer is the questions that take a paragraph: "what's actually going on this cycle?", "anything weird I should look at?", "is the high spend a one-off or a habit shift?". Those answers are judgment calls that an LLM can produce but a SQL aggregate cannot.

Most candidate "AI features" in the master spec are actually deterministic — anomaly thresholds, duplicate detection, untagged-pile counts. Those don't need an LLM and are not part of this phase. Phase 7 is specifically the on-demand advisor: a button that reads the current cycle's transactions plus dashboard tile values and writes a short paragraph, ranked items to look at, and suggested rules.

The "suggested rules" leg is what gives the feature long-term value. Without it, every cycle pays Claude to learn the same thing about your spending. With it, the human-approved rules accumulate in the existing rules engine (Phase 3b's `rules` table), AI dependence tapers, and the app gets durably smarter.

---

## Goal

Ship a single dashboard advisor button that, on click, returns:
- A short plain-English summary of the current cycle's state
- 0–5 ranked "things to look at" items
- 0–3 suggested rules with one-click "Add rule" buttons that feed the existing rules engine

All rules are human-approved before insertion. No background scheduling, no auto-applying. Cost stays under $1/year for personal use.

---

## Locked design decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Trigger | Active button — one button, one place (top of dashboard) |
| Number of buttons in v1 | One ("How's it looking?") |
| Output shape | Summary paragraph + ranked items + suggested rules |
| Rule lifecycle | AI suggests, human approves, rule joins existing `v2.rules` table |
| Auto-applying rules | No — every rule is approved by user before insertion |
| Model | `anthropic/claude-sonnet-4-6` via Vercel AI Gateway |
| Output format | Structured (Zod schema) via `generateObject` — not free-form text |
| Caching | Per-cycle row in `v2.ai_cards`, 1-hour TTL, refresh button forces fresh call |
| Cost guardrail | Per-household throttle: 10 fresh calls/hour |
| Storage of past responses | Yes — every call writes an `ai_cards` row (history accumulates, no UI yet) |
| Streaming responses | No — `generateObject` non-streaming is fine for ~3s responses |
| Recap / scheduled mode | Out of scope — separate future phase |
| Multiple advisor buttons (cycle deep-dive, txn-explain) | Out of scope — Phase 7+ once we know which contextual asks matter |

---

## Architecture

Phase 7 is additive. No existing dashboard tile changes; one new card is added at the top of the dashboard between the cycle header and the existing tile grid. One new table (`v2.ai_cards`) is added via migration. Two new API routes are added (`/api/advisor` and `/api/advisor/add-rule`). New pure helper modules live under `lib/advisor/`.

Data flow on click:

```
[advisor-card.tsx click "How's it looking?"]
        ↓ POST /api/advisor (force?: bool)
[route.ts: throttle check → cache lookup → if miss, build context + call Claude]
        ↓
[lib/advisor/build-context.ts: queries DB, returns prompt input object]
        ↓
[Vercel AI Gateway: anthropic/claude-sonnet-4-6, generateObject(schema)]
        ↓
[Server-side filter: drop suggested rules that duplicate existing rules
                     or reference non-existent categories]
        ↓
[INSERT INTO v2.ai_cards, return validated response to client]
        ↓
[advisor-card.tsx renders summary + items + rule cards]
        ↓ user clicks "Add rule"
[POST /api/advisor/add-rule with the rule shape]
        ↓
[/add-rule route.ts: re-validate category exists, INSERT into v2.rules
                     using the same shape Phase 3c CRUD writes]
        ↓
[Phase 3b's existing apply-rules-on-write logic catches new rule on next
 sync; existing "retroactively apply" UI from Phase 3c lets user back-apply]
```

The dashboard fetches its existing tiles and the latest `ai_cards` row for the current cycle in a single `Promise.all`, same pattern as Phase 4's data fetch. If a cached card exists for the current cycle, the dashboard renders it immediately on load; the user sees a "refresh" button to force a fresh call.

---

## Components

| Path | Purpose |
|---|---|
| `app/dashboard/_advisor/advisor-card.tsx` | Client component. Collapsed/expanded states, refresh button, "Add rule" handler. |
| `app/api/advisor/route.ts` | POST. Throttle → cache → Claude → filter → store → return. |
| `app/api/advisor/add-rule/route.ts` | POST. Validate category, INSERT into `v2.rules`. |
| `lib/advisor/build-context.ts` | Pure function. Takes `(supabase, householdId, cycleStart)`, returns `AdvisorContext` object for the prompt. |
| `lib/advisor/schema.ts` | Zod schema for `AdvisorResponse`. Exported for both server and client typing. |
| `lib/advisor/cache.ts` | `readLatestCard(householdId, cycleStart)` + `writeCard(...)` helpers. |
| `lib/advisor/throttle.ts` | Per-household call counter with 1-hour rolling window. |
| `lib/advisor/filter-rules.ts` | Server-side filter dropping dup/invalid rule suggestions before they reach the user. |
| `supabase/migrations/0004_v2_ai_cards.sql` | New `v2.ai_cards` table. |

The advisor card lives in `_advisor/` (underscore prefix) to follow Next 16's convention for "not a route" subdirectories within `app/`, matching existing Phase 4 `_tiles/` pattern.

---

## Schema

### Output schema (Zod, in `lib/advisor/schema.ts`)

```ts
import { z } from "zod";

export const AdvisorResponse = z.object({
  summary: z.string().min(20).max(600),
  items: z.array(z.object({
    priority: z.enum(["high", "medium", "low"]),
    title: z.string().min(5).max(100),
    body: z.string().min(10).max(400),
  })).max(5),
  suggestedRules: z.array(z.object({
    merchantKeyword: z.string().min(2).max(80),
    categoryName: z.string().min(2).max(60),
    reason: z.string().max(200),
    matchCount: z.number().int().min(1),
  })).max(3),
});

export type AdvisorResponse = z.infer<typeof AdvisorResponse>;
```

Hard caps prevent runaway responses. Cap of 5 items + 3 rules keeps UI readable on mobile.

### Database migration

```sql
-- supabase/migrations/0004_v2_ai_cards.sql
CREATE TABLE IF NOT EXISTS v2.ai_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES v2.households(id) ON DELETE CASCADE,
  cycle_start   date NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  response_json jsonb NOT NULL,
  model         text NOT NULL,
  prompt_tokens integer,
  output_tokens integer
);

CREATE INDEX IF NOT EXISTS idx_ai_cards_household_cycle
  ON v2.ai_cards(household_id, cycle_start DESC);

ALTER TABLE v2.ai_cards ENABLE ROW LEVEL SECURITY;

-- Read: members of the household can read their own cards.
CREATE POLICY ai_cards_select_self ON v2.ai_cards
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM v2.profiles WHERE id = auth.uid()
    )
  );

-- Insert is service-role only (the API route writes; users never INSERT directly).
-- No USING clause on INSERT for users; service-role bypasses RLS.
```

### Prompt context object

```ts
// lib/advisor/build-context.ts return type
export type AdvisorContext = {
  cycle: { start: string; end: string; daysIn: number };
  tiles: {
    netPosition: number;
    cycleSpend: number;
    cycleSpendDeltaPct: number | null;
    income: number;
    incomeDeltaPct: number | null;
    topCategories: Array<{ name: string; amount: number; deltaPct: number | null }>;
    uncategorisedCount: number;
  };
  recentCycles: Array<{ start: string; spend: number; income: number; topCategory: string }>;  // last 3
  cycleTransactions: Array<{
    date: string; merchant: string; amount: number;
    category: string | null; account: string;
  }>;
  existingRules: Array<{ merchantKeyword: string; categoryName: string }>;
  availableCategories: Array<{ name: string; type: "income" | "expense" | "transfer" }>;
};
```

This is what gets serialised into the user message. The system prompt is static and prompt-cached.

---

## Cost & model

- **Model:** `anthropic/claude-sonnet-4-6` via Vercel AI Gateway. Plain string; swap by editing one constant.
- **Why not Opus:** Sonnet is ~10× cheaper, 2-3s vs 6-10s latency, indistinguishable quality on this workload. Reach for Opus only if eval shows quality gaps.
- **Prompt caching:** ON for system prompt + recent-cycles context (changes ≤ once per cycle). The per-cycle-changing parts (current cycle txns, tile values) are uncached.
- **Estimated per-call cost:** $0.005–$0.015 uncached, $0.001–$0.003 cached.
- **Realistic personal-use cost:** 1–3 fresh calls per cycle + ~10 cached re-renders → **<$0.50/year**.
- **Abuse cap:** 10 fresh calls/household/hour. Hard ceiling before any worst-case explodes.

---

## Failure modes & handling

| Failure | Handling |
|---|---|
| Claude returns malformed JSON / fails Zod validation | Catch in route → 502 `{ error: "advisor_unavailable" }` → card shows "Couldn't generate advice. Try again." with refresh button |
| Network/timeout to AI Gateway | Single retry with 2s backoff → if still fails, same fallback |
| Rate limit (Anthropic side) | 429 → card shows "Rate limited. Try again in a minute." |
| App-level abuse cap hit | 429 with same UI message |
| Suggested rule duplicates an existing rule | Filtered server-side after Claude responds — never shown to user |
| Suggested rule references a non-existent category | Filtered server-side — `categoryName` must match an existing category for the household, else dropped |
| User clicks "Add rule" but suggestion has stale data | `/add-rule` re-validates category exists; returns 400 if gone |
| Auth missing on `/api/advisor` | Standard `authedAndScoped` 401 (existing helper from cleanup batch #4) |
| `ai_cards` table grows forever | No cleanup needed at this scale; add later if it ever matters |

---

## Testing strategy

| Layer | Test approach |
|---|---|
| `lib/advisor/build-context.ts` | Vitest with DB fixtures or mocked supabase client. Snapshot the produced context for stability. |
| `lib/advisor/schema.ts` | Vitest — happy path + 6 invalid-shape inputs (missing fields, wrong types, oversize strings, etc.) |
| `lib/advisor/throttle.ts` | Vitest — under cap, at cap, expired window resets |
| `lib/advisor/filter-rules.ts` | Vitest — drops dups, drops missing-cat, keeps valid. |
| `app/api/advisor/route.ts` | Vitest with mocked AI Gateway client. Covers: 200 happy path, 401 unauth, 429 throttled, 502 malformed Claude response, 502 network error, cache hit returns without calling Claude. |
| `app/api/advisor/add-rule/route.ts` | Vitest. Covers: 200 happy, 401, 400 invalid category, 400 duplicate rule. |
| `advisor-card.tsx` | Vitest + RTL — render states (collapsed, loading, error, expanded with response). Click "Add rule" calls handler with right shape. |
| Manual prod smoke | Sign in as demo user → click button → verify response paragraph + items + rules render → click "Add rule" → reload → verify rule appears in `/settings/rules`. Repeat as Sean's real account. |

---

## Out of scope (deferred)

- Multiple advisor buttons (cycle deep-dive, txn-explain) — Phase 7+ once we know which contextual asks matter
- Scheduled / monthly recap mode — separate future phase, anchored to Jenny's salary deposit
- "Advisor history" UI to browse past `ai_cards` rows — rows persist, no UI yet
- Streaming responses — non-streaming is fine for ~3s responses
- Auto-applying any rule without human approval — every rule goes through user click
- AI-generated category creation — only suggests rules pointing to existing categories
- Telling AI about future-dated transactions / projections — current cycle + history only
- Cost budget guardrails / hard spend cap — cost is so low it doesn't warrant the engineering
- Multi-language support — NZ English only
- "Explain this transaction" on `/transactions/[id]` — Phase 7+

---

## Estimated build

**~12-15 plan tasks**, ~2-3 hours of subagent-driven build:

1. Migration: `v2.ai_cards` table + RLS policy
2. `lib/advisor/schema.ts` + tests
3. `lib/advisor/build-context.ts` + tests (with DB fixtures)
4. `lib/advisor/throttle.ts` + tests
5. `lib/advisor/filter-rules.ts` + tests
6. `lib/advisor/cache.ts` (read/write helpers)
7. `app/api/advisor/route.ts` (compose: auth → throttle → cache → context → Claude → filter → store → return) + tests
8. `app/api/advisor/add-rule/route.ts` + tests
9. `app/dashboard/_advisor/advisor-card.tsx` (client component, expand/collapse, refresh, add-rule handler)
10. Wire advisor card into dashboard layout
11. Configure AI Gateway access — on Vercel deploys, the OIDC-injected gateway token is available automatically; for local dev, set `AI_GATEWAY_API_KEY` in `.env.local`. Document in env section of README.
12. Manual smoke checklist in `docs/PHASE-7-COMPLETE.md`
13. Subagent-driven verification + commit per task

---

## Predecessor

Phase 5d — Demo profile (`docs/PHASE-5D-COMPLETE.md`).

## Successor (queued)

- Phase 6 — Service Account auto-capture (separate stream, not blocked)
- Phase 8 — Charts (3-month / 6-month trends; will produce data the advisor can later cite)
- Future — AI monthly recap (scheduled, payday-anchored)
- Future — Phase 7 extensions: contextual advisor buttons on cycle and transaction-detail surfaces, advisor-history UI
