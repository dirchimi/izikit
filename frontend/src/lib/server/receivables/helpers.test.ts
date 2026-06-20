import { describe, it, expect } from 'vitest';
import { deriveStatus, uiStatus, allocateRepayment } from './helpers';

describe('deriveStatus', () => {
  it('OPEN quand rien remboursé', () => {
    expect(deriveStatus(1000, 0)).toBe('OPEN');
  });
  it('PARTIAL quand partiellement remboursé', () => {
    expect(deriveStatus(1000, 400)).toBe('PARTIAL');
  });
  it('PAID quand soldé (ou trop-perçu)', () => {
    expect(deriveStatus(1000, 1000)).toBe('PAID');
    expect(deriveStatus(1000, 1200)).toBe('PAID');
  });
});

describe('uiStatus', () => {
  it('mappe vers les clés du frontend', () => {
    expect(uiStatus('OPEN')).toBe('credit');
    expect(uiStatus('PARTIAL')).toBe('partial');
    expect(uiStatus('PAID')).toBe('paid');
  });
});

describe('allocateRepayment', () => {
  const open = [
    { id: 'r1', amount: 1000, amountPaid: 0 },
    { id: 'r2', amount: 2000, amountPaid: 500 },
  ];

  it('solde la plus ancienne puis entame la suivante', () => {
    const { allocations, applied } = allocateRepayment(open, 1300);
    expect(applied).toBe(1300);
    expect(allocations).toEqual([
      { id: 'r1', newPaid: 1000, status: 'PAID' },
      { id: 'r2', newPaid: 800, status: 'PARTIAL' },
    ]);
  });

  it('ne dépasse jamais le dû total (trop-perçu plafonné)', () => {
    // dû total = 1000 + 1500 = 2500
    const { allocations, applied } = allocateRepayment(open, 9999);
    expect(applied).toBe(2500);
    expect(allocations).toEqual([
      { id: 'r1', newPaid: 1000, status: 'PAID' },
      { id: 'r2', newPaid: 2000, status: 'PAID' },
    ]);
  });

  it('paiement partiel reste sur la première créance', () => {
    const { allocations, applied } = allocateRepayment(open, 600);
    expect(applied).toBe(600);
    expect(allocations).toEqual([{ id: 'r1', newPaid: 600, status: 'PARTIAL' }]);
  });

  it('ignore les créances déjà soldées', () => {
    const paid = [
      { id: 'r1', amount: 1000, amountPaid: 1000 },
      { id: 'r2', amount: 500, amountPaid: 0 },
    ];
    const { allocations, applied } = allocateRepayment(paid, 300);
    expect(applied).toBe(300);
    expect(allocations).toEqual([{ id: 'r2', newPaid: 300, status: 'PARTIAL' }]);
  });

  it('paiement nul ou négatif ne fait rien', () => {
    expect(allocateRepayment(open, 0)).toEqual({ allocations: [], applied: 0 });
    expect(allocateRepayment(open, -50)).toEqual({ allocations: [], applied: 0 });
  });
});
