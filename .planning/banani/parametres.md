# Paramètres — Banani → Next.js 16 / Tailwind v4

## Source

- Banani screen ID : `-03UWoquJIFS/screens/Parametres.jsx`
- Fetched : 2026-06-19
- Type : desktop, layout **réglages** (sous-nav verticale + panneau).
- Route : `/parametres` (déjà câblée dans `SidebarNav`, bas de la sidebar — distincte de l'`/settings` auth d'izikit).

## Structure map

- **Top bar** : « Paramètres » + sous-titre + `ScreenTopActions`.
- **Sous-nav (220px)** : Boutique (active) · Facturation · Devise · Langue · Utilisateurs · Mobile Money · Synchronisation. Actif = `bg-secondary text-secondary-foreground font-semibold` + accent `border-r-2 border-primary` (desktop).
- **Panneau** :
  - **Carte « Informations de la boutique »** : logo (S + « Changer le logo ») ; grille 2×2 (Nom, Téléphone, Ville, Quartier/Adresse) ; Note de bas de facture ; bouton « Enregistrer ».
  - **Carte « Utilisateurs »** : header + « Ajouter un utilisateur » ; lignes user (avatar, nom, badge « Vous », téléphone, badge rôle, crayon éditer si ≠ vous).

## Component breakdown

- **NEW** `components/boutique/parametres/ParametresManager.tsx` — orchestrateur (état section active), sous-nav interactive + rendu du panneau.
- **NEW** `components/boutique/parametres/BoutiqueInfoForm.tsx` — formulaire contrôlé (nom/tél/ville/adresse/note) → « Enregistrer » toast.
- **NEW** `components/boutique/parametres/UsersSection.tsx` — carte Utilisateurs (réutilisée par les sections Boutique **et** Utilisateurs).
- **REUSE** `TopBar` + `ScreenTopActions`, `Icon`, `useToast`.

## Données factices (fixtures.ts)

- `settingsSections` (7), `defaultBoutiqueInfo` (Sahilley · N'Djamena · +235…), `boutiqueUsers` (2 : Patron « Vous » + Vendeur). Types `SettingsSection`, `BoutiqueInfo`, `BoutiqueUser`.

## Interactions / état

- Sous-nav → change la section affichée. `boutique` = formulaire + carte Utilisateurs (vue Banani par défaut) ; `utilisateurs` = carte Utilisateurs seule ; autres = état « Cette section arrive bientôt » (placeholder honnête, non designé par Banani).
- Formulaire boutique : champs contrôlés ; « Enregistrer » → toast succès ; « Changer le logo » → toast info.
- Utilisateurs : « Ajouter » / crayon → toast info (formulaire d'ajout non designé ce round).

## Responsive plan (mobile-first)

- **Base (375px)** : sous-nav en **bande horizontale scrollable** (`flex-row overflow-x-auto`) ; panneau pleine largeur ; grille champs `grid-cols-1` ; header carte Utilisateurs `flex-col`.
- **sm (640px+)** : grille champs `sm:grid-cols-2` ; header Utilisateurs `sm:flex-row`.
- **lg (1024px+)** : sous-nav **rail vertical** (`lg:w-[220px] lg:flex-col lg:border-r`), accent actif `lg:border-r-2` — fidèle Banani.

## Implementation checklist

- [x] Fixtures (sections + infos boutique + utilisateurs)
- [x] `BoutiqueInfoForm` (contrôlé)
- [x] `UsersSection` (réutilisable)
- [x] `ParametresManager` (sous-nav interactive)
- [x] Page `(app)/parametres/page.tsx`
- [ ] lint / typecheck
- [ ] Vérif runtime `/parametres` → 200 + check 375 / 768 / 1280

## Open questions / déviations (à valider)

- **Pays/ville** : la maquette Paramètres affiche **N'Djamena / +235** (Tchad) alors que la facture montrait Dakar/Sénégal — gardé tel quel (placeholders démo). À uniformiser quand tu fixes l'identité boutique.
- **Sections non designées** (Facturation, Devise, Langue, Mobile Money, Sync) → placeholder « bientôt ». Dis-moi si tu veux que j'en conçoive une en particulier.
- **Formulaire enregistre via toast** (pas de persistance / upload réel) — câblage avec la phase data.
