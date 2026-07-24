/**
 * wipe.ts — purge du miroir local lors d'un changement de compte.
 *
 * Un seul appareil peut servir plusieurs comptes (compte patron + comptes de
 * test, téléphone partagé…). Le miroir Dexie n'est PAS espacé par boutique :
 * sans purge, le compte suivant fusionnerait ses données par-dessus celles de
 * l'ancien (et sa première synchro partirait du curseur `lastPull` de
 * l'ancien compte — donc incomplète). Deux gardes appellent cette purge :
 *   - `AuthContext.fetchUser` quand l'utilisateur connecté change
 *     (`peekSessionUserId` ≠ nouvel id) — AVANT que l'UI ne lise le miroir ;
 *   - `pull.ts`'s `pullAll` quand la boutique renvoyée par le serveur n'est
 *     pas celle stockée dans `meta.orgId` (ceinture + bretelles : couvre un
 *     snapshot de session absent/expiré).
 *
 * Ce qui est vidé : les 9 tables miroir + `conflicts` + `meta` (curseur de
 * pull, orgId, rôle). Ce qui SURVIT volontairement :
 *   - `outbox` — les écritures hors-ligne pas encore synchronisées de
 *     l'ancien compte. Elles sont estampillées `orgId` à l'enfilement
 *     (`outbox.ts`) et `listPending()` ne sert que les lignes de la boutique
 *     courante : elles attendent que LEUR compte se reconnecte pour partir,
 *     au lieu d'être perdues (ou pire, rejouées dans la mauvaise boutique).
 *   - `session` — c'est `AuthContext`/`logout` qui gèrent son cycle de vie.
 */
import { db } from './db';

/** Vide le miroir local (données + bookkeeping `meta`), en une transaction —
 * jamais un état à moitié purgé où un curseur pointerait sur des données
 * disparues. Ne touche ni `outbox` ni `session` (voir docblock). */
export async function wipeLocalMirror(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.products,
      db.customers,
      db.sales,
      db.saleItems,
      db.receivables,
      db.repayments,
      db.expenses,
      db.documents,
      db.stockMovements,
      db.conflicts,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.products.clear(),
        db.customers.clear(),
        db.sales.clear(),
        db.saleItems.clear(),
        db.receivables.clear(),
        db.repayments.clear(),
        db.expenses.clear(),
        db.documents.clear(),
        db.stockMovements.clear(),
        db.conflicts.clear(),
        db.meta.clear(),
      ]);
    },
  );
}
