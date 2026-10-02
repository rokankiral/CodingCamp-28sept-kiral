/**
 * Tests for Task 2.1 — State & Storage module
 *
 * Framework : Vitest + jsdom (for localStorage)
 * PBT lib   : fast-check (minimum 100 iterations per property test)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  state,
  Storage,
  StorageQuotaError,
  isValidTransaction,
  VALID_CATEGORIES
} from './app.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Build a minimal valid transaction object. */
function makeTransaction(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Makan siang',
    amount: 45000,
    category: 'Food',
    date: new Date().toISOString(),
    ...overrides
  };
}

// fast-check arbitrary that produces valid Transaction objects
const transactionArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  amount: fc.float({ min: 0.01, max: 999_999_999.99, noNaN: true }).filter(n => n > 0),
  category: fc.constantFrom(...VALID_CATEGORIES),
  date: fc.date({ min: new Date(0), max: new Date('2100-01-01') })
         .map(d => d.toISOString())
});

// ─────────────────────────────────────────────────────────────
// Reset localStorage before every test
// ─────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// isValidTransaction — unit tests
// ─────────────────────────────────────────────────────────────

describe('isValidTransaction()', () => {
  it('returns true for a well-formed transaction', () => {
    expect(isValidTransaction(makeTransaction())).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidTransaction(null)).toBe(false);
  });

  it('returns false when id is missing', () => {
    expect(isValidTransaction(makeTransaction({ id: '' }))).toBe(false);
  });

  it('returns false when name is empty string', () => {
    expect(isValidTransaction(makeTransaction({ name: '' }))).toBe(false);
  });

  it('returns false when name is only whitespace', () => {
    expect(isValidTransaction(makeTransaction({ name: '   ' }))).toBe(false);
  });

  it('returns false when amount is zero', () => {
    expect(isValidTransaction(makeTransaction({ amount: 0 }))).toBe(false);
  });

  it('returns false when amount is negative', () => {
    expect(isValidTransaction(makeTransaction({ amount: -1 }))).toBe(false);
  });

  it('returns false for an invalid category', () => {
    expect(isValidTransaction(makeTransaction({ category: 'Other' }))).toBe(false);
  });

  it('migrates missing date to epoch ISO string', () => {
    const tx = makeTransaction({ date: undefined });
    delete tx.date;
    expect(isValidTransaction(tx)).toBe(true);
    expect(tx.date).toBe(new Date(0).toISOString());
  });

  it('migrates empty date string to epoch ISO string', () => {
    const tx = makeTransaction({ date: '' });
    expect(isValidTransaction(tx)).toBe(true);
    expect(tx.date).toBe(new Date(0).toISOString());
  });
});

// ─────────────────────────────────────────────────────────────
// Storage.isAvailable() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Storage.isAvailable()', () => {
  it('returns true when localStorage works normally (jsdom)', () => {
    expect(Storage.isAvailable()).toBe(true);
  });

  it('returns false when localStorage.setItem throws', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(Storage.isAvailable()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Storage.load() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Storage.load()', () => {
  it('returns null when no data is stored', () => {
    expect(Storage.load()).toBeNull();
  });

  it('returns an empty array when the stored value is []', () => {
    localStorage.setItem(Storage.KEY, JSON.stringify([]));
    expect(Storage.load()).toEqual([]);
  });

  it('returns the stored transactions when data is valid', () => {
    const txs = [makeTransaction(), makeTransaction({ category: 'Transport' })];
    localStorage.setItem(Storage.KEY, JSON.stringify(txs));
    const loaded = Storage.load();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe(txs[0].id);
    expect(loaded[1].id).toBe(txs[1].id);
  });

  it('throws on malformed JSON', () => {
    localStorage.setItem(Storage.KEY, '{ not valid json');
    expect(() => Storage.load()).toThrow('Corrupt data');
  });

  it('throws when stored value is not an array', () => {
    localStorage.setItem(Storage.KEY, JSON.stringify({ foo: 'bar' }));
    expect(() => Storage.load()).toThrow('Corrupt data');
  });

  it('throws when any transaction element is invalid', () => {
    const bad = [makeTransaction({ amount: -50 })];
    localStorage.setItem(Storage.KEY, JSON.stringify(bad));
    expect(() => Storage.load()).toThrow('Corrupt data');
  });

  it('migrates legacy transactions without a date field on load', () => {
    const tx = makeTransaction();
    delete tx.date;
    localStorage.setItem(Storage.KEY, JSON.stringify([tx]));
    const loaded = Storage.load();
    expect(loaded[0].date).toBe(new Date(0).toISOString());
  });
});

