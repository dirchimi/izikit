'use client';

import { useEffect } from 'react';

/**
 * Frontière d'erreur globale. Cas fréquent : « ChunkLoadError » quand l'app
 * était ouverte pendant un déploiement (les anciens fichiers JS n'existent
 * plus côté serveur). On recharge alors une fois automatiquement pour récupérer
 * la nouvelle version — avec un garde-fou anti-boucle.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
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
    <main className="bg-background mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-5 px-4 text-center">
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
    </main>
  );
}
