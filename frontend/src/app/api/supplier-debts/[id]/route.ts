// Dettes fournisseurs — DELETE /api/supplier-debts/[id].
//
// Supprime UNE dette fournisseur : saisie par erreur, ou dette restée après la
// suppression du produit lié (SupplierDebt.productId est un scalaire sans FK —
// la dette SURVIT volontairement au produit, c'est de l'argent réellement dû).
// La suppression est donc TOUJOURS une décision humaine explicite (confirmation
// UI côté StockManager/SupplierDebtsPanel) — jamais une cascade silencieuse de
// la suppression d'un produit. 404 si la dette n'appartient pas à la boutique.
// Réservé Patron (OWNER) / Manager (ADMIN), comme le paiement.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscription/guard';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
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
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    // « Appli douce » : abonnement expiré (hors grâce) → écriture refusée.
    const locked = await requireActiveSubscription(primary.organizationId);
    if (locked) return locked;

    const { id } = await ctx.params;
    // deleteMany scopé boutique : 0 ligne = introuvable OU pas à nous → 404
    // dans les deux cas (pas de fuite d'existence inter-boutiques).
    const deleted = await prisma.supplierDebt.deleteMany({
      where: { id, organizationId: primary.organizationId },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: 'DEBT_NOT_FOUND', message: 'Dette introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
