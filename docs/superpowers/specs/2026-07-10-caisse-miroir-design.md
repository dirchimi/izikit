# Caisse « miroir » — Phase 1 (affichage de l'argent encaissé)

**Date :** 2026-07-10
**Statut :** design validé (à relire avant plan d'exécution)
**Portée :** Phase 1 uniquement (affichage). La caisse pilotée = Phase 2 (hors scope).

## 1. Problème

Aujourd'hui l'app affiche le **chiffre d'affaires** (Σ `sale.total`) et le **bénéfice net**
(marge − dépenses). Ces deux chiffres comptent une vente **à l'instant où elle est faite,
même à crédit** — c'est de la compta à l'engagement (correct), mais le commerçant le lit
comme « l'argent que j'ai ».

Symptôme vécu : une **vente à crédit** fait monter CA et bénéfice, alors que **rien n'est
entré en caisse** (0 dans la main). L'app ne montre **nulle part** « l'argent réellement
encaissé », d'où la confusion.

## 2. Objectif Phase 1

Afficher clairement **l'argent réellement encaissé** (espèces + mobile) à côté du CA et du
bénéfice, plus « ce qu'on te doit encore ». **Aucune saisie** pour le commerçant : tout est
dérivé des données existantes. **Aucun changement de base de données.**

## 3. Ce qu'on calcule

Toutes les données existent déjà :
- `Sale` stocke `cashAmount` / `mobileAmount` / `creditAmount` (parts par mode) et `status`.
- `Repayment` (remboursement de créance) stocke `amount`, `method` (`CASH` | `MOBILE`),
  `createdAt`.
- Les créances en cours (`receivablesOpen`) sont déjà calculées sur le dashboard.

**Argent encaissé sur une période P** (ne compter que les ventes `status = ACTIVE`) :

```
encaisséEspèces(P) = Σ sale.cashAmount   (ventes ACTIVE dans P)
                   + Σ repayment.amount  (method = CASH,   dans P)

encaisséMobile(P)  = Σ sale.mobileAmount (ventes ACTIVE dans P)
                   + Σ repayment.amount  (method = MOBILE, dans P)

encaisséTotal(P)   = encaisséEspèces(P) + encaisséMobile(P)

créditAccordé(P)   = Σ sale.creditAmount (ventes ACTIVE dans P)   // vendu à crédit sur P
```

**En attente (ce qu'on te doit)** = `receivablesOpen` = Σ (`amount` − `amountPaid`) des
créances non annulées — **cumul tout temps**, pas seulement la période (c'est le « total
qu'on te doit » utile au commerçant). Déjà calculé.

> Décision clé : « encaissé » inclut **les remboursements de créances**, pas seulement les
> ventes payées. Sinon, le jour où un client rembourse une vieille dette en espèces, le
> chiffre « encaissé » ne bougerait pas alors que la caisse réelle si → on recréerait la
> confusion à l'envers.

## 4. Où l'afficher

### a. Tableau de bord ([DashboardManager](../../../frontend/src/components/boutique/DashboardManager.tsx))
Nouveau bloc **« Argent encaissé aujourd'hui »** :
- 💵 Espèces = `encaisséEspèces(aujourd'hui)`
- 📱 Mobile money = `encaisséMobile(aujourd'hui)` (affiché discrètement / 0 si non utilisé)
- ⏳ En attente = `receivablesOpen` (déjà présent, ré-étiqueté)

### b. Rapports ([RapportsManager](../../../frontend/src/components/boutique/rapports/RapportsManager.tsx))
Dans le résumé de la période (today / semaine / mois / année / plage libre), ajouter :
- 💵 Encaissé espèces · 📱 Encaissé mobile · (Σ = encaissé total)
- Crédit accordé sur la période (`créditAccordé(P)`)

### c. Clarification des libellés (les deux écrans)
- **« Chiffre d'affaires »** → sous-texte « *valeur vendue, crédit inclus* »
- **« Bénéfice net »** → sous-texte « *gagné sur les ventes (pas forcément encore encaissé)* »

## 5. Changements de code (aucun schéma)

- **[compute.ts](../../../frontend/src/lib/server/reports/compute.ts)** — étendre `ReportSummary`
  avec `collectedCash`, `collectedMobile`, `creditGranted`. Sommer `cashAmount` / `mobileAmount`
  / `creditAmount` sur les ventes déjà chargées ; ajouter un `repayment.aggregate` (par méthode,
  sur la fenêtre) au `Promise.all`.
- **[api/reports/route.ts](../../../frontend/src/app/api/reports/route.ts)** — expose les
  nouveaux champs (dérivés de `computeReport`, rien à ajouter si le résumé les porte).
- **[api/dashboard/route.ts](../../../frontend/src/app/api/dashboard/route.ts)** — renvoyer
  `collectedCash` / `collectedMobile` pour « aujourd'hui » (depuis `computeReport('today')`).
- **[DashboardManager](../../../frontend/src/components/boutique/DashboardManager.tsx)** +
  **[RapportsManager](../../../frontend/src/components/boutique/rapports/RapportsManager.tsx)**
  — nouveaux blocs d'affichage + sous-textes.
- **[dictionary.ts](../../../frontend/src/lib/i18n/dictionary.ts)** — nouvelles clés i18n
  (fr/en/ar) : encaissé, espèces, mobile, en attente, crédit accordé, sous-textes CA/bénéfice.
- **Rôle :** ADMIN (Patron/Manager), comme le dashboard actuel. Le PDF de rapport
  ([reports/pdf.tsx](../../../frontend/src/lib/server/reports/pdf.tsx)) peut afficher l'encaissé
  aussi (optionnel, à confirmer au moment du plan).

## 6. Hors scope (Phase 2 — plus tard)

Vraie caisse pilotée : fond de caisse d'ouverture, entrées/sorties manuelles (retrait perso…),
clôture de caisse en fin de journée (comparaison théorique vs compté). Nécessitera de nouveaux
modèles (`CashSession` / `CashMovement`). **Pas dans cette phase.**

## 7. Tests

- **[reports/helpers.test.ts](../../../frontend/src/lib/server/reports/helpers.test.ts)** /
  nouveau test de `computeReport` : une vente mixte (espèces + mobile + crédit) →
  `collectedCash` / `collectedMobile` / `creditGranted` corrects, et un remboursement compté
  dans l'encaissé de la bonne méthode.
- Vérifier qu'une vente **CANCELLED** ne compte pas dans l'encaissé.
- Gate habituel : `format && lint && typecheck && test`.

## 8. Résultat attendu (exemple)

Vente à crédit de 10 000 (achat 6 000) :
- CA **+10 000** · Bénéfice **+4 000** · Encaissé **+0** · En attente **+10 000**.

Le commerçant voit enfin, côte à côte : « j'ai **vendu** 10 000, mais **encaissé** 0, on me
**doit** 10 000 ». Confusion résolue.
