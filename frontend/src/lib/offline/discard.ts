/**
 * discard.ts — abandon définitif d'une ligne d'outbox en `error`.
 *
 * Une ligne `error` est un rejet MÉTIER définitif du serveur (ex.
 * PRODUCT_NOT_FOUND : le produit a été supprimé du catalogue pendant que la
 * vente attendait dans la file — « Réessayer » ne passera jamais). Sans
 * abandon, la ligne reste à vie dans « Échecs de synchronisation » ET ses
 * effets locaux optimistes restent à vie dans le miroir (une vente fantôme
 * qui gonfle les rapports hors ligne, une créance fantôme qui gonfle la
 * dette du client, du stock décrémenté pour rien) — `purge.ts` ne touche
 * jamais une ligne non synchronisée.
 *
 * `discardErrorRow` fait donc DEUX choses, dans UNE transaction Dexie :
 *   1. supprime la ligne d'outbox ;
 *   2. DÉFAIT l'effet local optimiste de l'op, par `kind` (l'inverse exact de
 *      ce que `mutations.ts` a appliqué), en best-effort : chaque écriture est
 *      un no-op silencieux si la ligne locale a déjà disparu.
 *
 * Limites assumées (documentées, pas des bugs) :
 *   - `repay` : les allocations par créance ne sont pas stockées — on défait
 *     en parcourant les créances du client par `updatedAt` DESC (l'inverse de
 *     l'allocation oldest-first), exact dans le cas courant où rien d'autre
 *     n'a touché ces créances entre-temps.
 *   - `adjust` : l'éventuel `buyPrice` précédent n'est pas connu → non
 *     rétabli (le prochain pull du produit le corrige si le serveur diverge).
 *   - `cancel` : on ne « ressuscite » PAS la vente localement (le cas réel
 *     d'abandon est SALE_NOT_FOUND : la vente n'a jamais existé côté serveur,
 *     souvent parce que sa propre op a échoué/été abandonnée) — la vue locale
 *     garde la vente annulée ; une resynchronisation complète rétablirait la
 *     vérité serveur si elle divergeait.
 *   - un client créé en ligne de mire d'une vente abandonnée n'est PAS
 *     supprimé (il peut être référencé par d'autres ventes ; une fiche
 *     contact locale orpheline est sans danger).
 */
import { db, type OutboxRow, type ReceivableRow } from './db';

/** Statut d'une créance recalculé après un retrait de `amountPaid`. */
function receivableStatus(
  r: Pick<ReceivableRow, 'amount' | 'amountPaid'>,
): ReceivableRow['status'] {
  if (r.amountPaid <= 0) return 'OPEN';
  return r.amountPaid >= r.amount ? 'PAID' : 'PARTIAL';
}

/**
 * Supprime définitivement une ligne d'outbox en `error` et défait son effet
 * local optimiste. No-op si la ligne n'est pas/plus en `error` (déjà
 * réessayée ou abandonnée depuis un autre onglet).
 */
export async function discardErrorRow(row: OutboxRow): Promise<void> {
  const seq = row.seq;
  if (seq === undefined) return;

  await db.transaction(
    'rw',
    [
      db.outbox,
      db.sales,
      db.saleItems,
      db.stockMovements,
      db.products,
      db.receivables,
      db.expenses,
      db.customers,
      db.repayments,
    ],
    async () => {
      const current = await db.outbox.get(seq);
      if (!current || current.status !== 'error') return;

      switch (row.kind) {
        case 'sale': {
          // Inverse de `createSaleOffline` : re-créditer le stock décrémenté,
          // puis supprimer vente + lignes + mouvements + créance optimistes.
          const items = await db.saleItems.where('saleId').equals(row.opId).toArray();
          const neededByProduct = new Map<string, number>();
          for (const it of items) {
            if (it.productId) {
              neededByProduct.set(it.productId, (neededByProduct.get(it.productId) ?? 0) + it.qty);
            }
          }
          for (const [productId, needed] of neededByProduct) {
            const p = await db.products.get(productId);
            if (p) await db.products.update(productId, { qty: p.qty + needed });
          }
          const movementIds = (await db.stockMovements
            .filter((m) => m.clientOpId?.startsWith(`${row.opId}:`) === true)
            .primaryKeys()) as string[];
          if (movementIds.length > 0) await db.stockMovements.bulkDelete(movementIds);
          // Convention créance.id === vente.id : la créance optimiste (jamais
          // créée côté serveur puisque la vente a été rejetée) partage l'id.
          await db.receivables.delete(row.opId);
          await db.saleItems.bulkDelete(items.map((it) => it.id));
          await db.sales.delete(row.opId);
          break;
        }
        case 'expense': {
          await db.expenses.delete(row.opId);
          break;
        }
        case 'customer': {
          await db.customers.delete(row.opId);
          break;
        }
        case 'repay': {
          // Inverse best-effort de l'allocation optimiste (voir docblock).
          const repayment = await db.repayments.get(row.opId);
          if (repayment) {
            let toUndo = repayment.amount;
            const rows = (
              await db.receivables.where('customerId').equals(repayment.customerId).toArray()
            ).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
            for (const r of rows) {
              if (toUndo <= 0) break;
              const undo = Math.min(r.amountPaid, toUndo);
              if (undo <= 0) continue;
              const amountPaid = r.amountPaid - undo;
              await db.receivables.update(r.id, {
                amountPaid,
                status: receivableStatus({ amount: r.amount, amountPaid }),
              });
              toUndo -= undo;
            }
            await db.repayments.delete(row.opId);
          }
          break;
        }
        case 'adjust': {
          // Inverse de `createAdjustOffline` : retirer le delta appliqué au
          // stock local (borné à 0 : des ventes ont pu consommer entre-temps
          // le stock d'un réappro abandonné) et supprimer le mouvement.
          const movement = await db.stockMovements.filter((m) => m.clientOpId === row.opId).first();
          if (movement) {
            const p = await db.products.get(movement.productId);
            if (p) {
              await db.products.update(movement.productId, {
                qty: Math.max(0, p.qty - movement.delta),
              });
            }
            await db.stockMovements.delete(movement.id);
          }
          break;
        }
        case 'cancel':
        default:
          // `cancel` : rien à défaire ici (voir docblock) ; kind inconnu/futur :
          // pas d'effet local connu à inverser.
          break;
      }

      await db.outbox.delete(seq);
    },
  );
}
