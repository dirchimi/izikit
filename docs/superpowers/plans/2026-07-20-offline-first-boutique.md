# Offline-First Boutique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire fonctionner **toute l'app boutique** (vendre, stock, ventes, créances, dépenses, clients, documents) sans connexion, avec synchronisation automatique et sûre au retour du réseau — sans jamais créer de doublon de vente, de créance ou de mouvement de stock.

**Architecture:** Un **socle offline-first commun** (base locale IndexedDB via Dexie + file d'attente d'écritures « outbox client » + moteur de synchronisation) sur lequel chaque écran se branche. Chaque entité créée hors-ligne reçoit un **ID client (cuid v2)** qui sert aussi de **clé d'idempotence** : rejouer une écriture est un no-op côté serveur (collision sur l'ID = déjà appliqué). Les opérations qui mutent un agrégat (remboursement, ajustement de stock) portent une **clé d'opération** enregistrée dans une table serveur d'idempotence. Les numéros séquentiels (`V-`, `D-`, `RECU-`) restent **attribués par le serveur au moment de la sync**. Le stock local fait autorité hors-ligne ; à la sync, le serveur applique les décréments de façon idempotente et **signale** (sans bloquer) tout écart de stock négatif — cas « plusieurs appareils, rarement simultanés ».

**Tech Stack:** Next.js 16 App Router, Prisma 5 / Neon, Dexie 4 (IndexedDB), service worker maison existant (`public/sw.js`), Vitest.

## Global Constraints

