// POST /api/admin/boutiques/[id]/wipe-data — vide les données OPÉRATIONNELLES
// d'une boutique tout en la gardant vivante.
//
// SUPERADMIN uniquement, destructif et IRRÉVERSIBLE. Exige de retaper le nom
// exact de la boutique (`confirmName`) pour éviter une erreur de cible.
//
// Effacé (transaction, ordre enfant → parent) : documents, remboursements,
// créances, ventes (→ lignes de vente en cascade), mouvements de stock, dettes
// fournisseurs, dépenses, clients, produits.
//
// CONSERVÉ : la boutique elle-même, ses réglages, l'équipe (membres + invitations)
// et l'abonnement (statut + historique des paiements). Les numéros de vente/
// facture/dépense repartent de 1 (générés en count+1).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ confirmName: z.string() });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'BOUTIQUE_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Garde-fou : le nom saisi doit correspondre exactement (trim des deux côtés).
    if (parsed.data.confirmName.trim() !== org.name.trim()) {
      return NextResponse.json(
        { error: 'CONFIRM_MISMATCH', message: 'Le nom saisi ne correspond pas à la boutique.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const where = { organizationId: id };
    const counts = await prisma.$transaction(async (tx) => {
      // Ordre enfant → parent. Les lignes de vente (SaleItem) et certaines
      // relations s'effacent en cascade via leurs parents ; on supprime les
      // tables à scalaire `organizationId` (dette fournisseur, mouvement de
      // stock) explicitement car elles n'ont pas de FK cascade vers la boutique.
      const documents = await tx.document.deleteMany({ where });
      const repayments = await tx.repayment.deleteMany({ where });
      const receivables = await tx.receivable.deleteMany({ where });
      const sales = await tx.sale.deleteMany({ where });
      const stockMovements = await tx.stockMovement.deleteMany({ where });
      const supplierDebts = await tx.supplierDebt.deleteMany({ where });
      const expenses = await tx.expense.deleteMany({ where });
      const customers = await tx.customer.deleteMany({ where });
      const products = await tx.product.deleteMany({ where });

      const result = {
        products: products.count,
        stockMovements: stockMovements.count,
        customers: customers.count,
        sales: sales.count,
        receivables: receivables.count,
        supplierDebts: supplierDebts.count,
        repayments: repayments.count,
        expenses: expenses.count,
        documents: documents.count,
      };

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'boutique.wipe_data',
        targetType: 'Organization',
        targetId: id,
        metadata: { name: org.name, ...result },
      });

      return result;
    });

    return NextResponse.json(
      { ok: true, deleted: counts },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
