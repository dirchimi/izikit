# Banani implementation status — Sahilley Boutique

Flow Banani : « Sahilley Boutique Offline » (`-03UWoquJIFS`) — 10 écrans, gestion de boutique.
Stack cible : Next.js 16 App Router + Tailwind v4 + DM Sans. Données factices (UI-first).
Monnaie : FCFA (XOF, entiers). Langue : français.

Last updated: 2026-06-19

## Décisions cadrées (user)
- **UI d'abord, données factices** — backend métier (Produit/Vente/Facture/Dépense/Client/Stock) à créer plus tard, écran par écran.
- **Shell + Dashboard d'abord**, validation, puis écran par écran.
- **Offline = juste le nom** → app cloud standard (pas de PWA/sync).
- **FCFA, FR, dashboard connecté** (gating auth activé plus tard, voir note).

## Done
- [x] `shell` — `(app)/layout.tsx` + `AppShell` + `SidebarNav` + `TopBar` — responsive (sidebar desktop / drawer mobile)
- [x] `dashboard` — `src/app/(app)/dashboard/page.tsx` — plan: `dashboard.md` — KPIs, graphe hebdo, alertes stock, ventes récentes. Vérifié : format/lint/typecheck/build OK, /dashboard → 200.
- [x] socle design — `globals.css` (@theme Banani), DM Sans, `lang=fr`, `/` → `/dashboard`

## In progress
- (rien — round 1 UI terminé, voir phase data ci-dessous)

## Done (suite)
- [x] `vendre` (POS) — `src/app/(app)/vendre/page.tsx` + `components/boutique/pos/{VendrePos,ProductCard,CartLine}.tsx`
  — **interactif** (données factices) : recherche + filtres catégories, clic produit → panier, steppers qté,
  choix mode de paiement, sélecteur client débiteur (crédit), total calculé, « Valider la vente » → toast.
  TopBar étendu (slot `actions`). Vérifié : lint/typecheck/build OK, `/vendre` → 200.
- [x] `stock` — `src/app/(app)/stock/page.tsx` + `components/boutique/stock/{StockManager,AddProductForm}.tsx`
  — **interactif** : 4 KPI (low/rupture calculés en direct), recherche + filtre catégorie + segmenté
  Tous/Faible/Rupture, table produits, **ajout de produit fonctionnel** (réf auto, statut dérivé) → toast.
  Composant partagé `ScreenTopActions` (badge offline + langue) extrait et réutilisé par Vendre + Stock.
  Vérifié : lint/typecheck/build OK, `/stock` → 200.
