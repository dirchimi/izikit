// ADMIN-01 — GET /api/admin/users/[id] (detail).
//
// Sequence: makeRequestContext → withRequestContext → requireAdmin('ADMIN')
// → enforceAdminRateLimit → prisma.user.findUnique with the same PII-safe
// USER_SELECT shape as the list endpoint. 404 on miss with stable code
// USER_NOT_FOUND.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json({ user }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

/**
 * DELETE /api/admin/users/[id] — suppression définitive d'un compte (SUPERADMIN).
 *
 * Pour les comptes « pour rien » : inscription sans boutique, essais abandonnés.
 * Refuse un compte staff (ADMIN/SUPERADMIN) ou un compte qui possède encore une
 * boutique (→ passer par la suppression de boutique). Un vendeur rattaché à une
 * boutique est simplement retiré de celle-ci (cascade). Audité, irréversible.
 */
export async function DELETE(
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
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        _count: { select: { ownedOrganizations: true } },
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'Utilisateur introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (user.role !== 'USER') {
      return NextResponse.json(
        { error: 'CANNOT_DELETE_STAFF', message: 'Impossible de supprimer un administrateur.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (user._count.ownedOrganizations > 0) {
      return NextResponse.json(
        {
          error: 'USER_OWNS_BOUTIQUE',
          message: 'Ce compte possède une boutique. Supprimez d’abord la boutique.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.delete',
        targetType: 'User',
        targetId: id,
        metadata: { email: user.email },
      });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
