/**
 * conflict-format.ts — companion unit test (Task 4.2).
 *
 * Pure formatting logic extracted out of `ConflictsManager.tsx` so it's
 * testable without a React render harness (this repo has none — see
 * `useLocalResource.ts`'s docblock for the same reasoning).
 */
import { describe, it, expect } from 'vitest';
import { conflictLineVars } from './conflict-format';
import type { ConflictRow } from '@/lib/offline/db';

function makeRow(overrides: Partial<ConflictRow> = {}): ConflictRow {
  return {
    id: 's1:p1',
    saleId: 's1',
    saleNumber: 'V-0001',
    productId: 'p1',
    productName: 'Riz',
    requested: 5,
    available: 2,
    shortfall: 3,
    createdAt: '2026-07-20T00:00:00Z',
    resolved: 0,
    ...overrides,
  };
}

describe('conflictLineVars', () => {
  it('maps a conflict row to the i18n template vars, isolating numbers for RTL', () => {
    const vars = conflictLineVars(makeRow());

    expect(vars.productName).toBe('Riz');
    // LRI (U+2066) … PDI (U+2069) wrap every numeric/number-derived value so
    // Arabic BiDi reordering can't scramble it (see lib/i18n/bidi.ts).
    expect(vars.saleNumber).toBe('⁦V-0001⁩');
    expect(vars.shortfall).toBe('⁦3⁩');
    expect(vars.requested).toBe('⁦5⁩');
    expect(vars.available).toBe('⁦2⁩');
  });

  it('reflects a different row’s values', () => {
    const vars = conflictLineVars(
      makeRow({
        saleNumber: 'V-0042',
        productName: 'Sucre',
        requested: 10,
        available: 4,
        shortfall: 6,
      }),
    );

    expect(vars.saleNumber).toBe('⁦V-0042⁩');
    expect(vars.productName).toBe('Sucre');
    expect(vars.shortfall).toBe('⁦6⁩');
  });
});
