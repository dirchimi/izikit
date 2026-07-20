/**
 * Task 1.5 — pure decision function behind AppShell's client-side auth guard.
 *
 * Why this exists: today `(app)/layout.tsx` (a server component) is the only
 * auth gate — it runs `verifyToken(cookie)` and redirects to `/connexion`
 * before rendering `AppShell`. That's correct online, but once the service
 * worker starts serving the cached `(app)` shell HTML while offline (Phase
 * 6.1), the server component does NOT run, so there is no authority left to
 * decide whether the shell should render. `AppShell` needs its own client
 * guard built on `useAuth()`/`useUser()` (see AuthContext.tsx) to cover that
 * case — this helper is the branching logic factored out so it's unit
 * testable without a React render harness (the repo has none, see
 * session.test.ts / pull.test.ts for the pattern used instead).
 *
 * Mirrors `useUser()`'s own condition (`loading || !user` => don't render
 * the protected content) but splits it into two distinct UI states:
 *   - 'loading'  → auth status not resolved yet (online fetch in flight, or
 *                  the offline-session lookup in AuthContext's effect not
 *                  done yet) → show a neutral loader, not the app shell.
 *   - 'redirect' → resolved, no user → `useUser(redirectTo)` is already
 *                  triggering `router.replace` as a side effect; render
 *                  nothing (never the shell) while that happens.
 *   - 'ready'    → resolved with a user (online session OR a non-expired
 *                  offline snapshot from a prior real login, see
 *                  `lib/offline/session.ts`) → render the shell.
 *
 * `user` is typed `unknown` on purpose: this helper only needs truthiness,
 * and keeping it decoupled from the `User` type avoids a dependency on
 * AuthContext.tsx (a file this task must not touch) for a one-line check.
 */
export type AuthGateState = 'loading' | 'redirect' | 'ready';

export function authGateState(loading: boolean, user: unknown): AuthGateState {
  if (loading) return 'loading';
  if (!user) return 'redirect';
  return 'ready';
}
