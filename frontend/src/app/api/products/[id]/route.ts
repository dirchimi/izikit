// Phase 2 — PATCH (métadonnées) + DELETE /api/products/[id].
//
// PATCH ne touche PAS à `qty` (la quantité change uniquement via /adjust, qui
// écrit un mouvement). DELETE supprime le produit (mouvements en cascade).
// Rôle min ADMIN (Manager) — modification du catalogue. Produit hors boutique → 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { productView, isUniqueViolation, PRODUCT_SELECT } from '@/lib/server/products/helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  ref: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  buyPrice: z.number().int().min(0).optional(),
  sellPrice: z.number().int().min(0).optional(),
  threshold: z.number().int().min(0).optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
});

async function resolveOrg(
  req: NextRequest,
  ctx: { requestId: string },
): Promise<{ orgId: string; userSub: string } | NextResponse> {
  const auth = await requireAuth(req.headers.get('authorization'));
  if (auth instanceof NextResponse) return auth;
  const primary = await getPrimaryMembership(auth.user.sub);
  if (!primary) {
    return NextResponse.json(
      { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
      { status: 404, headers: { 'x-request-id': ctx.requestId } },
    );
  }
  // PATCH (édition) et DELETE (suppression) modifient le catalogue/stock →
  // réservés au Patron (OWNER) et au Manager (ADMIN).
  const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
  if (gate instanceof NextResponse) return gate;
  return { orgId: primary.organizationId, userSub: auth.user.sub };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const org = await resolveOrg(req, reqCtx);
    if (org instanceof NextResponse) return org;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id } = await ctx.params;
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== org.orgId) {
      return NextResponse.json(
        { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const d = parsed.data;
    const data = {
      ...(d.ref !== undefined ? { ref: d.ref } : {}),
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.buyPrice !== undefined ? { buyPrice: d.buyPrice } : {}),
      ...(d.sellPrice !== undefined ? { sellPrice: d.sellPrice } : {}),
      ...(d.threshold !== undefined ? { threshold: d.threshold } : {}),
      ...(d.imageUrl !== undefined ? { imageUrl: d.imageUrl } : {}),
      ...(d.barcode !== undefined
        ? { barcode: d.barcode && d.barcode.length > 0 ? d.barcode : null }
        : {}),
    };

    try {
      const updated = await prisma.product.update({ where: { id }, data, select: PRODUCT_SELECT });
      return NextResponse.json(
        { product: productView(updated) },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { error: 'REF_TAKEN', message: 'Cette référence existe déjà' },
          { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw e;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const org = await resolveOrg(req, reqCtx);
    if (org instanceof NextResponse) return org;

    const { id } = await ctx.params;
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== org.orgId) {
      return NextResponse.json(
        { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
