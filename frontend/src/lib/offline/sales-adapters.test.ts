// @vitest-environment node
/**
 * sales-adapters.ts / documents-adapters.ts — companion unit tests (Task 5.5).
 * Pure functions, no Dexie / no render harness needed.
 */
import { describe, it, expect } from 'vitest';
import { aggregateSales } from './sales-adapters';
import { documentRowToApi } from './documents-adapters';
import type { SaleRow, SaleItemRow, CustomerRow, DocumentRow } from './db';

function sale(overrides: Partial<SaleRow> & { id: string }): SaleRow {
  return {
    organizationId: 'org-1',
    number: '#L1',
    method: 'CASH',
    total: 1000,
    discount: 0,
    cashAmount: 1000,
    mobileAmount: 0,
    creditAmount: 0,
    status: 'ACTIVE',
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('aggregateSales', () => {
  it('joins items + customer, returns newest-first, maps sellerId from createdById (sellerName null)', async () => {
    const sales: SaleRow[] = [
      sale({ id: 's1', createdAt: '2026-07-20T08:00:00.000Z', createdById: 'u1' }),
      sale({
        id: 's2',
        createdAt: '2026-07-20T10:00:00.000Z',
        customerId: 'c1',
        method: 'CREDIT',
        creditAmount: 1000,
        cashAmount: 0,
      }),
    ];
    const items: SaleItemRow[] = [
      {
        id: 'i1',
        saleId: 's1',
        productId: 'p1',
        name: 'Riz',
        qty: 2,
        unitPrice: 500,
        buyPrice: 300,
      },
      {
        id: 'i2',
        saleId: 's2',
        productId: 'p2',
        name: 'Huile',
        qty: 1,
        unitPrice: 1000,
        buyPrice: 700,
      },
    ];
    const customers: CustomerRow[] = [
      { id: 'c1', organizationId: 'org-1', name: 'Awa', phone: '221700000000', updatedAt: 'x' },
    ];

    const out = aggregateSales(sales, items, customers);

    // newest-first (s2 before s1)
    expect(out.map((s) => s.id)).toEqual(['s2', 's1']);

    const s2 = out[0]!;
    expect(s2.customerName).toBe('Awa');
    expect(s2.customerPhone).toBe('221700000000');
    expect(s2.items).toEqual([{ name: 'Huile', qty: 1, unitPrice: 1000 }]);
    expect(s2.sellerId).toBeNull();
    expect(s2.sellerName).toBeNull();

    const s1 = out[1]!;
    expect(s1.sellerId).toBe('u1'); // createdById
    expect(s1.customerName).toBeNull();
    expect(s1.items).toEqual([{ name: 'Riz', qty: 2, unitPrice: 500 }]);
  });

  it('a sale with no items yields an empty items array (no crash)', async () => {
    const out = aggregateSales([sale({ id: 's1' })], [], []);
    expect(out[0]?.items).toEqual([]);
  });

  it("résout sellerName via l'annuaire memberNames (userId → nom), null si inconnu", () => {
    const out = aggregateSales(
      [
        sale({ id: 's1', createdById: 'u1', createdAt: '2026-07-20T10:00:00.000Z' }),
        sale({ id: 's2', createdById: 'u-parti', createdAt: '2026-07-20T08:00:00.000Z' }),
      ],
      [],
      [],
      { u1: 'Faris' },
    );
    expect(out[0]?.sellerName).toBe('Faris');
    // Membre supprimé depuis / annuaire incomplet → null (l'UI retombe sur l'id).
    expect(out[1]?.sellerName).toBeNull();
    expect(out[1]?.sellerId).toBe('u-parti');
  });

  it('maps synced: false through unchanged (row still queued for the outbox)', () => {
    const out = aggregateSales([sale({ id: 's1', synced: false })], [], []);
    expect(out[0]?.synced).toBe(false);
  });

  it('maps an absent synced (a row pulled fresh from the server) to true', () => {
    const out = aggregateSales([sale({ id: 's1' })], [], []);
    expect(out[0]?.synced).toBe(true);
  });

  it('passes through an explicit synced: true unchanged', () => {
    const out = aggregateSales([sale({ id: 's1', synced: true })], [], []);
    expect(out[0]?.synced).toBe(true);
  });
});

describe('documentRowToApi', () => {
  it('lowercases status and normalises absent optionals to "" / null', async () => {
    const row: DocumentRow = {
      id: 'd1',
      organizationId: 'org-1',
      type: 'FACTURE',
      number: 'F-0001',
      saleId: 's1',
      clientName: 'Awa',
      status: 'CREDIT',
      total: 1000,
      lines: [{ article: 'Riz', qty: 2, unitPrice: 500 }],
      issuedAt: '2026-07-20T00:00:00.000Z',
      createdAt: '2026-07-20T00:00:00.000Z',
    };

    const api = documentRowToApi(row);
    expect(api.status).toBe('credit');
    expect(api.clientPhone).toBe(''); // absent → ''
    expect(api.note).toBe('');
    expect(api.balanceAfter).toBeNull();
    expect(api.validityDays).toBeNull();
    expect(api.saleId).toBe('s1');
    expect(api.lines).toEqual([{ article: 'Riz', qty: 2, unitPrice: 500 }]);
  });
});
