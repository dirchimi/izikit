/**
 * Déclenche un effet de notification APRÈS l'envoi de la réponse HTTP, via
 * `after()` (Next.js). La caisse / la saisie de dépense ne sont donc jamais
 * ralenties par la création des alertes.
 *
 * Best-effort, ne lève jamais : hors contexte requête (tests unitaires) ou en
 * cas d'erreur, on ignore silencieusement. No-op explicite sous NODE_ENV=test
 * (mêmes garde-fous que `email/flush-after-response.ts`).
 */
import 'server-only';
import { after } from 'next/server';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

export function notifyAfterResponse(run: () => Promise<void>): void {
  if (process.env.NODE_ENV === 'test') return;
  try {
    after(async () => {
      try {
        await run();
      } catch (err) {
        log.warn('notifyAfterResponse: hook failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch {
    // `after()` hors contexte requête (tests) — no-op.
  }
}
