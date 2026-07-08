// Rejoue une transaction en cas de conflit transitoire.
//
// Deux checkouts (ou deux paiements) simultanés sur la même boutique peuvent
// entrer en collision :
//   - P2034 : échec de sérialisation (isolation Serializable) — les deux tx
//     touchent les mêmes lignes, Postgres en avorte une.
//   - P2002 : violation d'unicité — p.ex. deux ventes calculent le même numéro
//     séquentiel `V-000N` avant que l'une ne commit.
// Ces échecs sont TRANSITOIRES : rejouer toute la transaction (rien n'est
// committé en cas d'échec) recalcule le numéro/état et réussit. On ne rejoue
// QUE ces deux codes ; toute autre erreur remonte telle quelle.
import 'server-only';
import { Prisma } from '@prisma/client';

const RETRYABLE = new Set(['P2034', 'P2002']);

function isRetryable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE.has(err.code);
}

/**
 * Exécute `run` en le rejouant jusqu'à `attempts` fois sur conflit transitoire.
 * `run` DOIT être ré-exécutable sans effet de bord (typiquement un
 * `prisma.$transaction(...)` complet, qui ne committe rien s'il échoue).
 */
export async function withTxRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastErr = err;
      // Petit recul croissant pour laisser la tx concurrente committer avant de
      // rejouer (pas de dépendance au hasard : délai déterministe par tentative).
      await new Promise((r) => setTimeout(r, 15 * (i + 1)));
    }
  }
  throw lastErr;
}
