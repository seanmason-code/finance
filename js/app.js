// ===== Finance App =====
const App = (() => {
  let transactions = [];
  let budgets = [];
  let recurring = [];
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
    } catch (err) {
      console.error('Failed to load data:', err);
      transactions = [];
      budgets = [];
      recurring = [];
    }

    setTodayDate();
    bindNav();
    bindTransactionModal();
    bindBudgetModal();
    bindRecurringModal();
    bindAI();
    bindSettings();
    bindFilters();
    bindExportImport();
    bindCSVImport();
    bindSignOut();
    bindMobileMenu();

    renderDashboard();
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

    if (page === 'dashboard') renderDashboard();
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

    const income = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net = income - expenses;

    const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
    const budgetRemaining = totalBudget - expenses;

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
    if (netWk) netWk.textContent = `${formatCurrency((net) * 12 / 52)}/wk`;
    document.getElementById('stat-budget-remaining').textContent =
      totalBudget > 0 ? formatCurrency(budgetRemaining) : '—';

    Charts.renderCategoryChart(monthTxns);
    Charts.renderTimelineChart(transactions);
    renderRecentTransactions();
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
    { category: 'Housing',      amount: 8621 },
    { category: 'Food & Dining', amount: 1625 },
    { category: 'Transport',    amount: 996  },
    { category: 'Utilities',    amount: 697  },
    { category: 'Health',       amount: 350  },
    { category: 'Entertainment', amount: 91  },
    { category: 'Kids',         amount: 2007 },
    { category: 'Shopping',     amount: 400  },
    { category: 'Personal Care', amount: 150 },
    { category: 'Other',        amount: 300  },
  ];

  let _reportDate = new Date();

  function categoryIcon(category) {
    const icons = {
      'Housing': '🏠', 'Food & Dining': '🍽️', 'Transport': '🚗', 'Health': '💊',
      'Entertainment': '🎬', 'Shopping': '🛍️', 'Utilities': '💡', 'Kids': '👶',
      'Education': '📚', 'Personal Care': '💇', 'Salary': '💼', 'Freelance': '💻',
      'Investment': '📈', 'Gift': '🎁', 'Other Income': '💰', 'Other': '📌'
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
      closeModals();
      refreshCurrentPage();
      clearAISnapshot();
    } catch (err) {
      alert('Failed to save: ' + err.message);
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
      alert('Failed to delete: ' + err.message);
    }
  }

  // ===== Budgets =====
  function renderBudgets() {
    const container = document.getElementById('budgets-list');
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthExpenses = transactions.filter(t => t.type === 'expense' && t.date.startsWith(thisMonth));

    const byCategory = {};
    monthExpenses.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    if (budgets.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No budgets set. Add one to start tracking your spending limits.</p></div>';
      return;
    }

    container.innerHTML = budgets.map(b => {
      const spent = byCategory[b.category] || 0;
      const pct = Math.min((spent / b.amount) * 100, 100);
      const status = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : 'safe';
      const statusText = pct >= 100
        ? `<span style="color:var(--red)">Over by ${formatCurrency(spent - b.amount)}</span>`
        : `<span style="color:var(--text-muted)">${formatCurrency(b.amount - spent)} left</span>`;

      return `<div class="budget-item">
        <div class="budget-header">
          <div>
            <div class="budget-name">${categoryIcon(b.category)} ${escHtml(b.category)}</div>
            <div class="budget-amounts">
              <strong>${formatCurrency(spent)}</strong> of ${formatCurrency(b.amount)} · ${statusText}
            </div>
          </div>
          <div class="budget-actions">
            <button class="btn-ghost budget-edit" data-id="${b.id}" style="padding:5px 10px;font-size:12px;">Edit</button>
            <button class="btn-ghost budget-delete" data-id="${b.id}" style="padding:5px 10px;font-size:12px;color:var(--red);">Delete</button>
          </div>
        </div>
        <div class="budget-bar-bg">
          <div class="budget-bar-fill ${status}" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.budget-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditBudget(btn.dataset.id));
    });
    container.querySelectorAll('.budget-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteBudget(btn.dataset.id));
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
    if (!confirm('This will add preset budgets from your Excel sheet. Existing budgets will not be changed. Continue?')) return;
    let added = 0;
    for (const preset of PRESET_BUDGETS) {
      const exists = budgets.some(b => b.category === preset.category);
      if (!exists) {
        const b = { id: crypto.randomUUID(), category: preset.category, amount: preset.amount };
        await SB.upsertBudget(b);
        budgets.push(b);
        added++;
      }
    }
    renderBudgets();
    showToast(added > 0 ? `Added ${added} preset budgets` : 'All preset categories already have budgets');
  }

  function bindBudgetModal() {
    document.getElementById('btn-add-budget')?.addEventListener('click', openAddBudget);
    document.getElementById('btn-load-presets')?.addEventListener('click', loadPresetBudgets);
    document.getElementById('form-budget')?.addEventListener('submit', saveBudget);
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
    const b = {
      id,
      category: document.getElementById('budget-category').value,
      amount: parseFloat(document.getElementById('budget-amount').value),
    };
    try {
      await SB.upsertBudget(b);
      const idx = budgets.findIndex(x => x.id === id);
      if (idx >= 0) budgets[idx] = b;
      else budgets.push(b);
      closeModals();
      renderBudgets();
    } catch (err) {
      alert('Failed to save budget: ' + err.message);
    }
  }

  async function deleteBudget(id) {
    if (!confirm('Delete this budget?')) return;
    try {
      await SB.deleteBudget(id);
      budgets = budgets.filter(b => b.id !== id);
      renderBudgets();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
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
      <option value="Other">Other</option>`;
    const incomeOpts = `<option value="">Select category...</option>
      <option value="Salary">Salary</option>
      <option value="Rental Income">Rental Income</option>
      <option value="Freelance">Freelance</option>
      <option value="Investment">Investment</option>
      <option value="Other Income">Other Income</option>`;
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
      alert('Failed to save: ' + err.message);
    }
  }

  async function deleteRecurring(id) {
    if (!confirm('Delete this recurring transaction?')) return;
    try {
      await SB.deleteRecurring(id);
      recurring = recurring.filter(r => r.id !== id);
      renderRecurring();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
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
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file')?.addEventListener('change', importData);
    document.getElementById('btn-clear-data')?.addEventListener('click', clearAllData);
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
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
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

    if (toImport.length === 0) {
      alert('No transactions selected.');
      return;
    }

    const btn = document.getElementById('import-confirm-btn');
    btn.textContent = 'Importing...';
    btn.disabled = true;

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
        notes: `Bank import (${row.account})`,
      };
      try {
        await SB.upsertTransaction(t);
        transactions.push(t);
        count++;
      } catch (err) {
        console.error('Import row failed:', err);
      }
      btn.textContent = `Importing... ${Math.round((count / total) * 100)}%`;
    }

    btn.disabled = false;
    closeModals();
    refreshCurrentPage();
    showToast(`Imported ${count} transaction${count !== 1 ? 's' : ''}`);
    _importRows = [];
    _csvFiles = [];
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
    else if (page === 'transactions') renderTransactionsList();
    else if (page === 'budgets') renderBudgets();
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;background:#6c63ff;color:white;
      padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;
      z-index:9999;opacity:0;transition:opacity 0.2s;box-shadow:0 4px 20px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', App.boot);
