// POST /api/admin/announcements — diffuse une annonce à TOUS les patrons de
// boutique (une notification in-app par propriétaire de boutique non-interne).
//
// SUPERADMIN uniquement, CSRF, audité. Chaque diffusion a un id unique ; la
// dedupeKey `announcement:${annId}:${userId}` garantit une seule notification
// par destinataire même si la requête est rejouée.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createNotification } from '@/lib/server/notifications';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Titre (1–120) et message (1–1000) requis.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Destinataires : propriétaires distincts des boutiques non-internes.
    const orgs = await prisma.organization.findMany({
      where: { internal: false },
      select: { ownerId: true },
    });
    const ownerIds = [...new Set(orgs.map((o) => o.ownerId))];

    const annId = crypto.randomUUID();
    let sent = 0;
    for (const userId of ownerIds) {
      const created = await createNotification(prisma, {
        userId,
        type: 'ANNOUNCEMENT',
        title: parsed.data.title,
        body: parsed.data.body,
        dedupeKey: `announcement:${annId}:${userId}`,
      });
      if (created) sent++;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'announcement.send',
      targetType: 'Broadcast',
      targetId: annId,
      metadata: { title: parsed.data.title, recipients: ownerIds.length, sent },
    });

    return NextResponse.json(
      { ok: true, recipients: ownerIds.length, sent },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
