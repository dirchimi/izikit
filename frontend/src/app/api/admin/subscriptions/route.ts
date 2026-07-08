// Phase 8 — GET /api/admin/subscriptions
//
// Liste des demandes de paiement d'abonnement (filtre par statut, pagination
// curseur sur createdAt). Lecture ADMIN+ ; la confirmation/refus est
// SUPERADMIN-only (voir [id]/confirm et [id]/reject).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, encodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SELECT = {
  id: true,
  plan: true,
  amount: true,
  method: true,
  months: true,
  status: true,
  periodEnd: true,
  note: true,
  createdAt: true,
  confirmedAt: true,
  organization: { select: { id: true, name: true, slug: true } },
} as const satisfies Prisma.SubscriptionPaymentSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    // Filtres facultatifs, sur liste blanche (ignore toute valeur inattendue).
    const planParam = url.searchParams.get('plan');
    const plan = planParam === 'SOLO' || planParam === 'BOUTIQUE' ? planParam : null;
    const methodParam = url.searchParams.get('method');
    const method = methodParam === 'CASH' || methodParam === 'MOBILE' ? methodParam : null;
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.SubscriptionPaymentWhereInput = {
      ...(status ? { status } : {}),
      ...(plan ? { plan } : {}),
      ...(method ? { method } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };

    const rows = await prisma.subscriptionPayment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return NextResponse.json({ items, nextCursor }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
