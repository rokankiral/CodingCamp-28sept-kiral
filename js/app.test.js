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

// ─────────────────────────────────────────────────────────────
// Validator — imports
// ─────────────────────────────────────────────────────────────

import { Validator, NAME_MAX_LENGTH, AMOUNT_MAX } from './app.js';

// ─────────────────────────────────────────────────────────────
// Validator.validateTransaction() — unit tests
// ─────────────────────────────────────────────────────────────

describe('Validator.validateTransaction()', () => {
  // ── valid input ────────────────────────────────────────────
  it('returns { valid: true } for correct inputs', () => {
    const result = Validator.validateTransaction('Makan siang', '45000', 'Food');
    expect(result).toEqual({ valid: true });
  });

  it('accepts amount as string integer', () => {
    expect(Validator.validateTransaction('Taksi', '30000', 'Transport').valid).toBe(true);
  });

  it('accepts amount as string decimal', () => {
    expect(Validator.validateTransaction('Nonton', '25000.50', 'Fun').valid).toBe(true);
  });

  it('accepts name that is exactly 100 characters', () => {
    const name = 'a'.repeat(NAME_MAX_LENGTH);
    expect(Validator.validateTransaction(name, '1000', 'Food').valid).toBe(true);
  });

  it('accepts amount equal to the maximum allowed value', () => {
    expect(Validator.validateTransaction('Item', String(AMOUNT_MAX), 'Food').valid).toBe(true);
  });

  // ── name errors ────────────────────────────────────────────
  it('returns error when name is an empty string', () => {
    const result = Validator.validateTransaction('', '1000', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('returns error when name is only spaces', () => {
    const result = Validator.validateTransaction('   ', '1000', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('returns error when name is only tab/newline whitespace', () => {
    const result = Validator.validateTransaction('\t\n', '1000', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it('returns error when name exceeds 100 characters', () => {
    const name = 'a'.repeat(NAME_MAX_LENGTH + 1);
    const result = Validator.validateTransaction(name, '1000', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  // ── amount errors ──────────────────────────────────────────
  it('returns error when amount is empty string', () => {
    const result = Validator.validateTransaction('Item', '', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  it('returns error when amount is zero', () => {
    const result = Validator.validateTransaction('Item', '0', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  it('returns error when amount is negative', () => {
    const result = Validator.validateTransaction('Item', '-50', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  it('returns error when amount is non-numeric text', () => {
    const result = Validator.validateTransaction('Item', 'abc', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  it('returns error when amount exceeds maximum allowed value', () => {
    const result = Validator.validateTransaction('Item', String(AMOUNT_MAX + 1), 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.amount).toBeDefined();
  });

  // ── category errors ────────────────────────────────────────
  it('returns error when category is empty string (placeholder)', () => {
    const result = Validator.validateTransaction('Item', '1000', '');
    expect(result.valid).toBe(false);
    expect(result.errors.category).toBeDefined();
  });

  it('returns error for an unrecognised category', () => {
    const result = Validator.validateTransaction('Item', '1000', 'Shopping');
    expect(result.valid).toBe(false);
    expect(result.errors.category).toBeDefined();
  });

  // ── multiple errors ────────────────────────────────────────
  it('returns all field errors when all fields are invalid', () => {
    const result = Validator.validateTransaction('', '-5', 'Bad');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
    expect(result.errors.amount).toBeDefined();
    expect(result.errors.category).toBeDefined();
  });

  it('returns only the relevant error when only one field is invalid', () => {
    const result = Validator.validateTransaction('', '1000', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
    expect(result.errors.amount).toBeUndefined();
    expect(result.errors.category).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// PROPERTY-BASED TESTS — Validator
// ─────────────────────────────────────────────────────────────

// Feature: expense-budget-visualizer, Property 2: Input whitespace ditolak
describe('Property 2 — Input whitespace ditolak', () => {
  /**
   * Validates: Requirements 1.2, 1.5
   *
   * For any string composed entirely of whitespace characters used as the
   * name field, validateTransaction() must reject the input (valid === false)
   * regardless of the amount or category values.
   */
  it('rejects any all-whitespace name string', () => {
    // Arbitrary that produces non-empty strings made only of whitespace characters
    const whitespaceStringArb = fc.stringOf(
      fc.constantFrom(' ', '\t', '\n', '\r', '\u00A0'),
      { minLength: 1, maxLength: 50 }
    );

    fc.assert(
      fc.property(
        whitespaceStringArb,
        fc.float({ min: 0.01, max: AMOUNT_MAX, noNaN: true }).filter(n => n > 0),
        fc.constantFrom(...VALID_CATEGORIES),
        (wsName, amount, category) => {
          const result = Validator.validateTransaction(wsName, String(amount), category);
          expect(result.valid).toBe(false);
          expect(result.errors.name).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2 (extended) — Valid inputs always accepted by Validator', () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.5
   *
   * For any input where name is non-whitespace and within length, amount is
   * a positive number within range, and category is valid, the validator
   * must return { valid: true }.
   */
  it('accepts any valid transaction input combination', () => {
    const validNameArb = fc.string({ minLength: 1, maxLength: NAME_MAX_LENGTH })
      .filter(s => s.trim().length > 0);

    const validAmountArb = fc.float({ min: 0.01, max: AMOUNT_MAX, noNaN: true })
      .filter(n => n > 0 && n <= AMOUNT_MAX);

    fc.assert(
      fc.property(
        validNameArb,
        validAmountArb,
        fc.constantFrom(...VALID_CATEGORIES),
        (name, amount, category) => {
          const result = Validator.validateTransaction(name, String(amount), category);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
