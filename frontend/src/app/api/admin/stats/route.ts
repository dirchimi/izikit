// ADMIN — GET /api/admin/stats
//
// Agrégats plateforme pour le tableau de bord admin (lecture seule). Réservé
// aux ADMIN/SUPERADMIN (requireAdmin) + limite de débit admin. Toute la logique
// vit dans `computeAdminStats` (testable) ; la route se contente du gating.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { prisma } from '@/lib/server/prisma';
import { computeAdminStats } from '@/lib/server/admin/stats';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const stats = await computeAdminStats(prisma, new Date());

    return NextResponse.json(stats, { headers: { 'x-request-id': ctx.requestId } });
  });
}
