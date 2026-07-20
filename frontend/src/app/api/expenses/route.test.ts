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

describe('POST /api/expenses — Task 6.2 : createdAt client borné (offline entry time)', () => {
  function expenseCreateData(): { createdAt?: Date; occurredAt?: Date } {
    const call = prismaMock.expense.create.mock.calls[0]?.[0] as {
      data: { createdAt?: Date; occurredAt?: Date };
    };
    return call.data;
  }

  it('createdAt valide (passé récent) : repris tel quel sur createdAt ET occurredAt', async () => {
    prismaMock.expense.count.mockResolvedValueOnce(0);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'e1',
      number: 'D-0001',
      label: 'Transport',
      category: 'Transport',
      amount: 3000,
      note: null,
      occurredAt: new Date(),
    } as never);

    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // avant-hier
    const res = await POST(
      makePost({ label: 'Transport', amount: 3000, category: 'Transport', createdAt: past }),
    );
    expect(res.status).toBe(201);
    const data = expenseCreateData();
    expect(data.createdAt?.toISOString()).toBe(past);
    expect(data.occurredAt?.toISOString()).toBe(past);
  });

  it('createdAt dans le futur : repli sur now() (pas la valeur future)', async () => {
    prismaMock.expense.count.mockResolvedValueOnce(0);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'e1',
      number: 'D-0001',
      label: 'Transport',
      category: 'Transport',
      amount: 3000,
      note: null,
      occurredAt: new Date(),
    } as never);

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await POST(
      makePost({ label: 'Transport', amount: 3000, category: 'Transport', createdAt: future }),
    );
    expect(res.status).toBe(201);
    const data = expenseCreateData();
    expect(data.createdAt).toBeDefined();
    expect(data.createdAt).not.toEqual(new Date(future));
    expect(Math.abs((data.createdAt as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('createdAt trop ancien (> 30j) : repli sur now()', async () => {
    prismaMock.expense.count.mockResolvedValueOnce(0);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'e1',
      number: 'D-0001',
      label: 'Transport',
      category: 'Transport',
      amount: 3000,
      note: null,
      occurredAt: new Date(),
    } as never);

    const ancient = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const res = await POST(
      makePost({ label: 'Transport', amount: 3000, category: 'Transport', createdAt: ancient }),
    );
    expect(res.status).toBe(201);
    const data = expenseCreateData();
    expect(data.createdAt).toBeDefined();
    expect(Math.abs((data.createdAt as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('sans createdAt (online) : les clés sont omises, @default(now()) du schéma s’applique — comportement inchangé', async () => {
    prismaMock.expense.count.mockResolvedValueOnce(0);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'e1',
      number: 'D-0001',
      label: 'Transport',
      category: 'Transport',
      amount: 3000,
      note: null,
      occurredAt: new Date(),
    } as never);

    const res = await POST(makePost({ label: 'Transport', amount: 3000, category: 'Transport' }));
    expect(res.status).toBe(201);
    const data = expenseCreateData();
    expect('createdAt' in data).toBe(false);
    expect('occurredAt' in data).toBe(false);
  });
});

describe('POST /api/expenses — idempotence offline (id client + clientOpId)', () => {
  it('deux POST avec le même id : une seule dépense créée, 2e réponse = 200, même dépense', async () => {
    // --- 1er POST : crée la dépense (aucune opération offline connue) ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.expense.count.mockResolvedValueOnce(0);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'expense-client-1',
      number: 'D-0001',
      label: 'Transport',
      category: 'Transport',
      amount: 3000,
      note: 'taxi',
      occurredAt: new Date('2026-06-20T00:00:00Z'),
    } as never);

    const first = await POST(
      makePost({
        id: 'expense-client-1',
        label: 'Transport',
        amount: 3000,
        category: 'Transport',
        note: 'taxi',
      }),
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.expense.id).toBe('expense-client-1');
    expect(prismaMock.expense.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'expense-client-1' }) }),
    );

    // Ce que withIdempotency a mémoïsé (JSON) pour ce clientOpId.
    const memoized = {
      id: 'expense-client-1',
      number: firstBody.expense.number,
      label: firstBody.expense.label,
      category: firstBody.expense.category,
      amount: firstBody.expense.amount,
      note: firstBody.expense.note,
      occurredAt: firstBody.expense.occurredAt,
    };

    // --- 2e POST : même id → rejoué, résultat mémoïsé, aucune ré-exécution ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op1',
      organizationId: 'org1',
      clientOpId: 'expense-client-1',
      endpoint: 'expenses',
      resultJson: memoized,
      createdAt: new Date(),
    } as never);

    const second = await POST(
      makePost({
        id: 'expense-client-1',
        label: 'Transport',
        amount: 3000,
        category: 'Transport',
        note: 'taxi',
      }),
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.expense.id).toBe('expense-client-1');
    expect(secondBody.expense.number).toBe(firstBody.expense.number);
    expect(secondBody.expense.amount).toBe(firstBody.expense.amount);

    // Pas de duplication : une seule dépense créée au total.
    expect(prismaMock.expense.create).toHaveBeenCalledTimes(1);
  });

  it('online inchangé : POST sans id/clientOpId → dépense créée, numéro D- serveur, aucune OfflineOperation', async () => {
    prismaMock.expense.count.mockResolvedValueOnce(7);
    prismaMock.expense.create.mockResolvedValueOnce({
      id: 'e-server',
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
    expect(body.expense.id).toBe('e-server');
    expect(body.expense.number).toBe('D-0008');
    // clientOpId null → chemin online pur : la table d'idempotence n'est jamais touchée.
    expect(prismaMock.offlineOperation.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();
  });
});
