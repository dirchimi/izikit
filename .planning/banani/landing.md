# Landing Page (accueil public) — Banani → Next.js 16 / Tailwind v4

## Source

- Banani screen ID : `-03UWoquJIFS/screens/LandingPage.jsx` (« Landing Page — Sahilley »)
- Fetched : 2026-06-19 · desktop one-page marketing.
- Route : **`/`** — remplace l'ancien `redirect('/dashboard')`. L'app reste sous `/dashboard`.

## Structure (reproduite fidèlement)

Header (logo + nav + langue + CTA) · Hero (badge offline + H1 + sous-titre + 2 CTA + **aperçu dashboard**
faux-navigateur) · Le problème (3 pain points) · Fonctionnalités (4 cartes, 1 « hors-ligne » mise en avant) ·
Pourquoi nous (3 cartes) · Tarifs (Solo 3 500 / Boutique 7 500) · CTA final · Footer (marque + 3 colonnes + barre contact).

## Améliorations apportées (au-delà du design)

- **Mobile-first** : le design Banani était desktop-only (px-16, grilles fixes). Tout est responsive
  (`grid-cols-1 → sm:2 → lg:4`, paddings fluides, type `text-4xl → lg:text-[52px]`, conteneurs `max-w-6xl mx-auto`).
- **CTAs câblés** : tous les « Essai/Commencer/Créer » → `/inscription` ; « Se connecter » (ajouté au header) → `/connexion`.
- **Header sticky** + ancres de nav (`#fonctionnalites`, `#tarifs`, `#contact`) + `scroll-behavior: smooth` (globals.css).
- **Badge « Populaire »** sur le plan accentué ; hover/transition sur les cartes ; focus-visible ring sur les CTA ; landmarks sémantiques + `aria-label`.
- **Aperçu dashboard responsive** (sidebar masquée < sm, KPI `grid-cols-2 → lg:4`).
- Styles inline Banani (52px, maxWidth, grids, opacités) → utilitaires Tailwind ; hauteurs de barres dynamiques = seul `style` (comme le reste du projet).

## Composants

- `app/page.tsx` → `LandingPage` (+ metadata SEO).
- `components/boutique/landing/` : `LandingPage.tsx` (serveur, composition + données), `DashboardPreview.tsx`, `SectionHeading.tsx`.
- 100 % **server components** (statique, rapide, SEO) — aucun îlot client.

## Déviations / suites

- **Icônes réseaux sociaux** : `facebook`/`twitter` du design (marques retirées de Lucide récent) remplacés par
  `message-circle` (WhatsApp) / `mail` / `phone` — non-brand, sûrs.
- **Switcher langue** : visuel (non câblé, comme partout). Démo « Voir une démo » → ancre vers l'aperçu (`#apercu`).
- **Utilisateurs déjà connectés** : la landing reste publique pour tous (pas de redirect auto vers `/dashboard`) —
  à ajouter via un petit îlot client si souhaité.

## Vérifié

format ✅ lint ✅ typecheck ✅ · `/` → 200 (plus de redirect) · sections rendues · mobile-first.
