// Phase 1 — PATCH (rôle) + DELETE (retrait) /api/org/members/[id].
//
// PATCH : change le rôle d'un membre. Rôle min OWNER.
// DELETE: retire un membre. Rôle min ADMIN.
//
// Invariant : on refuse de rétrograder/retirer le DERNIER OWNER (sinon la
// boutique devient ingouvernable). Le garde COUNT + mutation est atomique
// (même transaction), comme le garde last-SUPERADMIN de l'admin back-office.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

type PatchResult =
  | { kind: 'NOT_FOUND' }
  | { kind: 'LAST_OWNER' }
  | { kind: 'OK'; member: { id: string; userId: string; role: string } };

type DeleteResult = { kind: 'NOT_FOUND' } | { kind: 'LAST_OWNER' } | { kind: 'OK' };

export async function PATCH(
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

    const gate = await requireOrgRole(primary.organizationId, 'OWNER');
    if (gate instanceof NextResponse) return gate;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id } = await ctx.params;
    const orgId = primary.organizationId;
    const newRole = parsed.data.role;

    const result: PatchResult = await prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findUnique({
        where: { id },
        select: { id: true, organizationId: true, userId: true, role: true },
      });
      if (!target || target.organizationId !== orgId) return { kind: 'NOT_FOUND' };

      if (target.role === 'OWNER' && newRole !== 'OWNER') {
        const owners = await tx.organizationMember.count({
          where: { organizationId: orgId, role: 'OWNER' },
        });
        if (owners <= 1) return { kind: 'LAST_OWNER' };
      }

      const updated = await tx.organizationMember.update({
        where: { id },
        data: { role: newRole },
        select: { id: true, userId: true, role: true },
      });
      return { kind: 'OK', member: updated };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'MEMBER_NOT_FOUND', message: 'Membre introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'LAST_OWNER') {
      return NextResponse.json(
        { error: 'LAST_OWNER', message: 'Impossible de rétrograder le dernier propriétaire' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { member: result.member },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
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

    const { id } = await ctx.params;
    const orgId = primary.organizationId;

    const result: DeleteResult = await prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findUnique({
        where: { id },
        select: { id: true, organizationId: true, role: true },
      });
      if (!target || target.organizationId !== orgId) return { kind: 'NOT_FOUND' };

      if (target.role === 'OWNER') {
        const owners = await tx.organizationMember.count({
          where: { organizationId: orgId, role: 'OWNER' },
        });
        if (owners <= 1) return { kind: 'LAST_OWNER' };
      }

      await tx.organizationMember.delete({ where: { id } });
      return { kind: 'OK' };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'MEMBER_NOT_FOUND', message: 'Membre introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'LAST_OWNER') {
      return NextResponse.json(
        { error: 'LAST_OWNER', message: 'Impossible de retirer le dernier propriétaire' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