- Chaque Route Handler garde `export const runtime = 'nodejs'` (test d'enforcement CI).
- Mutations : `verifyCsrf(req)` → `requireAuth`/`requireOrgRole` → `requireActiveSubscription`, dans cet ordre, inchangé.
- **Ne jamais rejouer un POST côté `api.ts`** (invariant existant). La ré-exécution offline passe UNIQUEMENT par le moteur de sync avec clé d'idempotence — jamais par le retry réseau du wrapper.
- Montants : entier en plus petite unité (FCFA, pas de décimales).
- IDs des entités : `cuid()` — désormais **fournis par le client** pour les entités créables hors-ligne ; le `@default(cuid())` Prisma reste le fallback online.
- Fichiers PROTÉGÉS touchés par ce plan : [api.ts](../../../frontend/src/lib/api.ts) (ajout d'un hook d'idempotence, PAS de retry sur mutations), et le gate serveur [(app)/layout.tsx](../../../frontend/src/app/(app)/layout.tsx). **Chaque tâche qui les modifie DOIT afficher « je modifie X parce que Y — confirmer ? » avant édition.**
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` doit passer avant chaque commit.
- Tout doit rester fonctionnel en RTL arabe (isoler nombres/numéros — voir convention BiDi projet).

---

## Décisions d'architecture (verrouillées)

| Sujet | Décision | Raison |
|---|---|---|
| Stockage local | **Dexie 4** (IndexedDB) | ergonomique, transactions, requêtes indexées ; pas de SQL-in-browser lourd |
| ID des entités | **cuid v2 généré client** (`@paralleldrive/cuid2`) | l'ID = clé d'idempotence ; collision `P2002` = déjà appliqué |
| Idempotence des mutations d'agrégat (repay, adjust) | table serveur `OfflineOperation(clientOpId @unique)` | un repay rejoué ne double pas l'allocation |
| Numéros `V-/D-/RECU` | attribués **serveur au moment de la sync** | impossible de garantir la séquence hors-ligne |
| Autorité du stock hors-ligne | **stock local** décrémenté localement ; serveur réconcilie à la sync | vente immédiate ; conflit rare |
| Conflit stock (2 appareils) | serveur **enregistre quand même** la vente, signale l'écart négatif → alerte + écran de réconciliation | choix utilisateur « rarement simultané → réconcilier + alerter » |
| Auth hors-ligne | instantané de session persistant + gate client de secours quand offline | booter l'app sans réseau |
| État de sync | table Dexie `outbox` (statut `pending|syncing|done|conflict|error`) | pilote le badge « X à synchroniser » |

---

## Structure des fichiers

**Socle (nouveau) — `frontend/src/lib/offline/`**
- `db.ts` — schéma Dexie : tables miroir (`products`, `customers`, `sales`, `receivables`, `expenses`, `documents`, `stockMovements`, `meta`) + table `outbox` + table `session`.
- `ids.ts` — `newId()` (cuid2) + `newOpId()`.
- `outbox.ts` — `enqueue(op)`, `listPending()`, `markDone/markConflict/markError`, comptage.
- `sync-engine.ts` — `drainOutbox()` (rejoue dans l'ordre), backoff, mapping id local→serveur, résolution des statuts.
- `pull.ts` — `pullAll()` / `pullResource(name)` : rafraîchit les tables miroir depuis le serveur.
- `mutations.ts` — API unifiée côté client : `createSaleOffline(input)`, `createExpenseOffline(...)`, `repayOffline(...)`, `adjustStockOffline(...)`, `createCustomerOffline(...)`. Chaque fonction : écrit optimiste en local + enqueue outbox ; si online, déclenche un drain immédiat.
- `session.ts` — `saveSession(snapshot)`, `loadSession()`, `clearSession()`.
- `useSyncStatus.ts` — hook React : `{ pendingCount, syncing, lastSyncedAt, syncNow(), conflicts }`.

**Serveur (nouveau/modifié)**
- `frontend/src/lib/server/idempotency.ts` — `withIdempotency(tx, clientOpId, fn)` : lit/écrit `OfflineOperation`, renvoie le résultat mémorisé si déjà vu.
- [schema.prisma](../../../frontend/prisma/schema.prisma) — nouveau modèle `OfflineOperation` ; les modèles créables offline acceptent un `id` client (aucun changement de colonne, juste l'usage) ; `StockMovement` gagne `clientOpId String? @unique` pour dédup ; `Repayment` gagne `clientOpId String? @unique`.
- Endpoints de mutation modifiés pour accepter un `id`/`clientOpId` optionnel et dédoublonner : `sales`, `expenses`, `customers`, `receivables/[id]/repay`, `products/[id]/adjust`.
- `frontend/src/app/api/sync/pull/route.ts` — endpoint batch de lecture « delta depuis `updatedAt` » pour semer/rafraîchir les tables locales en un appel.

**UI (modifié)**
- Managers d'écran (`VendrePos.tsx`, `StockManager.tsx`, `VentesManager.tsx`, créances, dépenses…) : lire depuis Dexie (via un `useLocalResource`) au lieu de `useApi` direct, écrire via `mutations.ts`.
- `AppShell.tsx` / `SidebarNav.tsx` : badge « X à synchroniser » + bouton « Synchroniser maintenant » + écran de conflits.
- [(app)/layout.tsx](../../../frontend/src/app/(app)/layout.tsx) : gate tolérant au offline (PROTÉGÉ — confirmer).
- [public/sw.js](../../../frontend/public/sw.js) : bump `sahilley-v5`, précache de l'app-shell des routes `(app)`.

---

## Séquencement des phases

Même livré « d'un coup », l'ordre de construction est imposé par les dépendances :

1. **Phase 0 — Socle serveur d'idempotence** (schema + `withIdempotency` + endpoints acceptent id/opId). *Rien de visible, mais tout en dépend.*
2. **Phase 1 — Base locale + session offline + pull** (Dexie, seed, boot offline).
3. **Phase 2 — Outbox + moteur de sync** (file, drain, mapping, statuts).
4. **Phase 3 — POS offline** (vendre = premier flux branché de bout en bout, valide le socle).
5. **Phase 4 — Réconciliation stock + écran de conflits.**
6. **Phase 5 — Domaines restants** (dépenses, créances/remboursements, ajustement stock, clients, documents) = réapplication du **patron domaine** ci-dessous.
7. **Phase 6 — UX de sync + service worker app-shell + durcissement** (badge, bouton, RTL, tests d'intégration offline).

Chaque phase ci-dessous est détaillée en tâches TDD bite-sized. Les phases 0→4 sont détaillées intégralement (c'est là que vit la complexité). La phase 5 est un **patron unique documenté une fois** puis instancié par domaine (DRY).

---

## PHASE 0 — Socle serveur d'idempotence

### Task 0.1 : Modèle `OfflineOperation` + colonnes de dédup

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create migration: `frontend/prisma/migrations/<ts>_offline_idempotency/`

**Interfaces:**
- Produces: modèle `OfflineOperation { id, organizationId, clientOpId @unique, endpoint, resultJson, createdAt }` ; `StockMovement.clientOpId String? @unique` ; `Repayment.clientOpId String? @unique`.

- [ ] **Step 1 — Écrire le test de schéma** (Vitest) : un test qui charge le client Prisma généré et vérifie la présence des champs.

```ts
// frontend/src/lib/server/offline-idempotency.schema.test.ts
import { Prisma } from '@prisma/client'
test('OfflineOperation model exists with clientOpId unique', () => {
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === 'OfflineOperation')
  expect(model).toBeDefined()
  expect(model!.fields.some(f => f.name === 'clientOpId' && f.isUnique)).toBe(true)
})
test('StockMovement has unique clientOpId', () => {
  const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'StockMovement')!
  expect(m.fields.some(f => f.name === 'clientOpId' && f.isUnique)).toBe(true)
})
```

- [ ] **Step 2 — Lancer, vérifier l'échec.** `pnpm --filter frontend exec vitest run src/lib/server/offline-idempotency.schema.test.ts` → FAIL (modèle absent).

- [ ] **Step 3 — Ajouter au schema :**

```prisma
model OfflineOperation {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  clientOpId     String   @unique
  endpoint       String
  resultJson     Json
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
}
```
Ajouter `clientOpId String? @unique` à `StockMovement` et à `Repayment`. Ajouter `offlineOperations OfflineOperation[]` à `Organization`.

- [ ] **Step 4 — Générer + migrer.** `pnpm db:migrate:dev` (nom : `offline_idempotency`). ⚠️ Windows : stopper le dev + tuer les workers next avant `prisma generate` (verrou DLL). Relancer le test → PASS.

- [ ] **Step 5 — Commit.** `git commit -m "feat(offline): OfflineOperation model + clientOpId dedup columns"`

### Task 0.2 : Helper `withIdempotency`

**Files:**
- Create: `frontend/src/lib/server/idempotency.ts`
- Test: `frontend/src/lib/server/idempotency.test.ts`

**Interfaces:**
- Produces: `withIdempotency<T>(tx: Prisma.TransactionClient, args: { organizationId: string; clientOpId: string | null; endpoint: string }, fn: () => Promise<T>): Promise<{ result: T; replayed: boolean }>`. Si `clientOpId` est `null` → exécute `fn` sans mémoriser (chemin online classique). Si l'op existe déjà → renvoie `resultJson` mémorisé, `replayed: true`.

- [ ] **Step 1 — Test :** premier appel exécute `fn` et mémorise ; deuxième appel avec le même `clientOpId` renvoie le résultat mémorisé sans ré-exécuter `fn` (spy count = 1).

```ts
test('withIdempotency memoizes by clientOpId', async () => {
  const fn = vi.fn().mockResolvedValue({ n: 1 })
  const a = await withIdempotency(tx, { organizationId: 'o', clientOpId: 'op1', endpoint: 'sales' }, fn)
  const b = await withIdempotency(tx, { organizationId: 'o', clientOpId: 'op1', endpoint: 'sales' }, fn)
  expect(fn).toHaveBeenCalledTimes(1)
  expect(a.replayed).toBe(false); expect(b.replayed).toBe(true)
  expect(b.result).toEqual({ n: 1 })
})
```

- [ ] **Step 2 — Run → FAIL.**

- [ ] **Step 3 — Implémenter** : `findUnique({clientOpId})` → si trouvé, renvoyer `{result: resultJson, replayed:true}` ; sinon `fn()`, `create` la ligne (catch `P2002` = course → relire et renvoyer mémorisé), renvoyer `{result, replayed:false}`.

- [ ] **Step 4 — Run → PASS.**

- [ ] **Step 5 — Commit** `feat(offline): withIdempotency helper`.

### Task 0.3 : `POST /api/sales` accepte `id` client + `clientOpId`

**Files:**
- Modify: `frontend/src/app/api/sales/route.ts`
- Test: `frontend/src/app/api/sales/route.test.ts` (ou fichier de test existant)

**Interfaces:**
- Consumes: `withIdempotency` (0.2), `newId`/`newOpId` shape (string).
- Produces: le body accepte optionnellement `id?: string` (cuid client pour la `Sale`), `customer.id?: string` (cuid client si client créé offline), `clientOpId?: string`. Réponse inchangée. Rejouer le même `id` renvoie **200 la vente existante** (pas 409).

- [ ] **Step 1 — Test** : deux POST avec le même `id` de vente ne créent qu'une `Sale`, ne décrémentent le stock qu'une fois. Deuxième réponse = même vente, statut 200.

- [ ] **Step 2 — Run → FAIL.**

- [ ] **Step 3 — Implémenter** : envelopper la transaction dans `withIdempotency(tx, {clientOpId: body.clientOpId ?? body.id, endpoint:'sales'}, ...)`. Passer `data.id = body.id` au `sale.create` si fourni (sinon Prisma génère). Idem `customer.id` si fourni. Le numéro `V-` reste calculé serveur. Le `StockMovement` reçoit `clientOpId = ${body.id}:${productId}` (dédup par item).

- [ ] **Step 4 — Run → PASS.**

- [ ] **Step 5 — Commit** `feat(offline): idempotent sale creation with client id`.

### Task 0.4 → 0.7 : idempotence des autres mutations

Même patron que 0.3, un fichier par endpoint. Pour chacun : test « double POST = un seul effet », puis `withIdempotency` + acceptation de l'`id`/`clientOpId` client. Détails spécifiques :

- **0.4 `POST /api/expenses`** — accepte `id` + `clientOpId`. Numéro `D-` reste serveur.
- **0.5 `POST /api/customers`** — accepte `id`. La dédup se fait par l'`id` client (règle le doublon de clients au replay). Pas de `clientOpId` séparé nécessaire (création pure).
- **0.6 `POST /api/receivables/[id]/repay`** — **exige** `clientOpId` pour les appels offline ; `withIdempotency` empêche la double-allocation. `Repayment.clientOpId` renseigné. Le `Document RECU` reste numéroté serveur.
- **0.7 `POST /api/products/[id]/adjust`** — accepte `clientOpId` ; `StockMovement.clientOpId` renseigné. **Changer** le calcul de `newQty` absolu par un `{ increment/decrement: delta }` idempotent-safe (sinon un replay ré-applique le delta). Test : double appel = un seul mouvement, stock ajusté une fois.

Chaque tâche : 5 steps (test rouge → impl → vert → commit).

---

## PHASE 1 — Base locale + session offline + pull

### Task 1.1 : Dépendances + schéma Dexie

**Files:**
- Modify: `frontend/package.json` (ajouter `dexie`, `@paralleldrive/cuid2`)
- Create: `frontend/src/lib/offline/db.ts`, `frontend/src/lib/offline/ids.ts`
- Test: `frontend/src/lib/offline/db.test.ts` (jsdom + `fake-indexeddb`)

**Interfaces:**
- Produces: `db` (instance Dexie) avec tables `products, customers, sales, saleItems, receivables, expenses, documents, stockMovements, outbox, session, meta`. `newId(): string`, `newOpId(): string`.

- [ ] **Step 1 — Installer** `pnpm --filter frontend add dexie @paralleldrive/cuid2 && pnpm --filter frontend add -D fake-indexeddb`.

- [ ] **Step 2 — Test** : ouvrir la db, insérer un produit, le relire par `id`, filtrer par `organizationId`.

```ts
import 'fake-indexeddb/auto'
import { db } from './db'
test('db stores and queries products by org', async () => {
  await db.products.put({ id: 'p1', organizationId: 'o1', name: 'Riz', qty: 5, sellPrice: 500, updatedAt: '2026-07-20T00:00:00Z' })
  const rows = await db.products.where('organizationId').equals('o1').toArray()
  expect(rows).toHaveLength(1)
})
```

- [ ] **Step 3 — Run → FAIL.**

- [ ] **Step 4 — Implémenter** `db.ts` (Dexie subclass, `version(1).stores({...})` avec index `organizationId, updatedAt, [organizationId+ref]`…) et `ids.ts` (`createId` de cuid2). `outbox` indexée sur `status, seq`.

- [ ] **Step 5 — Run → PASS. Commit** `feat(offline): Dexie local db + id generator`.

### Task 1.2 : Endpoint `GET /api/sync/pull`

**Files:**
- Create: `frontend/src/app/api/sync/pull/route.ts`
- Test: colocalisé.

**Interfaces:**
- Produces: `GET /api/sync/pull?since=<iso>` → `{ products[], customers[], sales[], receivables[], expenses[], documents[], stockMovements[], serverTime }` filtrés `updatedAt > since` (ou tout si `since` absent), scoping org via `requireOrgRole('MEMBER')`. `runtime = 'nodejs'`.

- [ ] **Step 1 — Test** : renvoie uniquement les lignes modifiées après `since` ; refuse sans auth (401) ; refuse hors org.
- [ ] **Step 2 — Run → FAIL.**
- [ ] **Step 3 — Implémenter** (un `Promise.all` de `findMany` scoping org + `updatedAt` gt).
- [ ] **Step 4 — Run → PASS.**
- [ ] **Step 5 — Commit** `feat(offline): batch pull endpoint`.

### Task 1.3 : `pull.ts` — seed/refresh des tables locales

**Files:** Create `frontend/src/lib/offline/pull.ts` + test.
**Interfaces:** `pullAll(): Promise<void>` (appelle `/api/sync/pull?since=<meta.lastPull>`, `bulkPut` chaque table, met à jour `meta.lastPull = serverTime`). `pullResource(name)`.

- [ ] Test : après `pullAll`, les tables Dexie contiennent les lignes du endpoint (fetch mocké) et `meta.lastPull` avance. → FAIL → impl → PASS → commit.

### Task 1.4 : Session offline persistante

**Files:** Create `frontend/src/lib/offline/session.ts` + test ; Modify `frontend/src/contexts/AuthContext.tsx`.
**Interfaces:** `saveSession({userId, orgId, role, name, email})`, `loadSession()`, `clearSession()`. `AuthProvider` : après un `/api/auth/me` réussi → `saveSession`; au boot, si `navigator.onLine === false`, hydrater `user` depuis `loadSession()` au lieu d'appeler le réseau ; sur `logout()` → `clearSession()` (en plus du `CLEAR_CACHE` existant).

- [ ] Test (jsdom) : offline + session persistée ⇒ `useAuth().user` est peuplé sans fetch. Online ⇒ chemin `/api/auth/me` inchangé. → FAIL → impl → PASS → commit.

### Task 1.5 : Gate `(app)/layout.tsx` tolérant au offline ⚠️ PROTÉGÉ

- [ ] **Step 0 — Confirmer** : afficher « je modifie `(app)/layout.tsx` parce que le gate serveur `redirect('/connexion')` empêche tout rendu hors-ligne — confirmer ? » et attendre.
- [ ] Rendre le gate résilient : garder la vérif serveur quand le token est présent ; quand la requête arrive sans réseau serveur (cas PWA app-shell servi par le SW), c'est le **SW qui sert le shell** et le gate client (`useUser`) prend le relais. Concrètement : ne pas dépendre d'un `redirect` serveur pour la sécurité offline — le contenu sensible est déjà protégé par les API (chaque route re-vérifie l'auth). Ajouter un fallback client `useUser()` dans `AppShell`.
- [ ] Test + commit.

---

## PHASE 2 — Outbox + moteur de sync

### Task 2.1 : `outbox.ts`
**Interfaces:** `enqueue({kind, payload, opId}): Promise<OutboxRow>` (statut `pending`, `seq` monotone), `listPending()`, `markSyncing/markDone/markConflict(id, reason)/markError(id, reason, retryAt)`, `pendingCount()`.
- [ ] Test : enqueue → apparait en pending ; markDone → sort du compte. FAIL → impl → PASS → commit.

### Task 2.2 : `sync-engine.ts` — `drainOutbox()`
**Interfaces:** `drainOutbox(): Promise<{ done: number; conflicts: number; errors: number }>`. Rejoue les ops `pending` par `seq` croissant. Pour chaque op : POST vers l'endpoint avec `id`/`clientOpId` du payload ; sur 2xx → `markDone` + met à jour la ligne locale (mapping numéro serveur, `synced:true`) ; sur 409 `INSUFFICIENT_STOCK` → `markConflict` ; sur erreur réseau → s'arrêter (garder l'ordre) ; sur 4xx non-conflit → `markError` + retirer de la tête pour ne pas bloquer la file.
- [ ] Test : file de 3 ops, la 1re réussit, la 2e renvoie 409 → statut `conflict`, la 3e réussit. Vérifie l'ordre et les statuts. FAIL → impl → PASS → commit.

### Task 2.3 : déclencheurs de drain
**Files:** Modify `frontend/src/lib/offline/mutations.ts` + un listener global (dans `AppShell`).
- [ ] Drain déclenché : (a) au retour de l'event `online`, (b) après chaque `enqueue` si `navigator.onLine`, (c) toutes les 30 s si file non vide. Debounce/verrou single-flight (comme le lock de refresh de `api.ts`). Test du single-flight. Commit.

### Task 2.4 : `useSyncStatus.ts`
**Interfaces:** `{ pendingCount, syncing, lastSyncedAt, conflicts, syncNow() }` (live via Dexie `liveQuery`).
- [ ] Test + commit.

---

## PHASE 3 — POS offline (premier flux de bout en bout)

### Task 3.1 : `useLocalResource` (lecture depuis Dexie)
**Interfaces:** `useLocalResource<T>(table, filter?)` renvoie `{ data, loading }` via `liveQuery`. Remplace `useApi` sur les écrans offline.
- [ ] Test + commit.

### Task 3.2 : `createSaleOffline` dans `mutations.ts`
**Interfaces:** `createSaleOffline(input): Promise<{ id }>`. Étapes (transaction Dexie) : `id = newId()`, décrément stock local par item (refuse si stock local insuffisant → erreur `INSUFFICIENT_STOCK_LOCAL`), insère `sales`/`saleItems`/`stockMovements` locaux avec `synced:false` + numéro provisoire `Local #n`, crée `receivable` local si crédit, crée `customer` local si nouveau (`id` client), `enqueue({kind:'sale', payload:{id, clientOpId:id, ...}})`, drain si online.
- [ ] Test : vente offline ⇒ stock local baisse, 1 ligne outbox pending, vente lisible immédiatement. FAIL → impl → PASS → commit.

