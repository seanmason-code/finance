// ===== Finance App =====
const App = (() => {
  let transactions = [];
  let budgets = [];
  let recurring = [];
  let accounts = [];        // bank accounts (bank !== 'Service')
  let serviceAccounts = []; // service provider balances (bank === 'Service')
  let currency = 'NZD';
  let chatHistory = [];
  let editingTxnId = null;
  let _importRows = [];
  let _csvFiles = []; // [{text, filename}]
  let _importPage = 0;
  const IMPORT_PAGE_SIZE = 100;

  // ===== Boot: setup → login → app =====
  async function boot() {
    const url = localStorage.getItem('sb_url');
    const key = localStorage.getItem('sb_key');

    if (!url || !key) {
      showScreen('setup');
      bindSetup();
      return;
    }

    SB.init(url, key);
    const session = await SB.getSession().catch(() => null);

    if (!session) {
      showScreen('login');
      bindAuth();
      return;
    }

    await startApp(session.user.email);
  }

  function showScreen(name) {
    // hide all auth screens and app
    ['setup', 'login', 'signup'].forEach(s => {
      document.getElementById(`screen-${s}`)?.classList.add('hidden');
    });
    document.getElementById('app').style.display = 'none';
    if (name === 'app') {
      document.getElementById('app').style.display = 'flex';
    } else {
      document.getElementById(`screen-${name}`)?.classList.remove('hidden');
    }
  }

  // ===== Setup (Supabase credentials) =====
  function bindSetup() {
    // Pre-fill known credentials
    const urlInput = document.getElementById('setup-url');
    const keyInput = document.getElementById('setup-anon-key');
    if (urlInput && !urlInput.value) urlInput.value = 'https://caahbpkqfgwkdyobfbpe.supabase.co';
    if (keyInput && !keyInput.value) keyInput.value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhYWhicGtxZmd3a2R5b2JmYnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDYwMTIsImV4cCI6MjA5MTY4MjAxMn0.LVN71IC6JWNhzPs_YFTwXQfOnyw6SJs4iyO41l1YoTs';

    document.getElementById('form-setup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('setup-url').value.trim().replace(/\/$/, '');
      const key = document.getElementById('setup-anon-key').value.trim();
      localStorage.setItem('sb_url', url);
      localStorage.setItem('sb_key', key);
      SB.init(url, key);
      showScreen('login');
      bindAuth();
    });
  }

  // ===== Auth (login / signup) =====
  function bindAuth() {
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      try {
        const { session } = await SB.signIn(email, password);
        await startApp(email);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const errEl = document.getElementById('signup-error');
      errEl.classList.add('hidden');
      try {
        await SB.signUp(email, password);
        // Auto sign in after signup
        await SB.signIn(email, password);
        await startApp(email);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    document.getElementById('btn-show-signup')?.addEventListener('click', () => showScreen('signup'));
    document.getElementById('btn-show-login')?.addEventListener('click', () => showScreen('login'));
    document.getElementById('btn-reset-setup')?.addEventListener('click', () => {
      localStorage.removeItem('sb_url');
      localStorage.removeItem('sb_key');
      showScreen('setup');
      bindSetup();
    });
  }

  // ===== Start App =====
  async function startApp(email) {
    showScreen('app');
    document.getElementById('nav-user-email').textContent = email;

    await DB.open();
    currency = (await DB.getSetting('currency')) || 'NZD';
    window._appCurrency = currency;

    try {
      transactions = await SB.getTransactions();
      budgets = await SB.getBudgets();
      recurring = await SB.getRecurring();
      const allAccounts = await SB.getAccounts().catch(() => []);
      accounts = allAccounts.filter(a => a.bank !== 'Service');
      serviceAccounts = allAccounts.filter(a => a.bank === 'Service');
    } catch (err) {
      console.error('Failed to load data:', err);
      transactions = [];
      budgets = [];
      recurring = [];
      accounts = [];
      serviceAccounts = [];
    }

    // Auto-seed budgets on first use if none exist
    if (budgets.length === 0) {
      for (const preset of PRESET_BUDGETS) {
        const b = {
          id: crypto.randomUUID(),
          category: preset.category,
          amount: preset.amount,
          items: (preset.items || []).map(item => ({ id: crypto.randomUUID(), name: item.name, amount: item.amount })),
        };
        try { await SB.upsertBudget(b); } catch { await SB.upsertBudget({ id: b.id, category: b.category, amount: b.amount }); }
        budgets.push(b);
      }
    }

    setTodayDate();
    bindNav();
    bindTransactionModal();
    bindBudgetModal();
    bindRecurringModal();
    bindAccountModal();
    bindServiceAccountModal();
    bindAI();
    bindSettings();
    bindFilters();
    bindExportImport();
    bindCSVImport();
    bindSignOut();
    bindMobileMenu();

    const lastPage = localStorage.getItem('lastPage') || 'dashboard';
    navigateTo(lastPage);
  }

  function bindMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    });
  }

  function bindSignOut() {
    document.getElementById('btn-signout')?.addEventListener('click', async () => {
      await SB.signOut();
      chatHistory = [];
      transactions = [];
      budgets = [];
      showScreen('login');
      bindAuth();
    });
  }

  // ===== Navigation =====
  function bindNav() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page);
      });
    });
  }

  function navigateTo(page) {
    document.querySelectorAll('[data-page]').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    document.getElementById(`page-${page}`)?.classList.add('active');
    localStorage.setItem('lastPage', page);

    if (page === 'dashboard') renderDashboard();
    if (page === 'accounts') renderAccounts();
    if (page === 'transactions') renderTransactionsList();
    if (page === 'budgets') renderBudgets();
    if (page === 'recurring') renderRecurring();
    if (page === 'reports') renderReports();
  }

  // ===== Dashboard =====
  function renderDashboard() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTxns = transactions.filter(t => t.date.startsWith(thisMonth));

    const income = monthTxns.filter(t => t.type === 'income' && t.category !== 'Transfer').reduce((s, t) => s + t.amount, 0);
    const expenses = monthTxns.filter(t => t.type === 'expense' && t.category !== 'Transfer').reduce((s, t) => s + t.amount, 0);
    const net = income - expenses;

    const weeklyIncome = income * 12 / 52;
    const weeklyExpenses = expenses * 12 / 52;

    document.getElementById('stat-income').textContent = formatCurrency(income);
    document.getElementById('stat-expenses').textContent = formatCurrency(expenses);
    document.getElementById('stat-net').textContent = formatCurrency(net);
    const incWk = document.getElementById('stat-income-weekly');
    const expWk = document.getElementById('stat-expenses-weekly');
    const netWk = document.getElementById('stat-net-weekly');
    if (incWk) incWk.textContent = `${formatCurrency(weeklyIncome)}/wk`;
    if (expWk) expWk.textContent = `${formatCurrency(weeklyExpenses)}/wk`;
    if (netWk) netWk.textContent = `${formatCurrency(net * 12 / 52)}/wk`;

    renderPaceCard();
    renderNetPosition();
    Charts.renderCategoryChart(monthTxns);
    Charts.renderTimelineChart(transactions);
    renderRecentTransactions();
  }

  function renderPaceCard() {
    const card = document.getElementById('pace-card');
    if (!card) return;

    // Rolling 31-day window
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 31);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const rolling = transactions.filter(t => t.date >= cutoffStr && t.category !== 'Transfer');
    const income = rolling.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = rolling.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    if (income === 0 && expenses === 0) { card.innerHTML = ''; return; }

    const net = income - expenses;
    const ahead = net >= 0;

    card.innerHTML = `
      <div class="pace-card ${ahead ? 'ahead' : 'behind'}">
        <div class="pace-status">${ahead ? '✅' : '⚠️'} ${ahead ? 'AHEAD' : 'BEHIND'}</div>
        <div class="pace-amount">${ahead ? '+' : '-'}${formatCurrency(Math.abs(net))} net position</div>
        <div class="pace-detail">Last 31 days · Received ${formatCurrency(income)} · Spent ${formatCurrency(expenses)}</div>
        ${!ahead ? `<button class="pace-drill" id="btn-pace-drill">→ See what's over budget</button>` : ''}
      </div>
    `;

    if (!ahead) {
      document.getElementById('btn-pace-drill')?.addEventListener('click', () => navigateTo('reports'));
    }
  }

  function renderNetPosition() {
    const card = document.getElementById('net-position-card');
    if (!card) return;

    const bankTotal = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const serviceTotal = serviceAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    const netTotal = bankTotal + serviceTotal;
    const netColor = netTotal >= 0 ? 'var(--green)' : 'var(--red)';

    // Hide if no data at all
    if (accounts.length === 0 && serviceAccounts.length === 0) { card.innerHTML = ''; return; }

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

  function renderRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    const recent = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    if (recent.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No transactions yet. Add your first one!</p></div>';
      return;
    }

    container.innerHTML = recent.map(t => transactionHTML(t)).join('');
    bindTransactionActions(container);
  }

  // ===== Accounts Page =====
  const ACCOUNT_COLORS = ['#6c63ff','#22c55e','#3b82f6','#f59e0b','#ef4444','#ec4899','#14b8a6','#8b5cf6'];
  const BANK_ICONS = { ANZ: '🏦', Kiwibank: '🥝', Westpac: '🔴', BNZ: '🟠', ASB: '🏧', Other: '💳' };

  function normAccNum(s) { return (s || '').replace(/[\s\-]/g, '').toLowerCase(); }

  function accNumMatches(storedNum, txnAccount) {
    if (!storedNum || !txnAccount) return false;
    const norm = normAccNum(storedNum);
    const txn = normAccNum(txnAccount);
    if (norm === txn) return true;
    if (norm.length >= 8 && txn.includes(norm)) return true;
    if (txn.length >= 8 && norm.includes(txn)) return true;
    return false;
  }

  function renderAccounts() {
    const totalEl = document.getElementById('accounts-total-card');
    const listEl = document.getElementById('accounts-list');
    if (!totalEl || !listEl) return;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // DEBUG: show matching status for each account
    const debugEl = document.getElementById('accounts-debug');
    if (debugEl) {
      const txnIds = [...new Set(transactions.map(t => t.account).filter(Boolean))].sort();
      const accountRows = accounts.map(a => {
        const matched = txnIds.some(id => accNumMatches(a.account_number, id));
        return `<div><strong>${escHtml(a.name)}</strong> — stored: <code>${escHtml(a.account_number || '(none)')}</code> — ${matched ? '✅ matched' : '❌ no match'}</div>`;
      }).join('');
      const txnIdList = txnIds.map(id => `<code>${escHtml(id)}</code>`).join('  ');
      debugEl.innerHTML = `<strong>Account IDs in transactions:</strong> ${txnIdList || '(none)'}<br><br><strong>Your accounts:</strong><br>${accountRows || '(none set up)'}`;
    }

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

    const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const monthIncome = transactions.filter(t => t.type === 'income' && t.category !== 'Transfer' && t.date.startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0);
    const monthExpense = transactions.filter(t => t.type === 'expense' && t.category !== 'Transfer' && t.date.startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0);

    totalEl.innerHTML = `
      <div class="accounts-total">
        <div>
          <div class="accounts-total-label">Total Balance</div>
          <div class="accounts-total-amount">${formatCurrency(totalBalance)}</div>
          <div class="accounts-total-sub">Across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="accounts-total-right">
          <div class="accounts-total-stat">
            <div class="val" style="color:var(--green)">${formatCurrency(monthIncome)}</div>
            <div class="lbl">In this month</div>
          </div>
          <div class="accounts-total-stat">
            <div class="val" style="color:var(--red)">${formatCurrency(monthExpense)}</div>
            <div class="lbl">Out this month</div>
          </div>
        </div>
      </div>
    `;

    if (accounts.length === 0) {
      listEl.innerHTML = `
        <div class="accounts-empty">
          <p>No accounts yet. Add your first account to track balances.</p>
          <button class="btn-primary" id="btn-accounts-add-first">+ Add Account</button>
        </div>`;
      document.getElementById('btn-accounts-add-first')?.addEventListener('click', () => openAddAccount());
      return;
    }

    listEl.innerHTML = `<div class="accounts-grid">${accounts.map(a => accountCardHTML(a, thisMonth)).join('')}</div>`;
    listEl.querySelectorAll('.account-card').forEach(card => {
      card.addEventListener('click', () => openEditAccount(card.dataset.id));
    });

    renderServiceAccounts();
  }

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
          <div class="account-card-balance-amount" style="color:${balanceColor}">${formatCurrency(balance)}</div>
          <div class="account-card-balance-updated">${updatedAt}</div>
        </div>
      </div>`;
  }

  function accountCardHTML(a, thisMonth) {
    const color = a.color || '#6c63ff';
    const icon = BANK_ICONS[a.bank] || '💳';
    const txns = transactions.filter(t => t.account && accNumMatches(a.account_number, t.account) && t.date.startsWith(thisMonth));
    const monthIn = txns.filter(t => t.type === 'income' && t.category !== 'Transfer').reduce((s, t) => s + t.amount, 0);
    const monthOut = txns.filter(t => t.type === 'expense' && t.category !== 'Transfer').reduce((s, t) => s + t.amount, 0);

    const updatedAt = a.balance_updated_at
      ? (() => { const d = new Date(a.balance_updated_at); const diff = Math.round((Date.now() - d) / 86400000); return diff === 0 ? 'Updated today' : diff === 1 ? 'Updated yesterday' : `Updated ${diff} days ago`; })()
      : 'Balance not set';

    return `
      <div class="account-card" data-id="${a.id}">
        <div class="account-card-top">
          <div class="account-bank-icon" style="background:${color}22;color:${color};font-size:22px">${icon}</div>
          <div class="account-card-info">
            <div class="account-card-name">${escHtml(a.name)}</div>
            <div class="account-card-meta">${escHtml(a.bank)} · ${escHtml(a.owner || 'Joint')}</div>
          </div>
        </div>
        <div class="account-card-balance">
          <div class="account-card-balance-amount" style="color:${color}">${formatCurrency(a.balance || 0)}</div>
          <div class="account-card-balance-updated">${updatedAt}</div>
        </div>
        <div class="account-card-stats">
          <div>
            <div class="account-stat-label">In this month</div>
            <div class="account-stat-value income">${monthIn > 0 ? '+' + formatCurrency(monthIn) : '—'}</div>
          </div>
          <div>
            <div class="account-stat-label">Out this month</div>
            <div class="account-stat-value expense">${monthOut > 0 ? formatCurrency(monthOut) : '—'}</div>
          </div>
        </div>
      </div>`;
  }

  function populateAccountNumberList() {
    const datalist = document.getElementById('account-number-list');
    if (!datalist) return;
    const distinct = [...new Set(transactions.map(t => t.account).filter(Boolean))].sort();
    datalist.innerHTML = distinct.map(v => `<option value="${escHtml(v)}">`).join('');
  }

  function openAddAccount() {
    document.getElementById('modal-account-title').textContent = 'Add Account';
    document.getElementById('form-account').reset();
    document.getElementById('account-id').value = '';
    document.getElementById('account-color').value = '#6c63ff';
    document.getElementById('btn-delete-account').style.display = 'none';
    renderColorPicker('#6c63ff');
    populateAccountNumberList();
    document.getElementById('modal-account').classList.remove('hidden');
  }

  function openEditAccount(id) {
    const a = accounts.find(x => x.id === id);
    if (!a) return;
    document.getElementById('modal-account-title').textContent = 'Edit Account';
    document.getElementById('account-id').value = a.id;
    document.getElementById('account-name').value = a.name;
    document.getElementById('account-bank').value = a.bank || 'ANZ';
    document.getElementById('account-owner').value = a.owner || 'Joint';
    document.getElementById('account-number').value = a.account_number || '';
    document.getElementById('account-balance').value = a.balance || 0;
    document.getElementById('account-color').value = a.color || '#6c63ff';
    document.getElementById('btn-delete-account').style.display = 'inline-flex';
    renderColorPicker(a.color || '#6c63ff');
    populateAccountNumberList();
    document.getElementById('modal-account').classList.remove('hidden');
  }

  function renderColorPicker(selected) {
    const row = document.getElementById('account-color-picker');
    row.innerHTML = ACCOUNT_COLORS.map(c =>
      `<div class="color-swatch${c === selected ? ' selected' : ''}" style="background:${c}" data-color="${c}"></div>`
    ).join('');
    row.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        document.getElementById('account-color').value = sw.dataset.color;
      });
    });
  }

  function bindAccountModal() {
    document.getElementById('btn-add-account')?.addEventListener('click', openAddAccount);

    document.getElementById('form-account')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('account-id').value || crypto.randomUUID();
      const session = await SB.getSession();
      const a = {
        id,
        user_id: session.user.id,
        name: document.getElementById('account-name').value.trim(),
        bank: document.getElementById('account-bank').value,
        owner: document.getElementById('account-owner').value,
        account_number: document.getElementById('account-number').value.trim(),
        balance: parseFloat(document.getElementById('account-balance').value) || 0,
        balance_updated_at: new Date().toISOString().slice(0, 10),
        color: document.getElementById('account-color').value,
      };
      try {
        await SB.upsertAccount(a);
        const idx = accounts.findIndex(x => x.id === id);
        if (idx >= 0) accounts[idx] = a; else accounts.push(a);
        closeModals();
        renderAccounts();
        showToast('Account saved');
      } catch (err) {
        showToast('Failed to save account: ' + err.message, 'error');
      }
    });

    document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
      const id = document.getElementById('account-id').value;
      if (!id || !confirm('Delete this account? Your transactions will not be affected.')) return;
      try {
        await SB.deleteAccount(id);
        accounts = accounts.filter(a => a.id !== id);
        closeModals();
        renderAccounts();
        showToast('Account deleted');
      } catch (err) {
        showToast('Failed to delete account: ' + err.message, 'error');
      }
    });
  }

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
        showToast('Failed to save service account: ' + err.message, 'error');
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
        showToast('Failed to delete service account: ' + err.message, 'error');
      }
    });
  }

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
        if (val === '') continue;
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

  // ===== Transactions Page =====
  function renderTransactionsList() {
    populateMonthFilter();
    applyFilters();
  }

  function populateMonthFilter() {
    const sel = document.getElementById('filter-month');
    const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
    const existing = sel.value;
    sel.innerHTML = '<option value="">All Time</option>' +
      months.map(m => {
        const d = new Date(m + '-01');
        const label = d.toLocaleDateString('en', { month: 'long', year: 'numeric' });
        return `<option value="${m}">${label}</option>`;
      }).join('');
    sel.value = existing;
  }

  function applyFilters() {
    const month = document.getElementById('filter-month').value;
    const category = document.getElementById('filter-category').value;
    const type = document.getElementById('filter-type').value;
    const search = document.getElementById('filter-search').value.toLowerCase();

    let filtered = transactions.filter(t => {
      if (month && !t.date.startsWith(month)) return false;
      if (category && t.category !== category) return false;
      if (type && t.type !== type) return false;
      if (search && !t.description.toLowerCase().includes(search) &&
          !t.category.toLowerCase().includes(search)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));

    const container = document.getElementById('transactions-list');
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No transactions found.</p></div>';
      return;
    }

    const grouped = {};
    filtered.forEach(t => {
      if (!grouped[t.date]) grouped[t.date] = [];
      grouped[t.date].push(t);
    });

    container.innerHTML = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([date, txns]) => {
      const d = new Date(date + 'T12:00:00');
      const label = d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
      return `<div class="date-group">
        <div class="date-label">${label}</div>
        ${txns.map(t => transactionHTML(t)).join('')}
      </div>`;
    }).join('');

    document.querySelectorAll('.date-label').forEach(el => {
      el.style.cssText = 'font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;padding:12px 0 6px;font-weight:600;';
    });

    bindTransactionActions(container);
  }

  function bindFilters() {
    ['filter-month', 'filter-category', 'filter-type'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });
    document.getElementById('filter-search')?.addEventListener('input', applyFilters);
    populateCategoryFilter();
  }

  function populateCategoryFilter() {
    const select = document.getElementById('filter-category');
    if (!select) return;
    const used = [...new Set(transactions.map(t => t.category).filter(Boolean))].sort();
    const current = select.value;
    select.innerHTML = '<option value="">All Categories</option>' +
      used.map(c => `<option value="${c}">${categoryIcon(c)} ${escHtml(c)}</option>`).join('');
    if (current) select.value = current;
  }

  // ===== Transaction HTML =====
  function transactionHTML(t) {
    const icon = categoryIcon(t.category);
    const dateStr = new Date(t.date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
    const amountStr = (t.type === 'expense' ? '−' : '+') + formatCurrency(t.amount);
    return `<div class="txn-item" data-id="${t.id}">
      <div class="txn-icon ${t.type}">${icon}</div>
      <div class="txn-details">
        <div class="txn-description">${escHtml(t.description)}</div>
        <div class="txn-meta">${escHtml(t.category)} · ${dateStr}${t.notes ? ' · ' + escHtml(t.notes) : ''}</div>
      </div>
      <div class="txn-amount ${t.type}">${amountStr}</div>
      <div class="txn-actions">
        <button class="txn-btn edit" data-id="${t.id}" title="Edit">✏️</button>
        <button class="txn-btn delete" data-id="${t.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  function bindTransactionActions(container) {
    container.querySelectorAll('.txn-btn.edit').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openEditTransaction(btn.dataset.id); });
    });
    container.querySelectorAll('.txn-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteTransaction(btn.dataset.id); });
    });
  }

  const PRESET_BUDGETS = [
    { category: 'Housing', amount: 1949, items: [
      { name: 'Apples',      amount: 1105, dueDate: 'weekly', note: 'AP · weekly' },
      { name: 'Skids',       amount: 563,  dueDate: 'weekly', note: 'AP · weekly' },
      { name: 'Tower Units', amount: 166,  dueDate: '25',     note: 'DD · 25th' },
      { name: 'Tower Home',  amount: 115,  dueDate: '25',     note: 'DD · 25th' },
    ]},
    { category: 'Food & Dining', amount: 1625, items: [
      { name: 'Food', amount: 1625, dueDate: '', note: 'AP · weekly transfer' },
    ]},
    { category: 'Transport', amount: 996, items: [
      { name: 'Fuel',    amount: 563, dueDate: '', note: 'AP · weekly transfer' },
      { name: 'Parking', amount: 433, dueDate: '', note: '' },
    ]},
    { category: 'Utilities', amount: 697, items: [
      { name: 'Meridian',  amount: 200, dueDate: '',   note: 'AP · monthly' },
      { name: 'Watercare', amount: 380, dueDate: '',   note: 'AP · monthly' },
      { name: 'Spark',     amount: 117, dueDate: '12', note: 'DD · 12th' },
    ]},
    { category: 'Health', amount: 695, items: [
      { name: 'A.I.A (1)',           amount: 158, dueDate: '28', note: 'DD · 28th' },
      { name: 'A.I.A (2)',           amount: 229, dueDate: '28', note: 'DD · 28th' },
      { name: 'Snap Fitness (Jenny)',amount: 94,  dueDate: '17', note: 'DD · 17th' },
      { name: 'Flex Fitness',        amount: 151, dueDate: 'weekly', note: 'DD · weekly' },
      { name: 'Sports Lab',          amount: 30,  dueDate: '',   note: 'DD' },
      { name: 'Training Peaks',      amount: 33,  dueDate: '29', note: 'DD · 29th' },
    ]},
    { category: 'Entertainment', amount: 58, items: [
      { name: 'Spotify',    amount: 19, dueDate: '15', note: 'DD · 15th' },
      { name: 'Netflix',    amount: 34, dueDate: '30', note: 'DD · 30th' },
      { name: 'Apple.com',  amount: 5,  dueDate: '19', note: 'DD · 19th' },
    ]},
    { category: 'Kids', amount: 340, items: [
      { name: 'Remuera Annual Fees', amount: 54,  dueDate: '', note: 'Kiwibank hidden' },
      { name: 'Clothes / Shoes',     amount: 108, dueDate: '', note: 'to arrange' },
      { name: 'School Holidays',     amount: 100, dueDate: '', note: 'to arrange' },
      { name: 'Swimming Lessons',    amount: 77,  dueDate: '', note: '' },
    ]},
    { category: 'Savings', amount: 1458, items: [
      { name: 'Fiji Savings',    amount: 333,  dueDate: '',   note: 'ANZ' },
      { name: 'House Savings',   amount: 1000, dueDate: '17', note: 'DD · 17th' },
      { name: 'Car Maintenance', amount: 125,  dueDate: '',   note: '' },
    ]},
    { category: 'Personal Spending', amount: 434, items: [
      { name: 'Jenny', amount: 217, dueDate: '', note: 'free money' },
      { name: 'Sean',  amount: 217, dueDate: '', note: 'free money' },
    ]},
    { category: 'Other', amount: 112, items: [
      { name: 'Vero',  amount: 88, dueDate: '16', note: 'DD · 16th · insurance' },
      { name: 'Canva', amount: 24, dueDate: '',   note: 'DD · monthly' },
    ]},
  ];

  let _budgetView = 'monthly'; // 'monthly' or 'weekly'

  let _reportDate = new Date();

  function categoryIcon(category) {
    const icons = {
      'Housing': '🏠', 'Food & Dining': '🍽️', 'Transport': '🚗',
      'Transport: Fuel': '⛽', 'Transport: Parking & Tolls': '🅿️', 'Transport: Car Maintenance': '🔧',
      'Health': '💊', 'Insurance': '🛡️', 'Entertainment': '🎬', 'Subscriptions': '📱',
      'Shopping': '🛍️', 'Utilities': '💡', 'Kids': '👶', 'Travel': '✈️',
      'Savings': '🏦', 'Investments': '📊', 'Work Expenses': '🧾',
      'Education': '📚', 'Personal Care': '💇', 'Personal Spending': '🎉',
      'Transfer': '🔁',
      'Salary': '💼', 'Freelance': '💻', 'Rental Income': '🏡',
      'Investment': '📈', 'Gift': '🎁', 'Reimbursements': '🔄', 'Other Income': '💰', 'Other': '📌'
    };
    return icons[category] || '💳';
  }

  // ===== Transaction Modal =====
  function bindTransactionModal() {
    document.getElementById('btn-add-transaction')?.addEventListener('click', openAddTransaction);
    document.querySelectorAll('.open-add-transaction').forEach(btn => {
      btn.addEventListener('click', openAddTransaction);
    });

    document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
      btn.addEventListener('click', closeModals);
    });

    document.querySelectorAll('.modal-backdrop').forEach(el => {
      el.addEventListener('click', closeModals);
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('txn-type').value = btn.dataset.type;
      });
    });

    document.getElementById('form-transaction')?.addEventListener('submit', saveTransaction);
  }

  function openAddTransaction() {
    editingTxnId = null;
    document.getElementById('modal-transaction-title').textContent = 'Add Transaction';
    document.getElementById('form-transaction').reset();
    document.getElementById('txn-id').value = '';
    document.getElementById('txn-type').value = 'expense';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'expense'));
    setTodayDate();
    updateCurrencySymbols();
    document.getElementById('modal-transaction').classList.remove('hidden');
  }

  function openEditTransaction(id) {
    const t = transactions.find(t => t.id === id);
    if (!t) return;
    editingTxnId = id;
    document.getElementById('modal-transaction-title').textContent = 'Edit Transaction';
    document.getElementById('txn-id').value = t.id;
    document.getElementById('txn-type').value = t.type;
    document.getElementById('txn-amount').value = t.amount;
    document.getElementById('txn-description').value = t.description;
    document.getElementById('txn-category').value = t.category;
    document.getElementById('txn-date').value = t.date;
    document.getElementById('txn-notes').value = t.notes || '';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t.type));
    updateCurrencySymbols();
    document.getElementById('modal-transaction').classList.remove('hidden');
  }

  async function saveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('txn-id').value || crypto.randomUUID();
    const isEdit = !!document.getElementById('txn-id').value;
    const t = {
      id,
      type: document.getElementById('txn-type').value,
      amount: parseFloat(document.getElementById('txn-amount').value),
      description: document.getElementById('txn-description').value.trim(),
      category: document.getElementById('txn-category').value,
      date: document.getElementById('txn-date').value,
      notes: document.getElementById('txn-notes').value.trim(),
    };

    try {
      await SB.upsertTransaction(t);
      const idx = transactions.findIndex(x => x.id === id);
      if (idx >= 0) transactions[idx] = t;
      else transactions.push(t);

      // If editing category, offer to apply to all matching descriptions
      if (isEdit) {
        const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const merchantBase = s => norm(s).split(/[\/\-\d]/)[0].trim();

        const exact = transactions.filter(x =>
          x.id !== id &&
          norm(x.description) === norm(t.description) &&
          x.category !== t.category
        );
        const partial = transactions.filter(x =>
          x.id !== id &&
          norm(x.description) !== norm(t.description) &&
          merchantBase(x.description) === merchantBase(t.description) &&
          merchantBase(t.description).length >= 4 &&
          x.category !== t.category
        );

        if (exact.length > 0 || partial.length > 0) {
          closeModals();
          refreshCurrentPage();
          clearAISnapshot();
          openBulkCategoryModal(t.category, exact, partial);
          return;
        }
      }

      closeModals();
      refreshCurrentPage();
      clearAISnapshot();
    } catch (err) {
      showToast('Failed to save transaction: ' + err.message, 'error');
    }
  }

  async function deleteTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await SB.deleteTransaction(id);
      transactions = transactions.filter(t => t.id !== id);
      refreshCurrentPage();
      clearAISnapshot();
    } catch (err) {
      showToast('Failed to delete transaction: ' + err.message, 'error');
    }
  }

  // ===== Bulk Category Modal =====
  function openBulkCategoryModal(category, exact, partial) {
    const list = document.getElementById('bulk-cat-list');
    const subtitle = document.getElementById('bulk-cat-subtitle');
    subtitle.textContent = `Applying category: "${category}"`;

    const allMatches = [
      ...exact.map(t => ({ t, isExact: true })),
      ...partial.map(t => ({ t, isExact: false })),
    ];

    list.innerHTML = allMatches.map(({ t, isExact }) => `
      <label class="bulk-cat-item">
        <input type="checkbox" class="bulk-cat-check" data-id="${t.id}" ${isExact ? 'checked' : 'checked'} />
        <div class="bulk-cat-info">
          <div class="bulk-cat-desc">${escHtml(t.description)}</div>
          <div class="bulk-cat-meta">${t.date} · ${formatCurrency(t.amount)} · was: ${escHtml(t.category || 'uncategorised')}${!isExact ? ' · <em>partial match</em>' : ''}</div>
        </div>
      </label>
    `).join('');

    document.getElementById('bulk-select-all').onclick = () =>
      list.querySelectorAll('.bulk-cat-check').forEach(c => c.checked = true);
    document.getElementById('bulk-deselect-all').onclick = () =>
      list.querySelectorAll('.bulk-cat-check').forEach(c => c.checked = false);

    document.getElementById('btn-bulk-apply').onclick = async () => {
      const selected = [...list.querySelectorAll('.bulk-cat-check:checked')].map(c => c.dataset.id);
      if (selected.length === 0) { closeModals(); return; }
      let count = 0;
      for (const sid of selected) {
        const txn = transactions.find(x => x.id === sid);
        if (!txn) continue;
        const updated = { ...txn, category };
        try {
          await SB.upsertTransaction(updated);
          const i = transactions.findIndex(x => x.id === sid);
          if (i >= 0) transactions[i] = updated;
          count++;
        } catch {}
      }
      closeModals();
      refreshCurrentPage();
      showToast(`Updated ${count} transaction${count !== 1 ? 's' : ''} to "${category}"`);
    };

    document.getElementById('modal-bulk-category').classList.remove('hidden');
  }

  // ===== Budgets =====
  function budgetWeekly(amount) { return amount / 4.333; }

  function dueSoonItems() {
    const today = new Date().getDate();
    const upcoming = [];
    budgets.forEach(b => {
      (b.items || []).forEach(item => {
        const d = parseInt(item.dueDate);
        if (!isNaN(d)) {
          const daysUntil = d >= today ? d - today : d + new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - today;
          if (daysUntil <= 7) upcoming.push({ name: item.name, amount: item.amount, daysUntil, dueDate: item.dueDate });
        }
      });
    });
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  function renderBudgets() {
    const container = document.getElementById('budgets-list');

    if (budgets.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No budgets set. Add one to start tracking your spending limits.</p></div>';
      return;
    }

    const filter = document.getElementById('budget-cat-filter')?.value || 'all';
    const filtered = filter === 'all' ? budgets : budgets.filter(b => b.category === filter);
    const grandMonthly = budgets.reduce((s, b) => s + b.amount, 0);
    const isWeekly = _budgetView === 'weekly';
    const grandDisplay = isWeekly ? budgetWeekly(grandMonthly) : grandMonthly;
    const viewLabel = isWeekly ? '/wk' : '/mo';

    // Upcoming bills banner
    const upcoming = dueSoonItems();
    const upcomingHtml = upcoming.length ? `
      <div class="budget-upcoming">
        <div class="budget-upcoming-title">⚠️ Due this week</div>
        ${upcoming.map(u => `
          <div class="budget-upcoming-item">
            <span>${escHtml(u.name)}</span>
            <span class="upcoming-due">${u.daysUntil === 0 ? 'today' : u.daysUntil === 1 ? 'tomorrow' : `in ${u.daysUntil} days`} · ${formatCurrency(u.amount)}</span>
          </div>
        `).join('')}
      </div>` : '';

    container.innerHTML = `
      ${upcomingHtml}
      <div class="budget-grand-total">
        <span>Total <span class="view-label-text">${isWeekly ? 'Weekly' : 'Monthly'}</span> Budget</span>
        <strong>${formatCurrency(grandDisplay)}<span class="per-month">${viewLabel}</span></strong>
      </div>
      ${filtered.map(b => {
        const items = b.items || [];
        const catDisplay = isWeekly ? budgetWeekly(b.amount) : b.amount;

        const itemsHtml = items.map(item => {
          const itemDisplay = isWeekly ? budgetWeekly(item.amount) : item.amount;
          const dueBadge = item.dueDate && item.dueDate !== 'weekly'
            ? `<span class="due-badge">📅 ${item.dueDate}${isNaN(item.dueDate) ? '' : 'th'}</span>` : '';
          const weeklyBadge = item.dueDate === 'weekly' ? `<span class="due-badge">🔁 weekly</span>` : '';
          const noteLine = item.note ? `<span class="line-item-note">${escHtml(item.note)}</span>` : '';
          return `
            <div class="budget-line-item">
              <div class="line-item-left">
                <span class="line-item-name">${escHtml(item.name)}</span>
                ${noteLine}
              </div>
              <div class="line-item-right">
                ${dueBadge}${weeklyBadge}
                <span class="line-item-amount">${formatCurrency(itemDisplay)}<span class="per-month">${viewLabel}</span></span>
                <button class="line-item-edit btn-ghost" data-budget-id="${b.id}" data-item-id="${item.id}">Edit</button>
                <button class="line-item-delete btn-ghost" data-budget-id="${b.id}" data-item-id="${item.id}" style="color:var(--red);">×</button>
              </div>
            </div>`;
        }).join('');

        return `<div class="budget-item">
          <div class="budget-header">
            <button class="budget-toggle btn-ghost" data-budget-id="${b.id}">▶</button>
            <div style="flex:1">
              <div class="budget-name">${categoryIcon(b.category)} ${escHtml(b.category)}</div>
            </div>
            <div class="budget-category-total">${formatCurrency(catDisplay)}<span class="per-month">${viewLabel}</span></div>
            <div class="budget-actions">
              <button class="btn-ghost budget-edit" data-id="${b.id}" style="padding:5px 10px;font-size:12px;">Edit</button>
              <button class="btn-ghost budget-delete" data-id="${b.id}" style="padding:5px 10px;font-size:12px;color:var(--red);">Del</button>
            </div>
          </div>
          <div class="budget-items-list hidden" data-budget-id="${b.id}">
            ${itemsHtml}
            <button class="btn-ghost btn-add-line-item" data-budget-id="${b.id}" style="width:100%;margin-top:8px;font-size:13px;">+ Add item</button>
          </div>
        </div>`;
      }).join('')}
    `;

    container.querySelectorAll('.budget-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const list = container.querySelector(`.budget-items-list[data-budget-id="${btn.dataset.budgetId}"]`);
        list.classList.toggle('hidden');
        btn.textContent = list.classList.contains('hidden') ? '▶' : '▼';
      });
    });
    container.querySelectorAll('.budget-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditBudget(btn.dataset.id));
    });
    container.querySelectorAll('.budget-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteBudget(btn.dataset.id));
    });
    container.querySelectorAll('.line-item-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditLineItem(btn.dataset.budgetId, btn.dataset.itemId));
    });
    container.querySelectorAll('.line-item-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteLineItem(btn.dataset.budgetId, btn.dataset.itemId));
    });
    container.querySelectorAll('.btn-add-line-item').forEach(btn => {
      btn.addEventListener('click', () => openAddLineItem(btn.dataset.budgetId));
    });
  }

  // ===== Reports =====
  function reportMonthKey() {
    return `${_reportDate.getFullYear()}-${String(_reportDate.getMonth() + 1).padStart(2, '0')}`;
  }

  function renderReports() {
    const label = _reportDate.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    document.getElementById('reports-month-label').textContent = label;

    const monthKey = reportMonthKey();
    Charts.renderBudgetVsActualChart(budgets, transactions, monthKey);
    Charts.renderBudgetTrendChart(budgets, transactions);
    Charts.renderSpendingTrendChart(transactions);
    Charts.renderTopMerchantsChart(transactions, monthKey);

    document.getElementById('reports-prev-month').onclick = () => {
      _reportDate = new Date(_reportDate.getFullYear(), _reportDate.getMonth() - 1, 1);
      renderReports();
    };
    document.getElementById('reports-next-month').onclick = () => {
      _reportDate = new Date(_reportDate.getFullYear(), _reportDate.getMonth() + 1, 1);
      renderReports();
    };
  }

  async function loadPresetBudgets() {
    if (!confirm('This will delete all existing budgets and reload the defaults. Continue?')) return;

    // Delete ALL existing budgets first to clear duplicates
    for (const b of [...budgets]) {
      try { await SB.deleteBudget(b.id); } catch {}
    }
    budgets = [];

    let count = 0;
    for (const preset of PRESET_BUDGETS) {
      const b = {
        id: crypto.randomUUID(),
        category: preset.category,
        amount: preset.amount,
        items: (preset.items || []).map(item => ({ id: crypto.randomUUID(), name: item.name, amount: item.amount, dueDate: item.dueDate || '', note: item.note || '' })),
      };
      try {
        await SB.upsertBudget(b);
      } catch (err) {
        await SB.upsertBudget({ id: b.id, category: b.category, amount: b.amount });
        b.items = [];
      }
      const idx = budgets.findIndex(x => x.category === preset.category);
      if (idx >= 0) budgets[idx] = b;
      else budgets.push(b);
      count++;
    }
    renderBudgets();
    showToast(`Loaded ${count} preset budgets`);
  }

  function bindBudgetModal() {
    document.getElementById('btn-add-budget')?.addEventListener('click', openAddBudget);
    document.getElementById('btn-load-presets')?.addEventListener('click', loadPresetBudgets);
    document.getElementById('form-budget')?.addEventListener('submit', saveBudget);
    document.getElementById('form-line-item')?.addEventListener('submit', saveLineItem);
    document.getElementById('budget-cat-filter')?.addEventListener('change', renderBudgets);
    document.getElementById('budget-view-monthly')?.addEventListener('click', () => { _budgetView = 'monthly'; document.getElementById('budget-view-monthly').classList.add('active'); document.getElementById('budget-view-weekly').classList.remove('active'); renderBudgets(); });
    document.getElementById('budget-view-weekly')?.addEventListener('click', () => { _budgetView = 'weekly'; document.getElementById('budget-view-weekly').classList.add('active'); document.getElementById('budget-view-monthly').classList.remove('active'); renderBudgets(); });
  }

  function openAddBudget() {
    document.getElementById('budget-id').value = '';
    document.getElementById('form-budget').reset();
    updateCurrencySymbols();
    document.getElementById('modal-budget').classList.remove('hidden');
  }

  function openEditBudget(id) {
    const b = budgets.find(b => b.id === id);
    if (!b) return;
    document.getElementById('budget-id').value = b.id;
    document.getElementById('budget-category').value = b.category;
    document.getElementById('budget-amount').value = b.amount;
    updateCurrencySymbols();
    document.getElementById('modal-budget').classList.remove('hidden');
  }

  async function saveBudget(e) {
    e.preventDefault();
    const id = document.getElementById('budget-id').value || crypto.randomUUID();
    const existing = budgets.find(x => x.id === id);
    const b = {
      id,
      category: document.getElementById('budget-category').value,
      amount: parseFloat(document.getElementById('budget-amount').value),
      items: existing?.items || [],
    };
    try {
      await upsertBudgetSafe(b);
      const idx = budgets.findIndex(x => x.id === id);
      if (idx >= 0) budgets[idx] = b;
      else budgets.push(b);
      closeModals();
      renderBudgets();
    } catch (err) {
      showToast('Failed to save budget: ' + err.message, 'error');
    }
  }

  async function deleteBudget(id) {
    if (!confirm('Delete this budget?')) return;
    try {
      await SB.deleteBudget(id);
      budgets = budgets.filter(b => b.id !== id);
      renderBudgets();
    } catch (err) {
      showToast('Failed to delete budget: ' + err.message, 'error');
    }
  }

  // ===== Line Items =====
  function openAddLineItem(budgetId) {
    document.getElementById('line-item-budget-id').value = budgetId;
    document.getElementById('line-item-id').value = '';
    document.getElementById('form-line-item').reset();
    document.getElementById('line-item-modal-title').textContent = 'Add Item';
    document.getElementById('line-item-move-label').classList.add('hidden');
    document.getElementById('line-item-move-to').classList.add('hidden');
    document.getElementById('modal-line-item').classList.remove('hidden');
  }

  function openEditLineItem(budgetId, itemId) {
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;
    const item = (budget.items || []).find(i => i.id === itemId);
    if (!item) return;
    document.getElementById('line-item-budget-id').value = budgetId;
    document.getElementById('line-item-id').value = itemId;
    document.getElementById('line-item-name').value = item.name;
    document.getElementById('line-item-amount').value = item.amount;
    document.getElementById('line-item-due').value = item.dueDate || '';
    document.getElementById('line-item-note').value = item.note || '';

    // Populate move-to dropdown with all other categories
    const select = document.getElementById('line-item-move-to');
    select.innerHTML = '<option value="">— stay in current category —</option>' +
      budgets.filter(b => b.id !== budgetId)
        .map(b => `<option value="${b.id}">${categoryIcon(b.category)} ${escHtml(b.category)}</option>`)
        .join('');
    select.value = '';
    document.getElementById('line-item-move-label').classList.remove('hidden');
    select.classList.remove('hidden');

    document.getElementById('line-item-modal-title').textContent = 'Edit Item';
    document.getElementById('modal-line-item').classList.remove('hidden');
  }

  async function saveLineItem(e) {
    e.preventDefault();
    const budgetId = document.getElementById('line-item-budget-id').value;
    const itemId = document.getElementById('line-item-id').value;
    const name = document.getElementById('line-item-name').value.trim();
    const amount = parseFloat(document.getElementById('line-item-amount').value);
    const dueDate = document.getElementById('line-item-due').value.trim();
    const note = document.getElementById('line-item-note').value.trim();
    const moveToBudgetId = document.getElementById('line-item-move-to').value;

    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;

    if (!budget.items) budget.items = [];

    const updatedItem = { id: itemId || crypto.randomUUID(), name, amount, dueDate, note };

    // Handle move to different category
    if (itemId && moveToBudgetId) {
      const targetBudget = budgets.find(b => b.id === moveToBudgetId);
      if (targetBudget) {
        budget.items = budget.items.filter(i => i.id !== itemId);
        budget.amount = budget.items.reduce((s, i) => s + i.amount, 0);
        if (!targetBudget.items) targetBudget.items = [];
        targetBudget.items.push(updatedItem);
        targetBudget.amount = targetBudget.items.reduce((s, i) => s + i.amount, 0);
        try {
          await upsertBudgetSafe(budget);
          await upsertBudgetSafe(targetBudget);
          closeModals();
          renderBudgets();
        } catch (err) { showToast('Failed to move item: ' + err.message, 'error'); }
        return;
      }
    }

    if (itemId) {
      const idx = budget.items.findIndex(i => i.id === itemId);
      if (idx >= 0) budget.items[idx] = updatedItem;
    } else {
      budget.items.push(updatedItem);
    }

    budget.amount = budget.items.reduce((s, i) => s + i.amount, 0);

    try {
      await upsertBudgetSafe(budget);
      closeModals();
      renderBudgets();
      // Re-open the category so user sees their change
      const toggle = document.querySelector(`.budget-toggle[data-budget-id="${budgetId}"]`);
      if (toggle) {
        const list = document.querySelector(`.budget-items-list[data-budget-id="${budgetId}"]`);
        if (list && list.classList.contains('hidden')) toggle.click();
      }
    } catch (err) {
      showToast('Failed to save budget item: ' + err.message, 'error');
    }
  }

  async function deleteLineItem(budgetId, itemId) {
    if (!confirm('Delete this item?')) return;
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;
    budget.items = (budget.items || []).filter(i => i.id !== itemId);
    budget.amount = budget.items.reduce((s, i) => s + i.amount, 0);
    try {
      await upsertBudgetSafe(budget);
      renderBudgets();
      const toggle = document.querySelector(`.budget-toggle[data-budget-id="${budgetId}"]`);
      if (toggle) {
        const list = document.querySelector(`.budget-items-list[data-budget-id="${budgetId}"]`);
        if (list && list.classList.contains('hidden')) toggle.click();
      }
    } catch (err) {
      showToast('Failed to delete budget item: ' + err.message, 'error');
    }
  }

  // Tries to save with items; falls back to without if column doesn't exist
  async function upsertBudgetSafe(b) {
    try {
      await SB.upsertBudget(b);
    } catch (err) {
      const { id, category, amount } = b;
      await SB.upsertBudget({ id, category, amount });
    }
  }

  // ===== Recurring =====
  function renderRecurring() {
    const container = document.getElementById('recurring-list');
    const summary = document.getElementById('recurring-summary');

    // Weekly/monthly summary
    let totalWeeklyIn = 0, totalWeeklyOut = 0;
    recurring.filter(r => r.active).forEach(r => {
      const weekly = r.frequency === 'weekly' ? r.amount
        : r.frequency === 'fortnightly' ? r.amount / 2
        : r.amount * 12 / 52;
      if (r.type === 'income') totalWeeklyIn += weekly;
      else totalWeeklyOut += weekly;
    });

    summary.innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card income">
          <span class="stat-label">Weekly Income</span>
          <span class="stat-value">${formatCurrency(totalWeeklyIn)}</span>
        </div>
        <div class="stat-card expenses">
          <span class="stat-label">Weekly Expenses</span>
          <span class="stat-value">${formatCurrency(totalWeeklyOut)}</span>
        </div>
        <div class="stat-card income">
          <span class="stat-label">Monthly Income</span>
          <span class="stat-value">${formatCurrency(totalWeeklyIn * 52 / 12)}</span>
        </div>
        <div class="stat-card expenses">
          <span class="stat-label">Monthly Expenses</span>
          <span class="stat-value">${formatCurrency(totalWeeklyOut * 52 / 12)}</span>
        </div>
      </div>`;

    if (recurring.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No recurring transactions yet. Add your salary, rent, subscriptions etc.</p></div>';
      return;
    }

    const income = recurring.filter(r => r.type === 'income');
    const expenses = recurring.filter(r => r.type === 'expense');

    container.innerHTML = [
      income.length ? `<div class="recurring-group-label">Income</div>` + income.map(r => recurringHTML(r)).join('') : '',
      expenses.length ? `<div class="recurring-group-label">Expenses</div>` + expenses.map(r => recurringHTML(r)).join('') : '',
    ].join('');

    container.querySelectorAll('.recurring-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditRecurring(btn.dataset.id));
    });
    container.querySelectorAll('.recurring-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteRecurring(btn.dataset.id));
    });
    container.querySelectorAll('.recurring-toggle').forEach(btn => {
      btn.addEventListener('click', () => toggleRecurring(btn.dataset.id));
    });
  }

  function recurringHTML(r) {
    const weekly = r.frequency === 'weekly' ? r.amount
      : r.frequency === 'fortnightly' ? r.amount / 2
      : r.amount * 12 / 52;
    const monthly = weekly * 52 / 12;
    const freqLabel = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: `Monthly (${r.day_of_month}${daySuffix(r.day_of_month)})` }[r.frequency] || r.frequency;

    return `<div class="recurring-item ${r.active ? '' : 'inactive'}">
      <div class="txn-icon ${r.type}">${categoryIcon(r.category)}</div>
      <div class="txn-details">
        <div class="txn-description">${escHtml(r.description)}</div>
        <div class="txn-meta">${escHtml(r.category)} · ${freqLabel}</div>
      </div>
      <div class="recurring-amounts">
        <div class="recurring-weekly">${formatCurrency(weekly)}/wk</div>
        <div class="recurring-monthly">${formatCurrency(monthly)}/mo</div>
      </div>
      <div class="txn-actions" style="opacity:1">
        <button class="txn-btn recurring-toggle" data-id="${r.id}" title="${r.active ? 'Pause' : 'Activate'}">${r.active ? '⏸' : '▶'}</button>
        <button class="txn-btn recurring-edit" data-id="${r.id}" title="Edit">✏️</button>
        <button class="txn-btn delete recurring-delete" data-id="${r.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  function daySuffix(d) {
    if (d >= 11 && d <= 13) return 'th';
    return ['th','st','nd','rd','th','th','th','th','th','th'][d % 10];
  }

  function bindRecurringModal() {
    document.getElementById('btn-add-recurring')?.addEventListener('click', openAddRecurring);
    document.getElementById('form-recurring')?.addEventListener('submit', saveRecurring);
    document.querySelectorAll('.tab-btn-r').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn-r').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('recurring-type').value = btn.dataset.type;
        updateRecurringCategories(btn.dataset.type);
      });
    });
  }

  function updateRecurringCategories(type) {
    const sel = document.getElementById('recurring-category');
    const expenseOpts = `<option value="">Select category...</option>
      <option value="Housing">Housing</option>
      <option value="Mortgage">Mortgage</option>
      <option value="Rates">Rates</option>
      <option value="Food & Dining">Food & Dining</option>
      <option value="Transport">Transport</option>
      <option value="Health">Health</option>
      <option value="Entertainment">Entertainment</option>
      <option value="Shopping">Shopping</option>
      <option value="Utilities">Utilities</option>
      <option value="Education">Education</option>
      <option value="Kids">Kids</option>
      <option value="Savings">Savings</option>
      <option value="Personal Care">Personal Care</option>
      <option value="Other">Other</option>
      <option value="Transfer">🔁 Transfer</option>`;
    const incomeOpts = `<option value="">Select category...</option>
      <option value="Salary">Salary</option>
      <option value="Rental Income">Rental Income</option>
      <option value="Freelance">Freelance</option>
      <option value="Investment">Investment</option>
      <option value="Other Income">Other Income</option>
      <option value="Transfer">🔁 Transfer</option>`;
    sel.innerHTML = type === 'income' ? incomeOpts : expenseOpts;
  }

  function openAddRecurring() {
    document.getElementById('recurring-id').value = '';
    document.getElementById('form-recurring').reset();
    document.getElementById('recurring-type').value = 'expense';
    document.querySelectorAll('.tab-btn-r').forEach(b => b.classList.toggle('active', b.dataset.type === 'expense'));
    updateRecurringCategories('expense');
    document.getElementById('modal-recurring-title').textContent = 'Add Recurring';
    document.getElementById('modal-recurring').classList.remove('hidden');
  }

  function openEditRecurring(id) {
    const r = recurring.find(r => r.id === id);
    if (!r) return;
    document.getElementById('recurring-id').value = r.id;
    document.getElementById('recurring-type').value = r.type;
    document.getElementById('recurring-description').value = r.description;
    document.getElementById('recurring-amount').value = r.amount;
    document.getElementById('recurring-category').value = r.category;
    document.getElementById('recurring-frequency').value = r.frequency;
    document.getElementById('recurring-day').value = r.day_of_month;
    document.querySelectorAll('.tab-btn-r').forEach(b => b.classList.toggle('active', b.dataset.type === r.type));
    updateRecurringCategories(r.type);
    document.getElementById('recurring-category').value = r.category;
    document.getElementById('modal-recurring-title').textContent = 'Edit Recurring';
    document.getElementById('modal-recurring').classList.remove('hidden');
  }

  async function saveRecurring(e) {
    e.preventDefault();
    const id = document.getElementById('recurring-id').value || crypto.randomUUID();
    const r = {
      id,
      type: document.getElementById('recurring-type').value,
      description: document.getElementById('recurring-description').value.trim(),
      amount: parseFloat(document.getElementById('recurring-amount').value),
      category: document.getElementById('recurring-category').value,
      frequency: document.getElementById('recurring-frequency').value,
      day_of_month: parseInt(document.getElementById('recurring-day').value) || 1,
      active: true,
    };
    try {
      await SB.upsertRecurring(r);
      const idx = recurring.findIndex(x => x.id === id);
      if (idx >= 0) recurring[idx] = r; else recurring.push(r);
      closeModals();
      renderRecurring();
    } catch (err) {
      showToast('Failed to save recurring: ' + err.message, 'error');
    }
  }

  async function deleteRecurring(id) {
    if (!confirm('Delete this recurring transaction?')) return;
    try {
      await SB.deleteRecurring(id);
      recurring = recurring.filter(r => r.id !== id);
      renderRecurring();
    } catch (err) {
      showToast('Failed to delete recurring: ' + err.message, 'error');
    }
  }

  async function toggleRecurring(id) {
    const r = recurring.find(r => r.id === id);
    if (!r) return;
    r.active = !r.active;
    await SB.upsertRecurring(r);
    renderRecurring();
  }

  // ===== AI Chat =====
  function bindAI() {
    const sendBtn = document.getElementById('btn-ai-send');
    const input = document.getElementById('ai-input');

    sendBtn?.addEventListener('click', sendAIMessage);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
    });

    document.querySelectorAll('.suggestion-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('ai-input').value = btn.dataset.msg;
        sendAIMessage();
      });
    });

    document.getElementById('btn-refresh-snapshot')?.addEventListener('click', refreshAISnapshot);
  }

  async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    const thinking = appendMessage('assistant', 'Thinking...', true);

    try {
      const reply = await AI.chat(chatHistory, transactions, budgets, currency);
      thinking.remove();
      appendMessage('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      thinking.remove();
      appendMessage('assistant', `Error: ${err.message}`);
    }
  }

  function appendMessage(role, text, isThinking = false) {
    const container = document.getElementById('ai-messages');
    const div = document.createElement('div');
    div.className = `ai-msg ${role}${isThinking ? ' thinking' : ''}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  async function refreshAISnapshot() {
    const el = document.getElementById('ai-snapshot-content');
    if (!el) return;
    el.innerHTML = '<p class="placeholder-text">Getting snapshot...</p>';
    try {
      const snap = await AI.getSnapshot(transactions, budgets, currency);
      el.textContent = snap || 'Add an API key in Settings to enable AI snapshots.';
    } catch (err) {
      el.innerHTML = `<p class="placeholder-text">Error: ${err.message}</p>`;
    }
  }

  function clearAISnapshot() {
    const el = document.getElementById('ai-snapshot-content');
    if (el) el.innerHTML = '<p class="placeholder-text">Click Refresh to update your AI snapshot.</p>';
  }

  // ===== Settings =====
  function bindSettings() {
    document.getElementById('btn-save-api-key')?.addEventListener('click', async () => {
      const key = document.getElementById('setting-api-key').value.trim();
      if (key) {
        await DB.setSetting('apiKey', key);
        showToast('API key saved');
      }
    });

    document.getElementById('setting-currency')?.addEventListener('change', async (e) => {
      currency = e.target.value;
      window._appCurrency = currency;
      await DB.setSetting('currency', currency);
      Charts.destroyAll();
      renderDashboard();
      updateCurrencySymbols();
      showToast('Currency updated');
    });

    DB.getSetting('apiKey').then(key => {
      if (key) document.getElementById('setting-api-key').value = key;
    });
    DB.getSetting('currency').then(cur => {
      if (cur) document.getElementById('setting-currency').value = cur;
    });
  }

  // ===== Export / Import =====
  function bindExportImport() {
    document.getElementById('btn-export')?.addEventListener('click', exportData);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    document.getElementById('btn-save-assigned-accounts')?.addEventListener('click', saveAssignedAccounts);
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file')?.addEventListener('change', importData);
    document.getElementById('btn-clear-data')?.addEventListener('click', clearAllData);
    document.getElementById('btn-remove-duplicates')?.addEventListener('click', removeDuplicates);
    document.getElementById('btn-find-transfers')?.addEventListener('click', findAndLabelTransfers);
  }

  function exportData() {
    const data = { transactions, budgets, exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    function csvEscape(val) {
      const s = String(val ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }
    const headers = ['date', 'description', 'amount', 'type', 'category', 'account', 'notes'];
    const rows = transactions.map(t => [
      csvEscape(t.date || ''),
      csvEscape(t.description || ''),
      csvEscape(t.type === 'expense' ? `-${t.amount}` : String(t.amount ?? '')),
      csvEscape(t.type || ''),
      csvEscape(t.category || ''),
      csvEscape(t.account || ''),
      csvEscape(t.notes || ''),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} as CSV`);
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.transactions || !data.budgets) throw new Error('Invalid file format');
      if (!confirm(`Import ${data.transactions.length} transactions and ${data.budgets.length} budgets?`)) return;
      for (const t of data.transactions) await SB.upsertTransaction(t);
      for (const b of data.budgets) await SB.upsertBudget(b);
      transactions = await SB.getTransactions();
      budgets = await SB.getBudgets();
      refreshCurrentPage();
      showToast('Data imported successfully');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function removeDuplicates() {
    const resultEl = document.getElementById('duplicate-result');
    const btn = document.getElementById('btn-remove-duplicates');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    resultEl.textContent = '';

    const seen = new Map();
    const toDelete = [];

    // Sort by date so we keep the earliest-inserted copy
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    for (const t of sorted) {
      const key = `${t.date}|${t.description}|${Math.round(t.amount * 100)}|${t.type}`;
      if (seen.has(key)) {
        toDelete.push(t.id);
      } else {
        seen.set(key, t.id);
      }
    }

    if (toDelete.length === 0) {
      resultEl.textContent = 'No duplicates found.';
      btn.disabled = false;
      btn.textContent = 'Find & Remove Duplicates';
      return;
    }

    if (!confirm(`Found ${toDelete.length} duplicate transaction${toDelete.length !== 1 ? 's' : ''}. Remove them?`)) {
      btn.disabled = false;
      btn.textContent = 'Find & Remove Duplicates';
      return;
    }

    let removed = 0;
    for (const id of toDelete) {
      try {
        await SB.deleteTransaction(id);
        const idx = transactions.findIndex(t => t.id === id);
        if (idx !== -1) transactions.splice(idx, 1);
        removed++;
        btn.textContent = `Removing... ${Math.round((removed / toDelete.length) * 100)}%`;
      } catch (err) {
        console.error('Failed to delete duplicate:', err);
      }
    }

    btn.disabled = false;
    btn.textContent = 'Find & Remove Duplicates';
    resultEl.textContent = `Done — removed ${removed} duplicate${removed !== 1 ? 's' : ''}.`;
    refreshCurrentPage();
  }

  async function silentlyLabelTransfers() {
    const accountPatterns = [
      /^\d{2}-\d{4}-\d{7}-\d{2}(?!\d)/,
      /^\d{2}-\d{4}-\d{6}-\d{2}(?!\d)/,
      /^\d{3}-\d{4}-\d{3}(?!\d)/,
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

  async function findAndLabelTransfers() {
    const resultEl = document.getElementById('transfer-result');
    const btn = document.getElementById('btn-find-transfers');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    resultEl.textContent = '';

    // NZ bank account number patterns
    const accountPatterns = [
      /^\d{2}-\d{4}-\d{7}-\d{2}/,   // 38-9020-0211287-05
      /^\d{2}-\d{4}-\d{6}-\d{2}/,    // 01-0902-034664-00
      /^\d{3}-\d{4}-\d{3}/,           // 012-3236-009
      /^\d{2}-\d{4}-\d{7}/,           // shorter variant
    ];
    const transferKeywords = [
      'transfer', 'trf', 'internet banking', 'online banking',
      'between accounts', 'own account', 'savings transfer',
      'mortgage', 'loan payment', 'from account', 'to account',
    ];

    const candidates = transactions.filter(t => {
      if (t.category === 'Transfer') return false; // already labelled
      const desc = (t.description || '').toLowerCase();
      const matchesPattern = accountPatterns.some(p => p.test(t.description || ''));
      const matchesKeyword = transferKeywords.some(k => desc.includes(k));
      return matchesPattern || matchesKeyword;
    });

    btn.disabled = false;
    btn.textContent = '🔁 Find & Label Transfers';

    if (candidates.length === 0) {
      resultEl.textContent = 'No transfers found — all looking clean.';
      return;
    }

    // Show preview
    const preview = candidates.slice(0, 5).map(t => `• ${t.date} — ${t.description} (${formatCurrency(t.amount)})`).join('\n');
    const more = candidates.length > 5 ? `\n...and ${candidates.length - 5} more` : '';
    const confirmed = confirm(
      `Found ${candidates.length} likely transfer${candidates.length !== 1 ? 's' : ''}:\n\n${preview}${more}\n\nLabel all as Transfer? (Excludes them from income/expense totals)`
    );

    if (!confirmed) { resultEl.textContent = 'Cancelled.'; return; }

    btn.disabled = true;
    let updated = 0;
    for (const t of candidates) {
      try {
        const updatedTxn = { ...t, category: 'Transfer' };
        await SB.upsertTransaction(updatedTxn);
        const idx = transactions.findIndex(x => x.id === t.id);
        if (idx !== -1) transactions[idx] = updatedTxn;
        updated++;
        btn.textContent = `Labelling... ${Math.round((updated / candidates.length) * 100)}%`;
      } catch (err) {
        console.error('Failed to update transfer:', err);
      }
    }

    btn.disabled = false;
    btn.textContent = '🔁 Find & Label Transfers';
    resultEl.textContent = `Done — labelled ${updated} transaction${updated !== 1 ? 's' : ''} as Transfer.`;
    refreshCurrentPage();
  }

  async function clearAllData() {
    if (!confirm('Delete ALL data? This cannot be undone.')) return;
    for (const t of transactions) await SB.deleteTransaction(t.id);
    for (const b of budgets) await SB.deleteBudget(b.id);
    transactions = [];
    budgets = [];
    chatHistory = [];
    refreshCurrentPage();
    showToast('All data cleared');
  }

  // ===== CSV Import =====
  function bindCSVImport() {
    document.getElementById('btn-import-csv')?.addEventListener('click', () => {
      document.getElementById('csv-file-input').click();
    });

    document.getElementById('csv-file-input')?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      _csvFiles = await Promise.all(files.map(async f => ({ text: await f.text(), filename: f.name })));
      openImportModal();
      e.target.value = '';
    });

    document.getElementById('import-skip-internal')?.addEventListener('change', () => {
      if (!_csvFiles.length) return;
      const skip = document.getElementById('import-skip-internal').checked;
      _importRows = _csvFiles.flatMap(f => CSVImport.processRows(CSVImport.parseCSV(f.text), skip, f.filename));
      const dupKeys = new Set(transactions.map(t => `${t.date}|${t.description}|${Math.round(t.amount * 100)}`));
      _importRows.forEach(row => {
        row._isDuplicate = dupKeys.has(`${row.date}|${row.description}|${Math.round(row.amount * 100)}`);
        row._checked = !row._isDuplicate;
      });
      _importPage = 0;
      renderImportTable();
    });

    document.getElementById('import-select-all')?.addEventListener('change', (e) => {
      _importRows.forEach(row => { row._checked = e.target.checked; });
      renderImportTable();
    });

    document.getElementById('import-confirm-btn')?.addEventListener('click', doImport);
  }

  function openImportModal() {
    const skipInternal = document.getElementById('import-skip-internal').checked;
    _importRows = _csvFiles.flatMap(f => CSVImport.processRows(CSVImport.parseCSV(f.text), skipInternal, f.filename));
    const dupKeys = new Set(transactions.map(t => `${t.date}|${t.description}|${Math.round(t.amount * 100)}`));
    _importRows.forEach(row => {
      row._isDuplicate = dupKeys.has(`${row.date}|${row.description}|${Math.round(row.amount * 100)}`);
      row._checked = !row._isDuplicate;
    });
    _importPage = 0;
    renderImportTable();
    document.getElementById('modal-import').classList.remove('hidden');
  }

  function renderImportTable() {
    const tbody = document.getElementById('import-tbody');
    const totalPages = Math.ceil(_importRows.length / IMPORT_PAGE_SIZE);
    const start = _importPage * IMPORT_PAGE_SIZE;
    const pageRows = _importRows.slice(start, start + IMPORT_PAGE_SIZE);

    tbody.innerHTML = pageRows.map((row, pi) => {
      const i = start + pi;
      const rowClass = row._isDuplicate ? 'duplicate' : '';
      const checked = row._checked ? ' checked' : '';
      const dupBadge = row._isDuplicate ? '<span class="dup-badge">exists</span>' : '';
      return `<tr class="${rowClass}" data-idx="${i}">
        <td><input type="checkbox" class="import-row-check" data-idx="${i}"${checked} /></td>
        <td class="import-date">${row.date}</td>
        <td class="import-desc">${escHtml(row.description)}${dupBadge}</td>
        <td class="import-amount ${row.type}">${row.type === 'expense' ? '&minus;' : '+'}${formatCurrency(row.amount)}</td>
        <td class="import-cat"><select class="import-cat-select" data-idx="${i}">${CSVImport.categoryOptionsHTML(row.category, row.type)}</select></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.import-cat-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const desc = _importRows[idx].description;
        const cat = e.target.value;
        _importRows.forEach((row, i) => {
          if (row.description === desc) {
            row.category = cat;
            const otherSel = tbody.querySelector(`.import-cat-select[data-idx="${i}"]`);
            if (otherSel) otherSel.value = cat;
          }
        });
      });
    });

    tbody.querySelectorAll('.import-row-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        _importRows[parseInt(e.target.dataset.idx)]._checked = e.target.checked;
        updateImportSummary();
      });
    });

    // Pagination controls
    let pager = document.getElementById('import-pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'import-pager';
      pager.className = 'import-pager';
      document.querySelector('.import-table-wrap').after(pager);
    }
    if (totalPages > 1) {
      pager.innerHTML = `
        <button class="btn-ghost" id="import-prev" ${_importPage === 0 ? 'disabled' : ''}>&#8592; Prev</button>
        <span>Page ${_importPage + 1} of ${totalPages}</span>
        <button class="btn-ghost" id="import-next" ${_importPage >= totalPages - 1 ? 'disabled' : ''}>Next &#8594;</button>`;
      document.getElementById('import-prev').addEventListener('click', () => { _importPage--; renderImportTable(); });
      document.getElementById('import-next').addEventListener('click', () => { _importPage++; renderImportTable(); });
    } else {
      pager.innerHTML = '';
    }

    updateImportSummary();
  }

  function updateImportSummary() {
    const total = _importRows.length;
    const selected = _importRows.filter(r => r._checked).length;
    document.getElementById('import-summary').textContent =
      `${total} transactions found · ${selected} selected`;
    document.getElementById('import-confirm-btn').textContent =
      `Import ${selected} transaction${selected !== 1 ? 's' : ''}`;
  }

  async function doImport() {
    const toImport = _importRows.filter(r => r._checked);
    const btn = document.getElementById('import-confirm-btn');
    btn.disabled = true;

    const setBtnState = (label) => { btn.innerHTML = `<span class="btn-spinner"></span> ${label}`; };
    setBtnState(`Saving 0 / ${toImport.length}`);

    let count = 0;
    const total = toImport.length;
    for (const row of toImport) {
      const t = {
        id: crypto.randomUUID(),
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type,
        category: row.category,
        account: row.account || '',
        notes: '',
      };
      try {
        await SB.upsertTransaction(t);
        transactions.push(t);
        count++;
      } catch (err) {
        console.error('Import row failed:', err);
      }
      setBtnState(`Saving ${count} / ${total}`);
    }

    // Patch account field on existing transactions that were imported without one
    let accountsPatched = 0;
    for (const row of _importRows) {
      if (!row._isDuplicate || !row.account) continue;
      const key = `${row.date}|${row.description}|${Math.round(row.amount * 100)}`;
      const existing = transactions.find(t =>
        `${t.date}|${t.description}|${Math.round(t.amount * 100)}` === key && !t.account
      );
      if (!existing) continue;
      const updated = { ...existing, account: row.account };
      try {
        await SB.upsertTransaction(updated);
        const idx = transactions.findIndex(t => t.id === existing.id);
        if (idx >= 0) transactions[idx] = updated;
        accountsPatched++;
      } catch (err) {
        console.error('Failed to patch account on transaction:', err);
      }
    }

    // Update account balances from closing balance in CSV (runs even if all duplicates)
    btn.innerHTML = '<span class="btn-spinner"></span> Updating balances…';
    const lastBalances = CSVImport.getLastBalances(_importRows);
    let balancesUpdated = 0;
    for (const [accountNumber, balance] of Object.entries(lastBalances)) {
      const account = accounts.find(a => a.account_number === accountNumber);
      if (account) {
        const updated = { ...account, balance, balance_updated_at: new Date().toISOString().slice(0, 10) };
        try {
          await SB.upsertAccount(updated);
          const idx = accounts.findIndex(a => a.id === account.id);
          if (idx >= 0) accounts[idx] = updated;
          balancesUpdated++;
        } catch (err) {
          console.error('Failed to update account balance:', err);
        }
      }
    }

    btn.disabled = false;
    closeModals();
    refreshCurrentPage();
    const txnMsg = count > 0 ? `Imported ${count} transaction${count !== 1 ? 's' : ''}` : 'No new transactions';
    const balanceMsg = balancesUpdated > 0 ? ` · ${balancesUpdated} balance${balancesUpdated !== 1 ? 's' : ''} updated` : '';
    const patchMsg = accountsPatched > 0 ? ` · ${accountsPatched} account link${accountsPatched !== 1 ? 's' : ''} fixed` : '';
    const transfersLabelled = await silentlyLabelTransfers();
    const transferMsg = transfersLabelled > 0 ? ` · ${transfersLabelled} transfer${transfersLabelled !== 1 ? 's' : ''} labelled` : '';
    showToast(`${txnMsg}${balanceMsg}${patchMsg}${transferMsg}`);
    _importRows = [];
    _csvFiles = [];
    if (serviceAccounts.length > 0) {
      setTimeout(() => showServiceBalancePrompt(), 400);
    }
  }

  // ===== Helpers =====
  function setTodayDate() {
    const input = document.getElementById('txn-date');
    if (input) input.value = new Date().toISOString().slice(0, 10);
  }

  function updateCurrencySymbols() {
    const symbols = { NZD: 'NZ$', USD: '$', AUD: 'A$', GBP: '£', EUR: '€' };
    const sym = symbols[currency] || '$';
    document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = sym);
  }

  function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  function refreshCurrentPage() {
    const active = document.querySelector('.page.active');
    if (!active) return;
    const page = active.id.replace('page-', '');
    if (page === 'dashboard') renderDashboard();
    else if (page === 'accounts') renderAccounts();
    else if (page === 'transactions') renderTransactionsList();
    else if (page === 'budgets') renderBudgets();
  }

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
    }, type === 'error' ? 4000 : 2500);
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', App.boot);
