# Sahilley — Roadmap d'implémentation (frontend → backend métier)

> **Document maître.** Stratégie + découpage par sous-système. Chaque phase
> donnera lieu à un plan TDD détaillé (bite-sized) au moment de l'exécuter,
> via `superpowers:writing-plans` puis `superpowers:subagent-driven-development`.

**Goal:** Transformer la vitrine UI actuelle (13 écrans branchés sur des
fixtures) en un vrai SaaS de gestion de boutique multi-utilisateurs, en
branchant chaque écran sur un backend métier réel.

**Architecture:** Monolithe Next.js 16 existant. On ajoute les modèles
métier dans Prisma, des Route Handlers `/api/*` (pattern `requireAuth` +
`requireOrgRole` + `verifyCsrf` + `withRequestContext`), et on remplace les
imports de `fixtures.ts` par des appels `api()`. Chaque ressource métier est
**org-scopée** (multi-tenant).

**Tech Stack:** Next.js 16 App Router · Prisma 5 / Neon Postgres · TypeScript
strict · Vitest · Tailwind v4 · i18n maison (FR/EN/AR) · Bictorys/Moneroo
(paiements) · Resend · Sentry.

## Global Constraints (copiés des invariants du repo — CLAUDE.md)

- **Marché v1 : Tchad / CEMAC.** Devise **XOF→XAF** (FCFA, **entier**, zéro
  décimale). Indicatif **+235**. Aligner landing + fixtures résiduelles.
- **Online-only v1.** Le offline-first (PWA/IndexedDB/file de synchro) est
  reporté en phase ultérieure. Atténuer les promesses « hors-ligne » et les
  badges « Sync Pending » tant que la synchro n'existe pas (ne pas mentir à
  l'utilisateur).