### Task 3.3 : brancher `VendrePos.tsx`
**Files:** Modify `frontend/src/components/boutique/VendrePos.tsx` (lecture produits via `useLocalResource`, checkout via `createSaleOffline` au lieu de `api('/api/sales')`). Garder `onSaleChange()` pour l'invalidation online.
- [ ] Test composant (jsdom) : checkout offline ne throw pas, affiche le ticket local. Vérif manuelle : couper le réseau, vendre, rétablir → la vente remonte avec un vrai `V-000x`. Commit.

### Task 3.4 : mapping numéro serveur après sync
- [ ] Au `markDone` d'une vente, remplacer le numéro `Local #n` par le `V-000x` renvoyé + `synced:true`. Test : après drain, la vente locale porte le numéro serveur. Commit.

---

## PHASE 4 — Réconciliation stock + écran de conflits

### Task 4.1 : réponse serveur « stock négatif signalé »
**Files:** Modify `frontend/src/app/api/sales/route.ts`.
- [ ] Quand un décrément à la sync ferait passer `product.qty < 0` (autre appareil a vendu), **enregistrer quand même** la vente (autorité = ventes réelles), poser `qty = max(0, ...)` OU permettre le négatif selon réglage, et renvoyer un flag `stockConflict: [{productId, shortfall}]` dans la réponse. Test : deux ventes concurrentes du même stock → les deux `Sale` existent, conflit signalé sur la 2e. Commit.

