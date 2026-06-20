# Auth (Connexion + Inscription + Vérification) — Banani → Next.js 16, CÂBLÉ AU VRAI BACKEND

## Source

- Banani screen ID coché : `-03UWoquJIFS/screens/Connexion.jsx` (« Connexion »).
- Fetched : 2026-06-19 · desktop, carte centrée.
- **Particularité** : contrairement aux écrans boutique (UI-first / données factices), izikit ship **déjà
  toute l'auth**. Ces pages sont donc **réellement câblées** sur `/api/auth/*`.

## Décisions utilisateur

1. Construire **les deux** : Connexion (login) **+** Inscription assortie (même style).
2. **Email + câblage réel** (le design Banani utilisait le téléphone +235 ; remplacé par e-mail car le backend
   izikit authentifie par e-mail). Petit écart visuel assumé.
3. **Ajouter « Continuer avec Google »** (OAuth déjà implémenté côté serveur).

## Contrats backend utilisés

- `POST /api/auth/login` `{email,password}` → 200 + cookies. Codes : `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`
  (403 → on redirige vers la vérif), `LOCKED_OUT`, `ACCOUNT_SUSPENDED`, `TOO_MANY_LOGIN_ATTEMPTS`.
- `POST /api/auth/signup` `{email,password}` → 201 **identique que l'e-mail existe ou non** (anti-énumération,
  aucun cookie). Codes : `PASSWORD_BANNED/TOO_SHORT/PWNED`, `TOO_MANY_SIGNUP_ATTEMPTS`. → toujours vers la vérif.
- `POST /api/auth/verify-email` `{email,code}` (code 8 car. Crockford) → 200 + cookies → dashboard.
- `GET /api/auth/oauth/google/start?next=/dashboard` (navigation top-level via `<a>`).
- Wrapper `@/lib/api` (CSRF auto, refresh 401, retry GET-only) + `useAuth().refresh()` après login/verify.

## Pages & composants

- `app/connexion/page.tsx` → `LoginForm` (email, mot de passe + œil, se-souvenir, mot de passe oublié → toast, Google, lien inscription).
- `app/inscription/page.tsx` → `SignupForm` (email, mot de passe + confirmation, Google, lien connexion) → `/verifier-email`.
- `app/verifier-email/page.tsx` → `VerifyEmailForm` (email + code 8 car., auto-submit si `?email=&code=`), `<Suspense>` (useSearchParams).
- Partagés `components/boutique/auth/` : `AuthShell` (carte + logo + sélecteur langue, **serveur**), `GoogleButton`, `styles.ts`.
- Messages d'erreur **traduits en français** par `err.code` (pas par message serveur anglais).

## Flux

Inscription → 201 → `/verifier-email?email=…` → saisie du code → cookies + `refresh()` → `/dashboard`.
Connexion → cookies + `refresh()` → `/dashboard` ; si `EMAIL_NOT_VERIFIED` → `/verifier-email`.

## Responsive

Mobile-first : carte `max-w-[420px]` pleine largeur < 420px, paddings `px-6 → sm:px-10`. Sélecteur de langue
masqué < sm. Pas de sidebar (pages hors groupe `(app)`).

## Vérifié

format ✅ lint ✅ typecheck ✅ · `/connexion` `/inscription` `/verifier-email` → 200.

## Déviations / suites

- **Téléphone → e-mail** : champ e-mail au lieu du +235 du design (contrainte backend). Auth par téléphone =
  build backend custom (phase data) si souhaité.
- **« Mot de passe oublié ? »** → toast pour l'instant (page `/api/auth/forgot-password` existe côté serveur ;
  page UI à faire — réf : `examples/frontend-pages/forgot-password.tsx`).
- **« Se souvenir de moi »** = cosmétique (le refresh token est fixé à 7 j côté serveur).
- **Google** actif uniquement si `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` configurés (sinon la route redirige vers `/auth/error`).
- **Longueur mot de passe** : `minLength={8}` côté UI, mais le serveur applique `AUTH_PASSWORD_MIN_LENGTH` (défaut **10**) ; le message serveur est affiché si trop court.
- **Gating** : `useUser()` redirige par défaut vers `/login` — passer `/connexion` quand tu activeras le gating sur `(app)/layout`.
