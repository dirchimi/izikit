/**
 * expense-adapters.ts — companion unit test (Task 5.1).
 *
 * Pure function, no render harness needed (this repo ships none — the
 * vitest include glob is `.test.ts` only). Mirrors `pos-adapters.test.ts`'s
 * shape.
 */
import { describe, it, expect } from 'vitest';
import type { ExpenseRow } from './db';
import { expenseRowToApi } from './expense-adapters';

const baseRow: ExpenseRow = {
  id: 'e1',
  organizationId: 'o1',
  number: '#L1',
  label: 'Loyer boutique',
  category: 'Loyer',
  amount: 30000,
  occurredAt: '2026-07-20T00:00:00.000Z',
  createdAt: '2026-07-20T00:00:00.000Z',
};

describe('expenseRowToApi', () => {
  it('maps every field the UI reads', () => {
    expect(expenseRowToApi(baseRow)).toEqual({
      id: 'e1',
      number: '#L1',
      label: 'Loyer boutique',
      category: 'Loyer',
      amount: 30000,
      note: '',
      occurredAt: '2026-07-20T00:00:00.000Z',
      synced: true,
    });
  });

  it("defaults an absent note to '' rather than undefined", () => {
    const mapped = expenseRowToApi(baseRow);
    expect(mapped.note).toBe('');
    expect('note' in mapped).toBe(true);
  });

  it('passes a present note through unchanged', () => {
    const mapped = expenseRowToApi({ ...baseRow, note: 'Payé en espèces' });
    expect(mapped.note).toBe('Payé en espèces');
  });

  it('does not leak internal fields (organizationId, createdAt)', () => {
    const mapped = expenseRowToApi({ ...baseRow, synced: false });
    expect(mapped).not.toHaveProperty('organizationId');
    expect(mapped).not.toHaveProperty('createdAt');
  });

  it('passes through a false synced flag (row still queued for the outbox)', () => {
    expect(expenseRowToApi({ ...baseRow, synced: false }).synced).toBe(false);
  });

  it('maps an absent synced (a row pulled fresh from the server) to true — never "pending" forever', () => {
    expect(expenseRowToApi(baseRow).synced).toBe(true);
  });

  it('passes through an explicit synced: true unchanged', () => {
    expect(expenseRowToApi({ ...baseRow, synced: true }).synced).toBe(true);
  });
});
