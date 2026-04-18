# Finance App Closeout Implementation Plan

> **HISTORICAL INTENT DOCUMENT** — Written before implementation. Describes what was planned, not necessarily what exists now.
> For current state, see: `PROJECT.md` (what it is), `ROADMAP.md` (phases), `STATE.md` (where we're up to).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the finance app with 7 targeted improvements: PWA icons, alert→toast cleanup, CSV export, auto transfer detection, account matching UX, custom categories, and mobile polish.

**Architecture:** All changes are in the existing vanilla JS SPA — `js/app.js` (2155 lines), `index.html`, `css/styles.css`. No new files needed except the PWA icon assets. No test infrastructure exists; manual browser testing is the verification method.

**Tech Stack:** Vanilla JS, HTML5, CSS3, Supabase, Chart.js, Vercel

---

## Task 1: PWA Icons

**Files:**
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`

No code changes — just generate the missing assets so the browser stops 404ing on them.

- [ ] **Step 1: Generate icons with Python**

```bash
cd /home/seanm/Projects/finance
python3 - <<'EOF'
from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('icons', exist_ok=True)

for size in [192, 512]:
    img = Image.new('RGB', (size, size), color='#0f1117')
    draw = ImageDraw.Draw(img)
    # Purple rounded square background
    margin = size // 8
    draw.rounded_rectangle([margin, margin, size - margin, size - margin],
                            radius=size // 6, fill='#6c63ff')
    # "F" letter centred
    font_size = size // 2
    try:
        font = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans-Bold.ttf', font_size)
    except:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), 'F', font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) // 2 - bbox[0], (size - th) // 2 - bbox[1]), 'F',
              fill='white', font=font)
    img.save(f'icons/icon-{size}.png')
    print(f'Created icons/icon-{size}.png')
