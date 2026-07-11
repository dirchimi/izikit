import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./notify-owner', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/subscription/status', () => ({ computeSubscription: vi.fn() }));

import { notifyUser } from './notify-owner';
import { computeSubscription } from '@/lib/subscription/status';
import { notifyExpiringSubscriptions } from './subscription-reminder';

const mockNotify = vi.mocked(notifyUser);
const mockCompute = vi.mocked(computeSubscription);

function org(id: string, email: string) {
  return {
    id,
    name: `Boutique ${id}`,
    plan: 'PREMIUM',
    trialEndsAt: null,
    currentPeriodEnd: null,
    owner: { id: `o-${id}`, email, name: null },
  };
}

function sub(status: string, daysLeft: number, activeUntil: string | null) {
  return { status, daysLeft, activeUntil } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifyExpiringSubscriptions', () => {
  it('notifie + email uniquement pour J-3 et J-1, ignore le reste', async () => {
    prismaMock.organization.findMany.mockResolvedValue([
      org('A', 'a@x.com'),
      org('B', 'b@x.com'),
      org('C', 'c@x.com'),
      org('D', 'd@x.com'),
    ] as never);
    mockCompute
      .mockReturnValueOnce(sub('TRIAL', 3, '2026-07-15T00:00:00.000Z'))
      .mockReturnValueOnce(sub('ACTIVE', 1, '2026-07-13T00:00:00.000Z'))
      .mockReturnValueOnce(sub('ACTIVE', 5, '2026-07-20T00:00:00.000Z')) // hors jalon
      .mockReturnValueOnce(sub('EXPIRED', 0, '2026-07-01T00:00:00.000Z')); // déjà expiré
    mockNotify.mockResolvedValue({ id: 'n' } as never); // créée
    const emailQueue = { enqueue: vi.fn().mockResolvedValue('id') };

    const res = await notifyExpiringSubscriptions(prismaMock as never, {
      now: new Date('2026-07-12T00:00:00.000Z'),
      emailQueue: emailQueue as never,
    });

    expect(res.notified).toBe(2);
    expect(res.emailed).toBe(2);
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(emailQueue.enqueue).toHaveBeenCalledTimes(2);
  });

  it("n'envoie pas d'email si la notification est dédupliquée (null)", async () => {
    prismaMock.organization.findMany.mockResolvedValue([org('A', 'a@x.com')] as never);
    mockCompute.mockReturnValueOnce(sub('TRIAL', 1, '2026-07-13T00:00:00.000Z'));
    mockNotify.mockResolvedValue(null as never); // dédupliquée / opt-out
    const emailQueue = { enqueue: vi.fn() };

    const res = await notifyExpiringSubscriptions(prismaMock as never, {
      now: new Date('2026-07-12T00:00:00.000Z'),
      emailQueue: emailQueue as never,
    });

    expect(res.notified).toBe(0);
    expect(res.emailed).toBe(0);
    expect(emailQueue.enqueue).not.toHaveBeenCalled();
  });

  it('sans file email : notifie seulement en in-app', async () => {
    prismaMock.organization.findMany.mockResolvedValue([org('A', 'a@x.com')] as never);
    mockCompute.mockReturnValueOnce(sub('ACTIVE', 3, '2026-07-15T00:00:00.000Z'));
    mockNotify.mockResolvedValue({ id: 'n' } as never);

    const res = await notifyExpiringSubscriptions(prismaMock as never, {
      now: new Date('2026-07-12T00:00:00.000Z'),
      emailQueue: null,
    });

    expect(res.notified).toBe(1);
    expect(res.emailed).toBe(0);
  });
});
