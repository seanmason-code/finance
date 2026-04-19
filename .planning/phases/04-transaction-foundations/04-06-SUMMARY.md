# Phase 4 / Wave 5 — Summary

**Plan:** 04-06-PLAN.md (Apply-to-future rules + deploy — TXN-06, TXN-07)
**Status:** Code complete (pending Sean's smoke test + `vercel --prod`)
**Executed:** 2026-04-19

## What Shipped

### `index.html`
- `#modal-apply-future` modal: editable `#apply-future-keyword` input, category readout, Cancel / Never ask / Apply to future buttons.
- New **Auto-categorisation Rules** section in Settings with empty-state hint and `#rules-list` table container.

### `js/app.js`
- `firstTokenKeyword(description)` — extracts first alphabetic token, uppercased (e.g. `COUNTDOWN ST CLAIR 14/04/26` → `COUNTDOWN`).
- `applyRulesToRow(row, rulesList)` — case-insensitive substring match, FIFO first-match-wins.
- `getNeverAskMap()` / `setNeverAsk(keyword)` — localStorage-backed "never ask again" map at key `finance_rule_never_ask`.
- `openApplyFutureModal(category, suggestedKeyword, description)` — renders + wires Save (creates rule via `SB.upsertRule`) and Never-ask (writes localStorage).
- `maybeOfferFutureRule(t)` — guards: empty keyword → skip; never-ask list → skip; existing rule for same keyword → skip.
- **`saveTransaction`** post-save flow: after the existing bulk-apply path, chains `maybeOfferFutureRule` by wrapping the bulk-apply button handler AND the bulk modal's close handlers. On the no-matches path, fires the prompt directly.
- **`doImport`** loads rules fresh at the top of the function, then for each incoming row runs `applyRulesToRow` and sets `t.category` BEFORE upsert. Transfer detection still runs AFTER import so bank-internal transfers override generic rule matches.
- `renderRulesSettings()` — renders the rules table with Delete buttons; empty state when no rules exist. Called from `bindSettings` and from `navigateTo('settings')`.

### `css/styles.css`
- `.rules-table` block appended (plus th/td/code/tr:last-child sub-selectors).

### `sw.js`
- Cache bumped `finance-v51` → `finance-v52`.

## Verification
- 5 new functions present ✓
- 3 hook points (doImport rule apply, modal upsertRule, settings deleteRule) ✓
- 4 HTML IDs/text ✓
- 5 CSS selectors ✓
- `finance-v52` present, `finance-v51` removed ✓
- `node --check js/app.js` passes ✓

## Pending — Sean
1. Smoke test in browser: edit a transaction's category, accept the future-rule prompt, verify rule saved, import a matching CSV row, verify auto-categorisation, test Never-ask, test rule delete.
2. Run the deploy:
   ```bash
   cd ~/Projects/finance
   git commit with phase-4 message
   git push origin master
   vercel --prod
   ```
3. Hard-refresh finance-two-jet.vercel.app, verify cache flipped to finance-v52, all pages work.

## Post-Deploy
Phase 4 (TXN-01..07 + Unsplit) is LIVE once Vercel finishes. Ready for Jenny testing.
