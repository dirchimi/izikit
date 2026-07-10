// Phase 8 (post-v1) — GET /api/reports/pdf?period=today|week|month|year.
// Rend le rapport d'activité en PDF (téléchargeable / partageable). Réutilise
// computeReport (même données que GET /api/reports) + renderReportPdf.
// Org-scopé, rôle min ADMIN (données financières réservées Patron/Manager).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ensureBoutique, getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { parsePeriod, parseDateRange, type Period } from '@/lib/server/reports/helpers';
import { computeReport, computeReportRange } from '@/lib/server/reports/compute';
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
    // Export PDF des rapports → réservé Manager/Patron.
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    const sp = new URL(req.url).searchParams;
    const fromQ = sp.get('from');
    const toQ = sp.get('to');
    const boutique = await ensureBoutique(auth.user.sub, auth.user.email);

    let report;
    let periodLabel: string;
    let fileTag: string;
    if (fromQ && toQ) {
      const range = parseDateRange(fromQ, toQ);
      if (!range) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Plage de dates invalide' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      report = await computeReportRange(primary.organizationId, range.from, range.to);
      periodLabel = 'Période personnalisée';
      fileTag = 'personnalise';
    } else {
      const period = parsePeriod(sp.get('period'));
      report = await computeReport(primary.organizationId, period, new Date());
      periodLabel = PERIOD_LABEL[period];
      fileTag = period;
    }

    // Détail des dépenses par catégorie (même fenêtre que le rapport).
    const expenseGroups = (await prisma.expense.groupBy({
      by: ['category'],
      where: {
        organizationId: primary.organizationId,
        occurredAt: { gte: new Date(report.range.from), lt: new Date(report.range.to) },
      },
      _sum: { amount: true },
    })) as unknown as Array<{ category: string | null; _sum: { amount: number | null } }>;
    const expensesByCategory = expenseGroups
      .map((g) => ({ category: g.category || 'Autre', amount: g._sum.amount ?? 0 }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const buffer = await renderReportPdf({
      periodLabel,
      rangeLabel: rangeLabel(report.range.from, report.range.to),
      generatedAt: new Date().toISOString(),
      summary: report.summary,
      series: report.series,
      topProducts: report.topProducts,
      expensesByCategory,
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
        'content-disposition': `inline; filename="rapport-${fileTag}.pdf"`,
        'cache-control': 'private, no-store',
        'x-request-id': ctx.requestId,
      },
    });
  });
}
