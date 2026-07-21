// ---------- State ----------
const STORAGE_KEY = 'ledger.entries.v1';
let entries = loadEntries();
let currentType = 'expense';

const CATEGORY_COLORS = {
  Food: '#3ECF8E',
  Transport: '#5AC8FA',
  Housing: '#E4572E',
  Utilities: '#F2C94C',
  Entertainment: '#9B72CF',
  Health: '#F28482',
  Income: '#3ECF8E',
  Other: '#8FA39B'
};

// ---------- DOM refs ----------
const form = document.getElementById('entryForm');
const typeToggle = document.getElementById('typeToggle');
const tapeBody = document.getElementById('tapeBody');
const tapeTotalValue = document.getElementById('tapeTotalValue');
const tapeDate = document.getElementById('tapeDate');
const balanceValue = document.getElementById('balanceValue');
const balanceNote = document.getElementById('balanceNote');
const incomeValue = document.getElementById('incomeValue');
const expenseValue = document.getElementById('expenseValue');
const filterCategory = document.getElementById('filterCategory');
const categoryEmpty = document.getElementById('categoryEmpty');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const dateInput = document.getElementById('date');

dateInput.valueAsDate = new Date();
tapeDate.textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// ---------- Persistence ----------
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Could not load saved entries:', e);
    return [];
  }
}

function saveEntries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Could not save entries:', e);
  }
}

// ---------- Type toggle ----------
typeToggle.addEventListener('click', () => {
  currentType = currentType === 'expense' ? 'income' : 'expense';
  typeToggle.dataset.type = currentType;
});

// ---------- Form submit ----------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const desc = document.getElementById('desc').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;
  const date = document.getElementById('date').value;

  if (!desc || !amount || amount <= 0) return;

  entries.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    desc,
    amount: Math.round(amount * 100) / 100,
    category,
    date,
    type: currentType
  });

  saveEntries();
  form.reset();
  dateInput.valueAsDate = new Date();
  renderAll();
});

// ---------- Delete entry ----------
function deleteEntry(id) {
  entries = entries.filter(e => e.id !== id);
  saveEntries();
  renderAll();
}

// ---------- Clear all ----------
clearBtn.addEventListener('click', () => {
  if (entries.length === 0) return;
  if (confirm('Clear every entry in the ledger? This cannot be undone.')) {
    entries = [];
    saveEntries();
    renderAll();
  }
});

// ---------- Export CSV ----------
exportBtn.addEventListener('click', () => {
  if (entries.length === 0) return;
  const header = 'Date,Description,Category,Type,Amount\n';
  const rows = entries.map(e =>
    [e.date, `"${e.desc.replace(/"/g, '""')}"`, e.category, e.type, e.amount].join(',')
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ledger-export.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Filter ----------
filterCategory.addEventListener('change', renderTape);

function populateFilterOptions() {
  const cats = [...new Set(entries.map(e => e.category))].sort();
  const current = filterCategory.value;
  filterCategory.innerHTML = '<option value="all">All categories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
  if (cats.includes(current)) filterCategory.value = current;
}

// ---------- Render: receipt tape ----------
function renderTape() {
  const filter = filterCategory.value;
  const visible = filter === 'all' ? entries : entries.filter(e => e.category === filter);

  if (visible.length === 0) {
    tapeBody.innerHTML = '<div class="tape-empty">— no entries yet —</div>';
  } else {
    tapeBody.innerHTML = visible.map(e => `
      <div class="tape-line">
        <div>
          <div class="tl-desc">${escapeHtml(e.desc)}</div>
          <div class="tl-cat">${e.category} · ${formatDate(e.date)}</div>
        </div>
        <span class="tl-amt ${e.type}">${e.type === 'expense' ? '-' : '+'}$${e.amount.toFixed(2)}</span>
        <button class="tl-del" title="Delete entry" onclick="deleteEntry('${e.id}')">✕</button>
      </div>
    `).join('');
  }

  const balance = entries.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
  tapeTotalValue.textContent = formatMoney(balance);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

// ---------- Render: summary cards ----------
function renderSummary() {
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;

  balanceValue.textContent = formatMoney(balance);
  incomeValue.textContent = `$${income.toFixed(2)}`;
  expenseValue.textContent = `$${expense.toFixed(2)}`;
  balanceValue.style.color = balance < 0 ? 'var(--rust)' : 'var(--text)';
  balanceNote.textContent = entries.length === 0
    ? 'start logging to see your standing'
    : balance >= 0 ? 'in the black' : 'in the red';
}

// ---------- Charts ----------
let categoryChart, trendChart;

function renderCategoryChart() {
  const spend = entries.filter(e => e.type === 'expense');
  const totals = {};
  spend.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount; });

  const labels = Object.keys(totals);
  const data = Object.values(totals);
  const ctx = document.getElementById('categoryChart');

  categoryEmpty.style.display = labels.length === 0 ? 'block' : 'none';
  ctx.style.display = labels.length === 0 ? 'none' : 'block';

  if (categoryChart) categoryChart.destroy();
  if (labels.length === 0) return;

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => CATEGORY_COLORS[l] || '#8FA39B'),
        borderColor: '#172221',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#EAF2EE', boxWidth: 10, font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

function renderTrendChart() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }) });
  }

  const income = months.map(m => entries
    .filter(e => e.type === 'income' && matchesMonth(e.date, m.key))
    .reduce((s, e) => s + e.amount, 0));

  const expense = months.map(m => entries
    .filter(e => e.type === 'expense' && matchesMonth(e.date, m.key))
    .reduce((s, e) => s + e.amount, 0));

  const ctx = document.getElementById('trendChart');
  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Income', data: income, backgroundColor: '#3ECF8E', borderRadius: 4 },
        { label: 'Spend', data: expense, backgroundColor: '#E4572E', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#8FA39B', font: { family: 'Inter', size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#8FA39B', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
      },
      plugins: {
        legend: { labels: { color: '#EAF2EE', font: { family: 'Inter', size: 11 } } }
      }
    }
  });
}

function matchesMonth(iso, key) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}-${d.getMonth()}` === key;
}

// ---------- Render all ----------
function renderAll() {
  populateFilterOptions();
  renderTape();
  renderSummary();
  renderCategoryChart();
  renderTrendChart();
}

renderAll();