- **Multi-utilisateurs.** Chaque boutique = `Organization`. Rôles :
  `Patron → OWNER`, `Gérant → ADMIN`, `Vendeur → MEMBER`. Toute ressource
  métier porte `organizationId` et est gatée par `requireOrgRole(min, …)`.
  Les non-membres reçoivent **404, pas 403** (ne pas fuiter l'existence).
- **Tout Route Handler** : `export const runtime = 'nodejs'` (sinon CI échoue).
- **Mutations** : `verifyCsrf(req)` en tête + middleware d'auth/rôle.
- **Montants** : entier en plus petite unité (FCFA = pas de décimales).
- **Ne pas modifier** les fichiers protégés (auth.ts, webhook/handler.ts,
  middleware/index.ts, etc. — cf. CLAUDE.md). On les *consomme*.
- `pnpm format && lint && typecheck && test` doit passer avant chaque commit.

---

## État actuel (diagnostic du 2026-06-20)

| Couche | État |
|---|---|
| UI / écrans (13) | ✅ Construits, stylés, responsives, trilingues, thème clair/sombre |
| Auth (connexion/inscription/verify) | ✅ Branchée sur le vrai backend (`/api/auth/*`) |
| Données métier | ❌ 100 % fixtures (`lib/boutique/fixtures.ts`, 940 lignes) |
| Modèles Prisma métier | ❌ Inexistants (que les modèles génériques starter) |
| API métier (`/api/products`, `/api/sales`…) | ❌ Inexistantes |
| Gating d'accès à l'app | ❌ `/dashboard` accessible sans login (AppShell.tsx:12) |
| Contexte boutique / org | ❌ User en dur (« Boutique Amir / Patron ») |
| États loading/erreur/vide | ❌ Absents (sauf auth) |
| Offline réel | ❌ Marketing uniquement |

**Conclusion :** le travail UI est fait ; le **chemin critique est le backend
métier**, écran par écran.

---

## Modèle de données cible (vue d'ensemble)

Nouveaux modèles Prisma (tous avec `organizationId` + index). Détails de champs
fixés dans le plan TDD de chaque phase.

```
Organization (existe déjà)
 └─ OrganizationMember (existe déjà — rôles OWNER/ADMIN/MEMBER)
 └─ Product            (réf, nom, catégorie, prixAchat, prixVente, qté, seuil)
 └─ StockMovement      (produit, type IN|OUT|ADJUST, delta, raison, refVente?)
 └─ Customer           (nom, téléphone, « client depuis »)  ← débiteurs créances
 └─ Sale               (numéro, total, méthode CASH|MOBILE|CREDIT, statut, vendeur)
 └─ SaleItem           (vente, produit, qté, prixUnitaire au moment de la vente)
 └─ Receivable         (vente à crédit, client, montantDû, statut) 
 └─ Repayment          (receivable, montant, méthode, date)
 └─ Expense            (libellé, catégorie, montant, date, note)
 └─ Document           (FACTURE|PROFORMA, vente?, numéro, statut, snapshot lignes)
 └─ BoutiqueSettings   (devise, note de facture, infos boutique)  ← 1:1 org
```

Catégories de produits/dépenses : enum souple (string) ou table `Category`
org-scopée (décidé en Phase 2).

---

## Phases

Ordre = dépendances réelles. Chaque phase produit un logiciel testable et
livrable seul. Estimations = ordre de grandeur (jours-dev), pas un engagement.

### Phase 0 — Mise au carré du frontend (quick wins, ~1j)
*Indépendante du backend ; à faire en premier car elle nettoie le terrain.*
- Aligner le marché : **XAF / +235 / N'Djamena** dans landing + fixtures
  résiduelles ; supprimer les mentions Sénégal/UEMOA contradictoires.
- Atténuer les promesses offline (landing + badges « Sync Pending ») → libellé
  honnête type « synchronisation à venir » ou retrait temporaire.
- Remplacer dates figées (« 15 jan 2025 ») et utilisateur en dur par des
  valeurs dérivées / placeholders neutres en attendant l'API.
- Page `/verifier-email` : gérer l'absence de `?email=` (état vide propre, plus
  d'erreur 500).
- Établir **les patterns réutilisables** loading / erreur / vide (un composant
  `<AsyncState>` ou hook `useApi`) qui serviront à toutes les phases suivantes.
- i18n : `error.tsx` racine traduit.

### Phase 1 — Fondation tenancy & compte (chemin critique, ~2-3j)
*Préalable à TOUT le reste : sans org, aucune ressource métier n'a de scope.*
- **Onboarding boutique** : à la 1re connexion (ou au signup), créer une
  `Organization` + `OrganizationMember(OWNER)` + `BoutiqueSettings` (devise XAF
  par défaut). Transaction unique.
- **Contexte boutique** : `/api/auth/me` enrichi (user + org courante + rôle).
  Remplacer « Boutique Amir / Patron » par les vraies données dans SidebarNav.
- **Gating de l'app** : `(app)/layout.tsx` exige une session valide (redirige
  vers `/connexion` sinon). Activer la note TODO d'AppShell.ts:12.
- **Gestion d'équipe** (écran Paramètres → Utilisateurs) : lister/inviter/
  changer rôle/retirer membres via `/api/org/members*`, gaté `requireOrgRole`.
- Helper `getCurrentOrg(ctx)` réutilisé par toutes les routes métier.

### Phase 2 — Catalogue & Stock (~2-3j)
*Première ressource métier ; modèle de référence pour les suivantes.*
- Modèles `Product` + `StockMovement` (ledger d'inventaire — jamais muter la
  quantité « à la main » sans mouvement).
- `/api/products` (CRUD), `/api/products/[id]/adjust` (mouvement de stock).
- Brancher **Stock** (`StockManager`, `AddProductForm`) + alertes stock du
  dashboard. États loading/erreur/vide. Statut dérivé serveur.
- Catégories : trancher table vs enum.

### Phase 3 — Point de vente & Ventes (~3j)
*Le cœur transactionnel. Dépend de Product (décrément stock).*
- Modèles `Sale` + `SaleItem` (+ `Customer` minimal pour client de la vente).
- `/api/sales` POST = **transaction** : crée Sale+items, décrémente le stock
  via `StockMovement`, refuse si stock insuffisant (erreur stable
  `INSUFFICIENT_STOCK`). Numérotation séquentielle par org.
- Brancher **Vendre** (checkout réel du panier — fin du panier démo) +
  **Ventes** (historique, filtres) + KPI dashboard (CA, nb ventes).
- Si méthode = `CREDIT` → crée un `Receivable` (pont vers Phase 4).

