# Service Accounts & Net Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manually-updated service account balances (Watercare, Rates, Power, Childcare etc.) as a separate section on the Accounts page, show a Net Position widget on the Dashboard combining bank + service balances, and prompt users to update service balances at the end of every CSV import.

**Architecture:** Service accounts are stored in the existing Supabase `accounts` table using `bank: 'Service'` as a type marker — no schema changes needed. They are filtered out of the bank accounts view and rendered separately. The dashboard reads both arrays to compute net position. The import prompt is a lightweight modal shown after `doImport()` completes if any service accounts exist.

**Tech Stack:** Vanilla JS, Supabase (existing accounts table), HTML/CSS, no new dependencies.

---

## File Map

| File | What changes |
|------|-------------|
| `js/app.js` | Split accounts into bank/service arrays; add `renderServiceAccounts()`; update `renderAccounts()` and `renderDashboard()`; add service account modal binding; add post-import balance prompt; remove debug panel |
| `index.html` | Add service accounts section + "Add Service Account" button to accounts page; add service account modal; add net position card to dashboard; remove debug div |
| `css/styles.css` | Service account card styles; net position widget styles |
| `sw.js` | Bump cache version |

---

## Task 1: Split accounts array into bank vs service

**Files:**
- Modify: `js/app.js` — state variables and `startApp`

- [ ] **Step 1: Add `serviceAccounts` state variable**

In `js/app.js`, find the top of the App IIFE where state variables are declared (around line 3–12). Add `serviceAccounts` next to `accounts`:

```javascript
let accounts = [];        // bank accounts (bank !== 'Service')
let serviceAccounts = []; // service provider balances (bank === 'Service')
```

- [ ] **Step 2: Split on load in `startApp`**

Find the `startApp` function (around line 116). After `accounts = await SB.getAccounts().catch(() => []);`, replace with:

```javascript
const allAccounts = await SB.getAccounts().catch(() => []);
accounts = allAccounts.filter(a => a.bank !== 'Service');
serviceAccounts = allAccounts.filter(a => a.bank === 'Service');
```

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/finance && git add js/app.js && git commit -m "Split accounts into bank vs service arrays"
```

---

## Task 2: Service Accounts section on Accounts page

**Files:**
- Modify: `js/app.js` — add `renderServiceAccounts()`, update `renderAccounts()`
- Modify: `index.html` — add section div and "Add Service Account" button
- Remove: debug div from `index.html`

- [ ] **Step 1: Add section HTML to Accounts page**

In `index.html`, find the accounts page block (around line 184–192). Replace the whole block with:

```html
<div id="page-accounts" class="page">
  <header class="page-header">
    <h1>Accounts</h1>
    <button id="btn-add-account" class="btn-primary">+ Add Account</button>
  </header>
  <div id="accounts-total-card"></div>
  <div id="accounts-list"></div>

  <header class="page-header" style="margin-top:32px">
    <h2 style="font-size:18px;font-weight:600">Service Accounts</h2>
    <button id="btn-add-service-account" class="btn-primary">+ Add Service Account</button>
  </header>
  <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Manually-tracked balances with providers — power credits, rates, childcare etc.</p>
  <div id="service-accounts-list"></div>
</div>
```

- [ ] **Step 2: Add `renderServiceAccounts()` to `js/app.js`**

After the closing `}` of `renderAccounts()` (find it by searching for `function accountCardHTML`), add:

```javascript
function renderServiceAccounts() {
  const el = document.getElementById('service-accounts-list');
  if (!el) return;

  if (serviceAccounts.length === 0) {
    el.innerHTML = `<div class="accounts-empty" style="padding:16px 0"><p>No service accounts yet. Add one to track provider balances.</p></div>`;
    return;
  }

  el.innerHTML = `<div class="accounts-grid">${serviceAccounts.map(a => serviceAccountCardHTML(a)).join('')}</div>`;
  el.querySelectorAll('.service-account-card').forEach(card => {
    card.addEventListener('click', () => openEditServiceAccount(card.dataset.id));
  });
}

