// Dettes fournisseurs — GET /api/supplier-debts.
//
// Liste ce que la boutique doit encore à ses fournisseurs (stock pris « en
// prêt »). Une ligne par dette non soldée (OPEN | PARTIAL), la plus récente
// d'abord, + le total restant dû. Réservé au Patron (OWNER) et au Manager
// (ADMIN) : c'est une info financière que le Vendeur n'a pas à voir.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // Info financière (ce que la boutique doit) → Patron/Manager uniquement.
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    const rows = await prisma.supplierDebt.findMany({
      where: { organizationId: primary.organizationId, status: { not: 'PAID' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        supplierName: true,
        amount: true,
        amountPaid: true,
        status: true,
        createdAt: true,
      },
    });

    let totalOwed = 0;
    const debts = rows.map((r) => {
      const remaining = r.amount - r.amountPaid;
      totalOwed += remaining;
      return {
        id: r.id,
        label: r.label,
        supplierName: r.supplierName ?? '',
        amount: r.amount,
        amountPaid: r.amountPaid,
        remaining,
        status: r.status.toLowerCase(), // OPEN|PARTIAL → open|partial (libellé UI)
        createdAt: iso(r.createdAt),
      };
    });

    return NextResponse.json(
      { debts, totalOwed },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
