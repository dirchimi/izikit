// Phase 6 — GET + POST /api/documents (facture depuis vente, proforma manuelle).
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
  return new NextRequest('http://test/api/documents', { method: 'GET' });
}
function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/documents', {
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

describe('GET /api/documents', () => {
  it('liste les documents (lignes JSON normalisées, statut UI)', async () => {
    prismaMock.document.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        type: 'FACTURE',
        number: 'F-0001',
        saleId: 's1',
        clientName: 'Moussa',
        clientPhone: null,
        status: 'CREDIT',
        total: 12000,
        balanceAfter: null,
        note: null,
        lines: [{ article: 'Riz', qty: 2, unitPrice: 6000 }],
        validityDays: null,
        issuedAt: new Date('2026-06-20T10:00:00Z'),
      },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents[0].number).toBe('F-0001');
    expect(body.documents[0].status).toBe('credit');
    expect(body.documents[0].lines[0].article).toBe('Riz');
    expect(body.documents[0].clientPhone).toBe('');
    expect(body.documents[0].balanceAfter).toBeNull();
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/documents — FACTURE depuis une vente', () => {
  it('fige les lignes/total/destinataire de la vente → 201', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      method: 'CREDIT',
      total: 13500,
      customerId: 'c1',
      customer: { name: 'Moussa', phone: '90 00 00 00' },
      items: [
        { name: 'Riz', qty: 2, unitPrice: 6000 },
        { name: 'Eau', qty: 3, unitPrice: 500 },
      ],
      document: null,
    } as never);
    prismaMock.document.count.mockResolvedValueOnce(0);
    prismaMock.document.create.mockResolvedValueOnce({
      id: 'd1',
      type: 'FACTURE',
      number: 'F-0001',
      saleId: 's1',
      clientName: 'Moussa',
      clientPhone: '90 00 00 00',
      status: 'CREDIT',
      total: 13500,
      note: null,
      lines: [
        { article: 'Riz', qty: 2, unitPrice: 6000 },
        { article: 'Eau', qty: 3, unitPrice: 500 },
      ],
      validityDays: null,
      issuedAt: new Date('2026-06-20T10:00:00Z'),
    } as never);

    const res = await POST(makePost({ type: 'FACTURE', saleId: 's1' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.number).toBe('F-0001');
    expect(body.document.status).toBe('credit');
    expect(prismaMock.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'FACTURE',
          number: 'F-0001',
          status: 'CREDIT',
          total: 13500,
          saleId: 's1',
        }),
      }),
    );
  });

  it('409 DOC_EXISTS si la vente est déjà facturée', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      method: 'CASH',
      total: 1000,
      customerId: null,
      customer: null,
      items: [{ name: 'X', qty: 1, unitPrice: 1000 }],
      document: { id: 'dX' },
    } as never);
    const res = await POST(makePost({ type: 'FACTURE', saleId: 's1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('DOC_EXISTS');
    expect(prismaMock.document.create).not.toHaveBeenCalled();
  });

  it('404 SALE_NOT_FOUND si la vente n’est pas de la boutique', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'other',
      method: 'CASH',
      total: 0,
      customerId: null,
      customer: null,
      items: [],
      document: null,
    } as never);
    const res = await POST(makePost({ type: 'FACTURE', saleId: 's1' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('SALE_NOT_FOUND');
  });
});

describe('POST /api/documents — PROFORMA manuelle', () => {
  it('crée un devis avec total figé et numéro PRO → 201', async () => {
    prismaMock.document.count.mockResolvedValueOnce(30);
    prismaMock.document.create.mockResolvedValueOnce({
      id: 'd2',
      type: 'PROFORMA',
      number: 'PRO-0031',
      saleId: null,
      clientName: 'Boutique Al-Nour',
      clientPhone: null,
      status: 'PENDING',
      total: 47000,
      note: null,
      lines: [{ article: 'Tissu wax', qty: 3, unitPrice: 9000 }],
      validityDays: 30,
      issuedAt: new Date('2026-06-20T10:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        type: 'PROFORMA',
        clientName: 'Boutique Al-Nour',
        lines: [
          { article: 'Tissu wax', qty: 3, unitPrice: 9000 },
          { article: 'Savon', qty: 5, unitPrice: 4000 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.number).toBe('PRO-0031');
    expect(prismaMock.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PROFORMA',
          status: 'PENDING',
          total: 47000, // 3×9000 + 5×4000
          validityDays: 30,
        }),
      }),
    );
  });

  it('400 si proforma sans lignes', async () => {
    const res = await POST(makePost({ type: 'PROFORMA', clientName: 'X', lines: [] }));
    expect(res.status).toBe(400);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makePost({ type: 'FACTURE', saleId: 's1' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
  });
});