### Task 4.2 : file de conflits locale + écran
**Files:** Create `frontend/src/app/(app)/synchronisation/page.tsx` + `ConflictsManager.tsx`.
- [ ] `drainOutbox` route les `stockConflict` vers `db.outbox` statut `conflict`. L'écran liste : « Vente V-0012 — Riz : stock manquant de 3 ». Actions : « Ajuster le stock » (réappro) ou « Marquer résolu ». Test + commit.

### Task 4.3 : badge + bouton dans la nav
**Files:** Modify `SidebarNav.tsx` / `AppShell.tsx` (utilise `useSyncStatus`).
- [ ] Badge « N à synchroniser », point de conflit rouge, bouton « Synchroniser maintenant » → `syncNow()`. Test + commit.

---

## PHASE 5 — Domaines restants (patron unique, instancié 5×)

**Le patron domaine** (à appliquer identiquement à chaque domaine) :

1. **Lecture** : remplacer le `useApi('/api/<res>')` du manager par `useLocalResource('<table>', filtreOrg)`.
2. **Écriture** : ajouter `create<Res>Offline(input)` dans `mutations.ts` — `id = newId()`, insert local optimiste (`synced:false`), `enqueue({kind, payload:{id, clientOpId, ...}})`, drain si online.
3. **Sync** : `drainOutbox` connaît déjà le `kind` → POST vers l'endpoint idempotent (Phase 0). Au `markDone`, patch la ligne locale (numéro serveur si applicable, `synced:true`).
4. **Pull** : la ressource est déjà dans `/api/sync/pull` (Phase 1.2) → rafraîchie automatiquement.
5. **Tests** : (a) create offline ⇒ lisible + 1 outbox pending ; (b) drain ⇒ POST idempotent, ligne `synced`.

