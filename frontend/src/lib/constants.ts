// Monolith: the API lives in the same Next.js app under /api/*, so the
// default is an empty string (same-origin / relative fetch). Override only
// for rare cross-origin setups (e.g. a mobile client hitting a hosted
// instance). The legacy `http://localhost:4000` default was a leftover from
// the pre-monolith era when the backend ran as a separate Express server.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const COOKIE_PREFIX = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? 'app';

// Marqueur « a ouvert l'app récemment », posé côté client par AppShell à
// chaque visite d'un écran boutique (max-age 72 h, ré-armé à chaque visite).
// Le header marketing (MarketingHeader) ne montre « Mon tableau de bord »
// que si ce cookie est présent : au-delà de 72 h sans ouvrir l'app, la
// landing redevient la vitrine normale (Se connecter / Essai gratuit) même
// si la session, elle, reste techniquement valable — elle doit le rester
// pour le mode hors-ligne (fenêtre glissante de 7 jours).
export const RECENT_APP_COOKIE = `${COOKIE_PREFIX}-recent-app`;
export const RECENT_APP_MAX_AGE_S = 72 * 60 * 60;
