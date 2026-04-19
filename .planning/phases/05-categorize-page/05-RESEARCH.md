# Phase 5: Categorize Page — Research

**Researched:** 2026-04-19
**Domain:** Vanilla JS SPA — new view + dashboard nudge tiles
**Confidence:** HIGH (all findings verified directly from codebase)

---

## Summary

Phase 5 is a low-risk, mostly additive phase. The existing codebase has strong patterns to follow: a `navigateTo(page)` router, reusable `transactionHTML()` and `buildCategoryOptions()` helpers, `maybeOfferFutureRule()` already wired for inline use, and a well-established CSS variable system. No new dependencies are required.

The two deliverables are:

1. **Dashboard nudges** — two small clickable tiles (or cards) on the Dashboard showing uncategorised and unconfirmed counts, deep-linking to the Categorize page.
2. **Categorize page** — a new `#page-categorize` page registered in the router, listing all uncategorised transactions with inline `<select>` category pickers and confirm buttons. Saving a category change calls the existing `saveTransaction` / `upsertTransaction` path and fires `maybeOfferFutureRule` inline.

The only novel work is:
- Counting uncategorised/unconfirmed from the in-memory `transactions` array.
- Rendering a fast inline `<select>` per row (not the full modal) on the Categorize page.
- Wiring keyboard navigation (Tab through selects, Enter to confirm).
- Adding `#page-categorize` to `index.html` and registering `categorize` in `navigateTo`.
- Adding a nav link (or no nav link — deep-link only from dashboard nudge).
- Bumping `sw.js` from `finance-v52` to `finance-v53`.

**Primary recommendation:** Build the Categorize page as a full `#page-categorize` div with a nav link. The dashboard nudges are small stat-card-style tiles injected into `renderDashboard()`. The inline category picker is a `<select>` rendered per row — no modal.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TDY-01 | Dashboard surfaces count of uncategorised transactions as clickable nudge | Count from `leafTransactions().filter(t => !t.category \|\| t.category === '')`. Dashboard already has a `#tidy-nudge` injection point. Render as a small `.stat-card` or `.tidy-nudge-card`. |
| TDY-02 | Dashboard surfaces count of unconfirmed transactions as clickable nudge | Count from `leafTransactions().filter(t => t.confirmed === false)`. Same nudge card, two rows. |
| TDY-03 | Dedicated Categorize page lists all uncategorised transactions | New `#page-categorize` page, registered in `navigateTo`. Filter: `transactions.filter(t => !t.category \|\| t.category === '')` (all transactions, not just leafTransactions — parents without a category should also be categorisable). |
| TDY-04 | User can set category on each transaction with minimal clicks (inline picker/keyboard-friendly) | Inline `<select>` per row using `buildCategoryOptions(t.type, t.category)`. On `change`, call `upsertTransaction` and `maybeOfferFutureRule`. Tab focus moves to next row's select. |
| TDY-05 | Apply-to-future prompt fires inline on Categorize page | Call `maybeOfferFutureRule(t)` after each successful category save. The existing modal (`#modal-apply-future`) handles the rest — no extra plumbing. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Uncategorised/unconfirmed count | Browser / Client | — | Derived from in-memory `transactions[]` array already loaded at boot |
| Dashboard nudge tiles | Browser / Client | — | Injected by `renderDashboard()`, same pattern as pace-card and budget-health-card |
| Categorize page routing | Browser / Client | — | `navigateTo('categorize')` pattern, same as all other pages |
| Inline category save | Browser / Client → Supabase | — | `SB.upsertTransaction()` already exists; no new DB layer needed |
| Apply-to-future prompt | Browser / Client | — | `maybeOfferFutureRule()` already implemented in Phase 4; just call it |

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Vanilla JS | ES2020+ | All app logic | Already used |
| Supabase JS | @2 (CDN) | DB reads/writes | Already wired via `SB.*` helpers |
| Chart.js | 4.4.0 (CDN) | Charts | Not needed for this phase |

### No new dependencies needed.

**Installation:** none required.

---

## Architecture Patterns

### How `navigateTo` Works [VERIFIED: js/app.js:227]

```javascript
function navigateTo(page) {
  document.querySelectorAll('[data-page]').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById(`page-${page}`)?.classList.add('active');
  localStorage.setItem('lastPage', page);

  if (page === 'dashboard') renderDashboard();
  if (page === 'transactions') renderTransactionsList();
  // ... etc
}
```

