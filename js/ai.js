// ===== AI Advisor (Claude API) =====
const AI = (() => {
  const MODEL = 'claude-opus-4-6';

  async function getApiKey() {
    return DB.getSetting('apiKey');
  }

  function buildFinancialContext(transactions, budgets, currency) {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthTxns = transactions.filter(t => t.date.startsWith(thisMonth));
    const income = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const byCategory = {};
    monthTxns.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    const last3Months = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mTxns = transactions.filter(t => t.date.startsWith(key));
      last3Months.push({
        month: d.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
        income: mTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expenses: mTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      });
    }

    const budgetStatus = budgets.map(b => {
      const spent = byCategory[b.category] || 0;
      return { category: b.category, limit: b.amount, spent, remaining: b.amount - spent };
    });

    return `You are a helpful personal finance advisor. Here is the user's financial data:

Currency: ${currency}

THIS MONTH (${new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })}):
- Income: ${formatCurrency(income)}
- Expenses: ${formatCurrency(expenses)}
- Net: ${formatCurrency(income - expenses)}

SPENDING BY CATEGORY THIS MONTH:
${Object.entries(byCategory).map(([cat, amt]) => `- ${cat}: ${formatCurrency(amt)}`).join('\n') || '- No expenses recorded'}

BUDGETS:
${budgetStatus.length > 0
  ? budgetStatus.map(b => `- ${b.category}: spent ${formatCurrency(b.spent)} of ${formatCurrency(b.limit)} limit (${formatCurrency(b.remaining)} remaining)`).join('\n')
  : '- No budgets set'}

LAST 3 MONTHS SUMMARY:
${last3Months.map(m => `- ${m.month}: Income ${formatCurrency(m.income)}, Expenses ${formatCurrency(m.expenses)}, Net ${formatCurrency(m.income - m.expenses)}`).join('\n')}

Be concise, friendly, and practical. Give specific actionable advice based on the actual numbers. Use the correct currency symbol.`;
  }

  function callClaude(apiKey, payload) {
    return fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });
  }

  async function chat(messages, transactions, budgets, currency) {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('No API key set. Go to Settings to add your Claude API key.');
    }

    const systemPrompt = buildFinancialContext(transactions, budgets, currency);

    const response = await callClaude(apiKey, {
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async function getSnapshot(transactions, budgets, currency) {
    const apiKey = await getApiKey();
    if (!apiKey) return null;

    const systemPrompt = buildFinancialContext(transactions, budgets, currency);

    const response = await callClaude(apiKey, {
      model: MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: "Give me a brief 3-4 sentence financial snapshot for this month. What's going well, what needs attention, and one actionable tip."
      }]
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.content[0].text;
  }

  return { chat, getSnapshot };
})();
