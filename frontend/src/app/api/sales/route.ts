// Phase 3 — GET + POST /api/sales.
//
// POST = checkout : valide le stock, crée la vente + ses lignes (instantané
// nom/prix), décrémente le stock via des StockMovement OUT, le tout dans UNE
// transaction Serializable (pas de survente sous concurrence). Numéro de vente
// séquentiel par boutique (V-0001). method: cash | mobile | credit. Une vente
// à crédit exige un client.
//
// GET = historique (100 dernières ventes, lignes + client). Rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() }))
    .min(1),
  method: z.enum(['cash', 'mobile', 'credit']),
  customer: z
    .object({
      id: z.string().min(1).optional(),
      name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(40).optional(),
    })
    .optional(),
});

type CheckoutResult =
  | { kind: 'PRODUCT_NOT_FOUND'; productId: string }
  | { kind: 'INSUFFICIENT'; productId: string }
  | { kind: 'CREDIT_NO_CUSTOMER' }
  | { kind: 'OK'; saleId: string; number: string; total: number };

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

    const rows = await prisma.sale.findMany({
      where: { organizationId: primary.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        method: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true } },
        items: { select: { name: true, qty: true, unitPrice: true } },
      },
    });

    const sales = rows.map((s) => ({
      id: s.id,
      number: s.number,
      method: s.method,
      total: s.total,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      customerName: s.customer?.name ?? null,
      items: s.items,
    }));

    return NextResponse.json(
      { sales },
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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const orgId = primary.organizationId;
    const userSub = auth.user.sub;
    const method = parsed.data.method.toUpperCase();
    const items = parsed.data.items;
    const customerInput = parsed.data.customer;

    const result: CheckoutResult = await prisma.$transaction(
      async (tx) => {
        const ids = items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: ids }, organizationId: orgId },
          select: { id: true, name: true, sellPrice: true, qty: true },
        });
        const byId = new Map(products.map((p) => [p.id, p]));

        for (const item of items) {
          const p = byId.get(item.productId);
          if (!p) return { kind: 'PRODUCT_NOT_FOUND', productId: item.productId };
          if (item.qty > p.qty) return { kind: 'INSUFFICIENT', productId: item.productId };
        }

        // Résolution du client (création à la volée si nom fourni sans id).
        let customerId: string | null = null;
        if (customerInput?.id) {
          const c = await tx.customer.findUnique({
            where: { id: customerInput.id },
            select: { organizationId: true },
          });
          if (c && c.organizationId === orgId) customerId = customerInput.id;
        } else if (customerInput?.name) {
          const c = await tx.customer.create({
            data: {
              organizationId: orgId,
              name: customerInput.name,
              phone: customerInput.phone ?? null,
            },
            select: { id: true },
          });
          customerId = c.id;
        }
        if (method === 'CREDIT' && !customerId) return { kind: 'CREDIT_NO_CUSTOMER' };

        const total = items.reduce((sum, item) => {
          const p = byId.get(item.productId);
          return sum + item.qty * (p ? p.sellPrice : 0);
        }, 0);

        const count = await tx.sale.count({ where: { organizationId: orgId } });
        const number = `V-${String(count + 1).padStart(4, '0')}`;

        const sale = await tx.sale.create({
          data: {
            organizationId: orgId,
            number,
            method,
            total,
            createdById: userSub,
            ...(customerId ? { customerId } : {}),
            items: {
              create: items.map((item) => {
                const p = byId.get(item.productId);
                return {
                  productId: item.productId,
                  name: p ? p.name : 'Article',
                  qty: item.qty,
                  unitPrice: p ? p.sellPrice : 0,
                };
              }),
            },
          },
          select: { id: true },
        });

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { qty: { decrement: item.qty } },
          });
          await tx.stockMovement.create({
            data: {
              organizationId: orgId,
              productId: item.productId,
              type: 'OUT',
              delta: -item.qty,
              reason: 'sale',
              createdById: userSub,
            },
          });
        }

        // Vente à crédit → ouvre une créance (Phase 4). customerId est garanti
        // ici car CREDIT sans client a déjà renvoyé CREDIT_NO_CUSTOMER plus haut.
        if (method === 'CREDIT' && customerId) {
          await tx.receivable.create({
            data: {
              organizationId: orgId,
              customerId,
              saleId: sale.id,
              amount: total,
              status: 'OPEN',
            },
          });
        }

        return { kind: 'OK', saleId: sale.id, number, total };
      },
      { isolationLevel: 'Serializable' },
    );

    if (result.kind === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json(
        { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable', productId: result.productId },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'INSUFFICIENT') {
      return NextResponse.json(
        { error: 'INSUFFICIENT_STOCK', message: 'Stock insuffisant', productId: result.productId },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'CREDIT_NO_CUSTOMER') {
      return NextResponse.json(
        { error: 'CREDIT_NEEDS_CUSTOMER', message: 'Une vente à crédit exige un client' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { sale: { id: result.saleId, number: result.number, total: result.total } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