**To add Categorize page:** add `if (page === 'categorize') renderCategorizePage();` to this switch block. Add `<div id="page-categorize" class="page">` in `index.html`. Add a `<li><a href="#" data-page="categorize">` nav item in the sidebar (or skip the nav link — deep-link only from dashboard).

### How Dashboard Cards Are Injected [VERIFIED: js/app.js:246, index.html:143]

Dashboard page has empty container divs that `renderDashboard()` fills via `innerHTML`:

```html
<div id="pace-card"></div>
<div id="upcoming-bills-card"></div>
<div id="spend-comparison-card" class="section-card"></div>
<div id="net-position-card" class="section-card net-position-card"></div>
<div id="budget-health-card"></div>
```

Each render function writes into its container:

```javascript
function renderPaceCard() {
  const card = document.getElementById('pace-card');
  if (!card) return;
  // ...
  card.innerHTML = `<div class="pace-card ...">...</div>`;
}
```

**For nudges:** Add `<div id="tidy-nudge-card"></div>` to `index.html` dashboard page (after pace-card is a good position), then write `renderTidyNudgeCard()` that follows the same pattern. Call it from `renderDashboard()`.

### How Transaction Category Select Works [VERIFIED: js/app.js:1781]

```javascript
function buildCategoryOptions(type, selected = '') {
  const cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
  return `<option value="">Select category...</option>` +
    cats.map(c => `<option value="${escHtml(c)}" ${c === selected ? 'selected' : ''}>${categoryIcon(c)} ${escHtml(c)}</option>`).join('');
}
```

This is the exact helper to use for the inline picker on the Categorize page. Pass `t.type` and `t.category` to pre-select the current value.

### How the Apply-to-future Modal Is Triggered [VERIFIED: js/app.js:1769]

```javascript
function maybeOfferFutureRule(t) {
  const suggested = firstTokenKeyword(t.description);
  if (!suggested) return;
  const never = getNeverAskMap();
  if (never[suggested]) return;
  const existingRule = rules.find(r =>
    (r.merchant_keyword || '').toLowerCase() === suggested.toLowerCase()
  );
  if (existingRule) return;
  openApplyFutureModal(t.category, suggested, t.description);
}
```

Call `maybeOfferFutureRule(updatedTransaction)` after a successful category save on the Categorize page. The modal (`#modal-apply-future`) is already in `index.html` and fully wired. No additional HTML or JS is needed.

### How `confirmTransaction` Works [VERIFIED: js/app.js:1421]

```javascript
async function confirmTransaction(id) {
  const txn = transactions.find(x => x.id === id);
  if (!txn) return;
  const updated = { ...txn, confirmed: true };
  try {
    await SB.upsertTransaction(updated);
    const idx = transactions.findIndex(x => x.id === id);
    if (idx >= 0) transactions[idx] = updated;
    refreshCurrentPage();
    showToast('Confirmed');
  } catch (err) {
    showToast('Failed to confirm: ' + err.message, 'error');
  }
}
```

Reuse this function directly on the Categorize page for inline confirm buttons.

### Recommended Page Structure

```
index.html
  #page-categorize.page
    header.page-header
      h1 "Categorize"
      p.hint "X transactions need a category"
    #categorize-list         ← rendered by renderCategorizePage()

js/app.js
  renderCategorizePage()     ← called by navigateTo('categorize')
  bindCategorizePage()       ← called once from startApp (or lazily on first navigate)
  saveInlineCategory(id, category)  ← upsert + maybeOfferFutureRule
```

### Transaction Row Pattern (existing) [VERIFIED: css/styles.css:352]

The existing `.txn-item` CSS gives: flex row, icon, description+meta, amount, actions. The Categorize page rows can reuse `.txn-item` but replace `.txn-amount` area with the inline `<select>` + save button. Alternatively use a table layout for the Categorize page — a flat list with columns: date, description, amount, category select, confirm button.

### CSS Variables Available [VERIFIED: css/styles.css:4]

```css
--bg: #0f0f1a          /* page background */
--card: #1e1e32        /* card background */
--border: #2a2a45      /* borders */
--accent: #6c63ff      /* primary accent (purple) */
--green: #22c55e       /* success/income */
--red: #ef4444         /* danger/expense */
--yellow: #f59e0b      /* warning */
--text-muted: #8888aa  /* secondary text */
--text-dim: #555577    /* tertiary text */
```

