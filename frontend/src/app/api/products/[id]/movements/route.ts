// GET /api/products/[id]/movements — historique complet des mouvements de stock
// d'un produit (traçabilité). Chaque vente, entrée (réappro), sortie et
// ajustement écrit un StockMovement ; on les liste ici du plus récent au plus
// ancien, avec le stock résultant calculé (somme cumulée des deltas depuis
// l'origine), le type, la quantité signée, l'auteur et le motif.
//
// Rôle min MEMBER : consultation (traçabilité). Produit hors boutique → 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const { id } = await ctx.params;
    const orgId = primary.organizationId;

    const product = await prisma.product.findUnique({
      where: { id },
      select: { organizationId: true, name: true, unite: true },
    });
    if (!product || product.organizationId !== orgId) {
      return NextResponse.json(
        { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Ordre ascendant pour cumuler les deltas → stock résultant à chaque étape.
    const movements = await prisma.stockMovement.findMany({
      where: { productId: id, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        delta: true,
        reason: true,
        createdAt: true,
        createdById: true,
      },
    });

    // Résolution des auteurs (createdById est un String libre, pas une relation).
    const authorIds = [
      ...new Set(movements.map((m) => m.createdById).filter((v): v is string => !!v)),
    ];
    const authors =
      authorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const authorById = new Map(authors.map((u) => [u.id, u.name ?? u.email]));

    let running = 0;
    const rows = movements.map((m) => {
      running += m.delta;
      return {
        id: m.id,
        type: m.type,
        delta: m.delta,
        resultingStock: running,
        reason: m.reason,
        author: m.createdById ? (authorById.get(m.createdById) ?? null) : null,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      };
    });
    // Le plus récent en premier pour l'affichage.
    rows.reverse();

    return NextResponse.json(
      { product: { id, name: product.name, unite: product.unite }, movements: rows },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