**Instances** (une tâche = 5 steps chacune, en réappliquant le patron) :

- **Task 5.1 — Dépenses** (`kind:'expense'`, endpoint `/api/expenses`, table `expenses`, manager dépenses). Numéro `D-` mappé à la sync.
- **Task 5.2 — Remboursement créance** (`kind:'repay'`, `/api/receivables/[id]/repay`, exige `clientOpId`, met à jour `receivables` locales + crée `documents` RECU local provisoire → numéro serveur à la sync). ⚠️ l'allocation locale doit répliquer `allocateRepayment` (oldest-first) pour un affichage optimiste correct — extraire la logique d'allocation en fonction pure partagée client/serveur.
- **Task 5.3 — Ajustement de stock** (`kind:'adjust'`, `/api/products/[id]/adjust`, `clientOpId`, applique `delta` local + `stockMovements` local). Rôle `ADMIN` : vérifier le rôle depuis la session offline.
- **Task 5.4 — Clients** (`kind:'customer'`, `/api/customers`, dédup par `id`).
- **Task 5.5 — Documents / annulation de vente** : lecture offline OK ; l'annulation de vente (`sales/[id]/cancel`) devient une op `kind:'cancel'` idempotente (ajouter idempotence à cet endpoint façon Phase 0). Remise en stock local.