function serviceAccountCardHTML(a) {
  const color = a.color || '#6c63ff';
  const balance = a.balance || 0;
  const balanceColor = balance >= 0 ? 'var(--green)' : 'var(--red)';
  const updatedAt = a.balance_updated_at
    ? (() => {
        const d = new Date(a.balance_updated_at);
        const diff = Math.round((Date.now() - d) / 86400000);
        return diff === 0 ? 'Updated today' : diff === 1 ? 'Updated yesterday' : `Updated ${diff} days ago`;
      })()
    : 'Not yet updated';

  return `
    <div class="service-account-card account-card" data-id="${a.id}" style="cursor:pointer">
      <div class="account-card-top">
        <div class="account-bank-icon" style="background:${color}22;color:${color};font-size:22px">🏷️</div>
        <div class="account-card-info">
          <div class="account-card-name">${escHtml(a.name)}</div>
          <div class="account-card-meta">${escHtml(a.notes || 'Service account')}</div>
        </div>
      </div>
      <div class="account-card-balance">
        <div class="account-card-balance-amount" style="color:${balanceColor}">${balance >= 0 ? '' : ''}${formatCurrency(balance)}</div>
        <div class="account-card-balance-updated">${updatedAt}</div>
      </div>
    </div>`;
}
```

- [ ] **Step 3: Call `renderServiceAccounts()` from `renderAccounts()`**

At the end of the `renderAccounts()` function body (just before its closing `}`), add:

```javascript
renderServiceAccounts();
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js index.html && git commit -m "Add service accounts section to Accounts page"
```

---

## Task 3: Service Account modal (add / edit / delete)

**Files:**
- Modify: `index.html` — add modal HTML
- Modify: `js/app.js` — add open/bind functions, keep serviceAccounts array in sync

- [ ] **Step 1: Add modal HTML to `index.html`**

Find the closing `</div>` of the Account Modal (around line 676, after `</form>`). After it, add:

```html
<!-- Service Account Modal -->
<div id="modal-service-account" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-box">
    <div class="modal-header">
      <h2 id="modal-service-account-title">Add Service Account</h2>
      <button class="modal-close">&times;</button>
    </div>
    <form id="form-service-account">
      <input type="hidden" id="service-account-id" value="" />
      <label>Name</label>
      <input type="text" id="service-account-name" placeholder="e.g. Watercare, Rates, Power" required />
      <label>Notes <span class="hint-inline">(optional — e.g. Auckland Council)</span></label>
      <input type="text" id="service-account-notes" placeholder="e.g. Auckland Council" />
      <label>Current Balance <span class="hint-inline">(negative if you owe them)</span></label>
      <div class="amount-input">
        <span class="currency-symbol">$</span>
        <input type="number" id="service-account-balance" placeholder="0.00" step="0.01" required />
      </div>
      <label>Colour</label>
      <div id="service-account-color-picker" class="color-picker-row"></div>
      <input type="hidden" id="service-account-color" value="#14b8a6" />
      <div class="modal-actions">
        <button type="button" id="btn-delete-service-account" class="btn-danger" style="margin-right:auto;display:none">Delete</button>
        <button type="button" class="btn-ghost modal-close-btn">Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>
```

- [ ] **Step 2: Add open/bind functions to `js/app.js`**

After the `bindAccountModal()` function closing `}` (around line 473), add:

```javascript
function openAddServiceAccount() {
  document.getElementById('modal-service-account-title').textContent = 'Add Service Account';
  document.getElementById('form-service-account').reset();
  document.getElementById('service-account-id').value = '';
  document.getElementById('service-account-color').value = '#14b8a6';
  document.getElementById('btn-delete-service-account').style.display = 'none';
  renderServiceColorPicker('#14b8a6');
  document.getElementById('modal-service-account').classList.remove('hidden');
}

function openEditServiceAccount(id) {
  const a = serviceAccounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('modal-service-account-title').textContent = 'Edit Service Account';
  document.getElementById('service-account-id').value = a.id;
  document.getElementById('service-account-name').value = a.name;
  document.getElementById('service-account-notes').value = a.notes || '';
  document.getElementById('service-account-balance').value = a.balance || 0;
  document.getElementById('service-account-color').value = a.color || '#14b8a6';
  document.getElementById('btn-delete-service-account').style.display = 'inline-flex';
  renderServiceColorPicker(a.color || '#14b8a6');
  document.getElementById('modal-service-account').classList.remove('hidden');
}

function renderServiceColorPicker(selected) {
  const row = document.getElementById('service-account-color-picker');
  if (!row) return;
  row.innerHTML = ACCOUNT_COLORS.map(c =>
    `<div class="color-swatch${c === selected ? ' selected' : ''}" style="background:${c}" data-color="${c}"></div>`
  ).join('');
  row.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      document.getElementById('service-account-color').value = sw.dataset.color;
    });
  });
}

