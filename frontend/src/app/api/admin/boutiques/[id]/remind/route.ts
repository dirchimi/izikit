// POST /api/admin/boutiques/[id]/remind — envoie MANUELLEMENT une relance
// d'abonnement au patron d'une boutique précise (notification in-app + email),
// en plus de la relance automatique J-3/J-1. Force l'envoi (dedupeKey unique) :
// le superadmin peut relancer quand il veut. SUPERADMIN, CSRF, audité.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createNotification } from '@/lib/server/notifications';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { computeSubscription } from '@/lib/subscription/status';
import { subscriptionExpiryEmail } from '@/lib/server/auth/email-templates';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const org = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        plan: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        owner: { select: { id: true, email: true, name: true } },
      },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'BOUTIQUE_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const now = new Date();
    const sub = computeSubscription(
      { plan: org.plan, trialEndsAt: org.trialEndsAt, currentPeriodEnd: org.currentPeriodEnd },
      now,
    );
    const isTrial = sub.status === 'TRIAL';
    const activeUntil = sub.activeUntil ? new Date(sub.activeUntil) : now;
    const daysLeft = Math.max(0, sub.daysLeft);
    // dedupeKey unique → envoi forcé (le superadmin relance intentionnellement).
    const nonce = crypto.randomUUID();

    await createNotification(prisma, {
      userId: org.owner.id,
      type: 'SUBSCRIPTION_EXPIRY',
      title: isTrial ? "Fin d'essai proche" : 'Renouvellement à prévoir',
      body: `Contacte-nous pour continuer avec Sahilley sans interruption.`,
      data: { manual: true, daysLeft },
      dedupeKey: `subscription-remind-manual:${id}:${nonce}`,
    });

    let emailed = false;
    const queue = getEmailQueue();
    if (queue && org.owner.email) {
      const tpl = subscriptionExpiryEmail({
        orgName: org.name,
        name: org.owner.name,
        daysLeft,
        isTrial,
        activeUntil,
      });
      await queue.enqueue({ to: org.owner.email, subject: tpl.subject, html: tpl.html });
      emailed = true;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'boutique.remind',
      targetType: 'Organization',
      targetId: id,
      metadata: { name: org.name, emailed },
    });

    return NextResponse.json(
      { ok: true, emailed },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