### Recommended Project Structure (additions only)

```
index.html
  + <div id="tidy-nudge-card"></div>   (in #page-dashboard)
  + <div id="page-categorize" class="page">  (after #page-recurring)
  + <li><a data-page="categorize">  (in #sidebar nav — or omit if deep-link only)

js/app.js
  + renderTidyNudgeCard()
  + renderCategorizePage()
  + saveInlineCategory(id, newCategory)
  + navigateTo: + if (page === 'categorize') renderCategorizePage()

css/styles.css
  + .tidy-nudge-card styles
  + .categorize-row styles (inline select, save btn)

sw.js
  + bump finance-v52 → finance-v53
```

---

## Counting Uncategorised and Unconfirmed [VERIFIED: js/app.js]

**Uncategorised:** `leafTransactions().filter(t => !t.category || t.category === '').length`
- `leafTransactions()` excludes split parents (line 1529). This is correct — split parents don't need categorising.
- A transaction is uncategorised if `category` is falsy or empty string.

**Unconfirmed:** `leafTransactions().filter(t => t.confirmed === false).length`
- Note: `confirmed === false` (strict equality), not `!t.confirmed`. Pre-migration rows have `confirmed = true` (backfilled). Only new imports have `confirmed = false`.

**For the Categorize page list:** Use `transactions.filter(t => !t.category || t.category === '')` directly (not `leafTransactions`), so split parents with empty categories also appear. However, split parents typically inherit a category from their children conceptually, so using `leafTransactions()` is also defensible — the planner should decide.

**Recommendation:** Use `leafTransactions().filter(t => !t.category || t.category === '')` for consistency with the rest of the app. Split parents are excluded since they don't represent real spend.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Category options list | Custom category fetcher | `buildCategoryOptions(t.type, t.category)` | Already exists; includes custom categories from localStorage |
| Category icon | Custom icon map | `categoryIcon(category)` | Already exists (line 1595) |
| Transaction upsert | Custom DB write | `SB.upsertTransaction(t)` | Already exists; handles Supabase upsert |
| Apply-to-future modal | New modal | `maybeOfferFutureRule(t)` + `#modal-apply-future` | Phase 4 fully wired this |
| Confirm transaction | Custom confirm logic | `confirmTransaction(id)` | Already exists (line 1421) |
| Toast notification | Custom toast | `showToast(msg, type)` | Already exists (line 3664) |
| HTML escaping | Custom escaping | `escHtml(str)` | Already exists (line 3681) |
| Page routing | Custom router | `navigateTo(page)` | Already handles active state + localStorage |

---

## Common Pitfalls

### Pitfall 1: Using `transactions` instead of `leafTransactions()` for counts
**What goes wrong:** Split parents double-count in totals.
**Why it happens:** Split parents are retained rows. Their children carry the real categories. Using `transactions.filter(...)` directly counts the parent row as uncategorised.
**How to avoid:** Always use `leafTransactions()` for display counts and lists. [VERIFIED: leafTransactions defined at js/app.js:1529]
**Warning signs:** Uncategorised count is higher than expected; parent transactions appear as uncategorised rows.

### Pitfall 2: Triggering `maybeOfferFutureRule` before updating the in-memory array
**What goes wrong:** The rule guard (`existingRule = rules.find(...)`) checks the live `rules` array. If `maybeOfferFutureRule` fires before the new rule is saved to `rules[]`, duplicate modals can appear.
**Why it happens:** Timing between async `upsertRule` and the in-memory `rules.push()`.
**How to avoid:** Follow the same pattern as `saveTransaction` — update `transactions[idx]` synchronously after `await SB.upsertTransaction`, then call `maybeOfferFutureRule(t)` in a `setTimeout(..., 80)` as Phase 4 does (line 1909).

### Pitfall 3: `category === ''` vs `!category`
**What goes wrong:** Transactions imported with an empty string category won't be caught by `!t.category` alone if the check is `t.category === undefined`.
**Why it happens:** Supabase may return `''` or `null` depending on how the row was inserted.
**How to avoid:** Check `!t.category || t.category === ''` (or just `!t.category` since `''` is falsy).