function bindServiceAccountModal() {
  document.getElementById('btn-add-service-account')?.addEventListener('click', openAddServiceAccount);

  document.getElementById('form-service-account')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('service-account-id').value || crypto.randomUUID();
    const session = await SB.getSession();
    const a = {
      id,
      user_id: session.user.id,
      name: document.getElementById('service-account-name').value.trim(),
      bank: 'Service',
      owner: 'Joint',
      account_number: '',
      notes: document.getElementById('service-account-notes').value.trim(),
      balance: parseFloat(document.getElementById('service-account-balance').value) || 0,
      balance_updated_at: new Date().toISOString().slice(0, 10),
      color: document.getElementById('service-account-color').value,
    };
    try {
      await SB.upsertAccount(a);
      const idx = serviceAccounts.findIndex(x => x.id === id);
      if (idx >= 0) serviceAccounts[idx] = a; else serviceAccounts.push(a);
      closeModals();
      renderServiceAccounts();
      renderDashboard();
      showToast('Service account saved');
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  });

  document.getElementById('btn-delete-service-account')?.addEventListener('click', async () => {
    const id = document.getElementById('service-account-id').value;
    if (!id || !confirm('Delete this service account?')) return;
    try {
      await SB.deleteAccount(id);
      serviceAccounts = serviceAccounts.filter(a => a.id !== id);
      closeModals();
      renderServiceAccounts();
      renderDashboard();
      showToast('Service account deleted');
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  });
}
```

- [ ] **Step 3: Call `bindServiceAccountModal()` in `startApp`**

Find the `bindAccountModal()` call in `startApp` (around line 156). After it, add:

```javascript
bindServiceAccountModal();
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js index.html && git commit -m "Add service account modal — add/edit/delete"
```

---

## Task 4: Net Position widget on Dashboard

**Files:**
- Modify: `index.html` — add net position card HTML before the stats row
- Modify: `js/app.js` — add `renderNetPosition()`, call from `renderDashboard()`
- Modify: `css/styles.css` — add net position styles

- [ ] **Step 1: Add net position card to `index.html`**

In the dashboard page, find the `<div class="stats-row">` (around line 138). Immediately before it, add:

```html
<div id="net-position-card" class="section-card net-position-card"></div>
```

- [ ] **Step 2: Add `renderNetPosition()` to `js/app.js`**

After `renderPaceCard()` (around line 284), add:

```javascript
function renderNetPosition() {
  const card = document.getElementById('net-position-card');
  if (!card) return;

  const bankTotal = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const serviceTotal = serviceAccounts.reduce((s, a) => s + (a.balance || 0), 0);
  const netTotal = bankTotal + serviceTotal;
  const netColor = netTotal >= 0 ? 'var(--green)' : 'var(--red)';

  card.innerHTML = `
    <div class="net-position-inner">
      <div class="net-position-title">💰 Net Position</div>
      <div class="net-position-rows">
        <div class="net-position-row">
          <span>Bank accounts</span>
          <span>${formatCurrency(bankTotal)}</span>
        </div>
        <div class="net-position-row">
          <span>Service credits</span>
          <span style="color:${serviceTotal >= 0 ? 'var(--green)' : 'var(--red)'}">${formatCurrency(serviceTotal)}</span>
        </div>
        <div class="net-position-row net-position-total">
          <span>Total net position</span>
          <span style="color:${netColor}">${formatCurrency(netTotal)}</span>
        </div>
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Call `renderNetPosition()` from `renderDashboard()`**

Find `renderDashboard()`. After `renderPaceCard();`, add:

```javascript
renderNetPosition();
```

- [ ] **Step 4: Add CSS to `css/styles.css`**

Append to the end of `css/styles.css` (after the btn-spinner styles):

```css
/* Net Position widget */
.net-position-card { padding: 0; overflow: hidden; }
.net-position-inner { padding: 16px 20px; }
.net-position-title { font-size: 14px; font-weight: 600; color: var(--text2); margin-bottom: 12px; letter-spacing: 0.05em; text-transform: uppercase; }
.net-position-rows { display: flex; flex-direction: column; gap: 8px; }
.net-position-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text2); }
.net-position-row span:last-child { font-variant-numeric: tabular-nums; }
.net-position-total { padding-top: 10px; border-top: 1px solid var(--border); font-size: 16px; font-weight: 700; color: var(--text); }
```

- [ ] **Step 5: Commit**

```bash
git add js/app.js index.html css/styles.css && git commit -m "Add Net Position widget to dashboard"
```

---

## Task 5: Post-import service balance prompt

**Files:**
- Modify: `index.html` — add prompt modal HTML
- Modify: `js/app.js` — add `showServiceBalancePrompt()`, call from `doImport()`

- [ ] **Step 1: Add prompt modal to `index.html`**

After the service account modal closing `</div>`, add:

```html
<!-- Service Balance Update Prompt (shown after CSV import) -->
<div id="modal-service-balance-prompt" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-box">
    <div class="modal-header">
      <h2>Update Service Balances?</h2>
      <button class="modal-close">&times;</button>
    </div>
    <p style="font-size:14px;color:var(--text2);margin-bottom:16px">While you're here — update any service account balances. Skip any you haven't checked.</p>
    <div id="service-balance-prompt-list"></div>
    <div class="modal-actions" style="margin-top:20px">
      <button type="button" class="btn-ghost modal-close-btn">Skip all</button>
      <button type="button" id="btn-save-service-balances" class="btn-primary">Save balances</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add `showServiceBalancePrompt()` to `js/app.js`**

