/**
 * sync-history.ts — « Dernières synchronisations » de l'écran
 * `/synchronisation`.
 *
 * Les lignes `outbox` en statut `done` sont l'historique naturel de ce qui a
 * été rejoué avec succès : ce module en lit les N plus récentes et résout,
 * en meilleur effort, un libellé lisible depuis le miroir local (numéro de
 * vente, libellé de dépense, nom du client…) — sans réseau, donc l'écran
 * reste 100 % consultable hors ligne. Une entité déjà purgée du miroir
 * (`purge.ts`) donne simplement `detail: null` ; le type d'opération et
 * l'heure restent affichables.
 *
 * `at` = `syncedAt` (posé par `markDone`) quand présent, sinon `createdAt`
 * (lignes terminées avant l'ajout du champ — l'heure de saisie est alors la
 * meilleure approximation disponible).
 */
import { db, type OutboxRow } from './db';
import { formatFCFA } from '@/lib/boutique/format';

export interface SyncHistoryEntry {
  seq: number;
  /** `OutboxKind` — libellé i18n via `sync.kind.<kind>` (déjà au dictionnaire). */
  kind: string;
  /** Libellé lisible best-effort (« V-0012 · 14 500 FCFA »), null si
   * l'entité n'est plus dans le miroir local. */
  detail: string | null;
  at: string; // ISO
}

/** Sale id embarqué dans l'endpoint d'une annulation (`/api/sales/<id>/cancel`)
 * — même extraction que `sync-engine.ts` (l'opId d'un cancel est un clientOpId
 * frais, PAS l'id de la vente). */
function extractCancelSaleId(endpoint: string): string | undefined {
  const match = /^\/api\/sales\/([^/]+)\/cancel$/.exec(endpoint);
  return match?.[1];
}

async function resolveDetail(row: OutboxRow): Promise<string | null> {
  switch (row.kind) {
    case 'sale': {
      const sale = await db.sales.get(row.opId);
      return sale ? `${sale.number} · ${formatFCFA(sale.total)} FCFA` : null;
    }
    case 'cancel': {
      const saleId = extractCancelSaleId(row.endpoint);
      const sale = saleId ? await db.sales.get(saleId) : undefined;
      return sale ? sale.number : null;
    }
    case 'expense': {
      const expense = await db.expenses.get(row.opId);
      return expense ? `${expense.label} · ${formatFCFA(expense.amount)} FCFA` : null;
    }
    case 'repay': {
      const repayment = await db.repayments.get(row.opId);
      if (!repayment) return null;
      const customer = await db.customers.get(repayment.customerId);
      const amount = `${formatFCFA(repayment.amount)} FCFA`;
      return customer ? `${customer.name} · ${amount}` : amount;
    }
    case 'customer': {
      const customer = await db.customers.get(row.opId);
      return customer?.name ?? null;
    }
    case 'adjust': {
      // Le mouvement local porte le clientOpId de l'op (pas d'index — table
      // petite, un filter() linéaire suffit, même raisonnement que
      // sync-engine.ts).
      const movement = await db.stockMovements.filter((m) => m.clientOpId === row.opId).first();
      const product = movement ? await db.products.get(movement.productId) : undefined;
      if (!product) return null;
      const delta = movement?.delta ?? 0;
      return `${product.name} (${delta > 0 ? '+' : ''}${delta})`;
    }
    default:
      return null;
  }
}

/**
 * Les `limit` dernières écritures synchronisées avec succès, la plus récente
 * d'abord. Chaque `resolveDetail` est isolé : une entité manquante ou une
 * lecture qui échoue donne `detail: null`, jamais une liste vide.
 */
export async function listRecentSynced(limit = 15): Promise<SyncHistoryEntry[]> {
  const done = await db.outbox.where('status').equals('done').sortBy('seq');
  const recent = done.slice(-limit).reverse();

  const entries: SyncHistoryEntry[] = [];
  for (const row of recent) {
    if (row.seq === undefined) continue; // defensive — Dexie always assigns seq
    let detail: string | null = null;
    try {
      detail = await resolveDetail(row);
    } catch {
      // best-effort — le type + l'heure restent affichables
    }
    entries.push({
      seq: row.seq,
      kind: row.kind,
      detail,
      at: row.syncedAt ?? row.createdAt,
    });
  }
  return entries;
}
