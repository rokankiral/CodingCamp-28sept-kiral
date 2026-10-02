// app.js — Expense & Budget Visualizer
// Modules: State, Storage, Validator, Renderer, Controller

// ─────────────────────────────────────────────────────────────
// TASK 2.1 — State (single source of truth) & Storage module
// ─────────────────────────────────────────────────────────────

/**
 * Valid transaction categories.
 * @type {readonly string[]}
 */
export const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];

/**
 * Application state — single source of truth.
 * @type {{ transactions: object[], sortOrder: string, spendingLimit: number }}
 */
export const state = {
  transactions: [],      // Transaction[]
  sortOrder: 'default',  // 'default' | 'amount-desc' | 'amount-asc' | 'category-asc'
  spendingLimit: 0       // number; 0 = highlight feature inactive
};

/**
 * Custom error thrown when Local Storage quota is exceeded.
 */
export class StorageQuotaError extends Error {
  constructor(message) {
    super(message || 'Local Storage quota exceeded.');
    this.name = 'StorageQuotaError';
  }
}

/**
 * Validates a single transaction object loaded from Local Storage.
 * Accepts legacy entries without `date` and migrates them to epoch ISO string.
 *
 * @param {unknown} tx - The value to validate
 * @returns {boolean} true if valid (mutates tx.date for migration if absent)
 */
export function isValidTransaction(tx) {
  if (typeof tx !== 'object' || tx === null) return false;
  if (typeof tx.id !== 'string' || tx.id.trim() === '') return false;
  if (typeof tx.name !== 'string' || tx.name.trim() === '') return false;
  if (typeof tx.amount !== 'number' || tx.amount <= 0) return false;
  if (!VALID_CATEGORIES.includes(tx.category)) return false;

  // Migrate legacy entries that lack a `date` field
  if (typeof tx.date !== 'string' || tx.date.trim() === '') {
    tx.date = new Date(0).toISOString();
  }

  return true;
}

/**
 * Storage module — wraps Local Storage operations with validation and error handling.
 */
export const Storage = {
  KEY: 'expense_visualizer_transactions',
  LIMIT_KEY: 'expense_visualizer_limit',

  /**
   * Checks whether Local Storage is available in the current browser.
   * Uses a test write/read/delete cycle inside try/catch.
   *
   * @returns {boolean}
   */
  isAvailable() {
    try {
      const testKey = '__ls_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Reads and parses the transaction array from Local Storage.
   *
   * @returns {object[] | null} null if no data is stored yet
   * @throws {Error} if the stored data cannot be parsed or fails validation
   */
  load() {
    const raw = localStorage.getItem(this.KEY);

    // Nothing stored yet — not an error
    if (raw === null) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('Corrupt data: failed to parse JSON from Local Storage.');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Corrupt data: stored value is not an array.');
    }

    // Validate every element; mutates legacy entries for date migration
    for (const tx of parsed) {
      if (!isValidTransaction(tx)) {
        throw new Error('Corrupt data: one or more transactions failed validation.');
      }
    }

    return parsed;
  },

  /**
   * Serialises the transaction array and writes it to Local Storage.
   *
   * @param {object[]} transactions
   * @throws {StorageQuotaError} if the Local Storage quota is exceeded
   */
  save(transactions) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(transactions));
    } catch (e) {
      // QuotaExceededError is `e.name === 'QuotaExceededError'` in Chrome/FF
      // and `e.code === 22` in older WebKit
      if (
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e.code === 22
      ) {
        throw new StorageQuotaError();
      }
      throw e;
    }
  },

  /**
   * Overwrites the transaction data in Local Storage with an empty array.
   * Used to recover from corrupt data on load.
   */
  clear() {
    localStorage.setItem(this.KEY, JSON.stringify([]));
  },

  /**
   * Reads the spending limit from Local Storage.
   *
   * @returns {number} The stored limit, or 0 if absent / invalid
   */
  loadLimit() {
    const raw = localStorage.getItem(this.LIMIT_KEY);
    if (raw === null) return 0;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return 0;
    }

    if (typeof parsed !== 'number' || !isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return parsed;
  },

  /**
   * Saves the spending limit to Local Storage.
   *
   * @param {number} limit
   */
  saveLimit(limit) {
    localStorage.setItem(this.LIMIT_KEY, JSON.stringify(limit));
  }
};