### Pitfall 4: Forgetting to refresh the dashboard nudge after categorising
**What goes wrong:** User categorises all transactions but the nudge count still shows the old number.
**Why it happens:** `refreshCurrentPage()` only re-renders the current active page — it won't refresh the dashboard if you're on the Categorize page.
**How to avoid:** After each inline save on the Categorize page, update the in-memory array and re-render the Categorize list. The dashboard will auto-refresh when the user navigates back to it (since `navigateTo('dashboard')` calls `renderDashboard()`). No special cross-page refresh is needed.

### Pitfall 5: sw.js cache not bumped
**What goes wrong:** Users get stale cached JS/HTML; new page and nudge tiles don't appear.
**Why it happens:** Service worker caches all assets; old cache is served until the version key changes.
**How to avoid:** Bump `finance-v52` → `finance-v53` in `sw.js` before deploy. [VERIFIED: sw.js:1]

### Pitfall 6: Inline `<select>` on mobile — accidental navigation
**What goes wrong:** On mobile, tapping anywhere on a transaction row navigates away (if row has a `click` handler).
**Why it happens:** The existing `.txn-item` rows have `cursor: pointer` and click handlers.
**How to avoid:** On the Categorize page, don't attach a row-level click handler. The `<select>` and save button handle all interaction. Or use `stopPropagation()` on the select's click event.

---

## Code Examples

### Counting uncategorised / unconfirmed
```javascript
// Source: verified pattern from js/app.js:1529 + filter logic
const uncategorised = leafTransactions().filter(t => !t.category || t.category === '').length;
const unconfirmed = leafTransactions().filter(t => t.confirmed === false).length;
```

### Nudge card injection (dashboard)
```javascript
// Source: pattern from renderPaceCard (js/app.js:278)
function renderTidyNudgeCard() {
  const card = document.getElementById('tidy-nudge-card');
  if (!card) return;
  const uncatCount = leafTransactions().filter(t => !t.category || t.category === '').length;
  const unconfCount = leafTransactions().filter(t => t.confirmed === false).length;
  if (uncatCount === 0 && unconfCount === 0) { card.innerHTML = ''; return; }
  card.innerHTML = `
    <div class="tidy-nudge-card section-card">
      ${uncatCount > 0 ? `<button class="tidy-nudge-item" data-filter="uncategorised">
        <span class="tidy-nudge-count">${uncatCount}</span> uncategorised
      </button>` : ''}
      ${unconfCount > 0 ? `<button class="tidy-nudge-item" data-filter="unconfirmed">
        <span class="tidy-nudge-count">${unconfCount}</span> unconfirmed
      </button>` : ''}
    </div>`;
  card.querySelectorAll('.tidy-nudge-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo('categorize'));
  });
}
```

### Inline category save
```javascript
// Source: pattern from saveTransaction (js/app.js:1856) + confirmTransaction (js/app.js:1421)
async function saveInlineCategory(id, newCategory) {
  const txn = transactions.find(x => x.id === id);
  if (!txn) return;
  const updated = { ...txn, category: newCategory };
  try {
    await SB.upsertTransaction(updated);
    const idx = transactions.findIndex(x => x.id === id);
    if (idx >= 0) transactions[idx] = updated;
    renderCategorizePage();                     // re-render to remove the row from list
    showToast(`Categorised as ${newCategory}`);
    setTimeout(() => maybeOfferFutureRule(updated), 80);
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}
```

