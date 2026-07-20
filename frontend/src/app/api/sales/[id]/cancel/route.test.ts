// POST /api/sales/[id]/cancel — annulation de vente (LOT 1).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
  requireOrgRole: vi.fn(),
}));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({
  getPrimaryMembership: vi.fn(),
}));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const adminGate = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'ADMIN' as const },
};

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function makeReq(
  csrf: 'match' | 'missing' = 'match',
  reason: string | null = 'erreur de saisie',
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/sales/s1/cancel', {
    method: 'POST',
    headers,
    ...(reason !== null ? { body: JSON.stringify({ reason }) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'ADMIN' });
  mockRequireOrgRole.mockResolvedValue(adminGate);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('POST /api/sales/[id]/cancel', () => {
  it('exige le rôle ADMIN (Manager) — pas un simple Vendeur', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0001',
      status: 'ACTIVE',
      items: [],
      receivable: null,
    } as never);
    await POST(makeReq(), params('s1'));
    expect(mockRequireOrgRole).toHaveBeenCalledWith('org1', 'ADMIN');
  });

  it('annule une vente à crédit : re-crédite le stock, annule la créance, marque CANCELLED → 200', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0007',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [
        { productId: 'p1', qty: 2 },
        { productId: 'p2', qty: 3 },
      ],
      receivable: { id: 'r1', amountPaid: 0 },
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.receivable.update.mockResolvedValueOnce({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sale.status).toBe('CANCELLED');

    // stock ré-incrémenté par ligne
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { qty: { increment: 2 } } }),
    );
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p2' }, data: { qty: { increment: 3 } } }),
    );
    // mouvement IN de traçabilité
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'IN', delta: 2, productId: 'p1' }),
      }),
    );
    // créance annulée
    expect(prismaMock.receivable.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { status: 'CANCELLED' } }),
    );
    // vente marquée annulée, non supprimée
    expect(prismaMock.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'CANCELLED', cancelledById: 'user-1' }),
      }),
    );
    expect(prismaMock.sale.delete).not.toHaveBeenCalled();
  });

  it('409 si la vente à crédit a déjà reçu un remboursement (pas d’orphelins)', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0010',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [{ productId: 'p1', qty: 1 }],
      receivable: { id: 'r1', amountPaid: 4000 }, // déjà partiellement remboursée
    } as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CREDIT_ALREADY_REPAID');
    // Rien n'est modifié : ni stock, ni créance, ni vente.
    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(prismaMock.receivable.update).not.toHaveBeenCalled();
    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });

  it('vente au comptant (sans créance) : ne touche aucune créance', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0008',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [{ productId: 'p1', qty: 1 }],
      receivable: null,
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    expect(prismaMock.receivable.update).not.toHaveBeenCalled();
  });

  it('ligne dont le produit a été supprimé (productId null) : ignorée, pas de re-crédit', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0009',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [{ productId: null, qty: 4 }],
      receivable: null,
    } as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(prismaMock.stockMovement.create).not.toHaveBeenCalled();
  });

  it('409 si la vente est déjà annulée (pas de double re-crédit)', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0001',
      status: 'CANCELLED',
      items: [{ productId: 'p1', qty: 2 }],
      receivable: null,
    } as never);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('SALE_ALREADY_CANCELLED');
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('404 si la vente est hors boutique', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'autre-org',
      number: 'V-0001',
      status: 'ACTIVE',
      items: [],
      receivable: null,
    } as never);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(404);
  });

  it('404 si la vente est introuvable', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(404);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makeReq('missing'), params('s1'));
    expect(res.status).toBe(403);
  });

  it('404 sans boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(404);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sales/[id]/cancel — idempotence offline (clientOpId, rejeu)', () => {
  function makeCancelReq(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://test/api/sales/s1/cancel', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'tok',
        cookie: 'app-csrf=tok',
      },
      body: JSON.stringify(body),
    });
  }

  it('deux POST même clientOpId : annulée une fois, stock re-crédité une fois, 2e réponse 200 (pas 409)', async () => {
    // 1er POST : opération offline inconnue → exécute l'annulation.
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0007',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [{ productId: 'p1', qty: 2 }],
      receivable: null,
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const first = await POST(
      makeCancelReq({ reason: 'erreur de saisie', clientOpId: 'cop-1' }),
      params('s1'),
    );
    expect(first.status).toBe(200);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.sale.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.offlineOperation.create).toHaveBeenCalledTimes(1);

    // 2e POST : même clientOpId → résultat OK mémoïsé renvoyé, aucune ré-exécution.
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op1',
      organizationId: 'org1',
      clientOpId: 'cop-1',
      endpoint: 'cancel',
      resultJson: { kind: 'OK', number: 'V-0007' },
      createdAt: new Date(),
    } as never);

    const second = await POST(
      makeCancelReq({ reason: 'erreur de saisie', clientOpId: 'cop-1' }),
      params('s1'),
    );
    expect(second.status).toBe(200); // rejeu = succès, PAS un 409
    const body = await second.json();
    expect(body.sale.status).toBe('CANCELLED');
    expect(body.sale.number).toBe('V-0007');

    // Pas de double re-crédit : stock/vente touchés une seule fois au total.
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.sale.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.offlineOperation.create).toHaveBeenCalledTimes(1);
  });

  it('rejet NOT_FOUND (clientOpId fourni) : ne mémoïse rien, un rejeu après création de la vente réussit', async () => {
    // 1er POST : la vente n'existe pas encore (ex : création offline en retard
    // pendant le drain). withIdempotency ne trouve aucune mémoïsation → fn()
    // s'exécute → throw NOT_FOUND → rollback complet → offlineOperation.create
    // n'est JAMAIS appelé (contrairement à un `return { kind: 'NOT_FOUND' }`
    // qui aurait été mémoïsé sous ce clientOpId pour toujours).
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.sale.findUnique.mockResolvedValueOnce(null as never);

    const first = await POST(
      makeCancelReq({ reason: 'erreur de saisie', clientOpId: 'cop-2' }),
      params('s1'),
    );
    expect(first.status).toBe(404);
    expect((await first.json()).error).toBe('SALE_NOT_FOUND');
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();

    // 2e POST : MÊME clientOpId, mais la vente existe désormais (le create
    // offline a fini par arriver). Comme rien n'a été mémoïsé au 1er essai,
    // withIdempotency retrouve toujours aucune ligne → fn() s'exécute pour de
    // vrai et l'annulation réussit — la preuve que NOT_FOUND n'était pas figé.
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0011',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [{ productId: 'p1', qty: 1 }],
      receivable: null,
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const second = await POST(
      makeCancelReq({ reason: 'erreur de saisie', clientOpId: 'cop-2' }),
      params('s1'),
    );
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.sale.status).toBe('CANCELLED');
    expect(body.sale.number).toBe('V-0011');
    expect(prismaMock.offlineOperation.create).toHaveBeenCalledTimes(1);
  });

  it('online inchangé : POST sans clientOpId → annulée, aucune OfflineOperation touchée', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0008',
      status: 'ACTIVE',
      createdAt: new Date(),
      items: [{ productId: 'p1', qty: 1 }],
      receivable: null,
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    // clientOpId null → chemin online pur : la table d'idempotence n'est jamais touchée.
    expect(prismaMock.offlineOperation.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();
  });
});
