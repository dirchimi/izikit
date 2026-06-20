// Phase 6 — rendu PDF réel (non mocké) : garde-fou contre une régression du
// moteur @react-pdf/renderer dans cet environnement (layout/fontkit).
import { describe, it, expect } from 'vitest';
import { renderDocumentPdf } from './pdf';

describe('renderDocumentPdf (rendu réel)', () => {
  it('produit un buffer PDF valide (en-tête %PDF)', async () => {
    const buf = await renderDocumentPdf({
      type: 'FACTURE',
      number: 'F-0001',
      clientName: 'Moussa Ibrahim',
      clientPhone: '+235 90 00 00 00',
      total: 13500,
      lines: [
        { article: 'Riz parfumé 5kg', qty: 2, unitPrice: 6000 },
        { article: 'Eau minérale', qty: 3, unitPrice: 500 },
      ],
      validityDays: null,
      issuedAt: '2026-06-20T10:00:00.000Z',
      note: null,
      org: { name: 'Boutique Amir', city: 'N’Djamena, Tchad', currency: 'FCFA' },
    });
    expect(buf.length).toBeGreaterThan(800);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 20000);
});
