// Paste this into the finance app's browser console.
// Step 1: runs analysis, prints suggestions, stores them on window.__suggestions
// Step 2: call   await __insertSuggestions()   to insert as inactive

(async () => {
  const txns = await SB.getTransactions();
  const existingRec = await SB.getRecurring();

  const norm = s => (s || '')
    .toLowerCase()
    .replace(/\d{2,}/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');

  const existingKeys = new Set(existingRec.map(r => `${r.type}::${norm(r.description)}`));

  const groups = {};
  for (const t of txns) {
    if (!t.description || t.category === 'Transfer') continue;
    const n = norm(t.description);
    if (!n || n.length < 3) continue;
    const key = `${t.type}::${n}`;
    (groups[key] = groups[key] || []).push(t);
  }

  const suggestions = [];
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 3) continue;
    if (existingKeys.has(key)) continue;
    const [type] = key.split('::');

    const months = [...new Set(list.map(t => t.date.slice(0, 7)))].sort();
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < months.length; i++) {
      const [y1, m1] = months[i - 1].split('-').map(Number);
      const [y2, m2] = months[i].split('-').map(Number);
      const diff = (y2 - y1) * 12 + (m2 - m1);
      if (diff === 1) { curRun++; maxRun = Math.max(maxRun, curRun); } else curRun = 1;
    }
    if (maxRun < 3) continue;

    const amounts = list.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const consistent = amounts.filter(a => median > 0 && Math.abs(a - median) / median < 0.15).length;
    if (consistent < Math.ceil(list.length * 2 / 3)) continue;

    const days = list.map(t => parseInt(t.date.slice(8, 10))).sort((a, b) => a - b);
    const dayMedian = days[Math.floor(days.length / 2)];

    const catCount = {};
    list.forEach(t => { const c = t.category || 'Uncategorised'; catCount[c] = (catCount[c] || 0) + 1; });
    const category = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0][0];

    const descCount = {};
    list.forEach(t => { descCount[t.description] = (descCount[t.description] || 0) + 1; });
    const description = Object.entries(descCount).sort((a, b) => b[1] - a[1])[0][0];

    suggestions.push({
      id: crypto.randomUUID(),
      type,
      description,
      amount: Math.round(median * 100) / 100,
      category,
      frequency: 'monthly',
      day_of_month: dayMedian,
      active: false,
      _evidence: { total_months: months.length, consecutive_months: maxRun, transactions: list.length, months_list: months },
    });
  }

  suggestions.sort((a, b) => b._evidence.consecutive_months - a._evidence.consecutive_months);

  console.table(suggestions.map(s => ({
    type: s.type,
    description: s.description,
    amount: s.amount,
    day: s.day_of_month,
    category: s.category,
    consecutive: s._evidence.consecutive_months,
    samples: s._evidence.transactions,
  })));
  console.log(`Found ${suggestions.length} recurring candidates.`);
  console.log(`Call:  await __insertSuggestions()  to insert them as INACTIVE (review & activate in the Recurring page).`);

  window.__suggestions = suggestions;
  window.__insertSuggestions = async () => {
    for (const s of suggestions) {
      const { _evidence, ...rec } = s;
      await SB.upsertRecurring(rec);
    }
    console.log(`Inserted ${suggestions.length} recurring items (inactive). Refresh the app to see them.`);
  };
})();
