// POST /api/invitations/[token]/accept — accepter une invitation.
//
// Route pré-session (CSRF carve-out, comme signup/verify-email). L'invité fournit
// nom + mot de passe ; on crée son compte (email déjà vérifié, prouvé par le lien),
// on l'ajoute à la boutique, on marque l'invitation consommée, puis on émet la
// session (connexion directe). Si l'email a entre-temps un compte, on l'ajoute
// comme membre et on lui demande de se connecter (on ne touche pas à son mot de passe).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import {
  hashPassword,
  setAuthCookies,
  setCsrfCookie,
  createAccessToken,
  createRefreshToken,
} from '@/lib/server/auth';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'invite:accept',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_INVITE_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many attempts. Try again later.',
});

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002'
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await context.params;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, password } = parsed.data;

    const invite = await prisma.invitation.findUnique({
      where: { token },
      select: { email: true, role: true, organizationId: true, acceptedAt: true, expiresAt: true },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'INVITATION_INVALID', message: 'Invitation invalide ou expirée' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rateFail = await limiter.check(req, invite.email);
    if (rateFail) return rateFail;

    // Politique de mot de passe (mêmes garde-fous que l'inscription).
    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const email = invite.email;
    const orgId = invite.organizationId;
    const role = invite.role;

    // L'email a déjà un compte (créé entre l'invitation et l'acceptation) :
    // on l'ajoute comme membre + on consomme l'invitation, SANS toucher au mot
    // de passe. L'invité se connectera normalement.
    async function attachExistingAndAccept(userId: string): Promise<void> {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: orgId, userId } },
          select: { id: true },
        });
        if (!existing) {
          await tx.organizationMember.create({
            data: { organizationId: orgId, userId, role },
          });
        }
        await tx.invitation.updateMany({
          where: { token, acceptedAt: null },
          data: { acceptedAt: new Date() },
        });
      });
    }

    const preexisting = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (preexisting) {
      await attachExistingAndAccept(preexisting.id);
      log.info('invitation accepted (existing account)', { email });
      return NextResponse.json(
        { alreadyAccount: true },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Nouveau compte : création + adhésion + consommation, en une transaction.
    const passwordHash = await hashPassword(password);
    let user: { id: string; email: string; tokenVersion: number };
    try {
      user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { email, passwordHash, name, emailVerifiedAt: new Date() },
          select: { id: true, email: true, tokenVersion: true },
        });
        await tx.organizationMember.create({
          data: { organizationId: orgId, userId: u.id, role },
        });
        const consumed = await tx.invitation.updateMany({
          where: { token, acceptedAt: null },
          data: { acceptedAt: new Date() },
        });
        if (consumed.count === 0) throw new Error('INVITATION_RACE');
        return u;
      });
    } catch (err) {
      // Course : un compte avec cet email vient d'apparaître → bascule en
      // « ajouter le membre » et demande de se connecter.
      if (isUniqueViolation(err)) {
        const now = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (now) {
          await attachExistingAndAccept(now.id);
          return NextResponse.json(
            { alreadyAccount: true },
            { status: 200, headers: { 'x-request-id': ctx.requestId } },
          );
        }
      }
      if (err instanceof Error && err.message === 'INVITATION_RACE') {
        return NextResponse.json(
          { error: 'INVITATION_INVALID', message: 'Invitation invalide ou expirée' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    // Connexion directe (mêmes cookies que verify-email).
    const access = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refresh = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(access, refresh);
    const csrfToken = await setCsrfCookie();

    log.info('invitation accepted (new account)', { userId: user.id });
    const res = NextResponse.json({
      ok: true,
      user: { sub: user.id, email: user.email },
      csrfToken,
    });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
