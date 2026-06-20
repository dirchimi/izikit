// Phase 6 — GET /api/documents/[id]/pdf. Le rendu @react-pdf est mocké
// (déterministe, rapide) ; on vérifie le câblage HTTP et le scoping org.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));
vi.mock('@/lib/server/documents/pdf', () => ({
  renderDocumentPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7 fake')),
}));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { renderDocumentPdf } from '@/lib/server/documents/pdf';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);
const mockRender = vi.mocked(renderDocumentPdf);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};
const params = Promise.resolve({ id: 'd1' });

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/documents/d1/pdf', { method: 'GET' });
}

const dbDoc = {
  organizationId: 'org1',
  type: 'FACTURE',
  number: 'F-0001',
  clientName: 'Moussa',
  clientPhone: null,
  total: 12000,
  lines: [{ article: 'Riz', qty: 2, unitPrice: 6000 }],
  validityDays: null,
  issuedAt: new Date('2026-06-20T10:00:00Z'),
  note: null,
  organization: { name: 'Boutique Amir', settings: { currency: 'XAF' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  mockRender.mockResolvedValue(Buffer.from('%PDF-1.7 fake'));
});

describe('GET /api/documents/[id]/pdf', () => {
  it('renvoie un PDF avec les bons en-têtes', async () => {
    prismaMock.document.findUnique.mockResolvedValueOnce(dbDoc as never);
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('F-0001.pdf');
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 'F-0001',
        org: expect.objectContaining({ name: 'Boutique Amir' }),
      }),
    );
  });

  it('404 si le document n’est pas de la boutique', async () => {
    prismaMock.document.findUnique.mockResolvedValueOnce({
      ...dbDoc,
      organizationId: 'other',
    } as never);
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(404);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('404 si le document n’existe pas', async () => {
    prismaMock.document.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(404);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(401);
  });
});