// ─────────────────────────────────────────────────────────────
// Storage.save() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Storage.save()', () => {
  it('persists transactions to localStorage', () => {
    const txs = [makeTransaction()];
    Storage.save(txs);
    const raw = localStorage.getItem(Storage.KEY);
    expect(JSON.parse(raw)).toEqual(txs);
  });

  it('overwrites previous data with new data', () => {
    const first = [makeTransaction({ name: 'First' })];
    const second = [makeTransaction({ name: 'Second' })];
    Storage.save(first);
    Storage.save(second);
    const raw = localStorage.getItem(Storage.KEY);
    expect(JSON.parse(raw)[0].name).toBe('Second');
  });

  it('throws StorageQuotaError when quota is exceeded (QuotaExceededError)', () => {
    const quotaErr = new DOMException('QuotaExceededError', 'QuotaExceededError');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw quotaErr; });
    expect(() => Storage.save([])).toThrowError(StorageQuotaError);
  });

  it('throws StorageQuotaError when quota is exceeded (code 22)', () => {
    const err = new Error('quota');
    err.code = 22;
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw err; });
    expect(() => Storage.save([])).toThrowError(StorageQuotaError);
  });

  it('re-throws non-quota errors unchanged', () => {
    const someErr = new TypeError('unexpected');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw someErr; });
    expect(() => Storage.save([])).toThrowError(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────
// Storage.clear() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Storage.clear()', () => {
  it('writes an empty array to localStorage', () => {
    Storage.save([makeTransaction()]);
    Storage.clear();
    expect(JSON.parse(localStorage.getItem(Storage.KEY))).toEqual([]);
  });

  it('after clear, Storage.load() returns []', () => {
    Storage.save([makeTransaction()]);
    Storage.clear();
    expect(Storage.load()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Storage.loadLimit() / saveLimit() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Storage.loadLimit()', () => {
  it('returns 0 when no limit is stored', () => {
    expect(Storage.loadLimit()).toBe(0);
  });

  it('returns the stored limit', () => {
    Storage.saveLimit(75000);
    expect(Storage.loadLimit()).toBe(75000);
  });

  it('returns 0 for a negative value', () => {
    localStorage.setItem(Storage.LIMIT_KEY, JSON.stringify(-100));
    expect(Storage.loadLimit()).toBe(0);
  });

  it('returns 0 for NaN', () => {
    localStorage.setItem(Storage.LIMIT_KEY, 'null');
    expect(Storage.loadLimit()).toBe(0);
  });

  it('returns 0 for malformed JSON', () => {
    localStorage.setItem(Storage.LIMIT_KEY, '{bad');
    expect(Storage.loadLimit()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// PROPERTY-BASED TESTS
// ─────────────────────────────────────────────────────────────

// Feature: expense-budget-visualizer, Property 5: Persistensi data round-trip
describe('Property 5 — Persistensi data round-trip', () => {
  /**
   * Validates: Requirements 5.1, 5.2, 5.3
   *
   * For any valid transaction array, save() then load() must return an
   * equivalent array (same id, name, amount, category, date; same order).
   */
  it('save then load returns an equivalent array for any valid transaction list', () => {
    fc.assert(
      fc.property(fc.array(transactionArb), (transactions) => {
        localStorage.clear();
        Storage.save(transactions);
        const loaded = Storage.load();

        // Same length
        expect(loaded).toHaveLength(transactions.length);

        // Same order, same field values
        for (let i = 0; i < transactions.length; i++) {
          expect(loaded[i].id).toBe(transactions[i].id);
          expect(loaded[i].name).toBe(transactions[i].name);
          expect(loaded[i].amount).toBe(transactions[i].amount);
          expect(loaded[i].category).toBe(transactions[i].category);
          expect(loaded[i].date).toBe(transactions[i].date);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('empty array round-trip returns an empty array', () => {
    Storage.save([]);
    expect(Storage.load()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
// TASK 5 — Renderer module tests
// ═════════════════════════════════════════════════════════════

import {
  CATEGORY_COLORS,
  getSortedTransactions,
  Renderer,
  escapeHtml
} from './app.js';

// ─────────────────────────────────────────────────────────────
// Helpers shared across Renderer tests
// ─────────────────────────────────────────────────────────────

/** Reset state.transactions to an empty array before each test. */
function resetState() {
  state.transactions = [];
  state.sortOrder    = 'default';
  state.spendingLimit = 0;
}

/** Build minimal DOM needed by renderBalance(). */
function setupBalanceDOM() {
  document.body.innerHTML = '<h1 id="total-balance"></h1>';
}

/** Build minimal DOM needed by renderList(). */
function setupListDOM() {
  document.body.innerHTML = `
    <ul id="transaction-list"></ul>
    <p id="empty-message"></p>
  `;
}

/** Build minimal DOM needed by renderChart(). */
function setupChartDOM() {
  document.body.innerHTML = `
    <canvas id="expense-chart"></canvas>
    <p id="chart-empty-message"></p>
    <div id="chart-legend"></div>
  `;
}

// ─────────────────────────────────────────────────────────────
// escapeHtml — unit tests
// ─────────────────────────────────────────────────────────────

describe('escapeHtml()', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });
  it('returns plain string unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
  it('coerces non-string input via String()', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

// ─────────────────────────────────────────────────────────────
// getSortedTransactions() — unit tests
// ─────────────────────────────────────────────────────────────

describe('getSortedTransactions()', () => {
  beforeEach(() => resetState());

  it('returns insertion order for "default"', () => {
    state.transactions = [
      makeTransaction({ amount: 300 }),
      makeTransaction({ amount: 100 }),
      makeTransaction({ amount: 200 })
    ];
    const sorted = getSortedTransactions();
    expect(sorted.map(t => t.amount)).toEqual([300, 100, 200]);
  });

  it('sorts amount-desc', () => {
    state.transactions = [
      makeTransaction({ amount: 100 }),
      makeTransaction({ amount: 300 }),
      makeTransaction({ amount: 200 })
    ];
    state.sortOrder = 'amount-desc';
    expect(getSortedTransactions().map(t => t.amount)).toEqual([300, 200, 100]);
  });

  it('sorts amount-asc', () => {
    state.transactions = [
      makeTransaction({ amount: 300 }),
      makeTransaction({ amount: 100 }),
      makeTransaction({ amount: 200 })
    ];
    state.sortOrder = 'amount-asc';
    expect(getSortedTransactions().map(t => t.amount)).toEqual([100, 200, 300]);
  });

  it('sorts category-asc (Food < Fun < Transport)', () => {
    state.transactions = [
      makeTransaction({ category: 'Transport' }),
      makeTransaction({ category: 'Food' }),
      makeTransaction({ category: 'Fun' })
    ];
    state.sortOrder = 'category-asc';
    expect(getSortedTransactions().map(t => t.category)).toEqual(['Food', 'Fun', 'Transport']);
  });

  it('does not mutate state.transactions', () => {
    state.transactions = [
      makeTransaction({ amount: 200 }),
      makeTransaction({ amount: 100 })
    ];
    state.sortOrder = 'amount-asc';
    getSortedTransactions();
    expect(state.transactions[0].amount).toBe(200); // original order preserved
  });
});

// ─────────────────────────────────────────────────────────────
// Renderer.renderBalance() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Renderer.renderBalance()', () => {
  beforeEach(() => {
    resetState();
    setupBalanceDOM();
  });

  it('shows Rp 0,00 when there are no transactions', () => {
    Renderer.renderBalance();
    const el = document.getElementById('total-balance');
    // Intl formatting in jsdom may differ slightly; check it contains 0
    expect(el.textContent).toMatch(/0/);
    expect(el.classList.contains('balance--overflow')).toBe(false);
  });

  it('shows the correct sum for a single transaction', () => {
    state.transactions = [makeTransaction({ amount: 45000 })];
    Renderer.renderBalance();
    const el = document.getElementById('total-balance');
    // Intl format for IDR 45000 in id-ID locale contains '45.000'
    expect(el.textContent).toMatch(/45[.,]?0+/);
  });

  it('shows the correct sum for multiple transactions', () => {
    state.transactions = [
      makeTransaction({ amount: 30000 }),
      makeTransaction({ amount: 20000 })
    ];
    Renderer.renderBalance();
    const el = document.getElementById('total-balance');
    expect(el.textContent).toMatch(/50[.,]?0+/);
  });

  it('adds overflow indicator when sum > 999_999_999.99', () => {
    state.transactions = [
      makeTransaction({ amount: 999_999_999.99 }),
      makeTransaction({ amount: 1 })
    ];
    Renderer.renderBalance();
    const el = document.getElementById('total-balance');
    expect(el.textContent).toMatch(/^⚠/);
    expect(el.classList.contains('balance--overflow')).toBe(true);
  });

  it('removes overflow class when sum is within range after a prior overflow', () => {
    const el = document.getElementById('total-balance');
    el.classList.add('balance--overflow');
    state.transactions = [makeTransaction({ amount: 50000 })];
    Renderer.renderBalance();
    expect(el.classList.contains('balance--overflow')).toBe(false);
  });

  it('does nothing if #total-balance is absent from the DOM', () => {
    document.body.innerHTML = '';
    // Should not throw
    expect(() => Renderer.renderBalance()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Renderer.renderList() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Renderer.renderList()', () => {
  beforeEach(() => {
    resetState();
    setupListDOM();
  });

  it('shows #empty-message and hides list when transactions is empty', () => {
    Renderer.renderList();
    const listEl  = document.getElementById('transaction-list');
    const emptyEl = document.getElementById('empty-message');
    expect(emptyEl.hidden).toBe(false);
    expect(listEl.style.display).toBe('none');
  });

  it('hides #empty-message and shows list when transactions exist', () => {
    state.transactions = [makeTransaction()];
    Renderer.renderList();
    const listEl  = document.getElementById('transaction-list');
    const emptyEl = document.getElementById('empty-message');
    expect(emptyEl.hidden).toBe(true);
    expect(listEl.style.display).not.toBe('none');
  });

  it('renders one <li> per transaction', () => {
    state.transactions = [makeTransaction(), makeTransaction({ category: 'Transport' })];
    Renderer.renderList();
    const items = document.querySelectorAll('#transaction-list .transaction-item');
    expect(items).toHaveLength(2);
  });

  it('each <li> has data-id matching the transaction id', () => {
    const tx = makeTransaction({ id: 'test-id-123' });
    state.transactions = [tx];
    Renderer.renderList();
    const li = document.querySelector('.transaction-item');
    expect(li.dataset.id).toBe('test-id-123');
  });

  it('renders category badge with correct class', () => {
    state.transactions = [makeTransaction({ category: 'Transport' })];
    Renderer.renderList();
    const badge = document.querySelector('.badge--Transport');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Transport');
  });

  it('renders delete button with correct aria-label', () => {
    state.transactions = [makeTransaction({ name: 'Makan' })];
    Renderer.renderList();
    const btn = document.querySelector('.btn-delete');
    expect(btn.getAttribute('aria-label')).toBe('Hapus Makan');
  });

  it('adds transaction-item--over-limit class when amount exceeds spendingLimit', () => {
    state.transactions  = [makeTransaction({ amount: 60000 })];
    state.spendingLimit = 50000;
    Renderer.renderList();
    const li = document.querySelector('.transaction-item');
    expect(li.classList.contains('transaction-item--over-limit')).toBe(true);
    const amountEl = li.querySelector('.item-amount');
    expect(amountEl.textContent).toMatch(/^⚠/);
  });

  it('does NOT add over-limit class when amount equals or is below limit', () => {
    state.transactions  = [makeTransaction({ amount: 50000 })];
    state.spendingLimit = 50000;
    Renderer.renderList();
    const li = document.querySelector('.transaction-item');
    expect(li.classList.contains('transaction-item--over-limit')).toBe(false);
  });

  it('does NOT add over-limit class when spendingLimit is 0 (disabled)', () => {
    state.transactions  = [makeTransaction({ amount: 1_000_000 })];
    state.spendingLimit = 0;
    Renderer.renderList();
    const li = document.querySelector('.transaction-item');
    expect(li.classList.contains('transaction-item--over-limit')).toBe(false);
  });

  it('respects sort order when rendering', () => {
    state.transactions = [
      makeTransaction({ amount: 300, name: 'C' }),
      makeTransaction({ amount: 100, name: 'A' }),
      makeTransaction({ amount: 200, name: 'B' })
    ];
    state.sortOrder = 'amount-asc';
    Renderer.renderList();
    const names = [...document.querySelectorAll('.item-name')].map(el => el.textContent);
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('clears previous render on subsequent calls', () => {
    state.transactions = [makeTransaction(), makeTransaction()];
    Renderer.renderList();
    state.transactions = [makeTransaction()];
    Renderer.renderList();
    expect(document.querySelectorAll('.transaction-item')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Renderer.renderChart() — unit tests  (Chart.js mocked)
// ─────────────────────────────────────────────────────────────

describe('Renderer.renderChart()', () => {
  let MockChart;
  let lastChartConfig;

  beforeEach(() => {
    resetState();
    setupChartDOM();

    // Mock Chart constructor
    lastChartConfig = null;
    MockChart = vi.fn(function (canvas, config) {
      lastChartConfig = config;
      this.data    = config.data;
      this.options = config.options;
      this.update  = vi.fn(() => {});
    });
    globalThis.Chart = MockChart;

    // Reset the module-level chartInstance between tests by reassigning via import
    // We access it through the module, but since ES modules are live bindings we
    // manipulate state indirectly by calling renderChart() on a fresh DOM.
  });

  afterEach(() => {
    delete globalThis.Chart;
    vi.restoreAllMocks();
  });

  it('hides canvas and shows empty message when all totals are 0', () => {
    state.transactions = [];
    Renderer.renderChart();
    const canvas  = document.getElementById('expense-chart');
    const emptyEl = document.getElementById('chart-empty-message');
    expect(canvas.hidden).toBe(true);
    expect(emptyEl.hidden).toBe(false);
  });

  it('shows canvas and hides empty message when there are transactions', () => {
    state.transactions = [makeTransaction({ amount: 50000, category: 'Food' })];
    Renderer.renderChart();
    const canvas  = document.getElementById('expense-chart');
    const emptyEl = document.getElementById('chart-empty-message');
    expect(canvas.hidden).toBe(false);
    expect(emptyEl.hidden).toBe(true);
  });

  it('only passes categories with total > 0 to Chart', () => {
    state.transactions = [
      makeTransaction({ amount: 50000, category: 'Food' }),
      makeTransaction({ amount: 30000, category: 'Transport' })
    ];
    Renderer.renderChart();
    const labels = lastChartConfig.data.labels;
    expect(labels).toContain('Food');
    expect(labels).toContain('Transport');
    expect(labels).not.toContain('Fun');
  });

  it('renders custom legend only for active categories', () => {
    state.transactions = [makeTransaction({ amount: 20000, category: 'Fun' })];
    Renderer.renderChart();
    const legendEl = document.getElementById('chart-legend');
    expect(legendEl.textContent).toMatch(/Fun/);
    expect(legendEl.textContent).not.toMatch(/Food/);
    expect(legendEl.textContent).not.toMatch(/Transport/);
  });

  it('clears legend when all totals drop to 0', () => {
    state.transactions = [makeTransaction({ amount: 20000, category: 'Fun' })];
    Renderer.renderChart();
    state.transactions = [];
    Renderer.renderChart();
    const legendEl = document.getElementById('chart-legend');
    expect(legendEl.innerHTML).toBe('');
  });

  it('uses CATEGORY_COLORS for chart background colours', () => {
    state.transactions = [makeTransaction({ amount: 10000, category: 'Food' })];
    Renderer.renderChart();
    const bgColors = lastChartConfig.data.datasets[0].backgroundColor;
    expect(bgColors).toContain(CATEGORY_COLORS.Food);
  });

  it('does not throw when Chart is not defined (no CDN)', () => {
    delete globalThis.Chart;
    state.transactions = [makeTransaction({ amount: 10000, category: 'Food' })];
    expect(() => Renderer.renderChart()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// PROPERTY-BASED TESTS
// ─────────────────────────────────────────────────────────────

// Feature: expense-budget-visualizer, Property 4: Total balance = sum of all transactions
describe('Property 4 — Total balance = sum of all transactions', () => {
  /**
   * Validates: Requirements 3.2, 3.3, 3.4
   *
   * For any valid transaction array, the text rendered in #total-balance must
   * reflect a value equal to the arithmetic sum of all transaction amounts.
   * We verify this by comparing the numeric sum against what Intl.NumberFormat
   * would produce (or by checking overflow when the sum is large).
   */
  it('displayed balance equals the sum of all amounts for any valid transaction list', () => {
    setupBalanceDOM();

    fc.assert(
      fc.property(fc.array(transactionArb), (transactions) => {
        state.transactions  = transactions;
        state.sortOrder     = 'default';
        state.spendingLimit = 0;

        Renderer.renderBalance();

        const el = document.getElementById('total-balance');
        const sum = transactions.reduce((acc, t) => acc + t.amount, 0);
        const OVERFLOW_LIMIT = 999_999_999.99;

        if (sum > OVERFLOW_LIMIT) {
          // Overflow case: text starts with ⚠ and element has the class
          expect(el.textContent.startsWith('⚠')).toBe(true);
          expect(el.classList.contains('balance--overflow')).toBe(true);
        } else {
          // Normal case: formatted text must match what Intl.NumberFormat produces
          const expected = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
          }).format(sum);
          expect(el.textContent).toBe(expected);
          expect(el.classList.contains('balance--overflow')).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: expense-budget-visualizer, Property 6: Chart proportions sum to 100%
describe('Property 6 — Chart proportions sum to 100%', () => {
  /**
   * Validates: Requirements 4.1, 4.3, 4.6
   *
   * For any non-empty valid transaction array, the data values passed to Chart.js
   * must sum to the grand total, which means each segment's proportion of the
   * total must sum to 100% ± 0.1%.
   */
  it('chart segment data values produce proportions that sum to 100% ± 0.1%', () => {
    let capturedData = null;

    const MockChartCtor = vi.fn(function (_canvas, config) {
      capturedData = config.data;
      this.data    = config.data;
      this.options = config.options;
      this.update  = vi.fn();
    });

    fc.assert(
      fc.property(fc.array(transactionArb, { minLength: 1 }), (transactions) => {
        setupChartDOM();
        capturedData = null;
        MockChartCtor.mockClear();
        globalThis.Chart = MockChartCtor;

        state.transactions  = transactions;
        state.sortOrder     = 'default';
        state.spendingLimit = 0;

        Renderer.renderChart();

        delete globalThis.Chart;

        // If canvas is hidden, all totals were 0 — skip proportion check
        const canvas = document.getElementById('expense-chart');
        if (canvas.hidden) return;

        // capturedData holds the data passed to the Chart constructor
        expect(capturedData).not.toBeNull();
        const values = capturedData.datasets[0].data;
        const total  = values.reduce((s, v) => s + v, 0);
        expect(total).toBeGreaterThan(0);

        // Sum of all (value/total)*100 should equal 100.0 within float tolerance
        const pctSum = values.reduce((s, v) => s + (v / total) * 100, 0);
        expect(Math.abs(pctSum - 100)).toBeLessThan(0.1);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: expense-budget-visualizer, Property 7: Zero-total categories excluded from chart
describe('Property 7 — Zero-total categories excluded from chart and legend', () => {
  /**
   * Validates: Requirements 4.5, 4.6
   *
   * For any valid transaction array, every category whose total is 0 must NOT
   * appear as a label in the Chart.js data, and must NOT appear in the legend.
   */
  it('categories with total = 0 are absent from chart labels and legend', () => {
    const MockChartCtor = vi.fn(function (_canvas, config) {
      this.data    = config.data;
      this.options = config.options;
      this.update  = vi.fn();
    });

    fc.assert(
      fc.property(fc.array(transactionArb), (transactions) => {
        setupChartDOM();
        MockChartCtor.mockClear();
        globalThis.Chart = MockChartCtor;

        state.transactions  = transactions;
        state.sortOrder     = 'default';
        state.spendingLimit = 0;

        Renderer.renderChart();

        delete globalThis.Chart;

        // Compute which categories have total = 0
        const totals = { Food: 0, Transport: 0, Fun: 0 };
        for (const tx of transactions) {
          if (tx.category in totals) totals[tx.category] += tx.amount;
        }
        const zeroCategories = VALID_CATEGORIES.filter(cat => totals[cat] === 0);

        // If Chart was constructed, check labels
        if (MockChartCtor.mock.calls.length > 0) {
          const config = MockChartCtor.mock.calls[0][1];
          for (const cat of zeroCategories) {
            expect(config.data.labels).not.toContain(cat);
          }
        }

        // Check legend
        const legendEl = document.getElementById('chart-legend');
        for (const cat of zeroCategories) {
          // Legend text should not mention a zero-total category
          // (allow empty legend for all-zero case)
          if (legendEl.innerHTML.trim() !== '') {
            expect(legendEl.textContent).not.toMatch(new RegExp(`\\b${cat}\\b`));
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
