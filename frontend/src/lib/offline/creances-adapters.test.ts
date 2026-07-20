/**
 * creances-adapters.ts — companion unit test (Task 5.2).
 *
 * Pure functions, no render harness needed (this repo ships none — the vitest
 * include glob is `.test.ts` only). Mirrors `expense-adapters.test.ts`'s shape:
 * plain in-memory rows in, UI-shape out. Focus is the money aggregation
 * (`aggregateDebtors`): outstanding totals, only OPEN/PARTIAL counted, names
 * joined, repayment history included.
 */
import { describe, it, expect } from 'vitest';
import type { CustomerRow, ReceivableRow, RepaymentRow } from './db';
import {
  aggregateDebtors,
  aggregateRepayments,
  repaymentWindow,
  customRepaymentWindow,
} from './creances-adapters';

const ORG = 'org-1';

function customer(over: Partial<CustomerRow> & { id: string; name: string }): CustomerRow {
  return {
    organizationId: ORG,
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
function receivable(
  over: Partial<ReceivableRow> & { id: string; customerId: string },
): ReceivableRow {
  return {
    organizationId: ORG,
    amount: 1000,
    amountPaid: 0,
    status: 'OPEN',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
function repayment(over: Partial<RepaymentRow> & { id: string; customerId: string }): RepaymentRow {
  return {
    organizationId: ORG,
    amount: 500,
    createdAt: '2026-07-10T00:00:00.000Z',
    synced: false,
    ...over,
  };
}

describe('aggregateDebtors', () => {
  it('computes outstanding totals per debtor (debt/repaid/totalCredit)', () => {
    const debtors = aggregateDebtors(
      [customer({ id: 'c1', name: 'Awa', phone: '221700000000' })],
      [
        receivable({
          id: 'r1',
          customerId: 'c1',
          amount: 1000,
          amountPaid: 400,
          status: 'PARTIAL',
        }),
        receivable({ id: 'r2', customerId: 'c1', amount: 500, amountPaid: 0, status: 'OPEN' }),
      ],
      [],
    );

    expect(debtors).toHaveLength(1);
    const d = debtors[0]!;
    expect(d.name).toBe('Awa');
    expect(d.phone).toBe('221700000000');
    expect(d.totalCredit).toBe(1500); // 1000 + 500
    expect(d.repaid).toBe(400); // 400 + 0
    expect(d.debt).toBe(1100); // (1000-400) + (500-0)
    expect(d.history).toHaveLength(2);
  });

  it('excludes CANCELLED receivables from totals and history', () => {
    const debtors = aggregateDebtors(
      [customer({ id: 'c1', name: 'Awa' })],
      [
        receivable({ id: 'r1', customerId: 'c1', amount: 1000, status: 'OPEN' }),
        receivable({ id: 'rc', customerId: 'c1', amount: 9999, status: 'CANCELLED' }),
      ],
      [],
    );

    const d = debtors[0]!;
    expect(d.debt).toBe(1000); // cancelled 9999 ignored
    expect(d.totalCredit).toBe(1000);
    expect(d.history).toHaveLength(1);
    expect(d.history[0]?.id).toBe('r1');
  });

  it('maps status to the UI credit-status key', () => {
    const debtors = aggregateDebtors(
      [customer({ id: 'c1', name: 'Awa' })],
      [
        receivable({
          id: 'r1',
          customerId: 'c1',
          status: 'OPEN',
          updatedAt: '2026-07-01T00:00:00.000Z',
        }),
        receivable({
          id: 'r2',
          customerId: 'c1',
          status: 'PARTIAL',
          amountPaid: 200,
          updatedAt: '2026-07-02T00:00:00.000Z',
        }),
        receivable({
          id: 'r3',
          customerId: 'c1',
          status: 'PAID',
          amountPaid: 1000,
          updatedAt: '2026-07-03T00:00:00.000Z',
        }),
      ],
      [],
    );

    const byId = Object.fromEntries(debtors[0]!.history.map((h) => [h.id, h.status]));
    expect(byId.r1).toBe('credit');
    expect(byId.r2).toBe('partial');
    expect(byId.r3).toBe('paid');
  });

  it('only lists customers that have at least one receivable', () => {
    const debtors = aggregateDebtors(
      [customer({ id: 'c1', name: 'Has debt' }), customer({ id: 'c2', name: 'No receivable' })],
      [receivable({ id: 'r1', customerId: 'c1' })],
      [repayment({ id: 'p1', customerId: 'c2' })], // repayment but no receivable → excluded
    );

    expect(debtors.map((d) => d.id)).toEqual(['c1']);
  });

  it('joins repayments (newest-first) into the debtor history', () => {
    const debtors = aggregateDebtors(
      [customer({ id: 'c1', name: 'Awa' })],
      [
        receivable({
          id: 'r1',
          customerId: 'c1',
          amount: 1000,
          amountPaid: 800,
          status: 'PARTIAL',
        }),
      ],
      [
        repayment({
          id: 'p1',
          customerId: 'c1',
          amount: 300,
          method: 'cash',
          createdAt: '2026-07-05T00:00:00.000Z',
        }),
        repayment({
          id: 'p2',
          customerId: 'c1',
          amount: 500,
          method: 'mobile',
          createdAt: '2026-07-12T00:00:00.000Z',
        }),
      ],
    );

    const reps = debtors[0]!.repayments;
    expect(reps.map((r) => r.id)).toEqual(['p2', 'p1']); // newest first
    expect(reps[0]).toMatchObject({ amount: 500, method: 'mobile', note: '' });
  });

  it('history is newest-first and debtors are most-indebted first', () => {
    const debtors = aggregateDebtors(
      [customer({ id: 'c1', name: 'Small' }), customer({ id: 'c2', name: 'Big' })],
      [
        receivable({ id: 'r1', customerId: 'c1', amount: 100 }),
        receivable({
          id: 'r2a',
          customerId: 'c2',
          amount: 500,
          updatedAt: '2026-07-01T00:00:00.000Z',
        }),
        receivable({
          id: 'r2b',
          customerId: 'c2',
          amount: 500,
          updatedAt: '2026-07-08T00:00:00.000Z',
        }),
      ],
      [],
    );

    expect(debtors.map((d) => d.id)).toEqual(['c2', 'c1']); // 1000 debt before 100
    // newest receivable first within a debtor's history
    expect(debtors[0]!.history.map((h) => h.id)).toEqual(['r2b', 'r2a']);
  });
});

describe('aggregateRepayments', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  it('filters to the window, joins names, sums cash/mobile, newest-first', () => {
    const win = repaymentWindow('year', now);
    const data = aggregateRepayments(
      [
        repayment({
          id: 'p1',
          customerId: 'c1',
          amount: 300,
          method: 'cash',
          createdAt: '2026-07-05T00:00:00.000Z',
        }),
        repayment({
          id: 'p2',
          customerId: 'c2',
          amount: 700,
          method: 'mobile',
          createdAt: '2026-07-12T00:00:00.000Z',
        }),
        repayment({
          id: 'pOld',
          customerId: 'c1',
          amount: 999,
          method: 'cash',
          createdAt: '2020-01-01T00:00:00.000Z',
        }),
      ],
      [customer({ id: 'c1', name: 'Awa' }), customer({ id: 'c2', name: 'Moussa' })],
      win,
    );

    expect(data.count).toBe(2); // pOld (2020) is outside the 2026 window
    expect(data.cash).toBe(300);
    expect(data.mobile).toBe(700);
    expect(data.total).toBe(1000);
    expect(data.repayments.map((r) => r.id)).toEqual(['p2', 'p1']); // desc
    expect(data.repayments[0]?.customerName).toBe('Moussa');
  });

  it('defaults an unknown customer name to a dash', () => {
    const win = repaymentWindow('year', now);
    const data = aggregateRepayments(
      [repayment({ id: 'p1', customerId: 'ghost', createdAt: '2026-07-05T00:00:00.000Z' })],
      [],
      win,
    );
    expect(data.repayments[0]?.customerName).toBe('—');
  });
});

describe('repaymentWindow / customRepaymentWindow', () => {
  it('today window is a single day [start, start+1)', () => {
    const now = new Date(2026, 6, 15, 10, 0, 0);
    const w = repaymentWindow('today', now);
    expect(new Date(w.from).getDate()).toBe(15);
    expect(new Date(w.to).getDate()).toBe(16);
  });

  it('custom window spans both inclusive days', () => {
    const w = customRepaymentWindow('2026-07-01', '2026-07-03');
    expect(w).not.toBeNull();
    expect(new Date(w!.from).getDate()).toBe(1);
    expect(new Date(w!.to).getDate()).toBe(4); // exclusive day-after
  });

  it('returns null for an inverted or malformed custom range', () => {
    expect(customRepaymentWindow('2026-07-05', '2026-07-01')).toBeNull();
    expect(customRepaymentWindow('nope', '2026-07-01')).toBeNull();
  });
});
