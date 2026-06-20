# Documents (Factures & Proformas) — Banani → Next.js 16 / Tailwind v4

## Source

- Banani screen IDs : `-03UWoquJIFS/screens/Documents.jsx` (Factures) + `…/DocumentsProformas.jsx` (Proformas)
- Fetched : 2026-06-19
- Type : desktop, **maître-détail à onglets**.

## Décision d'architecture

Les **deux écrans Banani sont le même écran** avec l'onglet actif inversé (la sidebar n'a qu'une entrée
« Documents »). → **une seule route `/documents`** avec un état `tab: 'factures' | 'proformas'` qui change
la liste **et** l'aperçu. Un composant `DocumentPreview` unique rend soit une FACTURE soit un PROFORMA
(`kind`). C'est la lecture fidèle + correcte du design (sinon les onglets n'auraient pas de sens).

## Structure map

- **Top bar** : « Documents » + sous-titre + `ScreenTopActions`.
- **Pane gauche (400px)** : onglets Factures/Proformas → recherche → chips de statut → liste des documents
  (icône `file-text` pour factures / `file` pour proformas ; n° mono, badge statut, client, montant, date).
- **Pane droite** : en-tête aperçu (titre + « Partager via WhatsApp » / « Imprimer ») + le document
  (logo S, Sahilley/adresse, titre FACTURE|PROFORMA, n°, date, validité [proforma], badge statut,
  FACTURÉ À|DESTINATAIRE, lignes Article/Qté/P.U./Total, Sous-total, Total|Total estimé, note de pied).

## Variantes facture ↔ proforma (dans `DocumentPreview`)

| Élément | Facture | Proforma |
| Titre | FACTURE | PROFORMA |
| Destinataire | FACTURÉ À | DESTINATAIRE |
| Validité | — | « Validité : 30 jours » |
| Libellé total | Total | Total estimé |
| Note de pied | « Merci pour votre achat. » | « Ce document est un devis… » |
| Icône liste | `file-text` | `file` |

## Component breakdown

- **NEW** `components/boutique/documents/DocumentsManager.tsx` — orchestrateur à onglets (tab + recherche + filtre statut + sélection), interactif.
- **NEW** `components/boutique/documents/DocumentPreview.tsx` — document imprimable réutilisé par les deux onglets (prop `kind`).
- **REUSE** `TopBar` + `ScreenTopActions`, `Icon`, `useToast`, `formatFCFA`.

## Données factices (fixtures.ts)

- Types `DocStatus`, `DocLine`, `SaleDocument` ; `docStatusConfig`, `docTotal(doc)`, `PROFORMA_VALIDITY`.
- `factures` (7) + `proformas` (3). Les lignes somment **exactement** aux montants Banani (le montant liste = `docTotal`).

## Interactions / état

- Onglets → bascule liste + aperçu ; reset recherche/filtre + sélection sur le 1er doc de l'onglet.
- Recherche (client ou n°) + chips statut (dérivés des statuts présents : factures → Tous/Payée/Crédit/En attente ; proformas → Tous/En attente).
- Clic document → aperçu mis à jour. Boutons Partager/Imprimer → toast (non câblés ce round).
- État vide (filtres) géré.

## Responsive plan (mobile-first)

- **Base (375px)** : `flex-col` — onglets + liste pleine largeur, aperçu en dessous ; en-tête doc `flex-col` ;
  lignes d'articles en scroll horizontal (`min-w-[460px]`) ; boutons aperçu `flex-wrap`.
- **sm (640px+)** : en-tête doc `sm:flex-row` + bloc droit `sm:text-right`.
- **lg (1024px+)** : deux panes côte à côte (`lg:flex-row`, liste `lg:w-[400px] lg:border-r`) — fidèle Banani.

## Implementation checklist

- [x] Fixtures (7 factures + 3 proformas, lignes cohérentes)
- [x] `DocumentPreview` (variantes par `kind`)
- [x] `DocumentsManager` (onglets interactifs)
- [x] Page `(app)/documents/page.tsx`
- [ ] lint / typecheck
- [ ] Vérif runtime `/documents` → 200 + check 375 / 768 / 1280

## Open questions / déviations (à valider)

- **Chips de statut dérivés des données** (au lieu des chips figés de Banani, qui omettaient « En attente » côté
  factures alors qu'une facture `pending` existe). Plus correct ; dis-moi si tu veux coller au design figé.
- **Partager via WhatsApp / Imprimer** = toast pour l'instant (comme les switchers langue/thème). Câblage réel
  (deep-link `wa.me`, impression CSS dédiée) à faire avec la phase data.
