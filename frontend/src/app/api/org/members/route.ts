// Phase 1 — GET + POST /api/org/members.
//
// GET  : liste les membres de la boutique courante (rôle min MEMBER).
// POST : ajoute un utilisateur DÉJÀ INSCRIT par email (rôle min ADMIN).
//
// Limitation v1 : pas d'invitation par email d'un compte inexistant — on
// renvoie 422 USER_NOT_REGISTERED. Les invitations (token + email) sont une
// phase ultérieure.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PostBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  // OWNER ne s'attribue pas via cette route (transfert de propriété = futur).
  role: z.enum(['MEMBER', 'ADMIN']).optional(),
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

    const rows = await prisma.organizationMember.findMany({
      where: { organizationId: primary.organizationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, role: true, user: { select: { email: true, name: true } } },
    });

    const members = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: r.user.email,
      name: r.user.name,
      role: r.role,
    }));

    return NextResponse.json(
      { members },
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
    const role = parsed.data.role ?? 'MEMBER';

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_REGISTERED', message: "Cet email n'a pas encore de compte" },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'ALREADY_MEMBER', message: 'Cet utilisateur est déjà membre' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const created = await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: user.id, role },
      select: { id: true, userId: true, role: true },
    });

    return NextResponse.json(
      {
        member: {
          id: created.id,
          userId: created.userId,
          email: user.email,
          name: user.name,
          role: created.role,
        },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