After `bindServiceAccountModal()`, add:

```javascript
function showServiceBalancePrompt() {
  if (serviceAccounts.length === 0) return;

  const list = document.getElementById('service-balance-prompt-list');
  if (!list) return;

  list.innerHTML = serviceAccounts.map(a => `
    <div class="service-balance-row" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="flex:1;font-size:14px;font-weight:500">${escHtml(a.name)}</div>
      <div style="font-size:12px;color:var(--text2);white-space:nowrap">Current: ${formatCurrency(a.balance || 0)}</div>
      <input type="number" class="service-balance-input" data-id="${a.id}"
        placeholder="New balance" step="0.01"
        style="width:130px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px" />
    </div>
  `).join('');

  document.getElementById('modal-service-balance-prompt').classList.remove('hidden');

  document.getElementById('btn-save-service-balances')?.addEventListener('click', async () => {
    const inputs = list.querySelectorAll('.service-balance-input');
    const today = new Date().toISOString().slice(0, 10);
    for (const input of inputs) {
      const val = input.value.trim();
      if (val === '') continue; // skip unchanged
      const id = input.dataset.id;
      const a = serviceAccounts.find(x => x.id === id);
      if (!a) continue;
      const updated = { ...a, balance: parseFloat(val), balance_updated_at: today };
      try {
        await SB.upsertAccount(updated);
        const idx = serviceAccounts.findIndex(x => x.id === id);
        if (idx >= 0) serviceAccounts[idx] = updated;
      } catch (err) {
        console.error('Failed to update service balance:', err);
      }
    }
    closeModals();
    renderServiceAccounts();
    renderDashboard();
    showToast('Service balances updated');
  });
}
```

- [ ] **Step 3: Call `showServiceBalancePrompt()` from `doImport()`**

In `doImport()`, find the final `closeModals()` call (around line 1852). Replace it with:

```javascript
closeModals();
if (serviceAccounts.length > 0) {
  setTimeout(() => showServiceBalancePrompt(), 400); // brief delay so import toast is visible first
}
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js index.html && git commit -m "Add post-import service balance update prompt"
```

---

## Task 6: Bump SW cache and deploy

**Files:**
- Modify: `sw.js` — bump cache version

- [ ] **Step 1: Bump SW cache**

In `sw.js`, change the cache version (currently `finance-v6`) to `finance-v7`.

- [ ] **Step 2: Final commit and push**

```bash
git add sw.js && git commit -m "Bump SW cache to finance-v7 for service accounts release"
git push origin master
```

- [ ] **Step 3: Verify deployment**

Visit https://finance-two-jet.vercel.app. Hard-refresh if needed (Ctrl+Shift+R).

Check:
- Accounts page shows "Service Accounts" section with "+ Add Service Account" button
- Can add a service account (e.g., Watercare with balance $200) — appears as a card
- Dashboard shows Net Position card at the top with bank total + service total
- Do a CSV import — after it completes, the service balance prompt appears
- "Skip all" closes without saving; filling in values and clicking "Save balances" updates the cards

---

## Self-Review Notes

- No schema migration required — reuses `accounts` table with `bank: 'Service'` flag
- Service accounts excluded from the bank account in/out matching logic (line 356 of app.js uses `a.account_number` which is empty for service accounts, so they'll never match transactions — correct)
- `renderDashboard()` now calls `renderNetPosition()` which reads both `accounts` and `serviceAccounts` — both are loaded at startup so this is safe
- `closeModals()` closes all modals including the service balance prompt (it selects all `.modal` elements and hides them) — verify this works in Task 5
- The post-import prompt uses `setTimeout(400)` to let the import toast appear first before the modal opens
