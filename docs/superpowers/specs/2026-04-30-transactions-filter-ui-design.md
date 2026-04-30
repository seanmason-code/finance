# Phase 5c — `/transactions` Filter UI Design

**Date:** 2026-04-30
**Status:** Spec — pending plan
**Predecessor:** Phase 5b (Txn detail + notes + autosave)
**Supersedes:** the URL-only filter contract introduced in Phase 4

---

## Context

Today, `/transactions` accepts URL params (`?type`, `?category`, `?since`, `?uncategorised`) but renders **zero filter UI** — Sean can only filter by URL-typing or by clicking through dashboard tile deep-links. The page also doesn't show a Category column. Today's smoke session also exposed two adjacent issues with the existing native HTML `<select>` in `MakeRuleModal`: a ~5s lag closing the dropdown (compositor-bound, partially mitigated by simplifying box-shadow) and viewport-clipping when the dropdown opens upward.

This phase replaces URL-only filtering with a real desktop filter UI on `/transactions` and introduces the shadcn primitives (`Select`, `Popover`) needed both here and as a permanent fix for the `MakeRuleModal` native-select issues.

---

## Goal

Sean can filter `/transactions` by **Date**, **Merchant**, and **Category** using inline column-header controls, plus a one-click **Uncategorised only** chip — all on desktop, all server-side, all URL-synced. The MakeRuleModal native `<select>` is permanently replaced with the new shadcn `<Select>` to kill today's lag/clipping.

---

## Locked design decisions (from brainstorm)

| Question | Decision |
|---|---|
| Where do filter controls live? | **C** — inline column-header filters (date / merchant / category each at their own column header) |
| Filters in v1 | Date, Merchant, Category. Amount deferred. |
| Uncategorised handling | **(a)** standalone chip beside the Category column header — daily-use, one-click |
| Mobile in v1 | **(a)** desktop-first, mobile deferred to a small follow-up phase |
| Component primitive | **A** — shadcn `Select` + `Popover` (Radix-based) — battle-tested accessibility, themeable through DESIGN.md tokens. Same primitives also permanently replace the native `<select>` in MakeRuleModal. |
| URL contract | Extends today's `?type / ?category / ?since / ?uncategorised` with `?date_preset` and `?q`. No breaking change. |
| Server vs client filtering | Server-side (current Supabase query). 4,745 rows × full record = ~2MB on first paint if client-side; not worth it. |
| Default state on first load | Today's behavior unchanged: latest first, no filters applied. |

---

## Architecture

**New shadcn primitives (one-time `npx shadcn add`):**
- `select` — Category column dropdown
- `popover` — Date column dropdown (preset list); also general primitive for future filter expansion

**File structure** (follows `ui-stack` convention — `components/ui/` for shadcn raw, `components/primitives/` for lightly-customised, `components/blocks/` for page-level compositions):

```
components/
  ui/
    select.tsx                       (new — shadcn raw)
    popover.tsx                      (new — shadcn raw)
  primitives/
    filter-popover.tsx               (new — wraps Popover with column-header trigger styling)
  blocks/
    transactions-filter-bar.tsx      (new — composes the four filters above the table)

app/transactions/
  page.tsx                           (server — extend search-param handling, render new column + filter bar)
  _filters/
    date-filter.tsx                  (new — client; uses FilterPopover)
    merchant-filter.tsx              (new — client; debounced input)
    category-filter.tsx              (new — client; uses shadcn Select)
    uncategorised-chip.tsx           (new — client; standalone toggle)
    use-debounced-value.ts           (new — small hook for merchant search)
  make-rule-modal.tsx                (refactor — replace native <select> with shadcn Select)

lib/transactions/
  filter-params.ts                   (new — pure helpers: parseDatePreset, escapeIlike, mergeFilterPrecedence)
  filter-params.test.ts              (new — vitest)
```

**Component breakdown:**

- **`<DateFilter>`** — opens a `<FilterPopover>` listing presets (`All time` / `This cycle` / `Last cycle` / `Last 7 days` / `Last 30 days`). Click → URL update with `?date_preset` (and `?since` derived). Selected preset shows a checkmark.
- **`<MerchantFilter>`** — inline `<input>` in the Merchant column header. Debounced via `use-debounced-value` (250ms) → URL update with `?q`.
- **`<CategoryFilter>`** — shadcn `<Select>` listing all categories alphabetised, with `Any` and `Uncategorised` pseudo-options at the top. Selecting `Uncategorised` is a synonym for setting `?uncategorised=true`.
- **`<UncategorisedChip>`** — standalone toggle button beside the column-header row. Same effect as `<CategoryFilter>` selecting `Uncategorised`. Both stay in sync via the URL.
- **`<TransactionsFilterBar>`** — block-level composition that holds the column-header row + the chip. Doesn't own state — reads from server-side props (current params) and emits URL changes via `next/navigation`'s `useRouter`.

