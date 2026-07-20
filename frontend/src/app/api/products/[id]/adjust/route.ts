// Phase 2 — POST /api/products/[id]/adjust.
//
// Ajuste le stock d'un produit en écrivant un StockMovement et en mettant à
// jour `qty` dans la MÊME transaction (ledger d'inventaire). `delta` signé :
// > 0 = entrée (IN), < 0 = sortie (OUT). Refuse si le stock passe sous 0
// (409 INSUFFICIENT_STOCK). Rôle min ADMIN (Manager).
//
// Offline-first (Task 0.7) : `clientOpId` est la clé d'idempotence —
// `withIdempotency` empêche un rejeu (appareil qui n'a jamais vu la réponse
// après une coupure réseau) de ré-appliquer le delta. L'écriture du stock se
// fait en `{ increment: delta }` ATOMIQUE (pas `qty: newQty` calculé depuis
// une lecture devenue périmée) : c'est ce qui rend le rejeu sûr — même si
// `fn` s'exécutait deux fois (ce que `withIdempotency` empêche déjà), un
// `increment` composé avec le StockMovement dédupliqué reste correct. Un
// appelant online omet `clientOpId`, comportement inchangé.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscription/guard';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { withTxRetry } from '@/lib/server/db/retry-transaction';
import { withIdempotency } from '@/lib/server/idempotency';
import { productView, PRODUCT_SELECT } from '@/lib/server/products/helpers';
import { onProductAdjusted } from '@/lib/server/notifications/boutique-events';
import { notifyAfterResponse } from '@/lib/server/notifications/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    delta: z.number().int(),
    reason: z.string().trim().max(120).optional(),
    // Type de mouvement explicite : 'IN' = réapprovisionnement (entrée),
    // 'ADJUST' = correction (casse/vol/inventaire). Absent → dérivé du signe
    // du delta (compat : IN si > 0, OUT si < 0).
    type: z.enum(['IN', 'OUT', 'ADJUST']).optional(),
    // Réapprovisionnement : met à jour le prix d'achat du produit si fourni.
    buyPrice: z.number().int().min(0).optional(),
    // Réappro pris « en prêt » : reste dû au fournisseur pour cette entrée.
    // Créé en dette fournisseur si > 0 (entrée IN uniquement). Borné au coût
    // (delta × prix d'achat) côté serveur.
    supplierDebt: z
      .object({
        amount: z.number().int().positive(),
        supplierName: z.string().trim().max(120).optional(),
      })
      .optional(),
    // Offline-first (Task 0.7) : clé d'idempotence explicite générée côté
    // client. Absente → chemin online pur, rien n'est mémoïsé.
    clientOpId: z.string().min(1).optional(),
  })
  // Un ajustement (correction) exige un motif — défense en profondeur (le
  // formulaire l'impose déjà côté client).
  .refine((d) => d.type !== 'ADJUST' || (d.reason?.trim().length ?? 0) > 0, {
    message: 'reason_required_for_adjust',
    path: ['reason'],
  });

type AdjustResult = { kind: 'OK'; product: Parameters<typeof productView>[0] };

// Seul le SUCCÈS traverse withIdempotency (et est donc mémoïsé). Un rejet
// métier (produit introuvable, stock insuffisant) est levé comme
// AdjustRejection : il fait AVORTER la $transaction (rollback complet —
// aucun StockMovement, aucune SupplierDebt, aucune ligne OfflineOperation).
// Sans ce rollback, un rejet mémoïserait pour ce clientOpId et renverrait la
// même erreur À JAMAIS, même après qu'un restock ait rendu l'opération
// valide.
class AdjustRejection extends Error {
  constructor(
    public payload: { error: string; message: string },
    public status: number,
  ) {
    super(payload.error);
    this.name = 'AdjustRejection';
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

    // Ajustement de stock (réapprovisionnement, casse, inventaire) → réservé au
    // Patron (OWNER) et au Manager (ADMIN). Le Vendeur ne modifie pas le stock.
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    // « Appli douce » : abonnement expiré (hors grâce) → écriture refusée.
    const locked = await requireActiveSubscription(primary.organizationId);
    if (locked) return locked;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || parsed.data.delta === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'delta entier non nul requis' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id } = await ctx.params;
    const orgId = primary.organizationId;
    const delta = parsed.data.delta;
    // Clé d'idempotence offline : `clientOpId` explicite. `null` (absent) =
    // chemin online pur, rien n'est mémoïsé.
    const clientOpId = parsed.data.clientOpId ?? null;

