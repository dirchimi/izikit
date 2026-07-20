import { describe, it, expect } from 'vitest';
import { deriveStatus, uiStatus } from './helpers';

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

// `allocateRepayment` (oldest-first) a été extraite vers
// `@/lib/shared/allocate-repayment.test.ts` (Task 5.6) — voir ce fichier pour
// sa couverture de tests.
