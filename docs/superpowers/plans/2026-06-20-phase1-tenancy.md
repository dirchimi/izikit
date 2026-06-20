# Phase 1 — Fondation tenancy & compte boutique — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans`. Étapes en cases à cocher.

**Goal:** Donner à chaque utilisateur connecté une boutique (`Organization`)
réelle avec rôle, protéger l'accès à l'app, et gérer l'équipe — préalable
bloquant à tout le métier (stock, ventes, etc.).

**Architecture:** Onboarding paresseux idempotent (`ensureBoutique`) appelé par
`/api/org/current`, qui crée Organization + OrganizationMember(OWNER) +
BoutiqueSettings dans une transaction au 1er appel. Les routes équipe sont
gatées par `requireOrgRole`. Le gating d'app est server-side dans le layout.

**Tech Stack:** Next.js 16 App Router · Prisma 5 / Neon · Vitest (prisma +
middleware mockés via `@/test-utils/prisma-mock` + `@/test-utils/mock-cookies`).

## Global Constraints (rappel)

- `export const runtime = 'nodejs'` sur **chaque** route.
- Mutations : `verifyCsrf(req)` en tête + middleware d'auth/rôle.
- Non-membre → **404** (pas 403). Rôle insuffisant → 403.
- Devise par défaut **XAF**. Montants entiers.
- Ne pas modifier les fichiers protégés (auth.ts, middleware/index.ts,
  require-org-role.ts…) — on les **consomme** (`verifyToken`, `COOKIE_NAME`,
  `requireAuth`, `requireOrgRole`, `verifyCsrf`).
- `pnpm format && lint && typecheck && test` vert avant chaque commit.

## File Structure

- **Modèle** : `frontend/prisma/schema.prisma` — ajouter `BoutiqueSettings`
  (1:1 org) + relations `settings` sur `Organization`.
- **Helper** : `frontend/src/lib/server/boutique/ensure-boutique.ts` (+ test) —
  cœur de l'onboarding idempotent.
- **Routes** :
  - `frontend/src/app/api/org/current/route.ts` (GET + PATCH) (+ test)
  - `frontend/src/app/api/org/members/route.ts` (GET + POST) (+ test)
  - `frontend/src/app/api/org/members/[id]/route.ts` (PATCH + DELETE) (+ test)
- **Gating** : `frontend/src/app/(app)/layout.tsx` (modifier).
- **Frontend** : `SidebarNav.tsx`, `parametres/UsersSection.tsx`,
  `parametres/BoutiqueInfoForm.tsx` — brancher sur les nouvelles routes.

---

### Task 1 : Schéma `BoutiqueSettings` + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (model `Organization` + nouveau model)

**Interfaces — Produces:** modèle Prisma `BoutiqueSettings { organizationId
@unique, currency, phone?, city?, address?, invoiceNote? }` et relation
`Organization.settings BoutiqueSettings?`.

- [ ] **Step 1 :** ajouter la relation sur `Organization` (après `members`) :
  `settings BoutiqueSettings?`
- [ ] **Step 2 :** ajouter le model :

```prisma
// Profil + préférences d'une boutique (1:1 avec Organization). Créé dans la
// même transaction que l'org lors de l'onboarding. currency par défaut XAF
// (marché CEMAC v1). Montants applicatifs : entiers, plus petite unité.
model BoutiqueSettings {
  id             String       @id @default(cuid())
  organizationId String       @unique
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  currency       String       @default("XAF") // XAF | XOF | …
  phone          String?
  city           String?
  address        String?
  invoiceNote    String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}
```

- [ ] **Step 3 :** appliquer — `pnpm db:push` (dev itératif Neon).
  Attendu : « Your database is now in sync ». Puis `pnpm db:migrate:dev
  --name boutique_settings` pour la migration versionnée.
- [ ] **Step 4 :** `pnpm --filter frontend exec prisma generate` (client à jour).
- [ ] **Step 5 :** commit `feat(db): add BoutiqueSettings model (1:1 org)`.

---

### Task 2 : Helper `ensureBoutique` (idempotent)

**Files:**
- Create: `frontend/src/lib/server/boutique/ensure-boutique.ts`
- Test: `frontend/src/lib/server/boutique/ensure-boutique.test.ts`

**Interfaces — Produces:**
```ts
export interface BoutiqueContext {
  organization: { id: string; slug: string; name: string };
  settings: { currency: string; phone: string | null; city: string | null;
              address: string | null; invoiceNote: string | null };
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
export async function getPrimaryMembership(userId: string):
  Promise<{ organizationId: string; role: 'OWNER'|'ADMIN'|'MEMBER' } | null>;
export async function ensureBoutique(userId: string, email: string):
  Promise<BoutiqueContext>;
```
**Consumes:** `prisma`, `slugify` de `@/lib/server/slug`.

