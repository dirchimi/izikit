// POST /api/sales/[id]/cancel — annuler une vente.
//
// Réservé au Patron (OWNER) et au Manager (ADMIN) : le Vendeur (MEMBER) ne peut
// pas annuler. Dans UNE transaction Serializable :
//   1. réintègre au stock les quantités vendues (StockMovement IN + qty),
//   2. annule la créance associée si la vente était à crédit (status CANCELLED),
//   3. marque la vente `status=CANCELLED` + auteur + date — SANS la supprimer
//      (traçabilité : la vente reste dans l'historique, barrée).
//
// Idempotent-safe : une vente déjà annulée renvoie 409 ALREADY_CANCELLED (on ne
// re-crédite jamais le stock deux fois).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { withTxRetry } from '@/lib/server/db/retry-transaction';
import { withIdempotency } from '@/lib/server/idempotency';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

// Fenêtre d'annulation : une vente ne peut être annulée que dans les 24h.
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

const Body = z.object({
  reason: z.string().trim().min(1).max(200),
  // Clé d'idempotence offline : un rejeu (ack perdu) de la MÊME annulation
  // renvoie le succès mémoïsé (200) au lieu d'un 409. `null`/absent = chemin
  // online pur (aucune OfflineOperation écrite, comportement inchangé).
  clientOpId: z.string().min(1).optional(),
});

type CancelResult = { kind: 'OK'; number: string };

// Rejets métier (dépendants des données) : DOIVENT être levés (throw), jamais
// `return`-és depuis la fonction enveloppée par `withIdempotency`. Un `return`
// serait mémoïsé sous le `clientOpId` du rejeu — si la vente n'existe pas
// encore au moment de l'annulation (ex : création offline en retard/erreur
// transitoire pendant le drain), un NOT_FOUND mémoïsé resterait figé pour
// toujours, même après que la vente soit créée côté serveur. En levant une
// exception, la transaction Prisma est annulée (rollback) et rien n'est
// mémoïsé — un rejeu ultérieur avec le même `clientOpId` réévalue les données
// à jour. Cf. `SaleRejection` dans `sales/route.ts` (Task 0.3), même pattern.
class CancelRejection extends Error {
  constructor(
    public readonly payload: unknown,
    public readonly status: number,
  ) {
    super('CancelRejection');
    this.name = 'CancelRejection';
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Annulation réservée Patron/Manager.
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    // Motif d'annulation obligatoire.
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'REASON_REQUIRED', message: "Le motif d'annulation est obligatoire" },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const reason = parsed.data.reason;
    // Clé d'idempotence offline : `clientOpId` explicite, sinon `null` (chemin
    // online pur — withIdempotency ne mémoïse rien et ne touche jamais la table
    // OfflineOperation, comportement byte-identique à l'avant-5.5).
    const clientOpId = parsed.data.clientOpId ?? null;

    const { id } = await ctx.params;
    const orgId = primary.organizationId;
    const userSub = auth.user.sub;