---

## Data flow & URL contract

**Single source of truth = URL params**, extending today's contract:

| Param | Today | After this phase | Notes |
|---|---|---|---|
| `?type=expense\|income\|transfer` | ✅ | unchanged | Set by chip clicks (later phase if we add type chips to UI) |
| `?category=<uuid>` | ✅ | unchanged | Set by `<CategoryFilter>` |
| `?since=YYYY-MM-DD` | ✅ | unchanged | Computed from `date_preset`; persisted for shareable URLs |
| `?uncategorised=true` | ✅ | unchanged | Set by chip OR by Category dropdown selecting "Uncategorised" |
| `?date_preset=all\|cycle\|last_cycle\|7d\|30d` | — | **NEW** | Drives `since` + caches the preset name so the UI shows which preset is selected |
| `?q=<text>` | — | **NEW** | Substring match against `merchant_clean` (server-side `ilike '%text%'`) |
| `?page=<n>` | ✅ | unchanged | Pagination, preserved across filter changes |

**Filter-change flow:**
1. User toggles a filter (chip click / dropdown select / typing in merchant box).
2. Client component pushes a new URL via `router.replace()` (preserves browser history sensibly — no back-button spam from each keystroke).
3. Next App Router refetches the page Server Component with the new search params.
4. Server Component runs the Supabase query with new filters and returns the new HTML.

**Debounce on merchant search:**
- 250ms — typing "central park" doesn't trigger 11 refetches.
- Implemented with a small `use-debounced-value` hook (~10 LOC).

**Pagination + filters:**
- Page resets to 1 whenever a filter changes (otherwise you can land on page 6 of a list with only 2 pages).
- Already partially handled today via `pagerPrefix`; extend it with the new params.

---

## Filter precedence & combination rules

When the URL state is internally inconsistent, deterministic precedence:

- `?uncategorised=true` AND `?category=<uuid>` both set → **uncategorised wins**. The Category dropdown displays "Uncategorised" (highlighted) and the chip is on. Reason: the chip is the stronger user signal; a stale `?category` from a bookmark shouldn't fight a deliberate uncategorised toggle.
- Selecting "Uncategorised" in the Category dropdown sets `?uncategorised=true` and clears `?category` — same URL as toggling the chip on.
- Selecting "Any" in the Category dropdown clears both `?category` and `?uncategorised`.
- All filters AND together at the SQL level — `type`, `date_preset/since`, `q`, `category`, and `uncategorised` all narrow the result set jointly. No OR semantics in v1.

---

## Default state

- **Date preset** = `All time` (no `?since`)
- **Merchant search** = empty
- **Category** = `Any`
- **Uncategorised chip** = off
- **Page** = 1

Reasoning: today's page shows everything, latest first. The new UI adds controls *on top* without silently narrowing the default — preserves dashboard tile click-through behaviour exactly.

---

## Edge cases

