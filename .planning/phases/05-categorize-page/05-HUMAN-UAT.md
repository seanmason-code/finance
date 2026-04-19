---
status: partial
phase: 05-categorize-page
source: [05-VERIFICATION.md]
started: 2026-04-19T00:00:00Z
updated: 2026-04-19T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Dashboard nudge tiles render correctly
expected: When uncategorised transactions exist, a nudge tile appears above the stats grid showing the count. When unconfirmed transactions exist, a second nudge tile appears. When neither exists, no tile is shown.
result: [pending]

### 2. Nudge tile → Categorize page navigation
expected: Clicking either nudge tile navigates to the Categorize page. The Categorize nav link in the sidebar also navigates correctly.
result: [pending]

### 3. Inline save flow
expected: Selecting a category from the dropdown and clicking Save removes the row from the list, shows a toast confirmation, and the change persists on page reload.
result: [pending]

### 4. Apply-to-future modal fires after save
expected: After saving a category for a transaction from a recurring merchant, the apply-to-future modal appears offering to apply the rule going forward.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