**Comportement :**
- `getPrimaryMembership` : 1re adhésion du user (`orderBy createdAt asc`),
  OWNER prioritaire ; `null` si aucune.
- `ensureBoutique` : si une adhésion existe → charge org + settings (crée les
  settings si manquants) et retourne. Sinon, **transaction** : crée
  `Organization` (name = partie locale de l'email, slug unique dérivé),
  `OrganizationMember(OWNER)`, `BoutiqueSettings(currency:'XAF')`. Idempotent :
  deux appels concurrents ne créent pas deux boutiques (gérer la collision de
  slug + l'unicité d'adhésion).

- [ ] **Step 1 :** test « retourne l'adhésion existante sans rien créer » —
  `prismaMock.organizationMember.findFirst` renvoie un membre OWNER → assert
  `organization.create` **non appelé**, `role === 'OWNER'`.
- [ ] **Step 2 :** test « crée la boutique au 1er appel » — `findFirst` →
  `null`, `prismaMock.$transaction` exécute le callback → assert org + member
  OWNER + settings XAF créés, `currency === 'XAF'`.
- [ ] **Step 3 :** test « slug dérivé de l'email » — email `amir@x.td` →
  `slug` commence par `amir`.
- [ ] **Step 4 :** lancer les tests → FAIL (module absent).
- [ ] **Step 5 :** implémenter `ensure-boutique.ts` (tx + idempotence + slug
  unique avec suffixe court sur collision).
- [ ] **Step 6 :** `pnpm --filter frontend exec vitest run src/lib/server/boutique/ensure-boutique.test.ts` → PASS.
- [ ] **Step 7 :** commit `feat(boutique): ensureBoutique idempotent onboarding helper`.

---

### Task 3 : Route `/api/org/current` (GET + PATCH)

**Files:**
- Create: `frontend/src/app/api/org/current/route.ts`
- Test: `frontend/src/app/api/org/current/route.test.ts`

**Interfaces — Consumes:** `requireAuth`, `requireOrgRole`, `verifyCsrf`,
`ensureBoutique`, `getPrimaryMembership`. **Produces:** `GET → 200 { organization,
settings, role }` (ensure au passage) ; `PATCH → 200 { settings }` (champs :
name, phone, city, address, invoiceNote, currency ; rôle min **ADMIN**).

- [ ] **Step 1 :** test GET « crée+retourne la boutique » (auth mockée,
  `ensureBoutique` mockée) → 200, body a `organization`+`settings`+`role`.
- [ ] **Step 2 :** test GET « 401 sans session » (requireAuth → 401).
- [ ] **Step 3 :** test PATCH « 403 si MEMBER » (requireOrgRole → 403).
- [ ] **Step 4 :** test PATCH « met à jour les settings » (ADMIN) → 200,
  `prismaMock.boutiqueSettings.update` appelé avec les champs.
- [ ] **Step 5 :** test source-invariant : contient `runtime='nodejs'`,
  `verifyCsrf`, `withRequestContext`.
- [ ] **Step 6 :** run → FAIL. **Step 7 :** implémenter la route
  (GET : requireAuth → ensureBoutique ; PATCH : requireAuth →
  getPrimaryMembership → requireOrgRole(orgId,'ADMIN') → verifyCsrf → update).
- [ ] **Step 8 :** run → PASS. **Step 9 :** commit
  `feat(api): /api/org/current (GET ensure + PATCH settings)`.

---

### Task 4 : Route `/api/org/members` (GET liste + POST ajout)

**Files:**
- Create: `frontend/src/app/api/org/members/route.ts`
- Test: `frontend/src/app/api/org/members/route.test.ts`

**Interfaces — Produces:** `GET → 200 { members: [{ id, userId, email, name,
role }] }` (rôle min MEMBER) ; `POST → 201 { member }` ajoute un **utilisateur
déjà inscrit** par email avec rôle MEMBER|ADMIN (rôle min **ADMIN** + csrf).
Limitation v1 : email non inscrit → `422 USER_NOT_REGISTERED` (invitations =
phase ultérieure — `log` la limite).

- [ ] **Step 1 :** test GET liste les membres (org du user).
- [ ] **Step 2 :** test POST « 422 si email non inscrit ».
- [ ] **Step 3 :** test POST « ajoute un user existant en MEMBER » → 201.
- [ ] **Step 4 :** test POST « 403 si appelant MEMBER ».
- [ ] **Step 5 :** test POST « 409 si déjà membre » (unicité).
- [ ] **Step 6 :** run → FAIL. **Step 7 :** implémenter. **Step 8 :** run → PASS.
- [ ] **Step 9 :** commit `feat(api): /api/org/members (list + add existing user)`.

---

### Task 5 : Route `/api/org/members/[id]` (PATCH rôle + DELETE)

**Files:**
- Create: `frontend/src/app/api/org/members/[id]/route.ts`
- Test: `frontend/src/app/api/org/members/[id]/route.test.ts`

**Interfaces — Produces:** `PATCH → 200 { member }` change le rôle (min
**OWNER** + csrf) ; `DELETE → 200 { ok: true }` retire un membre (min ADMIN +
csrf). **Invariant : on refuse de rétrograder/retirer le dernier OWNER** →
`409 LAST_OWNER`.

- [ ] **Step 1 :** test PATCH « OWNER change un MEMBER en ADMIN » → 200.
- [ ] **Step 2 :** test PATCH « 409 LAST_OWNER si on rétrograde le seul OWNER ».
- [ ] **Step 3 :** test DELETE « retire un membre » → 200.
- [ ] **Step 4 :** test DELETE « 409 LAST_OWNER si dernier OWNER ».
- [ ] **Step 5 :** test « 403 si appelant rôle insuffisant ».
- [ ] **Step 6 :** run → FAIL. **Step 7 :** implémenter (compter les OWNER
  restants dans une tx avant mutation). **Step 8 :** run → PASS.
- [ ] **Step 9 :** commit `feat(api): /api/org/members/[id] (role change + remove, last-owner guard)`.

---

### Task 6 : Gating d'app + branchement frontend

**Files:**
- Modify: `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/components/boutique/SidebarNav.tsx` (user/boutique réels)
- Modify: `frontend/src/components/boutique/parametres/UsersSection.tsx`
- Modify: `frontend/src/components/boutique/parametres/BoutiqueInfoForm.tsx`

- [ ] **Step 1 :** gating server-side — dans `(app)/layout.tsx` :
  `const token = (await cookies()).get(COOKIE_NAME)?.value; const p = token ?
  await verifyToken(token) : null; if (!p) redirect('/connexion');` puis rendre
  `<AppShell>`. (Importer `cookies` de `next/headers`, `redirect` de
  `next/navigation`, `verifyToken`+`COOKIE_NAME` de `@/lib/server/auth`.)
- [ ] **Step 2 :** retirer la note TODO obsolète d'`AppShell.tsx:12-13`.
- [ ] **Step 3 :** `SidebarNav` : remplacer « Boutique Amir / Patron » en dur
  par les données de `GET /api/org/current` (nom boutique + rôle traduit).
- [ ] **Step 4 :** `BoutiqueInfoForm` : précharger depuis `/api/org/current`,
  enregistrer via `PATCH /api/org/current` (états loading/erreur/succès).
- [ ] **Step 5 :** `UsersSection` : lister via `GET /api/org/members`, ajouter
  via POST, changer rôle / retirer via les routes `[id]` (gérer
  `USER_NOT_REGISTERED`, `LAST_OWNER` avec messages i18n).
- [ ] **Step 6 :** `pnpm format && lint && typecheck && test` → tout vert.
- [ ] **Step 7 :** **Vérif manuelle** (`pnpm dev`) : non connecté → `/dashboard`
  redirige vers `/connexion` ; connecté → la boutique réelle s'affiche dans la
  sidebar ; ajouter/retirer un membre fonctionne.
- [ ] **Step 8 :** commit `feat(app): gate app routes + wire boutique/team to real API`.

---

## Self-review (couverture spec Phase 1)

- Onboarding boutique → Task 1+2. Contexte boutique (`/api/auth/me` enrichi) →
  remplacé par `/api/org/current` dédié (Task 3) + branchement SidebarNav
  (Task 6). Gating → Task 6. Gestion d'équipe → Tasks 4+5+6. ✅
- Limitation assumée et journalisée : invitations d'utilisateurs **non encore
  inscrits** = phase ultérieure (v1 ajoute des comptes existants par email).

## Décisions reportées (hors Phase 1)

- Une boutique par compte en v1 (pas de multi-org par user) — `getPrimaryMembership`
  prend la 1re. Multi-boutiques = Phase 9.
- `currency` par boutique posée ici (XAF) ; le formatage `formatFcfa` reste à
  centraliser en Phase 2.
