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
// TASK 3.1 — Validator module
// ─────────────────────────────────────────────────────────────

/** Maximum allowed character length for a transaction name. */
export const NAME_MAX_LENGTH = 100;

/** Maximum allowed amount value. */
export const AMOUNT_MAX = 999_999_999.99;

/**
 * Validator module — validates user input before a transaction is created.
 */
export const Validator = {
  /**
   * Validates form input for a new transaction.
   *
   * Rules:
   *  - name   : required, not whitespace-only, ≤ 100 characters
   *  - amount : required, numeric > 0, ≤ 999_999_999.99
   *  - category: must be one of VALID_CATEGORIES
   *
   * @param {string} name     - Raw name input (string from text field)
   * @param {string} amount   - Raw amount input (string from number field)
   * @param {string} category - Selected category value
   * @returns {{ valid: true } | { valid: false, errors: { name?: string, amount?: string, category?: string } }}
   */
  validateTransaction(name, amount, category) {
    const errors = {};

    // ── name validation ──────────────────────────────────────
    if (typeof name !== 'string' || name.trim().length === 0) {
      errors.name = 'Nama item wajib diisi.';
    } else if (name.trim().length > NAME_MAX_LENGTH) {
      errors.name = `Nama item tidak boleh lebih dari ${NAME_MAX_LENGTH} karakter.`;
    }

    // ── amount validation ────────────────────────────────────
    const parsedAmount = parseFloat(amount);
    if (amount === '' || amount === null || amount === undefined) {
      errors.amount = 'Jumlah wajib diisi.';
    } else if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.amount = 'Jumlah harus berupa angka lebih dari nol.';
    } else if (parsedAmount > AMOUNT_MAX) {
      errors.amount = `Jumlah tidak boleh melebihi ${AMOUNT_MAX.toLocaleString('id-ID')}.`;
    }

    // ── category validation ───────────────────────────────────
    if (!VALID_CATEGORIES.includes(category)) {
      errors.category = 'Kategori harus salah satu dari: Food, Transport, Fun.';
    }

    if (Object.keys(errors).length === 0) {
      return { valid: true };
    }

    return { valid: false, errors };
  }
};

// ─────────────────────────────────────────────────────────────
// Task 5: Renderer module    — implemented in Task 5
// Task 6: Controller         — implemented in Task 6
// Task 8: Initialization     — implemented in Task 8
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Browser entry-point (no-op until Task 8 wires everything up)
// ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    console.log('Expense & Budget Visualizer loaded.');
  });
}
