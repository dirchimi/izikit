// Garde d'abonnement (« appli douce ») — requireActiveSubscription.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireActiveSubscription } from './guard';

const NOW = new Date('2026-07-04T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireActiveSubscription', () => {
  it('laisse passer (null) quand l’essai est encore valable', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      plan: 'SOLO',
      trialEndsAt: inDays(5),
      currentPeriodEnd: null,
    } as never);
    expect(await requireActiveSubscription('org1', NOW)).toBeNull();
  });

  it('laisse passer (null) pendant la période de grâce', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      plan: 'SOLO',
      trialEndsAt: inDays(-2), // expiré il y a 2 j, grâce jusqu'à J+3
      currentPeriodEnd: null,
    } as never);
    expect(await requireActiveSubscription('org1', NOW)).toBeNull();
  });

  it('renvoie 403 SUBSCRIPTION_EXPIRED au-delà de la grâce', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      plan: 'SOLO',
      trialEndsAt: inDays(-10),
      currentPeriodEnd: null,
    } as never);
    const res = await requireActiveSubscription('org1', NOW);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe('SUBSCRIPTION_EXPIRED');
    expect(body.graceEndsAt).toBe(inDays(-7).toISOString()); // -10 + 3
  });

  it('fail-open (null) si la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null as never);
    expect(await requireActiveSubscription('org1', NOW)).toBeNull();
  });
});
