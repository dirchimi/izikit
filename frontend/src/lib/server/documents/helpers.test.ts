import { describe, it, expect } from 'vitest';
import { coerceLines, linesTotal, docNumber, saleMethodToStatus, uiDocStatus } from './helpers';

describe('coerceLines', () => {
  it('accepte un instantané valide', () => {
    const lines = coerceLines([{ article: 'Riz', qty: 2, unitPrice: 6000 }]);
    expect(lines).toEqual([{ article: 'Riz', qty: 2, unitPrice: 6000 }]);
  });
  it('renvoie [] sur une forme cassée', () => {
    expect(coerceLines(null)).toEqual([]);
    expect(coerceLines([{ article: '', qty: 0, unitPrice: -1 }])).toEqual([]);
    expect(coerceLines('nope')).toEqual([]);
  });
});

describe('linesTotal', () => {
  it('somme qté × prix unitaire', () => {
    expect(
      linesTotal([
        { article: 'a', qty: 2, unitPrice: 6000 },
        { article: 'b', qty: 3, unitPrice: 500 },
      ]),
    ).toBe(13500);
  });
});

describe('docNumber', () => {
  it('préfixe F pour les factures, PRO pour les proformas, 4 chiffres', () => {
    expect(docNumber('FACTURE', 0)).toBe('F-0001');
    expect(docNumber('FACTURE', 123)).toBe('F-0124');
    expect(docNumber('PROFORMA', 30)).toBe('PRO-0031');
  });
});

describe('saleMethodToStatus', () => {
  it('CREDIT → CREDIT, sinon PAID', () => {
    expect(saleMethodToStatus('CASH')).toBe('PAID');
    expect(saleMethodToStatus('MOBILE')).toBe('PAID');
    expect(saleMethodToStatus('CREDIT')).toBe('CREDIT');
  });
});

describe('uiDocStatus', () => {
  it('mappe vers les clés du frontend', () => {
    expect(uiDocStatus('PAID')).toBe('paid');
    expect(uiDocStatus('CREDIT')).toBe('credit');
    expect(uiDocStatus('PENDING')).toBe('pending');
  });
});
