# Ventes — Historique — Banani → Next.js 16 / Tailwind v4

## Source

- Banani screen ID : `-03UWoquJIFS/screens/Ventes.jsx`
- Fetched : 2026-06-19 · desktop, layout liste (KPI + filtres + table).

## Structure map

- **Top bar** : « Ventes » + sous-titre + `ScreenTopActions`.
- **4 KPI** : CA aujourd'hui (accent) · Transactions · Sync en attente (warning) · Ventes à crédit. → `KpiCard` réutilisé.
- **Filtres** : recherche article/n° · période (Tout / Aujourd'hui) · segmenté moyen de paiement (Tous/Espèces/Mobile Money/Crédit) · compteur « N non synchronisées » (live).
- **Table** : N° · Date · Heure · Article · Qté · Total · Paiement (badge cash/mobile/credit) · Sync (icône `cloud` vert / `cloud-off` ambre).

## Component breakdown

- **NEW** `components/boutique/ventes/VentesManager.tsx` — KPIs + filtres + table, interactif.
- **REUSE** `KpiCard`, `TopBar`, `ScreenTopActions`, `Icon`, `formatFCFA`.

## Données factices (fixtures.ts)

- Types `SaleMethod`, `SaleTx` ; `saleMethods`, `saleMethodBadge`, `SALES_TODAY`, `salesSummary`, `salesTransactions` (12 ventes V-0892…V-0881).
- KPIs = `salesSummary` (totaux jour niveau appli, cohérents avec le dashboard 142 500 / 23) — le tableau n'affiche qu'un échantillon récent (cf. `stockSummary`).

## Interactions / état

- Recherche (article ou n°) + période (Tout/Aujourd'hui) + moyen de paiement → filtrent la table en direct.
- Compteur « non synchronisées » calculé sur la vue courante (icône `cloud-off`).
- État vide géré.

## Responsive plan (mobile-first)

- **Base (375px)** : KPI `grid-cols-1` ; filtres `flex-wrap` (recherche pleine largeur) ; table en scroll horizontal (`min-w-[820px]`).
- **sm (640px+)** : KPI `sm:grid-cols-2` ; recherche `sm:w-[260px]`.
- **xl (1280px+)** : KPI `xl:grid-cols-4` — fidèle Banani.

## Open questions / déviations

- Période par défaut = **« Tout l'historique »** (au lieu du libellé « Aujourd'hui » figé de Banani qui affichait pourtant toutes les dates) — sélecteur honnête. Dis-moi si tu préfères le défaut « Aujourd'hui ».
- Icônes sync : `cloud`/`cloud-off` (au lieu de `cloud-check` non garanti dans Lucide) — métaphore cloud conservée.