### Row HTML for Categorize page
```javascript
// Source: transactionHTML pattern (js/app.js:1318) + buildCategoryOptions (js/app.js:1781)
function categorizeRowHTML(t) {
  const icon = categoryIcon(t.category);
  const dateStr = new Date(t.date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
  return `<div class="categorize-row" data-id="${t.id}">
    <div class="txn-icon ${t.type}">${icon}</div>
    <div class="txn-details">
      <div class="txn-description">${escHtml(t.description)}</div>
      <div class="txn-meta">${dateStr} · ${t.type === 'expense' ? '−' : '+'}${formatCurrency(t.amount)}</div>
    </div>
    <select class="categorize-select" data-id="${t.id}">
      ${buildCategoryOptions(t.type, t.category)}
    </select>
    <button class="btn-primary categorize-save" data-id="${t.id}" style="font-size:12px;padding:6px 12px;">Save</button>
  </div>`;
}
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Per-transaction modal edit | Inline `<select>` per row | Phase 5 goal — bulk UX without modal-per-row |
| No dashboard nudge | Clickable count tiles | New in Phase 5 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deep-link from nudge goes directly to Categorize page (not transactions page pre-filtered) | Architecture | Minor — could link to transactions page with filter instead, but a dedicated page is cleaner |
| A2 | Categorize page shows only uncategorised transactions (not unconfirmed) by default; unconfirmed are a secondary action | Architecture | Low — success criteria says "lists every uncategorised transaction" as the primary, confirms are secondary |
| A3 | A nav link for Categorize is added to the sidebar (not deep-link only) | Project structure | Low — either works; nav link is more discoverable |

---

## Open Questions

1. **Should the Categorize page also list unconfirmed transactions, or just uncategorised?**
   - What we know: TDY-03 says "lists all uncategorised transactions". TDY-02 says dashboard nudge for unconfirmed. Success criteria #1 says "clicking deep-links to Categorize page pre-filtered".
   - What's unclear: Does "pre-filtered" mean the Categorize page has a tab/toggle for "uncategorised vs unconfirmed", or are they separate destinations?
   - Recommendation: Single Categorize page with two sections or a toggle: "Needs category" (default) and "Unconfirmed". Both filters use the same row UI.

2. **Should the Categorize page appear in the sidebar nav?**
   - What we know: All other pages have sidebar nav links.
   - Recommendation: Add a nav link. The nudge click is the fast path; the nav link is the direct path. A "checkmark" or "tidy" icon works well.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 5 is code/config-only changes. No external tools or services beyond the existing Supabase connection are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — project uses browser smoke testing |
| Config file | none |
| Quick run command | Open http://localhost:4000, navigate to Dashboard, verify nudge counts |
| Full suite command | Manual smoke test per STATE.md pattern |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | How to Verify |
|--------|----------|-----------|---------------|
| TDY-01 | Dashboard shows uncategorised count as clickable nudge | Manual smoke | Import a CSV; verify nudge tile appears with correct count; click navigates to Categorize page |
| TDY-02 | Dashboard shows unconfirmed count as clickable nudge | Manual smoke | Fresh import; verify unconfirmed count is non-zero; tile appears; click works |
| TDY-03 | Categorize page lists all uncategorised transactions | Manual smoke | Navigate to Categorize; count rows matches dashboard nudge count |
| TDY-04 | User can set category with minimal clicks | Manual smoke | Select a category from inline dropdown, click Save; row disappears from list; toast appears |
| TDY-05 | Apply-to-future fires inline | Manual smoke | Categorise a transaction; apply-to-future modal appears; accepting saves a rule visible in Settings |

### Wave 0 Gaps

None — no new test framework needed. Existing smoke test pattern from STATE.md is sufficient for this phase.

---

## Security Domain

No new security surface. The Categorize page reads from and writes to the same `transactions` table already used throughout the app. The existing Supabase client handles all auth; no new policies needed. RLS is disabled on `transactions` by project design (joint account, no per-user RLS).

Input validation: category values come from `buildCategoryOptions()` which sources from `getExpenseCategories()` / `getIncomeCategories()` — a controlled list. No free-text category input on this page.

---

## Sources

### Primary (HIGH confidence — verified directly from codebase)
- `js/app.js` — navigateTo routing, renderDashboard, transactionHTML, buildCategoryOptions, maybeOfferFutureRule, openApplyFutureModal, confirmTransaction, leafTransactions, saveTransaction
- `index.html` — dashboard page structure, modal inventory, sidebar nav pattern
- `css/styles.css` — CSS variables, .txn-item, .section-card, .pace-card, .bh-tile, .unconfirmed-badge
- `sw.js` — current cache version finance-v52

### Secondary (HIGH confidence — project planning docs)
- `.planning/STATE.md` — current phase state, blocked status, sw.js version history
- `.planning/REQUIREMENTS.md` — TDY-01..05 definitions
- `.planning/ROADMAP.md` — Phase 5 success criteria

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns verified in codebase
- Architecture: HIGH — routing, rendering, and apply-to-future modal all verified by direct code read
- Pitfalls: HIGH — identified from actual code patterns (leafTransactions usage, confirmed === false strict check, sw.js version)

**Research date:** 2026-04-19
**Valid until:** Stable — until Phase 5 implementation begins; no external dependencies to expire
