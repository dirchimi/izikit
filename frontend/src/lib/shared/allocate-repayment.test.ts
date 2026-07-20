import { describe, it, expect } from 'vitest';
import { allocateRepayment } from './allocate-repayment';

describe('allocateRepayment', () => {
  it('paiement couvrant exactement une créance → PAID, remainingDebt = 0', () => {
    const open = [{ id: 'r1', amount: 1000, amountPaid: 0 }];
    const result = allocateRepayment(open, 1000);
    expect(result.applied).toBe(1000);
    expect(result.remainingDebt).toBe(0);
    expect(result.allocations).toEqual([{ id: 'r1', newAmountPaid: 1000, status: 'PAID' }]);
  });

  it('paiement partiel → PARTIAL, remainingDebt = reliquat', () => {
    const open = [{ id: 'r1', amount: 1000, amountPaid: 0 }];
    const result = allocateRepayment(open, 400);
    expect(result.applied).toBe(400);
    expect(result.remainingDebt).toBe(600);
    expect(result.allocations).toEqual([{ id: 'r1', newAmountPaid: 400, status: 'PARTIAL' }]);
  });

  it('paiement réparti sur plusieurs créances, les plus anciennes d’abord (ordre fourni)', () => {
    const open = [
      { id: 'r1', amount: 6000, amountPaid: 0 }, // la plus ancienne
      { id: 'r2', amount: 4000, amountPaid: 0 },
    ];
    const result = allocateRepayment(open, 7000);
    expect(result.applied).toBe(7000);
    expect(result.remainingDebt).toBe(3000);
    expect(result.allocations).toEqual([
      { id: 'r1', newAmountPaid: 6000, status: 'PAID' },
      { id: 'r2', newAmountPaid: 1000, status: 'PARTIAL' },
    ]);
  });

  it('créance déjà partiellement remboursée : due = amount - amountPaid', () => {
    const open = [
      { id: 'r1', amount: 1000, amountPaid: 0 },
      { id: 'r2', amount: 2000, amountPaid: 500 },
    ];
    const result = allocateRepayment(open, 1300);
    expect(result.applied).toBe(1300);
    expect(result.allocations).toEqual([
      { id: 'r1', newAmountPaid: 1000, status: 'PAID' },
      { id: 'r2', newAmountPaid: 800, status: 'PARTIAL' },
    ]);
    // dû restant : (1000-1000) + (2000-800) = 1200
    expect(result.remainingDebt).toBe(1200);
  });

  it('trop-perçu plafonné : applied = min(payment, Σ dû), remainingDebt = 0', () => {
    const open = [
      { id: 'r1', amount: 2000, amountPaid: 0 },
      { id: 'r2', amount: 3000, amountPaid: 1000 },
    ];
    const result = allocateRepayment(open, 9999);
    expect(result.applied).toBe(4000); // 2000 + (3000-1000)
    expect(result.remainingDebt).toBe(0);
    expect(result.allocations).toEqual([
      { id: 'r1', newAmountPaid: 2000, status: 'PAID' },
      { id: 'r2', newAmountPaid: 3000, status: 'PAID' },
    ]);
  });

  it('paiement nul ou négatif : aucune allocation, applied = 0', () => {
    const open = [{ id: 'r1', amount: 1000, amountPaid: 0 }];
    expect(allocateRepayment(open, 0)).toEqual({
      allocations: [],
      applied: 0,
      remainingDebt: 1000,
    });
    expect(allocateRepayment(open, -50)).toEqual({
      allocations: [],
      applied: 0,
      remainingDebt: 1000,
    });
  });

  it('liste vide : aucune allocation, applied = 0, remainingDebt = 0', () => {
    expect(allocateRepayment([], 500)).toEqual({ allocations: [], applied: 0, remainingDebt: 0 });
  });

  it('ignore les créances déjà soldées présentes dans la liste (due <= 0)', () => {
    const open = [
      { id: 'r1', amount: 1000, amountPaid: 1000 },
      { id: 'r2', amount: 500, amountPaid: 0 },
    ];
    const result = allocateRepayment(open, 300);
    expect(result.applied).toBe(300);
    expect(result.remainingDebt).toBe(200);
    expect(result.allocations).toEqual([{ id: 'r2', newAmountPaid: 300, status: 'PARTIAL' }]);
  });

  it('montants entiers : pas de dérive flottante avec un payment décimal', () => {
    const open = [{ id: 'r1', amount: 1000, amountPaid: 0 }];
    const result = allocateRepayment(open, 400.9);
    expect(result.applied).toBe(400);
    expect(Number.isInteger(result.applied)).toBe(true);
    expect(Number.isInteger(result.allocations[0]?.newAmountPaid)).toBe(true);
  });
});
