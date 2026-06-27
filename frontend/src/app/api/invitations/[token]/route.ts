// GET /api/invitations/[token] — détails d'une invitation (page d'acceptation).
// Route pré-session (publique) : pas d'auth, pas de CSRF (lecture seule). Ne
// révèle que le strict nécessaire pour afficher l'écran « Rejoindre ».
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await context.params;

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

    const org = await prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    });

    return NextResponse.json(
      { email: invite.email, role: invite.role, orgName: org?.name ?? 'la boutique' },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
