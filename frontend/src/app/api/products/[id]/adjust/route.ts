// Phase 2 — POST /api/products/[id]/adjust.
//
// Ajuste le stock d'un produit en écrivant un StockMovement et en mettant à
// jour `qty` dans la MÊME transaction (ledger d'inventaire). `delta` signé :
// > 0 = entrée (IN), < 0 = sortie (OUT). Refuse si le stock passe sous 0
// (409 INSUFFICIENT_STOCK). Rôle min ADMIN (Manager).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { productView, PRODUCT_SELECT } from '@/lib/server/products/helpers';
import { onProductAdjusted } from '@/lib/server/notifications/boutique-events';
import { notifyAfterResponse } from '@/lib/server/notifications/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  delta: z.number().int(),
  reason: z.string().trim().max(120).optional(),
});

type AdjustResult =
  | { kind: 'NOT_FOUND' }
  | { kind: 'INSUFFICIENT' }
  | { kind: 'OK'; product: Parameters<typeof productView>[0] };

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

    const result: AdjustResult = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: { organizationId: true, qty: true },
      });
      if (!product || product.organizationId !== orgId) return { kind: 'NOT_FOUND' };

      const newQty = product.qty + delta;
      if (newQty < 0) return { kind: 'INSUFFICIENT' };

      await tx.stockMovement.create({
        data: {
          organizationId: orgId,
          productId: id,
          type: delta > 0 ? 'IN' : 'OUT',
          delta,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
          createdById: auth.user.sub,
        },
      });
      const updated = await tx.product.update({
        where: { id },
        data: { qty: newQty },
        select: PRODUCT_SELECT,
      });
      return { kind: 'OK', product: updated };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'INSUFFICIENT') {
      return NextResponse.json(
        { error: 'INSUFFICIENT_STOCK', message: 'Stock insuffisant pour cette sortie' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    // Alerte post-réponse (best-effort) : « stock bas » si l'ajustement laisse
    // le produit sous son seuil d'alerte.
    notifyAfterResponse(() => onProductAdjusted(prisma, { orgId, productId: id }));

    return NextResponse.json(
      { product: productView(result.product) },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
