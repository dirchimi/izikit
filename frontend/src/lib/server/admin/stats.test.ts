import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { computeAdminStats } from './stats';

const now = new Date('2026-06-24T12:00:00.000Z');

// Prisma's `groupBy` is heavily overloaded, which hides `.mockResolvedValue`
// from the deep-mock type. Cast through a plain Mock to set its resolution.
const asMock = (fn: unknown) => fn as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.count.mockResolvedValue(0 as never);
  asMock(prismaMock.user.groupBy).mockResolvedValue([]);
  prismaMock.organization.count.mockResolvedValue(0 as never);
  prismaMock.order.count.mockResolvedValue(0 as never);
  asMock(prismaMock.order.groupBy).mockResolvedValue([]);
  asMock(prismaMock.withdrawal.groupBy).mockResolvedValue([]);
  prismaMock.sale.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 } as never);
  prismaMock.receivable.aggregate.mockResolvedValue({
    _sum: { amount: null, amountPaid: null },
    _count: 0,
  } as never);
  prismaMock.product.count.mockResolvedValue(0 as never);
  prismaMock.outboxEvent.count.mockResolvedValue(0 as never);
  prismaMock.emailJob.count.mockResolvedValue(0 as never);
  // findMany is called twice (signups, then recent users) — default both to empty.
  prismaMock.user.findMany.mockResolvedValue([] as never);
  prismaMock.adminAction.findMany.mockResolvedValue([] as never);
});

describe('computeAdminStats', () => {
  it('aggregates role groups into byRole + admins total', async () => {
    asMock(prismaMock.user.groupBy).mockResolvedValue([
      { role: 'USER', _count: 40 },
      { role: 'ADMIN', _count: 3 },
      { role: 'SUPERADMIN', _count: 1 },
    ]);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.users.byRole).toEqual({ USER: 40, ADMIN: 3, SUPERADMIN: 1 });
    expect(s.users.admins).toBe(4);
  });

  it('derives order paid/pending/failed counts + paid revenue from groupBy', async () => {
    prismaMock.order.count.mockResolvedValue(10 as never);
    asMock(prismaMock.order.groupBy).mockResolvedValue([
      { status: 'PAID', _count: 6, _sum: { amount: 600000 } },
      { status: 'PENDING', _count: 3, _sum: { amount: 300000 } },
      { status: 'FAILED', _count: 1, _sum: { amount: 100000 } },
    ]);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.orders).toMatchObject({
      total: 10,
      paid: 6,
      pending: 3,
      failed: 1,
      revenuePaid: 600000,
    });
  });

  it('derives pending withdrawals count + amount and paid-out total', async () => {
    asMock(prismaMock.withdrawal.groupBy).mockResolvedValue([
      { status: 'PENDING', _count: 2, _sum: { amount: 150000 } },
      { status: 'COMPLETED', _count: 5, _sum: { amount: 500000 } },
    ]);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.withdrawals).toMatchObject({
      pending: 2,
      pendingAmount: 150000,
      completed: 5,
      paidOut: 500000,
    });
  });

  it('computes open receivables as amount - amountPaid', async () => {
    prismaMock.receivable.aggregate.mockResolvedValue({
      _sum: { amount: 100000, amountPaid: 30000 },
      _count: 4,
    } as never);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.receivables).toEqual({ openAmount: 70000, openCount: 4 });
  });

  it('buckets signups into 14 ordered daily buckets (oldest first)', async () => {
    // 1st findMany = signups query; 2nd = recent users.
    prismaMock.user.findMany
      .mockResolvedValueOnce([
        { createdAt: now }, // today
        { createdAt: now },
        { createdAt: new Date(now.getTime() - 86_400_000) }, // yesterday
      ] as never)
      .mockResolvedValueOnce([] as never);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.signups).toHaveLength(14);
    expect(s.signups[13]).toEqual({ date: '2026-06-24', count: 2 }); // last = today
    expect(s.signups[12]).toEqual({ date: '2026-06-23', count: 1 }); // yesterday
    expect(s.signups[0]!.count).toBe(0); // oldest day, empty
  });

  it('serializes recent users + actions dates to ISO strings', async () => {
    prismaMock.user.findMany
      .mockResolvedValueOnce([] as never) // signups
      .mockResolvedValueOnce([
        {
          id: 'u1',
          email: 'a@b.c',
          name: null,
          role: 'USER',
          status: 'ACTIVE',
          emailVerifiedAt: null,
          createdAt: now,
        },
      ] as never);
    prismaMock.adminAction.findMany.mockResolvedValue([
      {
        id: 'a1',
        actorId: 'admin1',
        action: 'user.role_change',
        targetType: 'User',
        createdAt: now,
      },
    ] as never);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.recentUsers[0]).toMatchObject({ id: 'u1', createdAt: now.toISOString() });
    expect(s.recentActions[0]).toMatchObject({
      action: 'user.role_change',
      createdAt: now.toISOString(),
    });
  });
});
