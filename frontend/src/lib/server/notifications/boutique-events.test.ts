import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  onSaleCommitted,
  onExpenseCreated,
  onProductAdjusted,
  notifyOverdueReceivables,
} from './boutique-events';

beforeEach(() => {
  vi.clearAllMocks();
  // By default: org owned by owner-1, prefs enabled, create succeeds.
  prismaMock.organization.findUnique.mockResolvedValue({ ownerId: 'owner-1' } as never);
  prismaMock.notificationPreferences.findUnique.mockResolvedValue(null as never);
  prismaMock.notification.create.mockResolvedValue({ id: 'n' } as never);
});

/** Collect the `type` of every notification the code attempted to create. */
function createdTypes(): string[] {
  return prismaMock.notification.create.mock.calls.map(
    (c) => (c[0] as { data: { type: string } }).data.type,
  );
}

describe('onSaleCommitted', () => {
  const sale = { id: 's1', number: 'V-0001', total: 9000 };

  it('notifies SALE_MADE when an employee (not the owner) made the sale', async () => {
    prismaMock.product.findMany.mockResolvedValue([] as never);
    await onSaleCommitted(prismaMock as never, {
      orgId: 'org-1',
      sellerId: 'employee-2',
      sale,
      productIds: [],
    });
    expect(createdTypes()).toContain('SALE_MADE');
  });

  it('does NOT notify SALE_MADE when the owner made the sale themselves', async () => {
    prismaMock.product.findMany.mockResolvedValue([] as never);
    await onSaleCommitted(prismaMock as never, {
      orgId: 'org-1',
      sellerId: 'owner-1',
      sale,
      productIds: [],
    });
    expect(createdTypes()).not.toContain('SALE_MADE');
  });

  it('fires LOW_STOCK only for products at/below their threshold', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Riz', qty: 2, threshold: 5 }, // low
      { id: 'p2', name: 'Huile', qty: 40, threshold: 5 }, // ok
      { id: 'p3', name: 'Sel', qty: 0, threshold: 0 }, // threshold 0 → ignored
    ] as never);

    await onSaleCommitted(prismaMock as never, {
      orgId: 'org-1',
      sellerId: 'owner-1',
      sale,
      productIds: ['p1', 'p2', 'p3'],
    });

    expect(createdTypes()).toEqual(['LOW_STOCK']);
    const arg = prismaMock.notification.create.mock.calls[0]![0] as {
      data: { dedupeKey: string };
    };
    expect(arg.data.dedupeKey).toMatch(/^low-stock:p1:\d{4}-\d{2}-\d{2}$/);
  });

  it('does nothing when the org has no owner', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null as never);
    await onSaleCommitted(prismaMock as never, {
      orgId: 'org-1',
      sellerId: 'employee-2',
      sale,
      productIds: ['p1'],
    });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe('onExpenseCreated', () => {
  it('fires BIG_EXPENSE when amount >= threshold and an employee saved it', async () => {
    prismaMock.boutiqueSettings.findUnique.mockResolvedValue({
      bigExpenseThreshold: 50_000,
      currency: 'XAF',
    } as never);

    await onExpenseCreated(prismaMock as never, {
      orgId: 'org-1',
      creatorId: 'employee-2',
      expense: { id: 'e1', label: 'Loyer', amount: 75_000 },
    });

    expect(createdTypes()).toEqual(['BIG_EXPENSE']);
  });

  it('does NOT fire when the owner saved the expense themselves', async () => {
    await onExpenseCreated(prismaMock as never, {
      orgId: 'org-1',
      creatorId: 'owner-1',
      expense: { id: 'e1', label: 'Loyer', amount: 75_000 },
    });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('does NOT fire when amount is below the threshold', async () => {
    prismaMock.boutiqueSettings.findUnique.mockResolvedValue({
      bigExpenseThreshold: 50_000,
      currency: 'XAF',
    } as never);

    await onExpenseCreated(prismaMock as never, {
      orgId: 'org-1',
      creatorId: 'employee-2',
      expense: { id: 'e1', label: 'Café', amount: 1_000 },
    });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe('onProductAdjusted', () => {
  it('fires LOW_STOCK when the adjusted product is at/below its threshold', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Riz',
      qty: 1,
      threshold: 5,
      organizationId: 'org-1',
    } as never);

    await onProductAdjusted(prismaMock as never, { orgId: 'org-1', productId: 'p1' });

    expect(createdTypes()).toEqual(['LOW_STOCK']);
  });

  it('ignores products from another org', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Riz',
      qty: 1,
      threshold: 5,
      organizationId: 'other-org',
    } as never);

    await onProductAdjusted(prismaMock as never, { orgId: 'org-1', productId: 'p1' });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe('notifyOverdueReceivables', () => {
  const now = new Date('2026-06-24T00:00:00.000Z');

  it('notifies the owner for each overdue receivable and counts them', async () => {
    prismaMock.boutiqueSettings.findMany.mockResolvedValue([
      { organizationId: 'org-1', overdueDays: 30, currency: 'XAF' },
    ] as never);
    prismaMock.receivable.findMany.mockResolvedValue([
      { id: 'r1', amount: 10_000, amountPaid: 2_000, customer: { name: 'Awa' } },
      { id: 'r2', amount: 5_000, amountPaid: 0, customer: { name: 'Bob' } },
    ] as never);

    const res = await notifyOverdueReceivables(prismaMock as never, { now });

    expect(res.notified).toBe(2);
    expect(createdTypes()).toEqual(['RECEIVABLE_OVERDUE', 'RECEIVABLE_OVERDUE']);
    // Cutoff = now - 30 days.
    const whereArg = prismaMock.receivable.findMany.mock.calls[0]![0] as {
      where: { status: { in: string[] }; createdAt: { lt: Date } };
    };
    expect(whereArg.where.status.in).toEqual(['OPEN', 'PARTIAL']);
    expect(whereArg.where.createdAt.lt.getTime()).toBe(now.getTime() - 30 * 86_400_000);
  });

  it('returns zero when no boutique has overdue receivables', async () => {
    prismaMock.boutiqueSettings.findMany.mockResolvedValue([
      { organizationId: 'org-1', overdueDays: 30, currency: 'XAF' },
    ] as never);
    prismaMock.receivable.findMany.mockResolvedValue([] as never);

    const res = await notifyOverdueReceivables(prismaMock as never, { now });
    expect(res.notified).toBe(0);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});
