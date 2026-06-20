# Rapports — Banani → Next.js 16 / Tailwind v4

## Source

- Banani screen ID : `-03UWoquJIFS/screens/Rapports.jsx`
- Fetched : 2026-06-19 · desktop, layout analytique.

## Structure map

- **Top bar** : « Rapports » + sous-titre + **bouton « Exporter en PDF »** + `ScreenTopActions`.
  → ScreenTopActions reçoit un slot `extra` (bouton inséré entre badge offline et switcher langue).
- **Sélecteur de période** : Aujourd'hui / Semaine (actif) / Mois / Année / Personnalisé + plage de dates (activée si « Personnalisé »).
- **5 KPI** : Chiffre d'affaires (accent) · Ventes · Marge brute (`FCFA · 25 %`, % en vert) · Dépenses (warning) · Bénéfice net estimé (danger, négatif). → `KpiCard` réutilisé.
- **Graphe barres** « Évolution des ventes » (7 jours, pic Ven mis en avant) + **Top produits** (5, rang 1 en vert).
- **Note** info (données locales, sync en attente).

## Component breakdown

- **NEW** `components/boutique/rapports/RapportsManager.tsx` — sélecteur période + KPIs + graphe + top produits + note.
- **NEW** `components/boutique/rapports/ReportBarChart.tsx` — mini graphe barres CSS (hauteur dynamique en `style`, seule exception justifiée).
- **MODIF** `KpiCard` — `sublabel` élargi à `ReactNode` (pour « FCFA · 25 % » avec le % coloré). Rétrocompatible.
- **MODIF** `ScreenTopActions` — slot optionnel `extra` (bouton Export PDF).
- **REUSE** `TopBar`, `Icon`, `formatFCFA`.

## Données factices (fixtures.ts)

- `reportPeriods`, `reportSummary` (CA 844 200 / 138 ventes / marge 213 500·25 % / dépenses 231 400 / net -17 900),
  `reportBars` (+`reportBarsMax`, `reportPeakIndex`), `reportTopProducts` (5). Types `ReportBar`, `TopProduct`.

## Interactions / état

- Période → état actif visuel ; « Personnalisé » active la plage de dates (sinon `opacity-40 pointer-events-none`).
- Export PDF / switchers → toast / visuel (non câblés ce round).
- KPIs/graphe = valeurs fixes de la semaine (pas de jeu de données par période designé).

## Responsive plan (mobile-first)

- **Base (375px)** : période en bande scrollable (`overflow-x-auto`, boutons `shrink-0`) ; KPI `grid-cols-1` ;
  graphe + top produits empilés (`flex-col`) ; graphe pleine largeur.
- **sm (640px+)** : KPI `sm:grid-cols-2`.
- **lg (1024px+)** : graphe + top produits côte à côte (`lg:flex-row`, top `lg:w-[380px]`).
- **xl (1280px+)** : KPI `xl:grid-cols-5` — fidèle Banani.

## Open questions / déviations

- **Période = sélecteur visuel** (KPIs/graphe constants) faute de données par période designées. Dis-moi si tu veux des jeux distincts (jour/mois/année).
- **Export PDF** = toast pour l'instant (génération réelle avec la phase data).
