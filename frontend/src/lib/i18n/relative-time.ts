/**
 * relative-time.ts — shared "N minutes ago" formatter.
 *
 * Extracted from `NotificationBell.tsx` (which had its own private
 * `relativeTime()`) so `SyncIndicator`'s "last synced" hint (Task 4.3 of the
 * offline-first plan) can reuse the exact same `notif.ago.*` i18n templates
 * instead of introducing a second set of "N minutes ago" strings in 3
 * languages. Pure — no React, no DOM — so it's directly unit-testable.
 */

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Date ISO → libellé relatif ("À l'instant", "il y a 5 min", …). */
export function relativeTime(iso: string, t: Translate): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t('notif.ago.now');
  if (min < 60) return t('notif.ago.min', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('notif.ago.hour', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('notif.ago.day', { n: days });
  return new Date(iso).toLocaleDateString('fr-FR');
}
