/**
 * Relance automatique avant la fin de l'essai / de l'abonnement.
 *
 * Balaye les boutiques non-internes, calcule le statut d'abonnement DÉRIVÉ, et
 * pour celles dont l'accès se termine à J-3 ou J-1, notifie le propriétaire :
 *   1. notification in-app (dédupliquée par boutique + échéance + jalon) ;
 *   2. email — envoyé UNIQUEMENT si la notification vient d'être créée (donc
 *      idempotent sur les deux canaux : un second passage même jour ne renvoie
 *      rien). Best-effort : sans file d'email configurée, on notifie seulement
 *      en in-app.
 *
 * Appelé par le cron quotidien `subscription-expiry-reminder`.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import type { EmailQueue } from '../queues/email-queue';
import { computeSubscription } from '@/lib/subscription/status';
import { notifyUser } from './notify-owner';
import { subscriptionExpiryNotification } from './templates';
import { subscriptionExpiryEmail } from '@/lib/server/auth/email-templates';

// Jalons de relance : 3 jours puis 1 jour avant la fin d'accès.
const MILESTONES = new Set([3, 1]);

export async function notifyExpiringSubscriptions(
  prisma: PrismaClient,
  args: { now: Date; emailQueue?: EmailQueue | null },
): Promise<{ notified: number; emailed: number }> {
  const orgs = await prisma.organization.findMany({
    where: { internal: false },
    select: {
      id: true,
      name: true,
      plan: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      owner: { select: { id: true, email: true, name: true } },
    },
  });

  let notified = 0;
  let emailed = 0;

  for (const org of orgs) {
    const sub = computeSubscription(
      { plan: org.plan, trialEndsAt: org.trialEndsAt, currentPeriodEnd: org.currentPeriodEnd },
      args.now,
    );
    if (sub.status === 'EXPIRED' || !sub.activeUntil) continue;
    if (!MILESTONES.has(sub.daysLeft)) continue;

    const activeUntilKey = sub.activeUntil.slice(0, 10); // YYYY-MM-DD
    const isTrial = sub.status === 'TRIAL';

    const created = await notifyUser(
      prisma,
      org.owner.id,
      subscriptionExpiryNotification(org.id, { daysLeft: sub.daysLeft, isTrial, activeUntilKey }),
    );
    // null = déjà envoyé (dédup) ou opt-out → on ne renvoie pas d'email non plus.
    if (!created) continue;
    notified++;

    if (args.emailQueue && org.owner.email) {
      const tpl = subscriptionExpiryEmail({
        orgName: org.name,
        name: org.owner.name,
        daysLeft: sub.daysLeft,
        isTrial,
        activeUntil: new Date(sub.activeUntil),
      });
      await args.emailQueue.enqueue({ to: org.owner.email, subject: tpl.subject, html: tpl.html });
      emailed++;
    }
  }

  return { notified, emailed };
}
