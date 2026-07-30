// @vitest-environment jsdom
/**
 * discard.ts — companion unit test. Même setup jsdom + fake-indexeddb que
 * `sync-engine.test.ts`. Vérifie que l'abandon d'une ligne `error` retire la
 * ligne d'outbox ET défait l'effet local optimiste, par `kind`.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  type SaleRow,
  type SaleItemRow,
  type ProductRow,
  type ReceivableRow,
  type RepaymentRow,
  type OutboxRow,
} from './db';
import { discardErrorRow } from './discard';

const ORG = 'o1';

function outboxRow(over: Partial<OutboxRow> & { kind: OutboxRow['kind']; opId: string }) {
  return {
    status: 'error' as const,
    endpoint: '/api/sales',
    payload: {},
    error: 'PRODUCT_NOT_FOUND',
    createdAt: '2026-07-30T00:00:00.000Z',
    ...over,
  };
}

function product(id: string, qty: number): ProductRow {
  return {
    id,
    organizationId: ORG,
    name: `P-${id}`,
    ref: `R-${id}`,
    category: 'Divers',
    buyPrice: 100,
    sellPrice: 200,
    prixGros: 0,
    qty,
    threshold: 5,
    updatedAt: '2026-07-30T00:00:00.000Z',
  } as unknown as ProductRow;
}

beforeEach(async () => {
  await Promise.all([
    db.outbox.clear(),
    db.sales.clear(),
    db.saleItems.clear(),
    db.stockMovements.clear(),
    db.products.clear(),
    db.receivables.clear(),
    db.expenses.clear(),
    db.customers.clear(),
    db.repayments.clear(),
  ]);
});

describe('discardErrorRow', () => {
  it('vente : supprime vente/lignes/mouvements/créance et re-crédite le stock', async () => {
    const saleId = 'sale-1';
    await db.products.bulkPut([product('p1', 8), product('p2', 3)]);
    await db.sales.put({
      id: saleId,
      organizationId: ORG,
      number: '#L1',
      method: 'CREDIT',
      total: 500,
      discount: 0,
      cashAmount: 0,
      mobileAmount: 0,
      creditAmount: 500,
      status: 'ACTIVE',
      createdAt: '2026-07-30T00:00:00.000Z',
      synced: false,
      customerId: 'c1',
    } as SaleRow);
    const items: SaleItemRow[] = [
      { id: 'i1', saleId, productId: 'p1', name: 'P-p1', qty: 2, unitPrice: 200, buyPrice: 100 },
      { id: 'i2', saleId, productId: 'p2', name: 'P-p2', qty: 1, unitPrice: 100, buyPrice: 50 },
    ];
    await db.saleItems.bulkPut(items);
    await db.stockMovements.bulkPut([
      {
        id: 'm1',
        organizationId: ORG,
        productId: 'p1',
        type: 'OUT',
        delta: -2,
        reason: 'sale',
        clientOpId: `${saleId}:p1`,
        createdAt: '2026-07-30T00:00:00.000Z',
        synced: false,
      },
    ]);
    // Créance optimiste — convention créance.id === vente.id.
    await db.receivables.put({
      id: saleId,
      organizationId: ORG,
      customerId: 'c1',
      saleId,
      amount: 500,
      amountPaid: 0,
      status: 'OPEN',
      updatedAt: '2026-07-30T00:00:00.000Z',
    } as ReceivableRow);
    const seq = (await db.outbox.add(outboxRow({ kind: 'sale', opId: saleId }))) as number;

    await discardErrorRow({ ...outboxRow({ kind: 'sale', opId: saleId }), seq });

    expect(await db.outbox.get(seq)).toBeUndefined();
    expect(await db.sales.get(saleId)).toBeUndefined();
    expect(await db.saleItems.where('saleId').equals(saleId).count()).toBe(0);
    expect(await db.receivables.get(saleId)).toBeUndefined();
    expect(await db.stockMovements.get('m1')).toBeUndefined();
    // Stock re-crédité : p1 8→10, p2 3→4.
    expect((await db.products.get('p1'))?.qty).toBe(10);
    expect((await db.products.get('p2'))?.qty).toBe(4);
  });

  it('remboursement : supprime la ligne et défait l’allocation (updatedAt DESC)', async () => {
    await db.receivables.bulkPut([
      {
        id: 'r-old',
        organizationId: ORG,
        customerId: 'c1',
        amount: 1000,
        amountPaid: 1000,
        status: 'PAID',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'r-new',
        organizationId: ORG,
        customerId: 'c1',
        amount: 500,
        amountPaid: 200,
        status: 'PARTIAL',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ] as ReceivableRow[]);
    await db.repayments.put({
      id: 'rp1',
      organizationId: ORG,
      customerId: 'c1',
      amount: 600,
      createdAt: '2026-07-30T00:00:00.000Z',
      synced: false,
    } as RepaymentRow);
    const seq = (await db.outbox.add(
      outboxRow({ kind: 'repay', opId: 'rp1', endpoint: '/api/receivables/c1/repay' }),
    )) as number;

    await discardErrorRow({
      ...outboxRow({ kind: 'repay', opId: 'rp1', endpoint: '/api/receivables/c1/repay' }),
      seq,
    });

    expect(await db.repayments.get('rp1')).toBeUndefined();
    // 600 défaits : r-new (le plus récent) 200→0 (OPEN), puis r-old 1000→600 (PARTIAL).
    const rNew = await db.receivables.get('r-new');
    expect(rNew?.amountPaid).toBe(0);
    expect(rNew?.status).toBe('OPEN');
    const rOld = await db.receivables.get('r-old');
    expect(rOld?.amountPaid).toBe(600);
    expect(rOld?.status).toBe('PARTIAL');
    expect(await db.outbox.get(seq)).toBeUndefined();
  });

  it('dépense / client : supprime simplement la ligne locale', async () => {
    await db.expenses.put({
      id: 'e1',
      organizationId: ORG,
      number: '#L1',
      label: 'Transport',
      category: 'Transport',
      amount: 1000,
      occurredAt: '2026-07-30T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      synced: false,
    });
    const seqE = (await db.outbox.add(
      outboxRow({ kind: 'expense', opId: 'e1', endpoint: '/api/expenses' }),
    )) as number;
    await discardErrorRow({
      ...outboxRow({ kind: 'expense', opId: 'e1', endpoint: '/api/expenses' }),
      seq: seqE,
    });
    expect(await db.expenses.get('e1')).toBeUndefined();
    expect(await db.outbox.get(seqE)).toBeUndefined();
  });

  it('ajustement : retire le delta du stock (borné à 0) et supprime le mouvement', async () => {
    await db.products.put(product('p1', 10)); // réappro +8 déjà appliqué localement
    await db.stockMovements.put({
      id: 'm1',
      organizationId: ORG,
      productId: 'p1',
      type: 'IN',
      delta: 8,
      clientOpId: 'op-adj',
      createdAt: '2026-07-30T00:00:00.000Z',
      synced: false,
    });
    const seq = (await db.outbox.add(
      outboxRow({ kind: 'adjust', opId: 'op-adj', endpoint: '/api/products/p1/adjust' }),
    )) as number;

    await discardErrorRow({
      ...outboxRow({ kind: 'adjust', opId: 'op-adj', endpoint: '/api/products/p1/adjust' }),
      seq,
    });

    expect((await db.products.get('p1'))?.qty).toBe(2); // 10 − 8
    expect(await db.stockMovements.get('m1')).toBeUndefined();
    expect(await db.outbox.get(seq)).toBeUndefined();
  });

  it('ne touche à rien si la ligne n’est plus en error (déjà réessayée ailleurs)', async () => {
    await db.expenses.put({
      id: 'e1',
      organizationId: ORG,
      number: '#L1',
      label: 'Transport',
      category: 'Transport',
      amount: 1000,
      occurredAt: '2026-07-30T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      synced: false,
    });
    const seq = (await db.outbox.add({
      ...outboxRow({ kind: 'expense', opId: 'e1', endpoint: '/api/expenses' }),
      status: 'pending',
    })) as number;

    await discardErrorRow({
      ...outboxRow({ kind: 'expense', opId: 'e1', endpoint: '/api/expenses' }),
      seq,
    });

    // Rien n'a bougé : la ligne est repartie en file (pending), on ne la tue pas.
    expect((await db.outbox.get(seq))?.status).toBe('pending');
    expect(await db.expenses.get('e1')).toBeDefined();
  });
});
