// Invitations d'employés — GET (liste en attente) + POST (inviter / ajouter).
//
// POST (rôle min ADMIN) : si l'email a DÉJÀ un compte → on l'ajoute directement
// comme membre ; sinon → on crée une invitation (jeton + 7 j) et on envoie un
// email avec le lien d'acceptation. GET (rôle min MEMBER) : invitations en
// attente (non acceptées, non expirées).
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  getPrimaryMembership,
  dissolveEmptyAutoBoutique,
} from '@/lib/server/boutique/ensure-boutique';
import { enqueueOutbox } from '@/lib/server/outbox';
import { flushEmailsAfterResponse } from '@/lib/server/email/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sahilley.com';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

const PostBody = z.object({
  email: z.string().trim().toLowerCase().email(),
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

    const rows = await prisma.invitation.findMany({
      where: {
        organizationId: primary.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });

    const invitations = rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      expiresAt: r.expiresAt instanceof Date ? r.expiresAt.toISOString() : r.expiresAt,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    return NextResponse.json(
      { invitations },
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
    const email = parsed.data.email;
    const role = parsed.data.role ?? 'MEMBER';

    // 1) L'email a déjà un compte → on l'ajoute directement comme membre.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (existingUser) {
      const already = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: existingUser.id } },
        select: { id: true },
      });
      if (already) {
        return NextResponse.json(
          { error: 'ALREADY_MEMBER', message: 'Cet utilisateur est déjà membre' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const member = await prisma.$transaction(async (tx) => {
        const m = await tx.organizationMember.create({
          data: { organizationId: orgId, userId: existingUser.id, role },
          select: { id: true, userId: true, role: true },
        });
        // S'il s'était inscrit tout seul avant d'être ajouté, il POSSÈDE une
        // boutique auto-créée vide — et getPrimaryMembership (possédée
        // d'abord) l'y enfermerait à vie : catalogue vide, ventes dans le
        // mauvais tenant. On dissout l'artefact dans la même transaction.
        await dissolveEmptyAutoBoutique(tx, existingUser.id);
        return m;
      });
      return NextResponse.json(
        {
          added: true,
          member: {
            id: member.id,
            userId: member.userId,
            email: existingUser.email,
            name: existingUser.name,
            role: member.role,
          },
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 2) Email inconnu → invitation par email (jeton + lien).
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'la boutique';
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const link = `${SITE_URL}/rejoindre?token=${token}`;

    await prisma.$transaction(async (tx) => {
      // Repartir propre : on supprime les invitations en attente précédentes
      // pour ce même email + boutique (un nouvel envoi remplace l'ancien).
      await tx.invitation.deleteMany({
        where: { organizationId: orgId, email, acceptedAt: null },
      });
      await tx.invitation.create({
        data: {
          token,
          email,
          organizationId: orgId,
          role,
          invitedByUserId: auth.user.sub,
          expiresAt,
        },
      });
      await enqueueOutbox(tx, {
        kind: 'email.org_invitation',
        payload: {
          to: email,
          orgName,
          inviterEmail: auth.user.email,
          link,
          expiresAt: expiresAt.toISOString(),
        },
      });
    });

    flushEmailsAfterResponse();
    return NextResponse.json(
      { invited: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