EOF
```

If Pillow is not installed: `pip install Pillow` first.

- [ ] **Step 2: Verify files exist**

```bash
ls -lh /home/seanm/Projects/finance/icons/
```

Expected: `icon-192.png` and `icon-512.png` both present, non-zero size.

- [ ] **Step 3: Commit**

```bash
cd /home/seanm/Projects/finance
git add icons/
git commit -m "feat: add PWA icons (192 and 512)"
```

---

## Task 2: Replace alert() with showToast()

**Files:**
- Modify: `js/app.js`

`showToast(msg)` already exists at line 2130. Replace all 14 `alert(...)` error calls with it. Leave `confirm()` calls alone — they need a different solution (modals) which is out of scope today.

- [ ] **Step 1: Replace all alert() calls**

Open `js/app.js` and make these replacements (each is an error handler):

| Line | Old | New |
|------|-----|-----|
| 565 | `alert('Failed to save account: ' + err.message)` | `showToast('Failed to save account: ' + err.message)` |
| 579 | `alert('Failed to delete: ' + err.message)` | `showToast('Failed to delete account: ' + err.message)` |
| 651 | `alert('Failed to save: ' + err.message)` | `showToast('Failed to save service account: ' + err.message)` |
| 666 | `alert('Failed to delete: ' + err.message)` | `showToast('Failed to delete service account: ' + err.message)` |
| 1000 | `alert('Failed to save: ' + err.message)` | `showToast('Failed to save transaction: ' + err.message)` |
| 1012 | `alert('Failed to delete: ' + err.message)` | `showToast('Failed to delete transaction: ' + err.message)` |
| 1288 | `alert('Failed to save budget: ' + err.message)` | `showToast('Failed to save budget: ' + err.message)` |
| 1299 | `alert('Failed to delete: ' + err.message)` | `showToast('Failed to delete budget: ' + err.message)` |
| 1371 | `alert('Failed to move item: ' + err.message)` | `showToast('Failed to move item: ' + err.message)` |
| 1396 | `alert('Failed to save item: ' + err.message)` | `showToast('Failed to save budget item: ' + err.message)` |
| 1415 | `alert('Failed to delete item: ' + err.message)` | `showToast('Failed to delete budget item: ' + err.message)` |
| 1606 | `alert('Failed to save: ' + err.message)` | `showToast('Failed to save recurring: ' + err.message)` |
| 1617 | `alert('Failed to delete: ' + err.message)` | `showToast('Failed to delete recurring: ' + err.message)` |
| 1764 | `alert('Import failed: ' + err.message)` | `showToast('Import failed: ' + err.message)` |

Also make the toast visually distinct for errors — add an optional `type` param to `showToast`:

Find `showToast` at line 2130 and replace the whole function:

```js
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.textContent = msg;
  const bg = type === 'error' ? '#ef4444' : '#6c63ff';
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;background:${bg};color:white;
    padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;
    z-index:9999;opacity:0;transition:opacity 0.2s;box-shadow:0 4px 20px rgba(0,0,0,0.4);
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}
```

Then update all the error replacements above to use `showToast('...', 'error')`.

- [ ] **Step 2: Verify no alert() calls remain (except confirm)**

```bash
grep -n "alert(" /home/seanm/Projects/finance/js/app.js
```

Expected: no output.

- [ ] **Step 3: Manual test**

Open the app, try saving a transaction with Supabase disconnected (or trigger an error). Confirm error shows as red toast, not browser dialog.

- [ ] **Step 4: Bump SW cache and commit**

In `sw.js`, change `finance-vN` to the next version number.

```bash
cd /home/seanm/Projects/finance
git add js/app.js sw.js
git commit -m "feat: replace alert() with toast notifications, add error type styling"
```

---

## Task 3: CSV Export

**Files:**
- Modify: `js/app.js` — add `exportCSV()` function near existing `exportData()` at line 1738
- Modify: `index.html` — add Export CSV button near existing Export Data button (line 358)

- [ ] **Step 1: Add exportCSV() to app.js**

Insert after the closing `}` of `exportData()` (after line 1747):

```js
function exportCSV() {
  const headers = ['date', 'description', 'amount', 'type', 'category', 'account', 'notes'];
  const rows = transactions.map(t => [
    t.date || '',
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.type === 'expense' ? `-${t.amount}` : t.amount,
    t.type || '',
    t.category || '',
    t.account || '',
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Wire up the event listener**

Find the line: `document.getElementById('btn-export')?.addEventListener('click', exportData);`

Add directly after it:

```js
document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
```

- [ ] **Step 3: Add button to index.html**

Find:
```html
<button id="btn-export" class="btn-ghost">Export Data (JSON)</button>
```

Replace with:
```html
<button id="btn-export" class="btn-ghost">Export Data (JSON)</button>
<button id="btn-export-csv" class="btn-ghost">Export Data (CSV)</button>
```

- [ ] **Step 4: Manual test**

Open Settings → click "Export Data (CSV)". Open the downloaded file in a spreadsheet — confirm all columns present and amounts are negative for expenses.

- [ ] **Step 5: Bump SW cache and commit**

```bash
cd /home/seanm/Projects/finance
# bump sw.js version
git add js/app.js index.html sw.js
git commit -m "feat: add CSV export to settings"
```

---

## Task 4: Auto-run Transfer Detection After CSV Import

**Files:**
- Modify: `js/app.js`

Currently `findAndLabelTransfers()` is UI-coupled (updates DOM buttons, uses `confirm()`). Extract the detection+labelling logic into a silent function that returns a count, then call it automatically at the end of CSV import.

- [ ] **Step 1: Extract silent transfer labeller**

Add this new function directly above `findAndLabelTransfers()` (before line 1822):

```js
async function silentlyLabelTransfers() {
  const accountPatterns = [
    /^\d{2}-\d{4}-\d{7}-\d{2}/,
    /^\d{2}-\d{4}-\d{6}-\d{2}/,
    /^\d{3}-\d{4}-\d{3}/,
    /^\d{2}-\d{4}-\d{7}/,
  ];
  const transferKeywords = [
    'transfer', 'trf', 'internet banking', 'online banking',
    'between accounts', 'own account', 'savings transfer',
    'mortgage', 'loan payment', 'from account', 'to account',
  ];
  const candidates = transactions.filter(t => {
    if (t.category === 'Transfer') return false;
    const desc = (t.description || '').toLowerCase();
    return accountPatterns.some(p => p.test(t.description || '')) ||
           transferKeywords.some(k => desc.includes(k));
  });
  let updated = 0;
  for (const t of candidates) {
    try {
      const updatedTxn = { ...t, category: 'Transfer' };
      await SB.upsertTransaction(updatedTxn);
      const idx = transactions.findIndex(x => x.id === t.id);
      if (idx !== -1) transactions[idx] = updatedTxn;
      updated++;
    } catch (err) {
      console.error('Failed to label transfer:', err);
    }
  }
  return updated;
}
```

- [ ] **Step 2: Call it after CSV import completes**

Find the block ending at line 2101 (after `showToast(...)` and the service balance prompt):

```js
showToast(`${txnMsg}${balanceMsg}${patchMsg}`);
_importRows = [];
_csvFiles = [];
if (serviceAccounts.length > 0) {
  setTimeout(() => showServiceBalancePrompt(), 400);
}
```

Replace with:

```js
const transfersLabelled = await silentlyLabelTransfers();
const transferMsg = transfersLabelled > 0 ? ` · ${transfersLabelled} transfer${transfersLabelled !== 1 ? 's' : ''} labelled` : '';
showToast(`${txnMsg}${balanceMsg}${patchMsg}${transferMsg}`);
_importRows = [];
_csvFiles = [];
if (serviceAccounts.length > 0) {
  setTimeout(() => showServiceBalancePrompt(), 400);
}
```

- [ ] **Step 3: Manual test**

Import a CSV that contains transactions with "transfer" in the description. Confirm the import toast mentions transfers labelled, and those transactions show category "Transfer" in the transaction list.

- [ ] **Step 4: Bump SW cache and commit**

```bash
cd /home/seanm/Projects/finance
# bump sw.js version
git add js/app.js sw.js
git commit -m "feat: auto-label transfers after CSV import"
```

---

## Task 5: Account Matching UX

**Files:**
- Modify: `js/app.js`

Three improvements:
1. **Fuzzy match**: accept a transaction account that _contains_ a significant portion of the stored account number (not just exact)
2. **Unmatched count badge**: show how many transactions have no account on the Accounts page
3. **Bulk assign tool**: filter + assign unmatched transactions to an account from the Accounts page

- [ ] **Step 1: Improve normAccNum to handle partial matches**

Find `normAccNum` at line 344:

```js
function normAccNum(s) { return (s || '').replace(/[\s\-]/g, '').toLowerCase(); }
```

Add a helper `accNumMatches` directly after it:

```js
function accNumMatches(storedNum, txnAccount) {
  if (!storedNum || !txnAccount) return false;
  const norm = normAccNum(storedNum);
  const txn = normAccNum(txnAccount);
  if (norm === txn) return true;
  // Accept if the significant core digits match (strips leading bank prefix)
  // e.g. stored "38-9020-0211287-05" matches txn "389020021128705"
  if (norm.length >= 8 && txn.includes(norm)) return true;
  if (txn.length >= 8 && norm.includes(txn)) return true;
  return false;
}
```

- [ ] **Step 2: Update account matching to use accNumMatches**

Find all places that compare account numbers. There are two main spots:

**In `renderAccounts()` (around line 360):**

```js
const matched = txnIds.some(id => normAccNum(id) === normA);
```

Replace with:

```js
const matched = txnIds.some(id => accNumMatches(a.account_number, id));
```

**In `renderAccounts()` account card rendering (around line 455):**

```js
const normA = normAccNum(a.account_number);
```

Find the full account card logic that filters transactions by account and update it to use `accNumMatches`. Search for the line that reads:

```js
const acctTxns = transactions.filter(t => normAccNum(t.account) === normAccNum(a.account_number));
```

Replace with:

```js
const acctTxns = transactions.filter(t => accNumMatches(a.account_number, t.account));
```

- [ ] **Step 3: Add unmatched transaction count to Accounts page**

Find `renderAccounts()`. After the debug panel block (around line 366), add:

```js
// Unmatched count banner
const unmatchedEl = document.getElementById('accounts-unmatched');
if (unmatchedEl) {
  const unmatched = transactions.filter(t => {
    if (!t.account) return true;
    return !accounts.some(a => accNumMatches(a.account_number, t.account));
  });
  unmatchedEl.innerHTML = unmatched.length > 0
    ? `<div class="unmatched-banner">⚠️ ${unmatched.length} transaction${unmatched.length !== 1 ? 's' : ''} not linked to an account — <button class="link-btn" id="btn-assign-accounts">Assign now</button></div>`
    : '';
  document.getElementById('btn-assign-accounts')?.addEventListener('click', openAssignAccountsModal);
}
```

- [ ] **Step 4: Add the unmatched banner element to index.html**

Find the accounts page section in `index.html`. Look for `id="accounts-list"` and add before it:

```html
<div id="accounts-unmatched"></div>
```

- [ ] **Step 5: Add openAssignAccountsModal function**

Add this function in `js/app.js` near the accounts section:

```js
function openAssignAccountsModal() {
  const unmatched = transactions.filter(t => {
    if (!t.account) return true;
    return !accounts.some(a => accNumMatches(a.account_number, t.account));
  });
  const modal = document.getElementById('modal-assign-accounts');
  if (!modal) return;
  const listEl = document.getElementById('assign-accounts-list');
  const accountOpts = accounts
    .filter(a => a.type !== 'service')
    .map(a => `<option value="${escHtml(a.account_number)}">${escHtml(a.name)}</option>`)
    .join('');

  listEl.innerHTML = unmatched.slice(0, 50).map(t => `
    <div class="assign-row" data-id="${escHtml(t.id)}">
      <span class="assign-desc">${escHtml(t.description || '')} <small>${escHtml(t.date || '')}</small></span>
      <select class="assign-select" data-id="${escHtml(t.id)}">
        <option value="">— skip —</option>
        ${accountOpts}
      </select>
    </div>
  `).join('');

  if (unmatched.length > 50) {
    listEl.innerHTML += `<p class="muted">Showing first 50 of ${unmatched.length}. Run again after saving to handle more.</p>`;
  }
  modal.classList.remove('hidden');
}

async function saveAssignedAccounts() {
  const rows = document.querySelectorAll('#assign-accounts-list .assign-row');
  let updated = 0;
  for (const row of rows) {
    const id = row.dataset.id;
    const sel = row.querySelector('.assign-select');
    if (!sel || !sel.value) continue;
    const txn = transactions.find(t => t.id === id);
    if (!txn) continue;
    const updatedTxn = { ...txn, account: sel.value };
    try {
      await SB.upsertTransaction(updatedTxn);
      const idx = transactions.findIndex(t => t.id === id);
      if (idx !== -1) transactions[idx] = updatedTxn;
      updated++;
    } catch (err) {
      console.error('Failed to assign account:', err);
    }
  }
  closeModals();
  refreshCurrentPage();
  showToast(`${updated} transaction${updated !== 1 ? 's' : ''} linked to accounts`);
}
```

- [ ] **Step 6: Add the assign accounts modal to index.html**

Add this modal before the closing `</body>` tag (or near other modals):

```html
<!-- Assign Accounts Modal -->
<div id="modal-assign-accounts" class="modal-backdrop hidden">
  <div class="modal" style="max-width:640px;max-height:80vh;overflow-y:auto;">
    <button class="modal-close">✕</button>
    <h2>Assign Accounts to Transactions</h2>
    <p class="muted">These transactions aren't linked to any account. Select an account for each one.</p>
    <div id="assign-accounts-list"></div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn-primary" id="btn-save-assigned-accounts">Save</button>
      <button class="btn-ghost modal-close-btn">Cancel</button>
    </div>
  </div>
</div>
```

- [ ] **Step 7: Wire up the save button**

In the `init()` or settings binding section, add:

```js
document.getElementById('btn-save-assigned-accounts')?.addEventListener('click', saveAssignedAccounts);
```

- [ ] **Step 8: Add CSS for new elements**

In `css/styles.css`, add:

```css
.unmatched-banner {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 16px;
  color: #f59e0b;
  font-size: 14px;
}
.unmatched-banner .link-btn {
  background: none;
  border: none;
  color: #6c63ff;
  cursor: pointer;
  text-decoration: underline;
  font-size: 14px;
  padding: 0;
}
.assign-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  gap: 12px;
}
.assign-desc { flex: 1; font-size: 13px; }
.assign-desc small { color: var(--text-muted); margin-left: 6px; }
.assign-select { background: var(--surface2); color: var(--text); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 8px; font-size: 13px; }
```

- [ ] **Step 9: Manual test**

Go to Accounts page. If any transactions lack an account, the yellow banner appears. Click "Assign now", assign a few, save. Confirm the count drops.

- [ ] **Step 10: Bump SW cache and commit**

```bash
cd /home/seanm/Projects/finance
# bump sw.js version
git add js/app.js index.html css/styles.css sw.js
git commit -m "feat: account matching UX — fuzzy match, unmatched banner, bulk assign modal"
```

---

## Task 6: Custom Categories

**Files:**
- Modify: `js/app.js`
- Modify: `index.html` — add manage categories UI in Settings

**Approach:** Store custom categories in `localStorage` under key `finance_custom_categories`. Merge with defaults at load time. Add a simple add/remove UI in Settings.

- [ ] **Step 1: Extract category lists into constants**

Find `categoryIcon()` (around line 880) and add these constants directly ABOVE it:

```js
const DEFAULT_EXPENSE_CATEGORIES = [
  'Housing','Food & Dining','Transport','Transport: Fuel',
  'Transport: Parking & Tolls','Transport: Car Maintenance',
  'Health','Insurance','Entertainment','Subscriptions',
  'Shopping','Utilities','Kids','Travel','Savings',
  'Investments','Work Expenses','Education','Personal Care',
  'Personal Spending','Transfer','Other',
];
const DEFAULT_INCOME_CATEGORIES = [
  'Salary','Freelance','Rental Income','Investment',
  'Gift','Reimbursements','Other Income','Transfer',
];

function getCustomCategories() {
  try {
    return JSON.parse(localStorage.getItem('finance_custom_categories') || '{"expense":[],"income":[]}');
  } catch { return { expense: [], income: [] }; }
}

function saveCustomCategories(custom) {
  localStorage.setItem('finance_custom_categories', JSON.stringify(custom));
}

function getExpenseCategories() {
  const custom = getCustomCategories();
  return [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...(custom.expense || [])])].sort();
}

function getIncomeCategories() {
  const custom = getCustomCategories();
  return [...new Set([...DEFAULT_INCOME_CATEGORIES, ...(custom.income || [])])].sort();
}
```

- [ ] **Step 2: Replace hardcoded category option builders**

Find `updateRecurringCategories()` (around line 1531). Replace the hardcoded HTML strings with:

```js
function updateRecurringCategories(type) {
  const sel = document.getElementById('recurring-category');
  const cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
  sel.innerHTML = `<option value="">Select category...</option>` +
    cats.map(c => `<option value="${escHtml(c)}">${categoryIcon(c)} ${escHtml(c)}</option>`).join('');
}
```

Find the transaction modal category population. Search for the block that builds `expenseOpts` and `incomeOpts` for the transaction form (grep for `option value="Housing"`). Replace with a function call:

```js
function buildCategoryOptions(type, selected = '') {
  const cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
  return `<option value="">Select category...</option>` +
    cats.map(c => `<option value="${escHtml(c)}" ${c === selected ? 'selected' : ''}>${categoryIcon(c)} ${escHtml(c)}</option>`).join('');
}
```

Then replace any remaining inline category `<option>` blocks in the transaction modal HTML generation with calls to `buildCategoryOptions('expense')` and `buildCategoryOptions('income')`.

- [ ] **Step 3: Add manage categories UI to Settings**

In `index.html`, find the Settings page section. After the existing settings content, add:

```html
<div class="settings-section">
  <h3>Categories</h3>
  <p class="muted">Add custom categories to expense or income lists.</p>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
    <input id="new-category-name" type="text" placeholder="Category name" style="flex:1;min-width:160px;">
    <select id="new-category-type">
      <option value="expense">Expense</option>
      <option value="income">Income</option>
    </select>
    <button id="btn-add-category" class="btn-primary">Add</button>
  </div>
  <div id="custom-categories-list"></div>
</div>
```

- [ ] **Step 4: Add renderCustomCategories() and wire up Settings**

Add these functions in `app.js`:

```js
function renderCustomCategories() {
  const el = document.getElementById('custom-categories-list');
  if (!el) return;
  const custom = getCustomCategories();
  const all = [
    ...custom.expense.map(c => ({ name: c, type: 'expense' })),
    ...custom.income.map(c => ({ name: c, type: 'income' })),
  ];
  if (all.length === 0) {
    el.innerHTML = '<p class="muted" style="font-size:13px;">No custom categories yet.</p>';
    return;
  }
  el.innerHTML = all.map(c => `
    <div class="category-tag">
      ${categoryIcon(c.name)} ${escHtml(c.name)} <span class="muted">(${c.type})</span>
      <button class="tag-remove" data-name="${escHtml(c.name)}" data-type="${escHtml(c.type)}">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const custom = getCustomCategories();
      custom[btn.dataset.type] = (custom[btn.dataset.type] || []).filter(c => c !== btn.dataset.name);
      saveCustomCategories(custom);
      renderCustomCategories();
    });
  });
}