    let result: CancelResult;
    try {
      result = await withTxRetry(() =>
        prisma.$transaction(
          async (tx) => {
            // withIdempotency DOIT rester à l'intérieur de withTxRetry : sur un
            // rejeu concurrent, le perdant lève P2002 sur `clientOpId @unique`,
            // que withTxRetry rejoue proprement (le findUnique initial retombe
            // alors sur la ligne gagnante et renvoie le résultat mémoïsé).
            const { result } = await withIdempotency(
              tx,
              { organizationId: orgId, clientOpId, endpoint: 'cancel' },
              async (): Promise<CancelResult> => {
                const sale = await tx.sale.findUnique({
                  where: { id },
                  select: {
                    organizationId: true,
                    number: true,
                    status: true,
                    createdAt: true,
                    items: { select: { productId: true, qty: true } },
                    receivable: { select: { id: true, amountPaid: true } },
                  },
                });
                if (!sale || sale.organizationId !== orgId) {
                  throw new CancelRejection(
                    { error: 'SALE_NOT_FOUND', message: 'Vente introuvable' },
                    404,
                  );
                }
                if (sale.status === 'CANCELLED') {
                  throw new CancelRejection(
                    { error: 'SALE_ALREADY_CANCELLED', message: 'Cette vente est déjà annulée' },
                    409,
                  );
                }
                // Au-delà de 24h, l'annulation est refusée (règle métier).
                if (Date.now() - new Date(sale.createdAt).getTime() > CANCEL_WINDOW_MS) {
                  throw new CancelRejection(
                    {
                      error: 'CANCEL_WINDOW_EXPIRED',
                      message: 'Annulation possible seulement dans les 24h',
                    },
                    409,
                  );
                }
                // Une vente à crédit déjà (partiellement) remboursée ne peut pas être
                // annulée : annuler créerait des remboursements « orphelins » (argent
                // reçu, mais plus aucune vente en face → écart de caisse). Le Patron
                // doit d'abord traiter le remboursement/avoir avec le client.
                if (sale.receivable && sale.receivable.amountPaid > 0) {
                  throw new CancelRejection(
                    {
                      error: 'CREDIT_ALREADY_REPAID',
                      message:
                        'Cette vente à crédit a déjà reçu un remboursement. Gérez d’abord le remboursement avec le client avant d’annuler.',
                    },
                    409,
                  );
                }

                // 1) Réintégration du stock. Les lignes dont le produit a été supprimé
                // (productId null via SetNull) ne peuvent pas être re-créditées : on les
                // ignore. On ne re-crédite que les produits encore présents dans la boutique.
                const productIds = sale.items
                  .map((it) => it.productId)
                  .filter((pid): pid is string => pid !== null);
                const existing =
                  productIds.length > 0
                    ? await tx.product.findMany({
                        where: { id: { in: productIds }, organizationId: orgId },
                        select: { id: true },
                      })
                    : [];
                const existingIds = new Set(existing.map((p) => p.id));

                for (const it of sale.items) {
                  if (!it.productId || !existingIds.has(it.productId) || it.qty <= 0) continue;
                  await tx.product.update({
                    where: { id: it.productId },
                    data: { qty: { increment: it.qty } },
                  });
                  await tx.stockMovement.create({
                    data: {
                      organizationId: orgId,
                      productId: it.productId,
                      type: 'IN',
                      delta: it.qty,
                      reason: `annulation vente ${sale.number}`,
                      createdById: userSub,
                    },
                  });
                }

                // 2) Créance associée (vente à crédit) → annulée.
                if (sale.receivable) {
                  await tx.receivable.update({
                    where: { id: sale.receivable.id },
                    data: { status: 'CANCELLED' },
                  });
                }

                // 3) Trace : la vente devient CANCELLED (jamais supprimée) + motif.
                await tx.sale.update({
                  where: { id },
                  data: {
                    status: 'CANCELLED',
                    cancelledAt: new Date(),
                    cancelledById: userSub,
                    cancelReason: reason,
                  },
                });

                return { kind: 'OK', number: sale.number };
              },
            );
            return result;
          },
          { isolationLevel: 'Serializable' },
        ),
      );
    } catch (e) {
      // Un rejet métier (NOT_FOUND/ALREADY_CANCELLED/TOO_LATE/CREDIT_REPAID) est
      // levé DEPUIS l'intérieur de `withIdempotency` : la transaction Prisma
      // fait un rollback complet et RIEN n'est mémoïsé sous `clientOpId`. Un
      // rejeu ultérieur (ex : après que la vente offline en retard a fini par
      // se créer) réévalue donc les données à jour au lieu de renvoyer un 404
      // figé pour toujours. `withTxRetry` ne rejoue que P2002/P2034, donc
      // `CancelRejection` remonte ici sans être rejouée.
      if (e instanceof CancelRejection) {
        return NextResponse.json(e.payload, {
          status: e.status,
          headers: { 'x-request-id': reqCtx.requestId },
        });
      }
      throw e;
    }

    log.info('sale cancelled', { saleId: id, number: result.number, by: userSub });
    return NextResponse.json(
      { ok: true, sale: { id, number: result.number, status: 'CANCELLED' } },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
