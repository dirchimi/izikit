// Phase 8 — /api/admin/discount-codes (SUPERADMIN-only)
//
// GET  : liste des codes de réduction (les plus récents d'abord).
// POST : crée un code (type PERCENT|AMOUNT, valeur, usages max & expiration
//        optionnels). Le code est normalisé en MAJUSCULES et unique.
// Toute création est journalisée (logAdminAction — traçabilité back-office).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { normalizeCode, DISCOUNT_TYPES } from '@/lib/subscription/discount';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const codes = await prisma.discountCode.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ codes }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const CreateBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, 'Lettres, chiffres et tirets uniquement'),
    type: z.enum(DISCOUNT_TYPES as unknown as [string, ...string[]]),
    value: z.number().int().positive(),
    maxUses: z.number().int().positive().nullable().optional(),
    // Date d'expiration ISO (fin de validité) ; null/absent = pas d'expiration.
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((d) => d.type !== 'PERCENT' || d.value <= 100, {
    message: 'Un pourcentage ne peut pas dépasser 100.',
    path: ['value'],
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Corps de requête invalide',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const code = normalizeCode(parsed.data.code);
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

    try {
      const created = await prisma.discountCode.create({
        data: {
          code,
          type: parsed.data.type,
          value: parsed.data.value,
          maxUses: parsed.data.maxUses ?? null,
          expiresAt,
          createdById: auth.admin.id,
        },
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          maxUses: true,
          usedCount: true,
          expiresAt: true,
          active: true,
          createdAt: true,
        },
      });

      await logAdminAction(prisma, {
        actorId: auth.admin.id,
        action: 'discount.create',
        targetType: 'DiscountCode',
        targetId: created.id,
        metadata: {
          code: created.code,
          type: created.type,
          value: created.value,
          maxUses: created.maxUses,
          expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
        },
      });

      return NextResponse.json(
        { code: created },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (e) {
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'DISCOUNT_CODE_EXISTS', message: 'Ce code existe déjà.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }
  });
}
