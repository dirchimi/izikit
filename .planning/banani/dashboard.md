# Dashboard Principal — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen: `-03UWoquJIFS/screens/Dashboard.jsx` (genType=components)
- Fetched: 2026-06-19

## Structure map
- **Shell** : `SidebarNav` (gauche, vert foncé) + zone principale.
- **TopBar** : titre « Tableau de bord » + date, switchers langue/thème, CTA « Nouvelle vente ».
- **KPI row** : 4 `StatCard` (CA du jour [accent], Ventes, Créances, Dépenses).
- **Middle row** : graphe « Ventes de la semaine » (`MiniBarChart`) + panneau « Alertes stock » (5 `StockAlertRow`).
- **Ventes récentes** : table (en-tête + 6 `RecentSaleRow`) avec statut de sync.

## Token mapping (Banani → projet)
Le bloc `@theme` de Banani est repris tel quel dans `globals.css` (Tailwind v4). Couleurs clés :
- `--color-primary: #0E9F6E` (vert) · `--color-sidebar: #0A3D2E` · `--color-background: #FAF8F3` (crème)
- badges paiement : cash (vert), mobile (bleu), credit (ambre)
- police : DM Sans (`--font-body`/`--font-headings`) via `next/font/google`

## Composants (tous extraits dans `src/components/boutique/`)
- NEW `Icon` (`ui/Icon.tsx`) — wrapper Lucide, prop `i`
- NEW `SidebarNav`, `AppShell`, `TopBar`, `StatCard`, `RecentSaleRow`, `StockAlertRow`, `MiniBarChart`

## Inline styles → Tailwind
- `width:220px` → `w-[220px]` · `minHeight:900px` → `min-h-screen`
- `width/height:32px` → `w-8 h-8` · chart `height:80px` → `h-20`, barres `height:Npx` → style dynamique (valeur calculée, OK car data-driven)
- `gridTemplateColumns: repeat(4,1fr)` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

## Responsive plan (mobile-first — design desktop only)
- **Base (<lg)** : sidebar cachée → header mobile avec hamburger ouvrant un **drawer**. KPI 1 col. Graphe + alertes empilés. Table ventes en `overflow-x-auto`.
- **sm (640+)** : KPI 2 col.
- **lg (1024+)** : sidebar fixe `w-[220px]`, KPI 4 col, graphe + alertes côte à côte — fidèle au mockup Banani.

## Données (placeholder)
`src/lib/boutique/fixtures.ts` — KPIs, ventes récentes, alertes stock, série hebdo + `formatFCFA()`.

## Interactions / états
- Sidebar : item actif via `usePathname()`. Drawer mobile : ouvre/ferme, overlay tap-to-close.
- TopBar switchers : visuels (non câblés) ce round.
- Touch targets ≥ 44px (nav, boutons).

## Checklist
- [ ] @theme + DM Sans + lang=fr
- [ ] Icon + composants partagés
- [ ] AppShell responsive + layout (app)
- [ ] Dashboard page + fixtures
- [ ] lint + build OK
- [ ] vérif 375 / 768 / 1280