// ─────────────────────────────────────────────────────────────
// Task 3: Validator module   — implemented in Task 3
// Task 6: Controller         — implemented in Task 6
// Task 8: Initialization     — implemented in Task 8
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// TASK 5 — Renderer module
// ─────────────────────────────────────────────────────────────

/**
 * Colour map for each spending category.
 * Used by renderChart() and the custom legend.
 */
export const CATEGORY_COLORS = {
  Food:      '#FF6384',
  Transport: '#36A2EB',
  Fun:       '#FFCE56'
};

/**
 * Returns a sorted *copy* of state.transactions according to state.sortOrder.
 * The original array is never mutated.
 *
 * @returns {object[]}
 */
export function getSortedTransactions() {
  const copy = [...state.transactions];
  switch (state.sortOrder) {
    case 'amount-desc':  return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':   return copy.sort((a, b) => a.amount - b.amount);
    case 'category-asc': return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:             return copy; // 'default': insertion order
  }
}

/**
 * Singleton Chart.js instance.
 * Created once by renderChart(); updated on subsequent calls.
 * @type {object|null}
 */
export let chartInstance = null;

/**
 * Renderer module — reads from `state` and updates the DOM.
 * All methods are pure side-effects on the DOM; they never mutate `state`.
 */
export const Renderer = {

  // ── 5.1 ─────────────────────────────────────────────────────
  /**
   * Computes the total of all transaction amounts and updates #total-balance.
   *
   * - Empty list → "Rp 0,00"
   * - sum > 999_999_999.99 → prepend "⚠ " + class `balance--overflow`
   * - Formatted with Intl.NumberFormat id-ID / IDR
   */
  renderBalance() {
    const el = document.getElementById('total-balance');
    if (!el) return;

    const sum = state.transactions.reduce((acc, t) => acc + t.amount, 0);
    const OVERFLOW_LIMIT = 999_999_999.99;

    const formatter = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    });

    if (sum > OVERFLOW_LIMIT) {
      el.textContent = '⚠ ' + formatter.format(sum);
      el.classList.add('balance--overflow');
    } else {
      el.textContent = formatter.format(sum);
      el.classList.remove('balance--overflow');
    }
  },

  // ── 5.3 ─────────────────────────────────────────────────────
  /**
   * Clears #transaction-list and re-renders every transaction from state.
   * Respects state.sortOrder and state.spendingLimit.
   * Shows #empty-message when there are no transactions.
   */
  renderList() {
    const listEl    = document.getElementById('transaction-list');
    const emptyEl   = document.getElementById('empty-message');
    if (!listEl) return;

    // Empty state
    if (state.transactions.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    listEl.style.display = '';

    const sorted = getSortedTransactions();
    const formatter = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    });

    listEl.innerHTML = '';

    for (const tx of sorted) {
      const overLimit =
        state.spendingLimit > 0 && tx.amount > state.spendingLimit;

      const formattedAmount = formatter.format(tx.amount);
      const displayAmount   = overLimit ? '⚠ ' + formattedAmount : formattedAmount;

      const li = document.createElement('li');
      li.className   = 'transaction-item' + (overLimit ? ' transaction-item--over-limit' : '');
      li.dataset.id  = tx.id;

      li.innerHTML = `
        <span class="item-name">${escapeHtml(tx.name)}</span>
        <span class="item-category badge badge--${escapeHtml(tx.category)}">${escapeHtml(tx.category)}</span>
        <span class="item-amount">${displayAmount}</span>
        <button class="btn-delete" aria-label="Hapus ${escapeHtml(tx.name)}">✕</button>
      `.trim();

      listEl.appendChild(li);
    }
  },

  // ── 5.4 ─────────────────────────────────────────────────────
  /**
   * Computes CategoryTotals and updates the Chart.js pie chart + custom legend.
   * Creates the Chart instance on first call; updates it on subsequent calls.
   * Hides canvas and shows #chart-empty-message when all totals are 0.
   */
  renderChart() {
    const canvasEl    = document.getElementById('expense-chart');
    const emptyMsgEl  = document.getElementById('chart-empty-message');
    const legendEl    = document.getElementById('chart-legend');

    if (!canvasEl) return;

    // Compute totals per category
    const totals = { Food: 0, Transport: 0, Fun: 0 };
    for (const tx of state.transactions) {
      if (tx.category in totals) totals[tx.category] += tx.amount;
    }

    const grandTotal = totals.Food + totals.Transport + totals.Fun;

    // All-zero case
    if (grandTotal === 0) {
      canvasEl.hidden = true;
      if (emptyMsgEl) emptyMsgEl.hidden = false;
      if (legendEl)   legendEl.innerHTML = '';
      return;
    }

    canvasEl.hidden = false;
    if (emptyMsgEl) emptyMsgEl.hidden = true;

    // Filter to only categories with total > 0
    const activeCategories = VALID_CATEGORIES.filter(cat => totals[cat] > 0);
    const labels  = activeCategories;
    const data    = activeCategories.map(cat => totals[cat]);
    const colors  = activeCategories.map(cat => CATEGORY_COLORS[cat]);

    // Percentage tooltip/label callback (format: "33.3%")
    const percentagePlugin = {
      afterDraw(chart) {
        const { ctx, data: d } = chart;
        const total = d.datasets[0].data.reduce((s, v) => s + v, 0);
        if (total === 0) return;

        chart.getDatasetMeta(0).data.forEach((arc, i) => {
          const value   = d.datasets[0].data[i];
          const pct     = ((value / total) * 100).toFixed(1) + '%';
          const { x, y } = arc.tooltipPosition();
          ctx.save();
          ctx.font         = 'bold 12px sans-serif';
          ctx.fillStyle    = '#fff';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pct, x, y);
          ctx.restore();
        });
      }
    };

    // eslint-disable-next-line no-undef
    const ChartConstructor = (typeof Chart !== 'undefined') ? Chart : null;
    if (!ChartConstructor) return; // Chart.js not loaded (e.g. test env without mock)

    const chartData = {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        hoverOffset: 8
      }]
    };

    const chartOptions = {
      responsive: true,
      plugins: {
        legend: { display: false }, // we render a custom legend
        tooltip: {
          callbacks: {
            label(context) {
              const total = context.dataset.data.reduce((s, v) => s + v, 0);
              const pct   = total > 0
                ? ((context.parsed / total) * 100).toFixed(1) + '%'
                : '0.0%';
              return `${context.label}: ${pct}`;
            }
          }
        }
      }
    };

    if (chartInstance) {
      chartInstance.data    = chartData;
      chartInstance.options = chartOptions;
      chartInstance.update();
    } else {
      chartInstance = new ChartConstructor(canvasEl, {
        type: 'pie',
        data: chartData,
        options: chartOptions,
        plugins: [percentagePlugin]
      });
    }

    // Custom legend
    if (legendEl) {
      legendEl.innerHTML = activeCategories.map(cat => `
        <span class="legend-item">
          <span class="legend-dot" style="background:${CATEGORY_COLORS[cat]}"></span>
          <span class="legend-label">${escapeHtml(cat)}</span>
        </span>
      `).join('');
    }
  }
};

// ─────────────────────────────────────────────────────────────
// Shared utility — HTML escaping (used by Renderer and Controller)
// ─────────────────────────────────────────────────────────────

/**
 * Escapes a string for safe insertion into HTML attribute values and content.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────
// Browser entry-point (no-op until Task 8 wires everything up)
// ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    console.log('Expense & Budget Visualizer loaded.');
  });
}