### Phase 4 — Créances (clients débiteurs) (~2j)
*Dépend de Sale (vente à crédit).*
- Modèles `Customer` (enrichi) + `Receivable` + `Repayment`.
- `/api/customers`, `/api/receivables`, `/api/receivables/[id]/repay`
  (remboursement = transaction, `min(montant, dû)`, met à jour statut).
- Brancher **Créances** (`CreancesManager`, `RepaymentForm`) + KPI dashboard.

### Phase 5 — Dépenses (~1-2j)
*Indépendante des ventes ; simple CRUD.*
- Modèle `Expense` + catégories.
- `/api/expenses` (CRUD + filtres période/catégorie).
- Brancher **Dépenses** (`DepensesManager`, `AddExpenseForm`) + KPI dashboard.

### Phase 6 — Documents / Facturation (~2-3j)
*Dépend de Sale.*
- Modèle `Document` (FACTURE/PROFORMA, snapshot des lignes au moment de
  l'émission — ne pas recalculer depuis des produits qui ont changé de prix).
- `/api/documents` : générer facture depuis une vente, créer une proforma.
- Génération **PDF** (lib serveur, ex. `@react-pdf/renderer` ou HTML→PDF) +
  partage WhatsApp/lien (gros usage local).
- Brancher **Documents** (`DocumentsManager`, `DocumentPreview`).

### Phase 7 — Rapports (~2j)
*Dépend de Sale + Expense (agrégations).*
- `/api/reports?period=…` : CA, marge brute, dépenses, bénéfice net, top
  produits, série par jour. Agrégations SQL/Prisma `groupBy`.
- Brancher **Rapports** (`RapportsManager`, `ReportBarChart`). Export CSV.

### Phase 8 — Abonnement & paiements Mobile Money (~3j+)
*Monétisation. La landing vend un essai 30j + plans Solo/Boutique.*
- ⚠️ **Recherche à faire en début de phase** : providers Mobile Money **Tchad**
  (Airtel Money, Moov Africa). Bictorys/Wave sont surtout UEMOA/Sénégal ;
  vérifier la couverture CEMAC/TD de Moneroo. Utiliser la skill
  `izisaas-payments-handler`.
- Modèle `Subscription` (plan, statut, période d'essai), gating des features
  selon le plan, webhooks de paiement (réutiliser l'outbox + webhook/handler).
- Réutiliser `Order`/`Withdrawal` existants si pertinent.

### Phase 9 — Plus tard (hors v1)
- **Offline-first** : PWA + IndexedDB + file de synchro + résolution de
  conflits (gros chantier — c'est la promesse différée).
- Notifications (stock bas, échéances créances) via le système `Notification`
  existant + Resend.
- Multi-boutiques par compte, rôles fins, journal d'audit métier.
- Recherche produit par code-barres / scan caméra.

---

## Améliorations frontend transverses (à intégrer dans chaque phase)

- **États async systématiques** : loading (skeletons), erreur (retry + message
  i18n), vide (CTA « ajoutez votre 1er produit/vente »). Pattern posé en Phase 0.
- **Optimistic UI** sur les mutations rapides (encaisser, ajouter), rollback si
  l'API échoue. Ne jamais étendre le retry de `api()` aux verbes mutants.
- **Cohérence des montants** : un seul helper `formatFcfa()` (lib/boutique/
  format.ts existe — le centraliser).
- **Accessibilité** : focus states, labels ARIA, contraste vérifié en dark mode.
- **i18n** : zéro chaîne en dur dans les nouveaux composants (passer par le
  dictionnaire). AR = RTL, vérifier les écrans branchés.

## Questions ouvertes / décisions à prendre par phase

- **Catégories** produits & dépenses : enum souple vs table éditable (Phase 2).
- **Numérotation** ventes/factures : séquence par org, format (`V-0892`,
  `F-0124`) — où stocker le compteur (Phase 3/6).
- **Customer** : entité partagée POS/Créances/Documents — modéliser dès Phase 3
  même minimalement pour éviter une migration douloureuse.
- **Provider paiement Tchad** : à confirmer (Phase 8).

---

## Prochaine étape recommandée

Écrire le **plan TDD détaillé de la Phase 1** (fondation tenancy) — c'est le
préalable bloquant à tout le métier — puis l'exécuter en
`subagent-driven-development`. La Phase 0 (quick wins frontend) peut se faire en
parallèle car elle ne touche pas la base.