- **Zero matches:** show `No transactions match these filters.` with a `Clear filters` link that strips all filter params and reloads. Don't render the empty pager.
- **Filter refers to a deleted category:** `?category=<uuid>` no longer in `v2.categories` → server query returns 0 rows → zero-state. Dropdown defaults to "Any" rather than crashing on "category not found".
- **Merchant search with special chars** (`%`, `_`, `\`): `escapeIlike()` helper escapes them before the query. Without escaping, `ilike` treats them as wildcards and `central%park` silently misbehaves.
- **Stale URL from a bookmark:** the page already redirects unauthenticated users to `/login`. Filter params are passive; missing/malformed values fall back to defaults.

---

## Error handling

- Supabase query error → existing error block in `app/transactions/page.tsx` lines 70-77 catches it. No change.
- Filter component errors → effectively impossible: all filters do is push URL changes. If the page refetch fails, the existing error block catches it.

---

## Visual aesthetic — follows DESIGN.md

- Headings: `#061b31` deep navy
- Active chip / selected popover item: `#533afd` purple
- Borders / dividers: subtle blue-grey (`#e5e9f0`)
- Shadows: light Stripe-style (`rgba(50,50,93,0.13)`) on popovers — but capped at one layer (lesson learned from today's MakeRuleModal compositor lag)
- Border radius: 4-6px (Stripe-conservative, no pills)
- Pills (in Category column): light grey background for set categories, light orange (`#fef3e0` / `#b07c1a`) for `Uncategorised`

---

## Tests

### Unit (vitest)

- `lib/transactions/filter-params.test.ts`
  - `parseDatePreset("cycle")` → `{ since: "<this-cycle-anchor>", date_preset: "cycle" }`
  - `parseDatePreset("7d")` → since is today minus 6 days
  - `parseDatePreset("all")` → `{ since: null, date_preset: "all" }`
  - `escapeIlike("100%_test\\")` → `"100\\%\\_test\\\\"` (or equivalent — confirms `%`, `_`, `\` are escaped)
  - `mergeFilterPrecedence({ category: "abc", uncategorised: true })` → `{ uncategorised: true }`
  - `mergeFilterPrecedence({ category: "Any" })` → `{}`
- `app/transactions/_filters/use-debounced-value.test.ts` — `vi.useFakeTimers`; typing `"c", "ce", "cen"` within 250ms emits once.

### Integration (skip)

- `app/transactions/page.test.tsx` — heavier than the project's current test surface. Server-component Supabase mocking would change the project's testing ergonomic. Pure helpers above cover the actual logic.

### Manual smoke (after deploy)

- ☐ Page loads with no filters → identical to today's view
- ☐ Click Uncategorised chip → URL gets `?uncategorised=true`, table shows only uncategorised rows
- ☐ Click Date column ⏷ → popover opens, click "This cycle" → URL gets `?date_preset=cycle&since=YYYY-MM-DD`, table reflects
- ☐ Type in Merchant box → after 250ms, URL gets `?q=…`, table refilters
- ☐ Pick a category from dropdown → URL gets `?category=<uuid>`, table refilters
- ☐ Combine: Uncategorised + merchant "central" + date "Last 30d" all compose correctly, count drops
- ☐ Zero-state shows when no rows match; "Clear filters" works
- ☐ Pagination preserves filters
- ☐ MakeRuleModal native `<select>` replaced with shadcn `<Select>`; verify dropdown opens/closes cleanly with no clipping or lag (regression check on today's bug)

### What NOT to test

- Visual pixel-perfection
- shadcn primitive internals (Radix tests them)
- URL routing (Next handles it)

---

## Out of scope (deferred)

**Small follow-up phase (next round of UI work):**
- Mobile responsive view — bottom-sheet "Filter" button on narrow viewports
- Type chips (Expense / Income / Transfer) — `?type=` already in URL, just no UI for it; easy to add later
- Amount range filter

**Bigger phases:**
- Custom calendar widget for Date — v1 ships presets only
- Saved filter views / pinned views — Phase 8 / Reports
- Multi-select category — extends `<Select>` to `<MultiSelect>`
- Server-side full-text search across description — needs `tsvector` index
- Column sorting — separate UX problem

**Other deferrals:**
- Spotify merchant cleanup is its own phase (parsing bug, not filter UI)

---

## Estimated build

**~3-4 hours subagent-driven, ~8-10 plan tasks:**

1. `npx shadcn add select popover` + commit installed primitives
2. `lib/transactions/filter-params.ts` + TDD tests (parseDatePreset, escapeIlike, mergeFilterPrecedence)
3. `app/transactions/_filters/use-debounced-value.ts` + test
4. `app/transactions/_filters/uncategorised-chip.tsx` (standalone — simplest filter component)
5. `components/primitives/filter-popover.tsx` + `app/transactions/_filters/date-filter.tsx`
6. `app/transactions/_filters/merchant-filter.tsx`
7. `app/transactions/_filters/category-filter.tsx`
8. `components/blocks/transactions-filter-bar.tsx` — compose the four filters
9. Wire into `app/transactions/page.tsx` — extend search-param parsing, render filter bar, add Category column, render zero-state with "Clear filters" link
10. Refactor `app/transactions/make-rule-modal.tsx` — replace native `<select>` with shadcn `<Select>`
11. Phase completion marker doc (`docs/PHASE-6-UI-COMPLETE.md`)

---

## Reference paths

- Predecessor spec: `2026-04-30-phase-5-dashboard-completeness-design.md`
- Master spec: `2026-04-29-finance-app-rebuild-design.md`
- DESIGN.md: `~/Projects/finance-v2/DESIGN.md` (Stripe-inspired)
- ui-stack guidance: `~/.claude/skills/ui-stack/SKILL.md`
- Brainstorm artefacts: `~/Projects/finance-v2/.superpowers/brainstorm/1666776-1777541877/`
