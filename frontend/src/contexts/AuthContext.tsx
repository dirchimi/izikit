'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearCsrfToken, storeCsrfToken } from '@/lib/api';
import { invalidateCachePrefix } from '@/lib/useApi';
import { COOKIE_PREFIX } from '@/lib/constants';
import {
  saveSession,
  loadSession,
  clearSession,
  type SessionSnapshot,
} from '@/lib/offline/session';

export interface User {
  id: string;
  email: string;
  /** Nom affiché choisi par l'utilisateur (null → on retombe sur l'e-mail). */
  name: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** false when the account was created via OAuth and never set a password. */
  hasPassword: boolean;
  /** Provider names already linked, e.g. ['google']. Empty for pure email/password accounts. */
  linkedProviders: string[];
  /** ISO timestamp set when the welcome/onboarding modal was first dismissed.
   *  null = never onboarded → show the first-run welcome once. */
  onboardedAt: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loggingOut: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Builds a minimal `User` from a persisted offline snapshot (Task 1.4).
 * Only identity fields are trustworthy offline — `hasPassword` /
 * `linkedProviders` / `emailVerifiedAt` default to safe placeholders
 * (`false` / `[]` / `null`) rather than stale guesses, since settings-page
 * actions that read them require a network round-trip anyway.
 * `createdAt`/`updatedAt` reuse `savedAt` (the last time we had a
 * confirmed network answer) as the closest available approximation.
 */
function snapshotToUser(snap: SessionSnapshot): User {
  const savedAtIso = new Date(snap.savedAt).toISOString();
  return {
    id: snap.userId,
    email: snap.email ?? '',
    name: snap.name,
    emailVerifiedAt: null,
    createdAt: savedAtIso,
    updatedAt: savedAtIso,
    hasPassword: false,
    linkedProviders: [],
    onboardedAt: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ user: User; csrfToken?: string }>('/api/auth/me');
      setUser(res.user);
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      // Task 1.4: refresh the offline snapshot on every successful online
      // check — this is what makes the 7-day offline window "sliding"
      // rather than a fixed expiry from first login. `/api/auth/me` today
      // doesn't return org/role, so those stay null (identity/boot only,
      // not authorization). Best-effort: a persistence failure (e.g.
      // IndexedDB unavailable in private browsing) must not break login.
      try {
        await saveSession({
          userId: res.user.id,
          orgId: null,
          role: null,
          name: res.user.name,
          email: res.user.email,
        });
      } catch {
        // ignore — offline boot just degrades to "requires reconnect" later
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many requests. Wait a few minutes and try again.');
      } else if (err instanceof ApiError && err.status === 0) {
        // Task 1.4: the request never reached the server (offline / network
        // failure — `api()` in lib/api.ts sets status=0 for this case, see
        // its catch block). Fall back to the persisted offline session
        // instead of forcing a logout; if there's no valid snapshot, surface
        // the same "cannot reach server" message as before.
        const snap = await loadSession().catch(() => null);
        if (snap) {
          setUser(snapshotToUser(snap));
        } else {
          setError(err.message || 'Cannot reach the server. Check your network and try again.');
        }
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Cannot reach the server. Check your network and try again.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip /me for anonymous visitors — the JS-readable CSRF cookie is only
    // set after login, so its absence is a reliable "no session" signal.
    const csrfCookieName = `${COOKIE_PREFIX}-csrf`;
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${csrfCookieName}=`));
    if (!hasCookie) {
      setLoading(false);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Task 1.4 (offline boot): don't even attempt the network call — go
      // straight to the persisted offline session (7-day sliding window).
      // No redirect-to-login on a miss: `loading` simply flips to false
      // with `user` still null, same as today's logged-out path, and
      // `useUser` redirects from there.
      void (async () => {
        const snap = await loadSession().catch(() => null);
        if (snap) setUser(snapshotToUser(snap));
        setLoading(false);
      })();
      return;
    }
    void fetchUser();
    // Run once on mount; fetchUser is stable.
  }, []);

  const logout = useCallback(async () => {
    // Garde hors-ligne (défense en profondeur — l'UI SidebarNav explique déjà
    // via un toast) : sans réseau, la révocation serveur ne peut pas partir ;
    // effacer quand même la session offline + les caches rendrait toute
    // re-connexion impossible jusqu'au retour du réseau (piège sur un
    // téléphone de boutique). On ne détruit rien tant qu'on est hors ligne.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — cookie will expire anyway
    }
    clearCsrfToken();
    // Task 1.4: drop the persisted offline session too — shared-device
    // hygiene, same reasoning as the CLEAR_CACHE message below (no leaking
    // the previous account's identity into the next offline boot).
    await clearSession().catch(() => {
      // ignore — best-effort, the cookie clear above already ends the session
    });
    invalidateCachePrefix('/api/');
    // Purge le cache de données du service worker (téléphone partagé : pas de
    // fuite des données entre comptes). Best-effort, jamais bloquant.
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
    setUser(null);
    setLoggingOut(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loggingOut, error, refresh: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

const SSR_STUB: AuthContextValue = {
  user: null,
  loading: true,
  loggingOut: false,
  error: null,
  refresh: async () => {},
  logout: async () => {},
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}

/**
 * Auth-required helper — returns the user, or redirects to the configured
 * login path if logged out. Use on pages that require an authenticated
 * session so each page doesn't reimplement the same `if (!user) router.push`.
 *
 *   export default function DashboardPage() {
 *     const user = useUser();         // never null inside the body
 *     if (!user) return null;         // null while redirecting / loading
 *     return <div>Hello {user.email}</div>;
 *   }
 *
 * Default redirect target is `/login`; override via the `redirectTo` arg.
 * Returns `null` while loading OR while the redirect is in flight, so the
 * UI can render a stub. Use the `loading` field of useAuth() if you want
 * to render a spinner explicitly.
 */
export function useUser(redirectTo: string = '/login'): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(redirectTo);
    }
  }, [loading, user, redirectTo, router]);

  if (loading || !user) return null;
  return user;
}
