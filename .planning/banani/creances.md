# Créances — Clients débiteurs — Banani → Next.js 16 / Tailwind v4

## Source

- Banani screen ID : `-03UWoquJIFS/screens/Creances.jsx`
- Fetched : 2026-06-19
- Type : desktop, layout **maître-détail** (liste à gauche, fiche client à droite)

## Structure map

- **Top bar** — titre « Créances » + sous-titre + badge offline + FR/AR/EN (`ScreenTopActions`).
- **Pane gauche (380px)** :
  - Bandeau total (`bg-primary`) : total créances en cours (Σ dettes) + nombre de débiteurs.
  - Recherche client.
  - Liste des débiteurs : avatar + nom + dette (rouge) + téléphone + dernière vente. Ligne active = `bg-secondary`.
- **Pane droite (flex-1)** :
  - En-tête client : avatar + nom + « tél · client depuis … » + CTA « Enregistrer un remboursement ».
  - 3 cartes synthèse : Solde restant dû (danger) / Total acheté à crédit / Déjà remboursé (primary).
  - Table « Historique des achats à crédit » : Date / Article / Montant / Statut (Remboursé·cash, Partiel·credit, Dû·danger).
  - Formulaire de remboursement : Montant reçu / Mode de paiement / Note / Valider.

## Component breakdown

- **NEW** `components/boutique/creances/CreancesManager.tsx` — orchestrateur maître-détail (état liste + sélection + recherche), interactif.
- **NEW** `components/boutique/creances/RepaymentForm.tsx` — formulaire de remboursement contrôlé, `forwardRef` sur le champ montant (focus depuis le CTA d'en-tête), remonté par client via `key`.
- **REUSE** `KpiCard` — les 3 cartes synthèse (valueClass danger/primary).
- **REUSE** `TopBar` + `ScreenTopActions`, `Icon`, `useToast`, `formatFCFA`.

## Token mapping

Identique aux écrans précédents (tokens déjà dans `globals.css`) : `bg-primary`, `bg-secondary`/`text-secondary-foreground`, `bg-badge-cash/credit`, `bg-danger`/`text-danger`, `bg-muted`, `bg-input`, `bg-surface`, `bg-offline`.

## Données factices (fixtures.ts)

- Types `CreditStatus`, `CreditPurchase`, `Debtor` ; `creditStatusConfig`, `creditPaymentMethods`.
- `debtors` : 6 clients (C-01…C-06). Invariant : `total acheté à crédit = debt + repaid`, l'historique somme à ce total. Σ dettes = 108 000 FCFA (matche la maquette).

## Interactions / état

- Clic sur un débiteur → sélection → fiche de droite mise à jour.
- Recherche → filtre la liste (nom ou téléphone) ; la sélection persiste même si filtrée.
- Remboursement → `applied = min(montant, dette)`, décrémente `debt`, incrémente `repaid` → toast ; bandeau total + cartes recalculés en direct.
- CTA d'en-tête → focus sur le champ « Montant reçu ».
- États : liste vide (recherche), garde-fous montant ≤ 0 et dette nulle.

## Responsive plan (mobile-first)

- **Base (375px)** : colonnes empilées (`flex-col`) — bandeau + recherche + liste, puis fiche en dessous ; cartes synthèse `grid-cols-1` ; table en scroll horizontal (`min-w-[560px]`) ; formulaire `flex-col` ; en-tête `flex-col`.
- **sm (640px+)** : cartes synthèse `sm:grid-cols-3` ; en-tête `sm:flex-row`.
- **lg (1024px+)** : deux panes côte à côte (`lg:flex-row`, liste `lg:w-[380px] lg:border-r`) ; formulaire `lg:flex-row lg:items-end` — fidèle à la maquette Banani.

## Implementation checklist

- [x] Fixtures (6 débiteurs cohérents)
- [x] `RepaymentForm` (forwardRef, contrôlé)
- [x] `CreancesManager` (maître-détail interactif)
- [x] Page `(app)/creances/page.tsx`
- [x] Réutilisation `KpiCard`
- [ ] lint / typecheck / build
- [ ] Vérif runtime 200 + check 375 / 768 / 1280

## Open questions for user

- Aucune bloquante (UI-first, données factices, validé au cadrage). Le câblage backend (modèle `Debtor`/`CreditSale`/`Repayment`) viendra avec la phase data.
