// Phase 2 — GET + POST /api/products.
//
// GET  : liste le catalogue de la boutique courante (statut stock dérivé).
// POST : crée un produit + un StockMovement IN initial (qty de départ).
//        La quantité ne change jamais sans mouvement (ledger d'inventaire).
//
// GET (consultation) : rôle min MEMBER (Vendeur). POST (modification du stock) :
// rôle min ADMIN (Manager) — le Vendeur ne crée/modifie pas le stock.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import {
  generateRef,
  productView,
  uniqueViolationField,
  PRODUCT_SELECT,
} from '@/lib/server/products/helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PostBody = z.object({
  ref: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  buyPrice: z.number().int().min(0).default(0),
  sellPrice: z.number().int().min(0).default(0),
  prixGros: z.number().int().min(0).default(0),
  unite: z.string().trim().min(1).max(30).default('piece'),
  qty: z.number().int().min(0).default(0),
  threshold: z.number().int().min(0).default(0),
  imageUrl: z.string().url().max(500).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const rows = await prisma.product.findMany({
      where: { organizationId: primary.organizationId },
      orderBy: [{ name: 'asc' }],
      select: PRODUCT_SELECT,
    });

    return NextResponse.json(
      { products: rows.map(productView) },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Création = modification du stock → réservée au Patron (OWNER) et au
    // Manager (ADMIN). Le Vendeur (MEMBER) ne peut pas créer de produit.
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    const parsed = PostBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const orgId = primary.organizationId;
    const d = parsed.data;
    const ref = d.ref && d.ref.length > 0 ? d.ref : generateRef();

    try {
      const product = await prisma.$transaction(async (tx) => {
        const p = await tx.product.create({
          data: {
            organizationId: orgId,
            ref,
            name: d.name,
            category: d.category,
            buyPrice: d.buyPrice,
            sellPrice: d.sellPrice,
            prixGros: d.prixGros,
            unite: d.unite,
            qty: d.qty,
            threshold: d.threshold,
            imageUrl: d.imageUrl ?? null,
            barcode: d.barcode && d.barcode.length > 0 ? d.barcode : null,
          },
          select: PRODUCT_SELECT,
        });
        if (d.qty > 0) {
          await tx.stockMovement.create({
            data: {
              organizationId: orgId,
              productId: p.id,
              type: 'IN',
              delta: d.qty,
              reason: 'initial',
              createdById: auth.user.sub,
            },
          });
        }
        return p;
      });

      return NextResponse.json(
        { product: productView(product) },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (e) {
      const field = uniqueViolationField(e);
      if (field === 'barcode') {
        return NextResponse.json(
          {
            error: 'BARCODE_TAKEN',
            message: 'Ce code-barres est déjà utilisé par un autre produit',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (field === 'ref') {
        return NextResponse.json(
          { error: 'REF_TAKEN', message: 'Cette référence existe déjà' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }
  });
}
