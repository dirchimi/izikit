// Cron quotidien — relance avant la fin de l'essai / de l'abonnement.
//
// Notifie (in-app + email) chaque propriétaire dont l'accès se termine à J-3 ou
// J-1. Gardé par `verifyCronSecret` + `leader-lease` (un seul pod émet en cas de
// multi-instance). L'email est best-effort : si la file n'est pas configurée
// (Redis/Resend absents), seule la notification in-app part.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { notifyExpiringSubscriptions } from '@/lib/server/notifications/subscription-reminder';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
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
    let emailed = 0;

    await withLease(redis ?? undefined, 'subscription-expiry-reminder', LEASE_TTL_MS, async () => {
      const res = await notifyExpiringSubscriptions(prisma, {
        now: new Date(),
        emailQueue: getEmailQueue(),
      });
      notified = res.notified;
      emailed = res.emailed;
      log.info('subscription-expiry-reminder tick', {
        notified,
        emailed,
        requestId: ctx.requestId,
      });
    });

    return NextResponse.json(
      { ok: true, notified, emailed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
