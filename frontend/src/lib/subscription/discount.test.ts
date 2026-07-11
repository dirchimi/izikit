import { describe, it, expect } from 'vitest';
import {
  normalizeCode,
  computeDiscountedAmount,
  validateDiscountCode,
  isDiscountType,
  type DiscountCodeRecord,
} from './discount';

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  promo10 ')).toBe('PROMO10');
  });
});

describe('isDiscountType', () => {
  it('accepts known types', () => {
    expect(isDiscountType('PERCENT')).toBe(true);
    expect(isDiscountType('AMOUNT')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isDiscountType('FREE')).toBe(false);
    expect(isDiscountType(null)).toBe(false);
  });
});

describe('computeDiscountedAmount', () => {
  it('applies a percentage', () => {
    expect(computeDiscountedAmount(300_000, 'PERCENT', 33)).toBe(201_000);
  });
  it('applies a fixed amount (annual 300k − 100k = 200k)', () => {
    expect(computeDiscountedAmount(300_000, 'AMOUNT', 100_000)).toBe(200_000);
  });
  it('never goes below zero (over-large fixed amount)', () => {
    expect(computeDiscountedAmount(30_000, 'AMOUNT', 999_999)).toBe(0);
  });
  it('clamps percentage to 100', () => {
    expect(computeDiscountedAmount(30_000, 'PERCENT', 150)).toBe(0);
  });
  it('rounds to an integer FCFA', () => {
    expect(computeDiscountedAmount(30_000, 'PERCENT', 33)).toBe(20_100);
    expect(computeDiscountedAmount(81_000, 'PERCENT', 33)).toBe(54_270);
  });
  it('returns 0 for a non-positive base', () => {
    expect(computeDiscountedAmount(0, 'PERCENT', 10)).toBe(0);
  });
});

describe('validateDiscountCode', () => {
  const now = new Date('2026-07-11T00:00:00Z');
  const base: DiscountCodeRecord = {
    code: 'PROMO',
    type: 'PERCENT',
    value: 10,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    active: true,
  };

  it('accepts a valid unlimited code', () => {
    expect(validateDiscountCode(base, now)).toEqual({ ok: true, type: 'PERCENT', value: 10 });
  });

  it('rejects a missing code', () => {
    expect(validateDiscountCode(null, now)).toEqual({ ok: false, reason: 'DISCOUNT_NOT_FOUND' });
  });

  it('rejects an inactive code', () => {
    expect(validateDiscountCode({ ...base, active: false }, now)).toEqual({
      ok: false,
      reason: 'DISCOUNT_INACTIVE',
    });
  });

  it('rejects an expired code', () => {
    expect(
      validateDiscountCode({ ...base, expiresAt: new Date('2026-07-10T00:00:00Z') }, now),
    ).toEqual({ ok: false, reason: 'DISCOUNT_EXPIRED' });
  });

  it('accepts a code expiring in the future', () => {
    const r = validateDiscountCode({ ...base, expiresAt: new Date('2026-07-12T00:00:00Z') }, now);
    expect(r.ok).toBe(true);
  });

  it('rejects an exhausted code', () => {
    expect(validateDiscountCode({ ...base, maxUses: 5, usedCount: 5 }, now)).toEqual({
      ok: false,
      reason: 'DISCOUNT_EXHAUSTED',
    });
  });

  it('accepts a code with uses remaining', () => {
    const r = validateDiscountCode({ ...base, maxUses: 5, usedCount: 4 }, now);
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(validateDiscountCode({ ...base, type: 'FREE' }, now)).toEqual({
      ok: false,
      reason: 'DISCOUNT_INVALID',
    });
  });

  it('rejects a non-positive value', () => {
    expect(validateDiscountCode({ ...base, value: 0 }, now)).toEqual({
      ok: false,
      reason: 'DISCOUNT_INVALID',
    });
  });
});