- [x] `depenses` — `src/app/(app)/depenses/page.tsx` + `components/boutique/depenses/{DepensesManager,AddExpenseForm}.tsx`
  — **interactif** : 4 KPI calculés (total mois, aujourd'hui, transactions, plus grosse charge), recherche +
  filtre période (Ce mois / Aujourd'hui) + catégorie, table, **ajout de dépense fonctionnel** (N° auto) → toast.
  KPI `StockKpiCard` généralisé en `components/boutique/KpiCard.tsx` (partagé Stock + Dépenses).
  Vérifié : lint/typecheck/build OK, `/depenses` → 200.
- [x] `creances` (clients débiteurs) — `src/app/(app)/creances/page.tsx` +
  `components/boutique/creances/{CreancesManager,RepaymentForm}.tsx` — plan : `creances.md`
  — **maître-détail interactif** : liste débiteurs (recherche nom/tél) + sélection → fiche client ;
  bandeau total (Σ dettes) et 3 cartes synthèse (`KpiCard` réutilisé) recalculés en direct ;
  table historique des achats à crédit (statut Remboursé/Partiel/Dû) ; **remboursement fonctionnel**
  (`applied = min(montant, dette)`, décrémente la dette, incrémente le remboursé) → toast ;
  CTA d'en-tête → focus du champ montant (`forwardRef`). Vérifié : format/lint/typecheck OK, `/creances` → 200.
- [x] `documents` (Factures **et** Proformas) — `src/app/(app)/documents/page.tsx` +
  `components/boutique/documents/{DocumentsManager,DocumentPreview}.tsx` — plan : `documents.md`
  — **une seule route à onglets** (les 2 écrans Banani = même écran, onglet inversé ; 1 entrée sidebar).
  Onglets Factures/Proformas → bascule liste **et** aperçu ; recherche + chips statut (dérivés des données) ;
  `DocumentPreview` unique rend FACTURE ou PROFORMA via `kind` (titre, FACTURÉ À/DESTINATAIRE, validité,
  Total/Total estimé, note de pied). Lignes somment aux montants Banani (`docTotal`). Partager/Imprimer → toast.
  Vérifié : format/lint/typecheck OK, `/documents` → 200.
- [x] `parametres` — `src/app/(app)/parametres/page.tsx` +
  `components/boutique/parametres/{ParametresManager,BoutiqueInfoForm,UsersSection}.tsx` — plan : `parametres.md`
  — sous-nav réglages interactive (Boutique/Facturation/Devise/Langue/Utilisateurs/Mobile Money/Sync) ;
  section Boutique = **formulaire infos boutique contrôlé** (Enregistrer → toast) + carte **Utilisateurs** ;
  sections non designées → placeholder « bientôt ». Route `/parametres` (≠ `/settings` auth izikit), déjà câblée
  dans `SidebarNav`. Vérifié : format/lint/typecheck OK, `/parametres` → 200.
- [x] `ventes` (historique) — `src/app/(app)/ventes/page.tsx` + `components/boutique/ventes/VentesManager.tsx`
  — plan : `ventes.md` — 4 KPI (`KpiCard`), filtres recherche + période (Tout/Aujourd'hui) + moyen de paiement,
  table 12 ventes (badge paiement, sync `cloud`/`cloud-off`), compteur « non synchronisées » live.
  Vérifié : format/lint/typecheck OK, `/ventes` → 200.
- [x] `rapports` — `src/app/(app)/rapports/page.tsx` +
  `components/boutique/rapports/{RapportsManager,ReportBarChart}.tsx` — plan : `rapports.md`
  — sélecteur de période, 5 KPI (`KpiCard`, dont marge `FCFA · 25 %`), graphe barres CSS (pic Ven), top produits,
  note de synchro. Bouton « Exporter en PDF » via slot `extra` de `ScreenTopActions`. `KpiCard.sublabel` élargi
  à `ReactNode`. Vérifié : format/lint/typecheck OK, `/rapports` → 200.

> 🎉 **Les 10 écrans du flux Banani sont reproduits** (Dashboard, Vendre, Ventes, Stock, Créances, Dépenses,
> Documents [Factures + Proformas], Rapports, Paramètres). Round 1 UI terminé.

## Landing (page d'accueil publique)
- [x] `landing` — `app/page.tsx` (remplace l'ancien `redirect('/dashboard')`) +
  `components/boutique/landing/{LandingPage,DashboardPreview,SectionHeading}.tsx` — plan : `landing.md`
  — reproduction fidèle du design Banani **+ améliorations** : mobile-first (design desktop-only à l'origine),
  CTAs câblés (`/inscription` + `/connexion`), header sticky + ancres + smooth-scroll, badge « Populaire »,
  hover/focus/a11y, aperçu dashboard responsive. 100 % server components (SEO). L'app reste sous `/dashboard`.
  Vérifié : format/lint/typecheck OK, `/` → 200.

## Auth (hors flux boutique — CÂBLÉ AU VRAI BACKEND, pas de données factices)
- [x] `connexion` + `inscription` + `verifier-email` — `app/{connexion,inscription,verifier-email}/page.tsx` +
  `components/boutique/auth/{AuthShell,GoogleButton,LoginForm,SignupForm,VerifyEmailForm,styles}` — plan : `auth.md`
  — design Banani « Connexion » reproduit, **e-mail** (au lieu du tél +235 du design car le backend izikit est e-mail),
  **bouton Google** ajouté. Câblé sur `/api/auth/{login,signup,verify-email}` + OAuth Google ; flux signup → vérif
  par code 8 car. → dashboard ; erreurs traduites FR par `err.code`. Vérifié : format/lint/typecheck OK, les 3 → 200.
  Suites : page « mot de passe oublié », « se souvenir » cosmétique, Google actif si `GOOGLE_*` configuré,
  `useUser()` à pointer vers `/connexion` au moment du gating.

## Internationalisation (FR / EN / AR + RTL)
- [x] Switcher de langue **fonctionnel sur toutes les pages** — plan : `.planning/i18n.md`
  — système cookie + contexte (`lib/i18n/*`, `contexts/LocaleContext.tsx`, `components/boutique/LanguageSwitcher.tsx`,
  `app/layout.tsx` async lang/dir). FR par défaut, **EN et AR complets**. Tout le chrome traduit (menus, titres,
  KPI, tableaux, boutons, statuts, paiements, rôles, toasts) ; les **données** (noms produits/clients, catégories)
  restent telles quelles. Vérifié : format/lint/typecheck OK, rendu EN+AR confirmé sur les 11 surfaces
  (cookies `app-locale=en` / `=ar`).
- [x] **RTL arabe** — `dir(locale)` posé sur `<html>` ; utilitaires Tailwind physiques convertis en logiques
  (`ms/me`, `ps/pe`, `border-s/e`, `text-start/end`, `start/end`) sur les ~25 composants ; flèche directionnelle
  en `rtl:rotate-180`. Chaque surface rendue en `lang="ar" dir="rtl"` ; FR/EN restent `dir="ltr"`.
- [x] **Police arabe Tajawal** — `next/font` (`--font-tajawal`), branchée en `html[lang='ar']` (FR/EN = DM Sans).
- [x] **Correctif `common.fcfa`** — clé manquante au dictionnaire (rendue en littéral partout où un montant
  s'affiche) → ajoutée (`FCFA` / `FCFA` / `فرنك`). Vérifié : 0 littéral, 25× FCFA (FR/EN) / 25× فرنك (AR) par écran.

## Thème (clair / sombre) — plan : `.planning/theme.md`
- [x] Mode nuit **fonctionnel** — système cookie (`app-theme`) + classe `dark` sur `<html>` (posée au SSR → pas de
  flash). `lib/theme/*`, `contexts/ThemeContext.tsx`, `components/boutique/ThemeToggle.tsx`. Le bouton Clair/Sombre
  de la TopBar (auparavant visuel) est câblé et présent partout : TopBar par défaut, `ScreenTopActions`
  (écrans métier), header de la **landing** et écrans d'**auth**. Palette sombre dérivée des tons Banani via
  surcharge des tokens `--color-*` sous `html.dark` dans `globals.css` — aucun composant n'a de variante `dark:`
  (tout suit par variables CSS). Le **footer de la landing** (ex-`bg-foreground` qui s'inversait) est figé sur la
  palette `sidebar` (vert foncé constant). Vérifié : `html.dark` togglé par cookie, footer `bg-sidebar`,
  format/lint/typecheck OK.

> ⚠️ Gotcha vérif : lancer `pnpm build` (prod) PUIS `pnpm dev` sur le même `.next` fait 404 toutes les
> routes. Nettoyer `.next` (`Remove-Item -Recurse -Force frontend/.next`) avant de relancer le dev.

## Pending (vus dans Banani, pas encore implémentés)
- (aucun — les 10 écrans Banani sont faits ✅)

## Phase suivante (data — quand tu veux)
Brancher le backend métier : modèles Prisma (Produit, Vente, Facture/Proforma, Dépense, Client/Créance,
Remboursement, Utilisateur) + routes `/api/*`, puis remplacer `src/lib/boutique/fixtures.ts` par les vraies
données. Activer le gating auth sur `(app)/layout`. Câbler les actions encore en toast (WhatsApp, Imprimer,
Export PDF, upload logo, ajout utilisateur).

## Composants partagés (à extraire une fois, réutilisés partout)
- `src/components/ui/Icon.tsx` — wrapper Lucide (prop `i` = nom kebab)
- `src/components/boutique/SidebarNav.tsx` — nav latérale (active via `usePathname`)
- `src/components/boutique/AppShell.tsx` — shell responsive (sidebar desktop + drawer mobile)
- `src/components/boutique/TopBar.tsx` — barre de titre (title/subtitle/actions)
- `src/components/boutique/StatCard.tsx` — carte KPI
- `src/components/boutique/RecentSaleRow.tsx` — ligne de vente récente
- `src/components/boutique/StockAlertRow.tsx` — ligne d'alerte stock
- `src/components/boutique/MiniBarChart.tsx` — mini graphe barres (CSS)

## Notes / dette
- **Auth gating** : `(app)/layout` ne force PAS encore le login (phase UI, pour visualisation). À activer via `useUser()` quand les pages auth existeront.
- **i18n** : le switcher FR/EN/AR est **fonctionnel** (FR/EN/AR + RTL). Seul le toggle Clair/Sombre de la TopBar reste visuel.
- **Données** : `src/lib/boutique/fixtures.ts` (placeholder). À remplacer par les routes `/api/*` métier.

## Open design questions
- (aucune bloquante — validées au cadrage)
