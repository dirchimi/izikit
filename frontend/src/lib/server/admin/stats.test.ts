import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { computeAdminStats, redactAdminStats, type AdminStats } from './stats';

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
  asMock(prismaMock.sale.groupBy).mockResolvedValue([]); // usage boutiques (7j / 30j)
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
  // Abonnements (statuts dérivés + MRR + file d'attente + expirations).
  asMock(prismaMock.organization.groupBy).mockResolvedValue([]);
  prismaMock.organization.findMany.mockResolvedValue([] as never);
  prismaMock.subscriptionPayment.aggregate.mockResolvedValue({
    _count: 0,
    _sum: { amount: null },
  } as never);
  prismaMock.subscriptionPayment.findMany.mockResolvedValue([] as never);
  // Phase B — classements par boutique / ville (top CA, top encaissé, villes).
  asMock(prismaMock.subscriptionPayment.groupBy).mockResolvedValue([]);
  prismaMock.boutiqueSettings.findMany.mockResolvedValue([] as never);
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

  it('derives subscription metrics: active/trial/expired, MRR, pending queue, expiring soon', async () => {
    prismaMock.organization.count
      .mockResolvedValueOnce(5 as never) // boutiquesTotal
      .mockResolvedValueOnce(2 as never) // accès actif (payant OU offert)
      .mockResolvedValueOnce(1 as never) // payantes (≥1 paiement CONFIRMED)
      .mockResolvedValueOnce(1 as never); // trial
    asMock(prismaMock.organization.groupBy).mockResolvedValue([{ plan: 'PREMIUM', _count: 1 }]);
    prismaMock.subscriptionPayment.aggregate.mockResolvedValue({
      _count: 3,
      _sum: { amount: 45000 },
    } as never);
    // 3 findMany successifs (ordre de construction du Promise.all) :
    // (1) paiements confirmés des boutiques actives (revenu mensuel réel),
    // (2) file des paiements PENDING, (3) encaissé par mois.
    prismaMock.subscriptionPayment.findMany
      .mockResolvedValueOnce([
        // Dernier paiement de o1 : 600000 pour 12 mois → 50000/mois réels.
        { organizationId: 'o1', amount: 600000, months: 12 },
        // Paiement plus ancien de la même boutique : ignoré (on garde le dernier).
        { organizationId: 'o1', amount: 50000, months: 1 },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'sp1',
          plan: 'PREMIUM',
          amount: 30000,
          method: 'CASH',
          months: 1,
          createdAt: now,
          organization: { name: 'Chez Ali' },
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.organization.findMany.mockResolvedValue([
      {
        id: 'o1',
        name: 'Boutique Amir',
        plan: 'PREMIUM',
        trialEndsAt: null,
        currentPeriodEnd: new Date(now.getTime() + 3 * 86_400_000),
      },
    ] as never);

    const s = await computeAdminStats(prismaMock as never, now);

    // `active` = payantes uniquement ; l'accès offert (grant-access sans
    // paiement) est compté à part dans `offered` et n'entre pas dans le MRR.
    expect(s.subscriptions.active).toBe(1);
    expect(s.subscriptions.offered).toBe(1); // 2 accès actifs − 1 payante
    expect(s.subscriptions.trial).toBe(1);
    expect(s.subscriptions.expired).toBe(2); // 5 − 2 (accès actif) − 1 (essai)
    // Revenu mensuel RÉEL : dernier paiement de o1 = 600000/12 mois = 50000/mois
    // (le paiement plus ancien de la même boutique ne compte pas).
    expect(s.subscriptions.mrr).toBe(50000);
    expect(s.subscriptions.pendingCount).toBe(3);
    expect(s.subscriptions.pendingAmount).toBe(45000);
    expect(s.subscriptions.pending[0]).toMatchObject({
      org: 'Chez Ali',
      plan: 'PREMIUM',
      amount: 30000,
    });
    expect(s.subscriptions.expiringSoon).toHaveLength(1);
    expect(s.subscriptions.expiringSoon[0]).toMatchObject({
      name: 'Boutique Amir',
      status: 'ACTIVE',
    });
    expect(s.subscriptions.expiringSoon[0]!.daysLeft).toBe(3);
  });

  it('derives boutique usage: activeWeek (7j) + dormant (total − active 30j)', async () => {
    prismaMock.organization.count.mockResolvedValue(10 as never); // boutiquesTotal
    // 1er groupBy = ventes 7j (2 boutiques), 2e = ventes 30j (6 boutiques).
    asMock(prismaMock.sale.groupBy)
      .mockResolvedValueOnce([{ organizationId: 'a' }, { organizationId: 'b' }])
      .mockResolvedValueOnce([
        { organizationId: 'a' },
        { organizationId: 'b' },
        { organizationId: 'c' },
        { organizationId: 'd' },
        { organizationId: 'e' },
        { organizationId: 'f' },
      ]);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.boutiques.total).toBe(10);
    expect(s.boutiques.activeWeek).toBe(2);
    expect(s.boutiques.dormant).toBe(4); // 10 − 6 actives sur 30j
  });

  it('derives Phase B leaderboards: plan split, top boutiques (CA + encaissé), top cities', async () => {
    // Plans actifs → nombre d'abonnés Premium (réutilise le groupBy du MRR).
    asMock(prismaMock.organization.groupBy).mockResolvedValue([{ plan: 'PREMIUM', _count: 5 }]);
    // sale.groupBy est appelé 3 fois, dans l'ordre : 7j, 30j, puis CA/boutique.
    asMock(prismaMock.sale.groupBy)
      .mockResolvedValueOnce([]) // activeWeek (7j)
      .mockResolvedValueOnce([]) // active30 (30j)
      .mockResolvedValueOnce([
        { organizationId: 'o1', _sum: { total: 100000 } },
        { organizationId: 'o2', _sum: { total: 40000 } },
      ]);
    asMock(prismaMock.subscriptionPayment.groupBy).mockResolvedValue([
      { organizationId: 'o1', _sum: { amount: 30000 } },
    ]);
    prismaMock.boutiqueSettings.findMany.mockResolvedValue([
      { organizationId: 'o1', city: "N'Djamena" },
      { organizationId: 'o2', city: 'Moundou' },
    ] as never);
    // Résolution des noms (2e appel org.findMany) + expiringRows (1er, ignoré).
    prismaMock.organization.findMany.mockResolvedValue([
      { id: 'o1', name: 'Chez Ali' },
      { id: 'o2', name: 'Boutique Amir' },
    ] as never);

    const s = await computeAdminStats(prismaMock as never, now);

    expect(s.planSplit).toEqual({ premium: 5 });
    expect(s.topBoutiques.byRevenue).toEqual([
      { id: 'o1', name: 'Chez Ali', value: 100000 },
      { id: 'o2', name: 'Boutique Amir', value: 40000 },
    ]);
    expect(s.topBoutiques.byCollected).toEqual([{ id: 'o1', name: 'Chez Ali', value: 30000 }]);
    expect(s.topCities).toEqual([
      { city: "N'Djamena", revenue: 100000, boutiques: 1 },
      { city: 'Moundou', revenue: 40000, boutiques: 1 },
    ]);
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

describe('redactAdminStats — confidentialité clients pour le rôle ADMIN', () => {
  it("expurge les CHIFFRES clients, garde les signaux et l'argent Sahilley", () => {
    const base = {
      sales: { volume: 123456, count: 42 },
      receivables: { openAmount: 9000, openCount: 3 },
      trials: [
        { id: 'o1', name: 'A', phone: null, daysLeft: 5, salesTotal: 75000, hasSold: true },
        { id: 'o2', name: 'B', phone: null, daysLeft: 2, salesTotal: 0, hasSold: false },
      ],
      topBoutiques: {
        byRevenue: [{ id: 'o1', name: 'A', value: 75000 }],
        byCollected: [{ id: 'o1', name: 'A', value: 50000 }],
      },
      topCities: [{ city: 'Moundou', revenue: 75000, boutiques: 2 }],
      subscriptions: { mrr: 50000 },
      collectedTotal: 600000,
      redacted: false,
    } as unknown as AdminStats;

    const r = redactAdminStats(base);

    // Chiffres CLIENTS expurgés.
    expect(r.redacted).toBe(true);
    expect(r.sales).toEqual({ volume: 0, count: 0 });
    expect(r.receivables).toEqual({ openAmount: 0, openCount: 0 });
    expect(r.trials.map((t) => t.salesTotal)).toEqual([0, 0]);
    expect(r.topBoutiques.byRevenue).toEqual([]);
    expect(r.topCities[0]?.revenue).toBe(0);

    // Signaux d'activité conservés (l'outil de travail terrain reste utile).
    expect(r.trials.map((t) => t.hasSold)).toEqual([true, false]);
    expect(r.topCities[0]?.boutiques).toBe(2);

    // Argent SAHILLEY (abonnements) intact — c'est celui de l'entreprise.
    expect(r.topBoutiques.byCollected).toHaveLength(1);
    expect(r.subscriptions.mrr).toBe(50000);
    expect(r.collectedTotal).toBe(600000);

    // Pure : l'objet d'origine n'est pas muté.
    expect(base.redacted).toBe(false);
    expect(base.sales.volume).toBe(123456);
    expect(base.trials[0]?.salesTotal).toBe(75000);
  });
});
