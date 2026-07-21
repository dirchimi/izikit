'use client';

import { useEffect, useState } from 'react';

/**
 * Frontière d'erreur globale. Cas fréquent : « ChunkLoadError » quand l'app
 * était ouverte pendant un déploiement (les anciens fichiers JS n'existent
 * plus côté serveur). On recharge alors une fois automatiquement pour récupérer
 * la nouvelle version — avec un garde-fou anti-boucle.
 *
 * Un bloc « Détails techniques » repliable expose name/message/digest/stack :
 * sur un POS de terrain (souvent hors-ligne, opéré par des non-techniciens),
 * pouvoir lire/partager la cause réelle d'un crash vaut mieux qu'un message
 * générique opaque. L'erreur est aussi tracée en console pour le support.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error('[app-error]', error);
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      /loading chunk|failed to load chunk|dynamically imported module/i.test(error.message);
    if (!isChunkError || typeof window === 'undefined') return;
    // Anti-boucle : au plus un rechargement automatique par tranche de 10 s.
    const KEY = 'chunk-reloaded-at';
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last > 10_000) {
      window.sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  return (
    <main className="bg-background mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-headings text-foreground text-xl font-bold">Une erreur est survenue</h1>
      <p className="text-muted-foreground font-body max-w-sm text-sm">
        L’application a rencontré un problème. Réessaie — si ça persiste, recharge la page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground font-body rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
      >
        Réessayer
      </button>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="text-muted-foreground font-body text-xs underline underline-offset-2"
      >
        {showDetails ? 'Masquer les détails' : 'Détails techniques'}
      </button>
      {showDetails && (
        <pre className="bg-muted text-foreground font-body max-h-64 w-full max-w-full overflow-auto rounded-md p-3 text-start text-[11px] whitespace-pre-wrap">
          {error.name}: {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
      )}
    </main>
  );
}
