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
import { onSaleCommitted } from '@/lib/server/notifications/boutique-events';
import { notifyAfterResponse } from '@/lib/server/notifications/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          qty: z.number().int().positive(),
          // Ligne facturée au prix de gros (prixGros) plutôt qu'au détail.
          wholesale: z.boolean().optional(),
        }),
      )
      .min(1),
    // Paiement unique (compat). Absent si une ventilation `payments` est fournie.
    method: z.enum(['cash', 'mobile', 'credit']).optional(),
    // Paiement mixte : une ou plusieurs tranches par méthode. Leur somme doit
    // égaler le total (recalculé serveur-side). La part `credit` devient la créance.
    payments: z
      .array(
        z.object({
          method: z.enum(['cash', 'mobile', 'credit']),
          amount: z.number().int().nonnegative(),
        }),
      )
      .max(3)
      .optional(),
    customer: z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
  })
  .refine((d) => d.method !== undefined || (d.payments?.length ?? 0) > 0, {
    message: 'method_or_payments_required',
  });

type CheckoutResult =
  | { kind: 'PRODUCT_NOT_FOUND'; productId: string }
  | { kind: 'INSUFFICIENT'; productId: string }
  | { kind: 'CREDIT_NO_CUSTOMER' }
  | { kind: 'PAYMENT_MISMATCH' }
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
        cashAmount: true,
        mobileAmount: true,
        creditAmount: true,
        status: true,
        createdAt: true,
        createdById: true,
        customer: { select: { name: true, phone: true } },
        items: { select: { name: true, qty: true, unitPrice: true } },
      },
    });

    // Nom du vendeur (traçabilité) : pas de relation Sale→User, on résout les
    // ids en un seul findMany. `name` peut être null (compte email) → email.
    const sellerIds = Array.from(
      new Set(rows.map((s) => s.createdById).filter((v): v is string => v !== null)),
    );
    const sellers =
      sellerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const sellerName = new Map(sellers.map((u) => [u.id, u.name ?? u.email]));

    const sales = rows.map((s) => ({
      id: s.id,
      number: s.number,
      method: s.method,
      total: s.total,
      cashAmount: s.cashAmount,
      mobileAmount: s.mobileAmount,
      creditAmount: s.creditAmount,
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      sellerId: s.createdById,
      sellerName: s.createdById ? (sellerName.get(s.createdById) ?? null) : null,
      customerName: s.customer?.name ?? null,
      customerPhone: s.customer?.phone ?? null,
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
    const items = parsed.data.items;
    const customerInput = parsed.data.customer;
    const paymentsInput = parsed.data.payments;
    const legacyMethod = parsed.data.method;

    const result: CheckoutResult = await prisma.$transaction(
      async (tx) => {
        const ids = items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: ids }, organizationId: orgId },
          select: {
            id: true,
            name: true,
            sellPrice: true,
            prixGros: true,
            buyPrice: true,
            qty: true,
          },
        });
        const byId = new Map(products.map((p) => [p.id, p]));

        // Prix unitaire d'une ligne : gros si demandé ET défini (> 0), sinon détail.
        const unitPriceFor = (p: { sellPrice: number; prixGros: number }, wholesale?: boolean) =>
          wholesale && p.prixGros > 0 ? p.prixGros : p.sellPrice;

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
        const total = items.reduce((sum, item) => {
          const p = byId.get(item.productId);
          return sum + item.qty * (p ? unitPriceFor(p, item.wholesale) : 0);
        }, 0);

        // Ventilation du paiement. Avec `payments` : somme par méthode, qui doit
        // égaler le total. Sinon : paiement unique via `method` (compat).
        const bd = { CASH: 0, MOBILE: 0, CREDIT: 0 };
        if (paymentsInput && paymentsInput.length > 0) {
          for (const p of paymentsInput) {
            bd[p.method.toUpperCase() as keyof typeof bd] += p.amount;
          }
          if (bd.CASH + bd.MOBILE + bd.CREDIT !== total) return { kind: 'PAYMENT_MISMATCH' };
        } else {
          bd[(legacyMethod ?? 'cash').toUpperCase() as keyof typeof bd] = total;
        }
        const creditAmount = bd.CREDIT;
        const parts = (['CASH', 'MOBILE', 'CREDIT'] as const).filter((k) => bd[k] > 0);
        const method = parts.length >= 2 ? 'MIXED' : (parts[0] ?? 'CASH');

        // La part crédit exige un client (sélectionné ou créé à la volée).
        if (creditAmount > 0 && !customerId) return { kind: 'CREDIT_NO_CUSTOMER' };

        const count = await tx.sale.count({ where: { organizationId: orgId } });
        const number = `V-${String(count + 1).padStart(4, '0')}`;

        const sale = await tx.sale.create({
          data: {
            organizationId: orgId,
            number,
            method,
            total,
            cashAmount: bd.CASH,
            mobileAmount: bd.MOBILE,
            creditAmount,
            createdById: userSub,
            ...(customerId ? { customerId } : {}),
            items: {
              create: items.map((item) => {
                const p = byId.get(item.productId);
                return {
                  productId: item.productId,
                  name: p ? p.name : 'Article',
                  qty: item.qty,
                  unitPrice: p ? unitPriceFor(p, item.wholesale) : 0,
                  buyPrice: p ? p.buyPrice : 0,
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

        // Part à crédit → ouvre une créance du montant restant dû (creditAmount).
        // customerId garanti ici (crédit sans client déjà renvoyé plus haut).
        if (creditAmount > 0 && customerId) {
          await tx.receivable.create({
            data: {
              organizationId: orgId,
              customerId,
              saleId: sale.id,
              amount: creditAmount,
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
    if (result.kind === 'PAYMENT_MISMATCH') {
      return NextResponse.json(
        {
          error: 'PAYMENT_MISMATCH',
          message: 'La ventilation du paiement ne correspond pas au total',
        },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // Alertes post-réponse (best-effort) : « nouvelle vente » (si un employé l'a
    // faite) + « stock bas » pour les produits repassés sous leur seuil.
    notifyAfterResponse(() =>
      onSaleCommitted(prisma, {
        orgId,
        sellerId: userSub,
        sale: { id: result.saleId, number: result.number, total: result.total },
        productIds: items.map((i) => i.productId),
      }),
    );

    return NextResponse.json(
      { sale: { id: result.saleId, number: result.number, total: result.total } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