### Task 5.6 — Fonction pure `allocateRepayment` partagée
**Files:** Extraire de `receivables/[id]/repay` vers `frontend/src/lib/shared/allocate-repayment.ts` (importable client + serveur, pas de `server-only`).
- [ ] Test unitaire de la fonction pure + rebrancher les deux appelants. Commit.

---

## PHASE 6 — UX de sync, service worker app-shell, durcissement

### Task 6.1 : Service worker `sahilley-v5` — précache app-shell
**Files:** Modify `frontend/public/sw.js`.
- [ ] Bump `CACHE = sahilley-v5`, précacher les routes `(app)` (shell HTML) pour qu'un hard-load offline serve l'app, pas seulement `/hors-ligne`. Ne jamais cacher `/api/*` mutations. Test manuel : mode avion + recharge `/vendre` → l'app se charge. Commit.

### Task 6.2 : Indicateurs par ligne
- [ ] Dans les listes (ventes, dépenses…), badge « ⏳ à synchroniser » / « ✓ synchronisé » / « ⚠ conflit » selon `synced`/statut outbox. RTL : isoler les nombres. Test + commit.

### Task 6.3 : Purge / rétention locale
- [ ] `meta`-driven : purger les `sales`/`stockMovements` locaux `synced` de plus de N jours pour ne pas gonfler IndexedDB (garder tout ce qui est `pending`/`conflict`). Test + commit.

