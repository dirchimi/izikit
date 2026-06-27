// Phase 7 — GET /api/reports?period=today|week|month|year.
//
// Agrège ventes + dépenses sur la fenêtre de la période (lecture seule) :
//   revenue     = Σ Sale.total
//   sales       = nb de ventes
//   grossMargin = revenue − COGS, COGS = Σ ligne (buyPrice × qty)  (instantané)
//   marginPct   = marge / CA
//   expenses    = Σ Expense.amount
//   netProfit   = grossMargin − expenses
//   series[]    = CA par compartiment (jour/mois) pour le graphe
//   topProducts = top 5 produits par CA
// Org-scopé, rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { parsePeriod, parseDateRange } from '@/lib/server/reports/helpers';
import { computeReport, computeReportRange } from '@/lib/server/reports/compute';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const sp = new URL(req.url).searchParams;
    const fromQ = sp.get('from');
    const toQ = sp.get('to');

    let report;
    if (fromQ && toQ) {
      const range = parseDateRange(fromQ, toQ);
      if (!range) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Plage de dates invalide' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      report = await computeReportRange(primary.organizationId, range.from, range.to);
    } else {
      const period = parsePeriod(sp.get('period'));
      report = await computeReport(primary.organizationId, period, new Date());
    }

    return NextResponse.json(report, {
      status: 200,
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
