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
import { requireActiveSubscription } from '@/lib/server/subscription/guard';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  // Offline-first (Task 0.5): the client may supply the id it generated
  // locally so a replayed POST (retry after a dropped response) dedupes on
  // that id instead of creating a second customer. Online callers omit it.
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
});

/** Duck-typed P2002 check — mirrors the pattern in notifications/index.ts and slug.ts. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

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

    // « Appli douce » : abonnement expiré (hors grâce) → écriture refusée.
    const locked = await requireActiveSubscription(org.orgId);
    if (locked) return locked;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'nom requis' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id, name, phone } = parsed.data;

    try {
      const customer = await prisma.customer.create({
        data: {
          ...(id ? { id } : {}),
          organizationId: org.orgId,
          name,
          phone: phone ?? null,
        },
        select: { id: true, name: true, phone: true },
      });

      return NextResponse.json(
        { customer },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      // No transaction here (pure create) so this is a plain autocommit —
      // safe to re-read on the same client after a caught error. A P2002 on
      // the client-supplied `id` means this is a replay of an already-created
      // customer: refetch and return it instead of erroring.
      if (!isUniqueViolation(err) || !id) throw err;

      const existing = await prisma.customer.findUnique({
        where: { id },
        select: { id: true, name: true, phone: true, organizationId: true },
      });

      // Defense-in-depth: cuid ids are globally unique so a cross-tenant
      // collision is practically impossible, but never leak another org's
      // customer if it somehow happens.
      if (!existing || existing.organizationId !== org.orgId) {
        return NextResponse.json(
          { error: 'CUSTOMER_ID_CONFLICT', message: "Conflit d'identifiant client" },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      return NextResponse.json(
        { customer: { id: existing.id, name: existing.name, phone: existing.phone } },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
