// POST /api/admin/boutiques/[id]/delete — SUPPRESSION COMPLÈTE d'une boutique.
//
// SUPERADMIN uniquement, destructif et IRRÉVERSIBLE. Exige de retaper le nom
// exact de la boutique (`confirmName`).
//
// Supprime : la boutique + toutes ses données (cascade : produits, ventes,
// clients, créances, dépenses, documents, réglages, paiements d'abonnement,
// liens d'équipe) + les dettes fournisseurs (scalaire sans cascade) + les
// COMPTES devenus orphelins (patron + vendeurs qui n'appartiennent plus à
// aucune boutique). Les emails redeviennent libres.
//
// Garde-fous : refuse si le patron est un ADMIN/SUPERADMIN (compte staff) ; ne
// supprime jamais un compte staff, ni un compte encore rattaché à une autre
// boutique (retiré de celle-ci seulement).
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
      select: {
        id: true,
        name: true,
        owner: { select: { id: true, role: true } },
        members: { select: { userId: true } },
      },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'BOUTIQUE_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (parsed.data.confirmName.trim() !== org.name.trim()) {
      return NextResponse.json(
        { error: 'CONFIRM_MISMATCH', message: 'Le nom saisi ne correspond pas à la boutique.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Ne jamais supprimer une boutique dont le patron est un compte staff.
    if (org.owner.role !== 'USER') {
      return NextResponse.json(
        {
          error: 'OWNER_IS_STAFF',
          message: 'Le patron est un administrateur : retirez d’abord son rôle.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Comptes candidats à la suppression : patron + vendeurs de la boutique.
    const candidateIds = Array.from(new Set([org.owner.id, ...org.members.map((m) => m.userId)]));

    const deletedUsers = await prisma.$transaction(async (tx) => {
      // Dettes fournisseurs : scalaire `organizationId` sans FK cascade.
      await tx.supplierDebt.deleteMany({ where: { organizationId: id } });
      // La boutique part : cascade sur toutes ses données + liens d'équipe.
      await tx.organization.delete({ where: { id } });

      // Après la suppression, on retire les comptes devenus orphelins : plus
      // aucune boutique possédée NI aucune adhésion, et rôle USER (jamais staff).
      let removed = 0;
      for (const uid of candidateIds) {
        const owns = await tx.organization.count({ where: { ownerId: uid } });
        if (owns > 0) continue;
        const memberships = await tx.organizationMember.count({ where: { userId: uid } });
        if (memberships > 0) continue;
        const u = await tx.user.findUnique({ where: { id: uid }, select: { role: true } });
        if (!u || u.role !== 'USER') continue;
        await tx.user.delete({ where: { id: uid } });
        removed += 1;
      }

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'boutique.delete',
        targetType: 'Organization',
        targetId: id,
        metadata: { name: org.name, deletedUsers: removed, candidates: candidateIds.length },
      });

      return removed;
    });

    return NextResponse.json(
      { ok: true, deletedUsers },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
