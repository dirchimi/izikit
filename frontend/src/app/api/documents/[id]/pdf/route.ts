// Phase 6 — GET /api/documents/[id]/pdf.
// Rend un document (facture/proforma) en PDF via @react-pdf/renderer. En-tête
// alimenté par le nom de la boutique + ses BoutiqueSettings (devise, ville…).
// Org-scopé, rôle min MEMBER. 404 si le document n'est pas de la boutique.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { coerceLines } from '@/lib/server/documents/helpers';
import { renderDocumentPdf } from '@/lib/server/documents/pdf';
import { fetchLogoDataUri } from '@/lib/server/documents/logo';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const { id } = await ctx.params;
    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        organizationId: true,
        type: true,
        number: true,
        clientName: true,
        clientPhone: true,
        total: true,
        lines: true,
        validityDays: true,
        issuedAt: true,
        note: true,
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

    if (!doc || doc.organizationId !== primary.organizationId) {
      return NextResponse.json(
        { error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const settings = doc.organization.settings;
    const logo = await fetchLogoDataUri(settings?.logoUrl ?? null);
    const buffer = await renderDocumentPdf({
      type: doc.type === 'PROFORMA' ? 'PROFORMA' : 'FACTURE',
      number: doc.number,
      clientName: doc.clientName,
      clientPhone: doc.clientPhone,
      total: doc.total,
      lines: coerceLines(doc.lines),
      validityDays: doc.validityDays,
      issuedAt: doc.issuedAt instanceof Date ? doc.issuedAt.toISOString() : doc.issuedAt,
      note: doc.note,
      org: {
        name: doc.organization.name,
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
        'content-disposition': `inline; filename="${doc.number}.pdf"`,
        'cache-control': 'private, no-store',
        'x-request-id': reqCtx.requestId,
      },
    });
  });
}
