'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/useApi';

interface BannerResp {
  banner: { id: string; message: string; level: 'INFO' | 'WARNING' | 'SUCCESS' } | null;
}

const TONE: Record<string, string> = {
  INFO: 'bg-primary/10 border-primary/30 text-primary',
  WARNING: 'bg-warning/10 border-warning/30 text-warning',
  SUCCESS: 'bg-success/10 border-success/30 text-success',
};
const ICON: Record<string, string> = {
  INFO: 'info',
  WARNING: 'triangle-alert',
  SUCCESS: 'party-popper',
};

const DISMISS_KEY = 'sahilley.banner.dismissed';

/**
 * Bandeau d'information GLOBAL défini par un super-admin (maintenance, nouveauté,
 * promo…), affiché à tous les utilisateurs connectés. Refermable — l'id masqué
 * est mémorisé dans localStorage, donc changer le message le fait réapparaître.
 * Partage le cache/polling de /api/banner via useApi.
 */
export default function GlobalBanner() {
  const { data } = useApi<BannerResp>('/api/banner');
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY));
    } catch {
      // localStorage indisponible (mode privé) : on affiche simplement la bannière
    }
  }, []);

  const banner = data?.banner;
  if (!banner || banner.message.trim().length === 0) return null;
  if (dismissed === banner.id) return null;

  function close() {
    if (!banner) return;
    setDismissed(banner.id);
    try {
      localStorage.setItem(DISMISS_KEY, banner.id);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={`font-body flex items-center gap-2 border-b px-4 py-2 text-xs ${TONE[banner.level] ?? TONE.INFO}`}
    >
      <Icon i={ICON[banner.level] ?? 'info'} size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 font-semibold">{banner.message}</span>
      <button
        type="button"
        aria-label="Fermer"
        onClick={close}
        className="shrink-0 rounded-md p-1 transition hover:opacity-70 active:scale-90"
      >
        <Icon i="x" size={14} />
      </button>
    </div>
  );
}
