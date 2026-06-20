// Envoi d'email quasi instantané SANS dépendre du cron quotidien (plan gratuit
// Vercel). On réutilise le pipeline existant et testé :
//   outbox (table) -> drainOutbox -> file Redis -> queue.drainOne() -> Resend
//
// `after()` (Next.js) exécute le drain APRÈS l'envoi de la réponse HTTP : la
// réponse reste donc instantanée et l'anti-énumération de signup/forgot n'est
// pas affectée (le client a déjà reçu sa réponse avant que le drain tourne).
//
// Best-effort : toute erreur est avalée — les crons cron/outbox-drain +
// cron/email-queue-drain restent le filet de sécurité (rattrapage + réessais).
import 'server-only';
import { after } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { drainOutbox } from '@/lib/server/outbox/dispatcher';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();
const BATCH = 25;

/**
 * À appeler dans une route APRÈS avoir enfilé un événement email dans l'outbox
 * (juste avant de renvoyer la réponse). Déclenche un drain immédiat post-réponse.
 * Ne lève jamais : si on est hors contexte requête (ex. tests unitaires) ou si
 * le drain échoue, on ignore — le cron prendra le relais.
 */
export function flushEmailsAfterResponse(): void {
  // En tests unitaires, on ne déclenche aucun drain (pas d'effets réseau, et
  // `after()` est hors contexte requête). Garde explicite = coût nul en test.
  if (process.env.NODE_ENV === 'test') return;
  try {
    after(async () => {
      try {
        const queue = getEmailQueue();
        // 1. outbox -> file email
        await drainOutbox({ prisma, ...(queue ? { emailQueue: queue } : {}) }, BATCH);
        // 2. file email -> Resend
        if (queue) {
          for (let i = 0; i < BATCH; i++) {
            const handled = await queue.drainOne();
            if (!handled) break;
          }
        }
      } catch (err) {
        log.warn('flushEmailsAfterResponse: drain failed (cron will retry)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch {
    // `after()` appelé hors contexte requête (tests) — no-op.
  }
}