function addCustomCategory() {
  const name = document.getElementById('new-category-name')?.value.trim();
  const type = document.getElementById('new-category-type')?.value;
  if (!name || !type) return;
  const custom = getCustomCategories();
  if (!(custom[type] || []).includes(name)) {
    custom[type] = [...(custom[type] || []), name];
    saveCustomCategories(custom);
  }
  document.getElementById('new-category-name').value = '';
  renderCustomCategories();
  showToast(`Category "${name}" added`);
}
```

Wire up in the settings binding block:

```js
document.getElementById('btn-add-category')?.addEventListener('click', addCustomCategory);
renderCustomCategories();
```

- [ ] **Step 5: Add CSS for category tags**

In `css/styles.css`:

```css
.category-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 13px;
  margin: 4px;
}
.tag-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  line-height: 1;
}
.tag-remove:hover { color: #ef4444; }
```

- [ ] **Step 6: Manual test**

Go to Settings → add a custom category "Pets" (expense). Open a transaction → category dropdown should include "Pets". Go back to Settings → delete it → confirm it's gone from the dropdown.

- [ ] **Step 7: Bump SW cache and commit**

```bash
cd /home/seanm/Projects/finance
# bump sw.js version
git add js/app.js index.html css/styles.css sw.js
git commit -m "feat: custom categories — add/remove via Settings, persisted in localStorage"
```

---

## Task 7: Mobile Layout Polish

**Files:**
- Modify: `css/styles.css`
- Modify: `index.html` (minor — modal sizing)

Target the three roughest mobile spots: stats cards stacking awkwardly, chart overflow on narrow screens, and modal padding on small screens.

- [ ] **Step 1: Fix stats cards on mobile**

In `css/styles.css`, find the `@media (max-width: 600px)` block (around line 1177). Add:

```css
@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .stat-card {
    padding: 14px 12px;
  }
  .stat-value {
    font-size: 18px;
  }
  .charts-grid {
    grid-template-columns: 1fr;
  }
  .modal {
    margin: 8px;
    padding: 20px 16px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-actions {
    flex-direction: column;
  }
  .modal-actions button {
    width: 100%;
  }
}
```

- [ ] **Step 2: Fix chart containers overflowing on mobile**

Find or add chart container styles:

```css
@media (max-width: 600px) {
  .chart-card canvas {
    max-height: 220px;
  }
  .chart-card {
    padding: 14px 10px;
  }
}
```

- [ ] **Step 3: Fix transaction list on mobile**

```css
@media (max-width: 600px) {
  .txn-row {
    flex-wrap: wrap;
    gap: 4px;
  }
  .txn-amount {
    font-size: 14px;
  }
  .txn-desc {
    font-size: 13px;
    white-space: normal;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .page-header .btn-primary {
    width: 100%;
  }
}
```

- [ ] **Step 4: Test on mobile viewport**

In browser DevTools, toggle mobile emulation (iPhone SE or similar, 375px wide). Check:
- Dashboard stats cards: two columns ✓
- Charts: don't overflow ✓
- Transaction list: readable ✓
- Modals: full width with proper padding ✓

- [ ] **Step 5: Bump SW cache and commit**

```bash
cd /home/seanm/Projects/finance
# bump sw.js version
git add css/styles.css sw.js
git commit -m "feat: mobile layout polish — stats grid, chart sizing, modal responsive"
```

---

## End of Day: UI/Styling Pass

This is a lighter-touch review once all features are in. Reserve 30-60 min at end of session. Focus areas:

1. **Spacing consistency** — check card padding, section gaps, modal internal spacing
2. **Button hierarchy** — primary vs ghost vs danger buttons used correctly
3. **Empty states** — pages with no data should have a friendly message, not just blank space
4. **Typography** — heading sizes consistent across pages
5. **Colour usage** — red only for errors/destructive, green for positive amounts, purple for primary actions

No specific code for this task — it's an eyes-on pass with targeted CSS tweaks.

---

## Execution Order

1. Task 1 (Icons) — quick win, 10 min
2. Task 2 (Alerts→Toast) — quick win, 20 min
3. Task 3 (CSV Export) — quick win, 15 min
4. Task 4 (Transfer Auto-detect) — quick win, 20 min
5. Task 5 (Account Matching UX) — most important, 60 min
6. Task 6 (Custom Categories) — 45 min
7. Task 7 (Mobile Polish) — 30 min
8. UI/Styling pass — 30 min end-of-day