    let result: AdjustResult;
    let replayed: boolean;
    try {
      const outcome = await withTxRetry(() =>
        prisma.$transaction(
          (tx) =>
            withIdempotency<AdjustResult>(
              tx,
              { organizationId: orgId, clientOpId, endpoint: 'adjust' },
              async () => {
                const product = await tx.product.findUnique({
                  where: { id },
                  select: { organizationId: true, qty: true, name: true, buyPrice: true },
                });
                if (!product || product.organizationId !== orgId) {
                  throw new AdjustRejection(
                    { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable' },
                    404,
                  );
                }

                const newQty = product.qty + delta;
                if (newQty < 0) {
                  throw new AdjustRejection(
                    { error: 'INSUFFICIENT_STOCK', message: 'Stock insuffisant pour cette sortie' },
                    409,
                  );
                }

                // Réappro pris « en prêt » → dette fournisseur du reste dû, bornée au
                // coût de l'entrée (delta × prix d'achat effectif). Seulement pour une
                // entrée.
                if (parsed.data.supplierDebt && delta > 0) {
                  const effectiveBuyPrice = parsed.data.buyPrice ?? product.buyPrice;
                  const owed = Math.min(parsed.data.supplierDebt.amount, delta * effectiveBuyPrice);
                  if (owed > 0) {
                    await tx.supplierDebt.create({
                      data: {
                        organizationId: orgId,
                        productId: id,
                        label: product.name,
                        amount: owed,
                        status: 'OPEN',
                        createdById: auth.user.sub,
                        ...(parsed.data.supplierDebt.supplierName
                          ? { supplierName: parsed.data.supplierDebt.supplierName }
                          : {}),
                      },
                    });
                  }
                }

                await tx.stockMovement.create({
                  data: {
                    organizationId: orgId,
                    productId: id,
                    type: parsed.data.type ?? (delta > 0 ? 'IN' : 'OUT'),
                    delta,
                    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
                    createdById: auth.user.sub,
                    ...(clientOpId ? { clientOpId } : {}),
                  },
                });
                // Écriture ATOMIQUE en delta (increment/decrement), pas l'absolu
                // `newQty` calculé depuis la lecture ci-dessus : rejeu-safe et
                // concurrency-safe (deux ajustements concurrents composent
                // correctement au lieu que le second écrase le premier).
                const updated = await tx.product.update({
                  where: { id },
                  data: {
                    qty: { increment: delta },
                    // Réapprovisionnement avec prix d'achat : on met à jour le coût
                    // courant.
                    ...(parsed.data.buyPrice !== undefined
                      ? { buyPrice: parsed.data.buyPrice }
                      : {}),
                  },
                  select: PRODUCT_SELECT,
                });
                return { kind: 'OK', product: updated };
              },
            ),
          { isolationLevel: 'Serializable' },
        ),
      );
      result = outcome.result;
      replayed = outcome.replayed;
    } catch (e) {
      // Un rejet métier a fait avorter la transaction (rollback : rien n'est
      // écrit, rien n'est mémoïsé). On restitue la réponse HTTP identique à
      // celle d'avant le refactor. Toute autre erreur continue de remonter.
      if (e instanceof AdjustRejection) {
        return NextResponse.json(e.payload, {
          status: e.status,
          headers: { 'x-request-id': reqCtx.requestId },
        });
      }
      throw e;
    }

    // Alerte post-réponse (best-effort) : « stock bas » si l'ajustement laisse
    // le produit sous son seuil d'alerte. Jamais sur un rejeu — l'effet date de
    // la 1re exécution.
    if (!replayed) {
      notifyAfterResponse(() => onProductAdjusted(prisma, { orgId, productId: id }));
    }

    return NextResponse.json(
      { product: productView(result.product) },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
