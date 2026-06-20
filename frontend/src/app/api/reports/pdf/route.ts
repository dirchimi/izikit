// Phase 8 (post-v1) — GET /api/reports/pdf?period=today|week|month|year.
// Rend le rapport d'activité en PDF (téléchargeable / partageable). Réutilise
// computeReport (même données que GET /api/reports) + renderReportPdf.
// Org-scopé, rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { ensureBoutique, getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { parsePeriod, type Period } from '@/lib/server/reports/helpers';
import { computeReport } from '@/lib/server/reports/compute';
import { renderReportPdf } from '@/lib/server/reports/pdf';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PERIOD_LABEL: Record<Period, string> = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois',
  year: 'Cette année',
};

function rangeLabel(fromIso: string, toIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  // `to` est exclusif (minuit du lendemain) → on retire 1ms pour afficher le dernier jour inclus.
  const lastIncluded = new Date(new Date(toIso).getTime() - 1).toISOString();
  return `du ${fmt(fromIso)} au ${fmt(lastIncluded)}`;
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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const period = parsePeriod(new URL(req.url).searchParams.get('period'));
    const boutique = await ensureBoutique(auth.user.sub, auth.user.email);
    const report = await computeReport(primary.organizationId, period, new Date());

    const buffer = await renderReportPdf({
      periodLabel: PERIOD_LABEL[period],
      rangeLabel: rangeLabel(report.range.from, report.range.to),
      generatedAt: new Date().toISOString(),
      summary: report.summary,
      series: report.series,
      topProducts: report.topProducts,
      org: {
        name: boutique.organization.name,
        city: boutique.settings.city,
        currency: boutique.settings.currency,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="rapport-${period}.pdf"`,
        'cache-control': 'private, no-store',
        'x-request-id': ctx.requestId,
      },
    });
  });
}
