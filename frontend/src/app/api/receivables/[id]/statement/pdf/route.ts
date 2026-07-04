// Phase 7 — GET /api/receivables/[id]/statement/pdf.
// Relevé de compte d'un client : achats à crédit (+) et remboursements (−) avec
// le solde restant dû. Réconcilie l'écran Créances et les Documents (la facture
// figée ne connaît pas les remboursements postérieurs — ce relevé, si).
// Généré à la volée (jamais figé). Org-scopé, rôle min MEMBER. 404 hors boutique.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { renderStatementPdf } from '@/lib/server/documents/pdf';
import { fetchLogoDataUri } from '@/lib/server/documents/logo';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}

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

    const orgId = primary.organizationId;
    const { id } = await ctx.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        organizationId: true,
        name: true,
        phone: true,
        receivables: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' },
          select: {
            amount: true,
            amountPaid: true,
            createdAt: true,
            sale: { select: { items: { select: { name: true } } } },
          },
        },
        repayments: {
          orderBy: { createdAt: 'asc' },
          select: { amount: true, method: true, createdAt: true },
        },
      },
    });

    if (!customer || customer.organizationId !== orgId) {
      return NextResponse.json(
        { error: 'CUSTOMER_NOT_FOUND', message: 'Client introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let totalCredit = 0;
    let repaid = 0;
    const credits = customer.receivables.map((r) => {
      totalCredit += r.amount;
      repaid += r.amountPaid;
      const names = r.sale?.items ?? [];
      const first = names[0]?.name ?? '—';
      const label = names.length > 1 ? `${first} +${names.length - 1}` : first;
      return { date: iso(r.createdAt), label, amount: r.amount };
    });
    const debt = totalCredit - repaid;

    const repayments = customer.repayments.map((p) => ({
      date: iso(p.createdAt),
      method: p.method,
      amount: p.amount,
    }));

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
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
    });
    const settings = org?.settings;
    const logo = await fetchLogoDataUri(settings?.logoUrl ?? null);

    const buffer = await renderStatementPdf({
      customerName: customer.name,
      customerPhone: customer.phone,
      credits,
      repayments,
      totalCredit,
      repaid,
      debt,
      issuedAt: new Date().toISOString(),
      org: {
        name: org?.name ?? 'Boutique',
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
        'content-disposition': `inline; filename="releve-${id}.pdf"`,
        'cache-control': 'private, no-store',
        'x-request-id': reqCtx.requestId,
      },
    });
  });
}
