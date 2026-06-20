// Phase 5 — GET + POST /api/expenses.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/expenses', { method: 'GET' });
}
function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/expenses', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('GET /api/expenses', () => {
  it('liste les dépenses (occurredAt sérialisé en ISO, note normalisée)', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([
      {
        id: 'e1',
        number: 'D-0002',
        label: 'Loyer',
        category: 'Loyer',
        amount: 50000,
        note: null,
        occurredAt: new Date('2026-06-15T09:00:00Z'),
      },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expenses[0].number).toBe('D-0002');
    expect(body.expenses[0].note).toBe('');
    expect(body.expenses[0].occurredAt).toBe('2026-06-15T09:00:00.000Z');
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/expenses', () => {
  it('crée une dépense avec numéro séquentiel → 201', async () => {
    prismaMock.expense.count.mockResolvedValueOnce(7);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'e8',
      number: 'D-0008',
      label: 'Transport',
      category: 'Transport',
      amount: 3000,
      note: 'taxi',
      occurredAt: new Date('2026-06-20T00:00:00Z'),
    } as never);

    const res = await POST(
      makePost({ label: 'Transport', amount: 3000, category: 'Transport', note: 'taxi' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.expense.number).toBe('D-0008');
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: 'D-0008', amount: 3000, organizationId: 'org1' }),
      }),
    );
  });

  it('400 si montant non positif', async () => {
    const res = await POST(makePost({ label: 'X', amount: 0, category: 'Frais' }));
    expect(res.status).toBe(400);
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('400 si libellé manquant', async () => {
    const res = await POST(makePost({ amount: 1000, category: 'Frais' }));
    expect(res.status).toBe(400);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(
      makePost({ label: 'X', amount: 1000, category: 'Frais' }, { csrf: 'missing' }),
    );
    expect(res.status).toBe(403);
  });
});
