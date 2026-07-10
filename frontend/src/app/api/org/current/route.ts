// Phase 1 — GET + PATCH /api/org/current.
//
// GET  : retourne la boutique du user (la crée au 1er appel via ensureBoutique).
// PATCH: met à jour le profil boutique (nom + settings). Rôle min ADMIN.
//
// Le nom vit sur Organization ; le reste (devise, téléphone, ville, adresse,
// note de facture) sur BoutiqueSettings (1:1). Non-membre → 404 (requireOrgRole).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ensureBoutique, getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SETTINGS_SELECT = {
  currency: true,
  country: true,
  phone: true,
  city: true,
  address: true,
  invoiceNote: true,
  logoUrl: true,
  businessType: true,
  overdueDays: true,
  bigExpenseThreshold: true,
  expiryAlertDays: true,
} as const;

const PatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  invoiceNote: z.string().trim().max(500).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  businessType: z.string().trim().max(40).nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  // Pays de la boutique (ISO 3166-1 alpha-2) — fixe l'indicatif téléphonique.
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  // Seuils de notifications (réglés dans Paramètres).
  overdueDays: z.number().int().min(1).max(365).optional(),
  bigExpenseThreshold: z.number().int().min(0).max(1_000_000_000).optional(),
  expiryAlertDays: z.number().int().min(1).max(365).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const boutique = await ensureBoutique(auth.user.sub, auth.user.email);
    return NextResponse.json(boutique, {
      status: 200,
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const orgId = primary.organizationId;
    const d = parsed.data;

    const organization = d.name
      ? await prisma.organization.update({
          where: { id: orgId },
          data: { name: d.name },
          select: { id: true, slug: true, name: true },
        })
      : await prisma.organization.findUniqueOrThrow({
          where: { id: orgId },
          select: { id: true, slug: true, name: true },
        });

    const settings = await prisma.boutiqueSettings.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        currency: d.currency ?? 'XAF',
        country: d.country ?? 'TD',
        phone: d.phone ?? null,
        city: d.city ?? null,
        address: d.address ?? null,
        invoiceNote: d.invoiceNote ?? null,
        logoUrl: d.logoUrl ?? null,
        businessType: d.businessType ?? null,
        ...(d.overdueDays !== undefined ? { overdueDays: d.overdueDays } : {}),
        ...(d.bigExpenseThreshold !== undefined
          ? { bigExpenseThreshold: d.bigExpenseThreshold }
          : {}),
        ...(d.expiryAlertDays !== undefined ? { expiryAlertDays: d.expiryAlertDays } : {}),
      },
      update: {
        ...(d.currency !== undefined ? { currency: d.currency } : {}),
        ...(d.country !== undefined ? { country: d.country } : {}),
        ...(d.phone !== undefined ? { phone: d.phone } : {}),
        ...(d.city !== undefined ? { city: d.city } : {}),
        ...(d.address !== undefined ? { address: d.address } : {}),
        ...(d.invoiceNote !== undefined ? { invoiceNote: d.invoiceNote } : {}),
        ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl } : {}),
        ...(d.businessType !== undefined ? { businessType: d.businessType } : {}),
        ...(d.overdueDays !== undefined ? { overdueDays: d.overdueDays } : {}),
        ...(d.bigExpenseThreshold !== undefined
          ? { bigExpenseThreshold: d.bigExpenseThreshold }
          : {}),
        ...(d.expiryAlertDays !== undefined ? { expiryAlertDays: d.expiryAlertDays } : {}),
      },
      select: SETTINGS_SELECT,
    });

    return NextResponse.json(
      { organization, settings, role: gate.orgMember.role },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
