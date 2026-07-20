/**
 * pos-adapters.ts — companion unit test (Task 3.3).
 *
 * Pure functions, no render harness needed (this repo ships none — the vitest
 * include glob is `.test.ts` only). Covers the two adapters `VendrePos` relies
 * on: the `ProductRow → PosProduct` reshape (status derivation + optional→null
 * normalisation) and the online-vs-offline receipt-number resolution.
 */
import { describe, it, expect } from 'vitest';
import { type ProductRow, type SaleRow } from './db';
import { deriveStockStatus, productRowToPos, resolveReceiptNumbers } from './pos-adapters';

const baseRow: ProductRow = {
  id: 'p1',
  organizationId: 'o1',
  ref: 'RIZ-1',
  name: 'Riz',
  category: 'Alimentation',
  buyPrice: 400,
  sellPrice: 500,
  prixGros: 450,
  unite: 'sac',
  qty: 5,
  threshold: 2,
  updatedAt: '2026-07-20T00:00:00Z',
};

describe('deriveStockStatus', () => {
  it("returns 'out' when qty is 0 or negative", () => {
    expect(deriveStockStatus(0, 2)).toBe('out');
    expect(deriveStockStatus(-1, 2)).toBe('out');
  });

  it("returns 'low' when qty is at or below the threshold (but > 0)", () => {
    expect(deriveStockStatus(2, 2)).toBe('low');
    expect(deriveStockStatus(1, 2)).toBe('low');
  });

  it("returns 'ok' when qty is above the threshold", () => {
    expect(deriveStockStatus(3, 2)).toBe('ok');
  });

  it("treats a zero threshold as 'ok' for any positive stock", () => {
    expect(deriveStockStatus(1, 0)).toBe('ok');
  });
});

describe('productRowToPos', () => {
  it('maps every column and derives the stock status', () => {
    expect(productRowToPos(baseRow)).toEqual({
      id: 'p1',
      ref: 'RIZ-1',
      name: 'Riz',
      category: 'Alimentation',
      buyPrice: 400,
      sellPrice: 500,
      prixGros: 450,
      unite: 'sac',
      qty: 5,
      threshold: 2,
      status: 'ok',
      imageUrl: null,
      barcode: null,
      expiryDate: null,
    });
  });

  it('normalises absent optional columns to null', () => {
    const pos = productRowToPos(baseRow);
    expect(pos.imageUrl).toBeNull();
    expect(pos.barcode).toBeNull();
    expect(pos.expiryDate).toBeNull();
  });

  it('passes present optional columns through unchanged', () => {
    const pos = productRowToPos({
      ...baseRow,
      imageUrl: 'https://cdn/x.jpg',
      barcode: '123456',
      expiryDate: '2026-08-01T12:00:00.000Z',
    });
    expect(pos.imageUrl).toBe('https://cdn/x.jpg');
    expect(pos.barcode).toBe('123456');
    expect(pos.expiryDate).toBe('2026-08-01T12:00:00.000Z');
  });

  it("derives 'out'/'low' from qty vs threshold", () => {
    expect(productRowToPos({ ...baseRow, qty: 0 }).status).toBe('out');
    expect(productRowToPos({ ...baseRow, qty: 2 }).status).toBe('low');
  });
});

describe('resolveReceiptNumbers', () => {
  const local = { number: '#L7', publicToken: null };

  it('uses the provisional local values when there is no synced row (offline)', () => {
    expect(resolveReceiptNumbers(local, undefined)).toEqual({
      number: '#L7',
      publicToken: null,
    });
  });

  it('prefers the server-assigned number from a re-read synced row', () => {
    const synced: Pick<SaleRow, 'number' | 'publicToken'> = {
      number: 'V-0042',
      publicToken: 'tok_abc',
    };
    expect(resolveReceiptNumbers(local, synced)).toEqual({
      number: 'V-0042',
      publicToken: 'tok_abc',
    });
  });

  it('falls back to a null token when the synced row has no publicToken yet', () => {
    // Before Task 3.4 the drain patches `number` but not `publicToken`.
    const synced: Pick<SaleRow, 'number' | 'publicToken'> = { number: 'V-0042' };
    expect(resolveReceiptNumbers(local, synced)).toEqual({
      number: 'V-0042',
      publicToken: null,
    });
  });
});
