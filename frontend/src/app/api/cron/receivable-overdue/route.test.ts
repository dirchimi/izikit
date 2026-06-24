import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const notifyOverdueReceivablesMock = vi.fn();
vi.mock('@/lib/server/notifications/boutique-events', () => ({
  notifyOverdueReceivables: notifyOverdueReceivablesMock,
}));

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  notifyOverdueReceivablesMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/receivable-overdue', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/receivable-overdue', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(notifyOverdueReceivablesMock).not.toHaveBeenCalled();
  });

  it('calls notifyOverdueReceivables with prisma + now', async () => {
    notifyOverdueReceivablesMock.mockResolvedValueOnce({ notified: 0 });
    const { POST } = await import('./route');
    await POST(makeReq());
    expect(notifyOverdueReceivablesMock).toHaveBeenCalledOnce();
    const [prismaArg, optsArg] = notifyOverdueReceivablesMock.mock.calls[0]! as [
      unknown,
      { now: Date },
    ];
    expect(prismaArg).toBeDefined();
    expect(optsArg.now).toBeInstanceOf(Date);
  });

  it('returns the notified count', async () => {
    notifyOverdueReceivablesMock.mockResolvedValueOnce({ notified: 3 });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: 3 });
  });
});
