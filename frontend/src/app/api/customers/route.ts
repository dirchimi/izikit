// Phase 4 — GET + POST /api/customers.
//
// GET  : liste les clients de la boutique (id, nom, téléphone), triés par nom.
//        Sert au sélecteur de client du POS et à l'écran Créances.
// POST : crée un client (nom requis, téléphone optionnel). Rôle min MEMBER.
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
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
});

async function resolveOrg(
  req: NextRequest,
  ctx: ReturnType<typeof makeRequestContext>,
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
  const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
  if (gate instanceof NextResponse) return gate;
  return { orgId: primary.organizationId, userSub: auth.user.sub };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const org = await resolveOrg(req, ctx);
    if (org instanceof NextResponse) return org;

    const customers = await prisma.customer.findMany({
      where: { organizationId: org.orgId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true },
    });

    return NextResponse.json(
      { customers },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const org = await resolveOrg(req, ctx);
    if (org instanceof NextResponse) return org;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'nom requis' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const customer = await prisma.customer.create({
      data: {
        organizationId: org.orgId,
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
      },
      select: { id: true, name: true, phone: true },
    });

    return NextResponse.json(
      { customer },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
