// Cron quotidien — alerte « péremption proche / produit périmé ».
//
// Balaye, par boutique, les produits datés qui sont périmés ou entrent dans la
// fenêtre d'alerte (`BoutiqueSettings.expiryAlertDays`) et notifie chaque
// propriétaire (une alerte par produit et par date, dédupliquée). Gardé par
// `verifyCronSecret` + `leader-lease` (un seul pod émet en multi-instance).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { notifyExpiringProducts } from '@/lib/server/notifications/boutique-events';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let notified = 0;

    await withLease(redis ?? undefined, 'product-expiry', LEASE_TTL_MS, async () => {
      const res = await notifyExpiringProducts(prisma, { now: new Date() });
      notified = res.notified;
      log.info('product-expiry tick', { notified, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, notified },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
