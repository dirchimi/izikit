// Task 1.2 (offline-first) — GET /api/sync/pull?since=<iso>
//
// Batch read endpoint that seeds/refreshes the client's local mirror
// (Dexie, see `frontend/src/lib/offline/db.ts`) in a single round trip.
// Returns the 7 org-scoped domain tables + `repayments` (Task 5.2) + a
// `serverTime` cursor the client stores (`meta.lastPull`) for its next
// incremental pull.
//
// Filtering: `updatedAt > since` per table when `since` is provided,
// otherwise a full org snapshot. All 7 `@updatedAt`-bearing models
// (`Product`, `Customer`, `Sale`, `Receivable`, `Expense`, `Document`,
// `StockMovement`) carry an `@updatedAt` column (Task 1.2 schema
// prerequisite — Sale/Expense/Document/StockMovement gained theirs in
// migration `35_sync_updated_at`), so the same filter shape applies
// uniformly across the Promise.all.
//
// `Repayment` (Task 5.2) is append-only/immutable — rows are never edited
// after creation, so there is no `@updatedAt` column and none is added
// (no migration needed). It's filtered on `createdAt > since` instead, and
// is scoped directly by its own `organizationId` column (see schema.prisma
// — Repayment carries `organizationId` itself, unlike SaleItem below).
//
// `Sale.items` (SaleItem) has no `organizationId`/`updatedAt` of its own —
// it can't be filtered independently, so each sale row carries its items
// nested (`sale.items[]`); the client's `pull.ts` (Task 1.3) flattens them
// into the separate Dexie `saleItems` table.
//
// Read-only → no CSRF check. Auth: requireAuth + org membership +
// requireOrgRole('MEMBER') (Vendeur can sync, matches other read routes
// like /api/products, /api/search).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

/** Parses `?since=` into a Date, or `undefined` if absent. Throws on an
 * invalid (non-empty, non-parseable) value so the caller can 400. */
function parseSince(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error('INVALID_SINCE');
  }
  return d;
}

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

    let since: Date | undefined;
    try {
      since = parseSince(req.nextUrl.searchParams.get('since'));
    } catch {
      return NextResponse.json(
        { error: 'INVALID_SINCE', message: 'Le paramètre since doit être une date ISO valide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const organizationId = primary.organizationId;
    const updatedAtFilter = since ? { updatedAt: { gt: since } } : {};
    // Repayment has no `updatedAt` (append-only/immutable rows — see the
    // module docblock above), so it filters on `createdAt` instead.
    const createdAtFilter = since ? { createdAt: { gt: since } } : {};

    const [
      products,
      customers,
      sales,
      receivables,
      expenses,
      documents,
      stockMovements,
      repayments,
    ] = await Promise.all([
      prisma.product.findMany({ where: { organizationId, ...updatedAtFilter } }),
      prisma.customer.findMany({ where: { organizationId, ...updatedAtFilter } }),
      prisma.sale.findMany({
        where: { organizationId, ...updatedAtFilter },
        include: { items: true },
      }),
      prisma.receivable.findMany({ where: { organizationId, ...updatedAtFilter } }),
      prisma.expense.findMany({ where: { organizationId, ...updatedAtFilter } }),
      prisma.document.findMany({ where: { organizationId, ...updatedAtFilter } }),
      prisma.stockMovement.findMany({ where: { organizationId, ...updatedAtFilter } }),
      prisma.repayment.findMany({ where: { organizationId, ...createdAtFilter } }),
    ]);

    return NextResponse.json(
      {
        products,
        customers,
        sales,
        receivables,
        expenses,
        documents,
        stockMovements,
        repayments,
        // Task 5.1 — additive: the caller's current boutique id, so the
        // client can populate `meta.orgId` (see `frontend/src/lib/offline/pull.ts`'s
        // `getOrgId()`). Product-less offline writes (expenses, later
        // customers/adjust/repay) need an org id but have no referenced row
        // to derive it from the way `createSaleOffline` derives it from the
        // sale's products.
        orgId: organizationId,
        serverTime: new Date().toISOString(),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
