// ===== Chart helpers =====
const Charts = (() => {
  let categoryChart = null;
  let timelineChart = null;

  const CATEGORY_COLORS = [
    '#6c63ff', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
    '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4'
  ];

  const chartDefaults = {
    color: '#8888aa',
    borderColor: '#2a2a45',
    font: { family: 'Inter, system-ui, sans-serif', size: 12 },
  };

  Chart.defaults.color = chartDefaults.color;
  Chart.defaults.borderColor = chartDefaults.borderColor;
  Chart.defaults.font = chartDefaults.font;

  function renderCategoryChart(transactions) {
    const canvas = document.getElementById('chart-categories');
    if (!canvas) return;

    const expenses = transactions.filter(t => t.type === 'expense');
    const totals = {};
    expenses.forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });

    const labels = Object.keys(totals);
    const data = Object.values(totals);

    if (categoryChart) categoryChart.destroy();

    if (labels.length === 0) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';

    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: CATEGORY_COLORS.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#1e1e32',
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 14, boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        }
      }
    });
  }

  function renderTimelineChart(transactions, months = 6) {
    const canvas = document.getElementById('chart-timeline');
    if (!canvas) return;

    const now = new Date();
    const labels = [];
    const incomeData = [];
    const expenseData = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      labels.push(d.toLocaleDateString('en', { month: 'short', year: '2-digit' }));

      const monthTxns = transactions.filter(t => t.date.startsWith(key));
      incomeData.push(monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
      expenseData.push(monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    }

    if (timelineChart) timelineChart.destroy();

    timelineChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: '#22c55e',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Expenses',
            data: expenseData,
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'top', labels: { padding: 14, boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(42,42,69,0.5)' } },
          y: {
            grid: { color: 'rgba(42,42,69,0.5)' },
            ticks: { callback: (v) => formatCurrency(v, true) }
          }
        }
      }
    });
  }

  function destroyAll() {
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    if (timelineChart) { timelineChart.destroy(); timelineChart = null; }
  }

  return { renderCategoryChart, renderTimelineChart, destroyAll };
})();

// Currency format helper (global, used by charts + app)
function formatCurrency(amount, compact = false) {
  const currency = window._appCurrency || 'NZD';
  if (compact && amount >= 1000) {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency,
      notation: 'compact', maximumFractionDigits: 1
    }).format(amount);
  }
  return new Intl.NumberFormat('en', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount);
}
