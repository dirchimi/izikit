// GET /api/repayments?period=today|week|month|year  (ou ?from=&to=).
//
// Liste GLOBALE des remboursements de créances reçus sur une période, tous
// clients confondus (≠ la fiche d'un seul client sur /creances). Renvoie le
// total, la ventilation espèces/mobile, le nombre et les lignes (date, client,
// montant, méthode). Org-scopé, rôle min ADMIN (Manager/Patron), lecture seule.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { prisma } from '@/lib/server/prisma';
import { parsePeriod, parseDateRange, periodRange } from '@/lib/server/reports/helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

// Garde-fou : une période ne devrait pas dépasser quelques centaines de
// remboursements. On borne la liste ; le total/ventilation restent exacts (agrégat DB).
const LIST_LIMIT = 500;

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
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    const sp = new URL(req.url).searchParams;
    const fromQ = sp.get('from');
    const toQ = sp.get('to');

    let window: { from: Date; to: Date };
    if (fromQ && toQ) {
      const range = parseDateRange(fromQ, toQ);
      if (!range) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Plage de dates invalide' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      window = range;
    } else {
      window = periodRange(parsePeriod(sp.get('period')), new Date());
    }

    const where = {
      organizationId: primary.organizationId,
      createdAt: { gte: window.from, lt: window.to },
    };

    const [byMethod, rows] = await Promise.all([
      prisma.repayment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
        _count: true,
      }) as unknown as Promise<
        Array<{ method: string; _sum: { amount: number | null }; _count: number }>
      >,
      prisma.repayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          amount: true,
          method: true,
          note: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    let cash = 0;
    let mobile = 0;
    let count = 0;
    for (const g of byMethod) {
      count += g._count;
      if (g.method === 'CASH') cash = g._sum.amount ?? 0;
      else if (g.method === 'MOBILE') mobile = g._sum.amount ?? 0;
    }

    return NextResponse.json(
      {
        range: { from: window.from.toISOString(), to: window.to.toISOString() },
        total: cash + mobile,
        cash,
        mobile,
        count,
        repayments: rows.map((r) => ({
          id: r.id,
          customerName: r.customer?.name ?? '—',
          amount: r.amount,
          method: r.method.toLowerCase(), // cash | mobile
          note: r.note ?? '',
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
