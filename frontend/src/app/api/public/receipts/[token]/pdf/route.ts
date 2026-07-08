// Lien public de reçu — GET /api/public/receipts/[token]/pdf.
//
// PUBLIC (aucune authentification) : sert le reçu d'une vente en PDF à partir de
// son jeton aléatoire (`Sale.publicToken`). Permet au client d'ouvrir/télécharger
// son reçu depuis le message WhatsApp, sans compte. Le jeton (~96 bits) est
// impossible à deviner → seul le destinataire du lien y accède. 404 si le jeton
// est inconnu ou la vente annulée.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { renderDocumentPdf } from '@/lib/server/documents/pdf';
import { fetchLogoDataUri } from '@/lib/server/documents/logo';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;
    if (!token) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    const sale = await prisma.sale.findUnique({
      where: { publicToken: token },
      select: {
        number: true,
        total: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true, phone: true } },
        items: { select: { name: true, qty: true, unitPrice: true } },
        organization: {
          select: {
            name: true,
            settings: {
              select: {
                currency: true,
                city: true,
                address: true,
                phone: true,
                invoiceNote: true,
                logoUrl: true,
              },
            },
          },
        },
      },
    });

    // Jeton inconnu OU vente annulée → on ne divulgue rien.
    if (!sale || sale.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'RECEIPT_NOT_FOUND', message: 'Reçu introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const settings = sale.organization.settings;
    const logo = await fetchLogoDataUri(settings?.logoUrl ?? null);
    const buffer = await renderDocumentPdf({
      type: 'FACTURE',
      number: sale.number,
      clientName: sale.customer?.name ?? '',
      clientPhone: sale.customer?.phone ?? null,
      total: sale.total,
      balanceAfter: null,
      lines: sale.items.map((it) => ({
        article: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
      })),
      validityDays: null,
      issuedAt: sale.createdAt instanceof Date ? sale.createdAt.toISOString() : sale.createdAt,
      note: settings?.invoiceNote ?? null,
      org: {
        name: sale.organization.name,
        city: settings?.city ?? null,
        address: settings?.address ?? null,
        phone: settings?.phone ?? null,
        currency: settings?.currency ?? 'XAF',
        invoiceNote: settings?.invoiceNote ?? null,
        logo,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="recu-${sale.number}.pdf"`,
        // Lien semi-privé (contient nom/téléphone du client) et révocable si la
        // vente est annulée → jamais mis en cache partagé (CDN/proxy). Sinon le
        // PDF resterait téléchargeable après annulation et les données client
        // dormiraient dans des caches intermédiaires.
        'cache-control': 'private, no-store',
        'x-request-id': reqCtx.requestId,
      },
    });
  });
}
