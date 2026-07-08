// Lien public de reçu — GET /api/public/receipts/[token]/pdf.
// Route PUBLIQUE (aucune auth) : on vérifie le rendu par jeton + le 404.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/documents/pdf', () => ({
  renderDocumentPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7 fake')),
}));
vi.mock('@/lib/server/documents/logo', () => ({
  fetchLogoDataUri: vi.fn().mockResolvedValue(null),
}));

import { renderDocumentPdf } from '@/lib/server/documents/pdf';
import { GET } from './route';

const mockRender = vi.mocked(renderDocumentPdf);

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/public/receipts/tok123/pdf', { method: 'GET' });
}
const params = Promise.resolve({ token: 'tok123' });

const dbSale = {
  number: 'V-0007',
  total: 13500,
  status: 'ACTIVE',
  createdAt: new Date('2026-07-08T10:00:00Z'),
  customer: { name: 'Moussa', phone: '90 00 00 00' },
  items: [{ name: 'Riz', qty: 2, unitPrice: 6000 }],
  organization: { name: 'Boutique Amir', settings: { currency: 'XAF' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRender.mockResolvedValue(Buffer.from('%PDF-1.7 fake'));
});

describe('GET /api/public/receipts/[token]/pdf', () => {
  it('renvoie le reçu en PDF (public, sans auth) pour un jeton valide', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce(dbSale as never);
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('recu-V-0007.pdf');
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FACTURE',
        number: 'V-0007',
        clientName: 'Moussa',
        org: expect.objectContaining({ name: 'Boutique Amir' }),
      }),
    );
  });

  it('404 si le jeton est inconnu', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(404);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('404 si la vente est annulée (rien divulgué)', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({ ...dbSale, status: 'CANCELLED' } as never);
    const res = await GET(makeGet(), { params });
    expect(res.status).toBe(404);
    expect(mockRender).not.toHaveBeenCalled();
  });
});
