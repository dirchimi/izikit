// Phase 4 — GET /api/receivables.
//
// Vue « débiteurs » de l'écran Créances : un client par ligne, agrégé depuis ses
// créances (Receivable). Chaque créance vient d'une vente à crédit (Phase 3).
//   debt        = Σ (amount - amountPaid) des créances non soldées
//   repaid      = Σ amountPaid
//   totalCredit = Σ amount (= debt + repaid)
//   history[]   = une ligne par créance (date, libellé articles, montant, statut)
// Org-scopé, rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { uiStatus } from '@/lib/server/receivables/helpers';
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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const customers = await prisma.customer.findMany({
      where: { organizationId: primary.organizationId, receivables: { some: {} } },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        receivables: {
          // Les créances annulées (vente annulée) ne comptent plus dans la dette.
          where: { status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amount: true,
            amountPaid: true,
            status: true,
            createdAt: true,
            sale: { select: { items: { select: { name: true } } } },
          },
        },
        // Remboursements reçus (timeline du détail débiteur, plus récent d'abord).
        repayments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, amount: true, method: true, note: true, createdAt: true },
        },
      },
    });

    const debtors = customers.map((c) => {
      let debt = 0;
      let repaid = 0;
      let totalCredit = 0;
      let lastSale = c.createdAt;
      const history = c.receivables.map((r) => {
        debt += r.amount - r.amountPaid;
        repaid += r.amountPaid;
        totalCredit += r.amount;
        if (r.createdAt > lastSale) lastSale = r.createdAt;
        const names = r.sale?.items ?? [];
        const first = names[0]?.name ?? '—';
        const label = names.length > 1 ? `${first} +${names.length - 1}` : first;
        return {
          id: r.id,
          date: iso(r.createdAt),
          label,
          amount: r.amount,
          amountPaid: r.amountPaid,
          status: uiStatus(r.status),
        };
      });
      // historique le plus récent en premier
      history.reverse();
      const repayments = c.repayments.map((p) => ({
        id: p.id,
        date: iso(p.createdAt),
        amount: p.amount,
        method: p.method.toLowerCase(), // CASH|MOBILE → cash|mobile (libellé UI)
        note: p.note ?? '',
      }));
      return {
        id: c.id,
        name: c.name,
        phone: c.phone ?? '',
        debt,
        repaid,
        totalCredit,
        since: iso(c.createdAt),
        lastSale: iso(lastSale),
        history,
        repayments,
      };
    });

    // les plus endettés d'abord
    debtors.sort((a, b) => b.debt - a.debt);

    return NextResponse.json(
      { debtors },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
