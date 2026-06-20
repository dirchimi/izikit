import { describe, it, expect } from 'vitest';
import { deriveStockStatus, generateRef } from './helpers';

describe('deriveStockStatus', () => {
  it('out quand qty <= 0', () => {
    expect(deriveStockStatus(0, 5)).toBe('out');
    expect(deriveStockStatus(-2, 5)).toBe('out');
  });
  it('low quand qty <= seuil', () => {
    expect(deriveStockStatus(3, 5)).toBe('low');
    expect(deriveStockStatus(5, 5)).toBe('low');
  });
  it('ok au-dessus du seuil', () => {
    expect(deriveStockStatus(10, 5)).toBe('ok');
  });
});

describe('generateRef', () => {
  it('préfixe P- et longueur stable', () => {
    expect(generateRef()).toMatch(/^P-[A-Z0-9]{5}$/);
  });
});