### Task 6.4 : Tests d'intégration offline (scénarios)
- [ ] Scénario complet simulé (fake-indexeddb + fetch mock on/off) : vendre 2× offline, rétablir, drainer, vérifier 0 doublon, numéros serveur, stock cohérent, 1 conflit correctement signalé sur collision. Commit.

### Task 6.5 : Passe finale
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Corriger. Mettre à jour `CLAUDE.md` (section offline-first) et `STATUS.md`. Commit.

---

## Auto-revue (couverture spec)

- ✅ Toute l'app offline → Phases 3 (POS) + 5 (5 domaines) + lecture via `useLocalResource` partout.
- ✅ Sync au retour → Phase 2 (drain sur event `online`).
- ✅ Multi-appareils rarement simultané → Phase 4 (réconciliation + écran de conflits, non bloquant).
- ✅ Zéro doublon → Phase 0 (idempotence par `id`/`clientOpId`).
- ✅ Écran « à synchroniser » (la version dont tu te souviens) → Task 4.3 + 6.2.
- ✅ Boot sans réseau → Tasks 1.4 (session) + 1.5 (gate) + 6.1 (SW app-shell).
- ✅ Invariants projet préservés (runtime nodejs, pas de retry POST, numéros serveur, advisory/serializable inchangés).

## Points d'attention / risques

- **Fichiers protégés** (`api.ts`, `(app)/layout.tsx`) : confirmation explicite requise (Tasks 1.4/1.5).
- **Migration prod** : suivre le workflow migrations du projet (db:push + numérotées + `migrate resolve`), barcode unique par org inchangé.
- **Taille IndexedDB** : purge (6.3) obligatoire pour les grosses boutiques.
- **RTL arabe** : ~23 fichiers boutique encore non balayés (dette connue) — ne pas régresser en ajoutant les badges de sync.
- **Windows** : verrou DLL Prisma — stopper dev avant generate/migrate.
