// GET /api/admin/boutiques — vue « par boutique » du back-office.
//
// Une ligne = une Organization enrichie de son patron (owner), ses réglages
// (téléphone / ville), son nombre de vendeurs (membres hors OWNER), son statut
// d'abonnement DÉRIVÉ (voir lib/subscription/status.ts), le total ENCAISSÉ
// (SubscriptionPayment CONFIRMED) et son chiffre d'affaires (Sale ACTIVE).
//
// Lecture ADMIN+ (PII patron). Pagination curseur sur createdAt desc, comme les
// autres listes admin. Le bloc `summary` (totaux plateforme) n'est calculé que
// sur la 1re page (pas de cursor) — les pages suivantes le renvoient à null,
// le client conserve le premier.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeSubscription } from '@/lib/subscription/status';

const Q_MAX = 200;

// Fragment de filtrage par statut d'abonnement DÉRIVÉ (le statut n'est pas
// stocké : on le traduit en conditions sur currentPeriodEnd / trialEndsAt).
//   ACTIVE  = période payée encore valable
//   TRIAL   = pas de période valable MAIS essai encore valable
//   EXPIRED = ni l'un ni l'autre
function statusWhere(status: string, now: Date): Prisma.OrganizationWhereInput | null {
  const noActive: Prisma.OrganizationWhereInput = {
    OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lt: now } }],
  };
  const noTrial: Prisma.OrganizationWhereInput = {
    OR: [{ trialEndsAt: null }, { trialEndsAt: { lt: now } }],
  };
  if (status === 'ACTIVE') return { currentPeriodEnd: { gte: now } };
  if (status === 'TRIAL') return { AND: [noActive, { trialEndsAt: { gte: now } }] };
  if (status === 'EXPIRED') return { AND: [noActive, noTrial] };
  return null;
}

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  internal: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  createdAt: true,
  owner: { select: { name: true, email: true } },
  settings: { select: { phone: true, city: true, country: true } },
  // Vendeurs = membres hors patron (l'owner a aussi une ligne OrganizationMember).
  _count: { select: { members: { where: { role: { not: 'OWNER' } } } } },
} as const satisfies Prisma.OrganizationSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const statusParam = url.searchParams.get('status');
    const status =
      statusParam === 'ACTIVE' || statusParam === 'TRIAL' || statusParam === 'EXPIRED'
        ? statusParam
        : null;
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    // Composition explicite en AND[] : q et le curseur produisent chacun un
    // `OR`, qui ne peut pas cohabiter comme clé au même niveau.
    const and: Prisma.OrganizationWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { owner: { name: { contains: q, mode: 'insensitive' } } },
          { owner: { email: { contains: q, mode: 'insensitive' } } },
          { settings: { city: { contains: q, mode: 'insensitive' } } },
          { settings: { phone: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (status) {
      const sw = statusWhere(status, now);
      if (sw) and.push(sw);
    }
    const cw = cursorWhere(cursor);
    if (Object.keys(cw).length) and.push(cw);
    const where: Prisma.OrganizationWhereInput = and.length ? { AND: and } : {};

    const rows = await prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: ORG_SELECT,
    });

    const page = buildPage(rows, limit);
    const ids = page.items.map((o) => o.id);

    // Agrégats par boutique, en 2 groupBy sur les ids de la page uniquement.
    const [collectedRows, salesRows] = ids.length
      ? await Promise.all([
          prisma.subscriptionPayment.groupBy({
            by: ['organizationId'],
            where: { organizationId: { in: ids }, status: 'CONFIRMED' },
            _sum: { amount: true },
          }),
          prisma.sale.groupBy({
            by: ['organizationId'],
            where: { organizationId: { in: ids }, status: 'ACTIVE' },
            _sum: { total: true },
          }),
        ])
      : [[], []];

    const collectedById = new Map(collectedRows.map((r) => [r.organizationId, r._sum.amount ?? 0]));
    const salesById = new Map(salesRows.map((r) => [r.organizationId, r._sum.total ?? 0]));

    const items = page.items.map((o) => {
      const sub = computeSubscription(
        { plan: o.plan, trialEndsAt: o.trialEndsAt, currentPeriodEnd: o.currentPeriodEnd },
        now,
      );
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        internal: o.internal,
        ownerName: o.owner.name,
        ownerEmail: o.owner.email,
        phone: o.settings?.phone ?? null,
        city: o.settings?.city ?? null,
        sellers: o._count.members,
        plan: sub.plan,
        status: sub.status,
        daysLeft: sub.daysLeft,
        activeUntil: sub.activeUntil,
        collected: collectedById.get(o.id) ?? 0,
        salesTotal: salesById.get(o.id) ?? 0,
        createdAt: o.createdAt,
      };
    });

    // Totaux plateforme — seulement en 1re page (pas de cursor).
    //
    // Comptes INTERNES (test / associés) exclus de tous les totaux — ce ne sont
    // pas de vrais clients. `active` ne compte que les abonnées PAYANTES (≥ 1
    // paiement CONFIRMÉ) ; une boutique active sans paiement (jours offerts via
    // grant-access) est comptée à part dans `offered` — sinon elle gonflait
    // « Abonnées actives » alors que rien n'a été encaissé.
    let summary: {
      boutiques: number;
      active: number;
      offered: number;
      trial: number;
      expired: number;
      collected: number;
      sellers: number;
    } | null = null;
    if (!cursor) {
      const notInternal = { internal: false } as const;
      const [boutiques, accessActive, payingActive, trial, collectedAgg, sellers] =
        await Promise.all([
          prisma.organization.count({ where: notInternal }),
          prisma.organization.count({ where: { AND: [statusWhere('ACTIVE', now)!, notInternal] } }),
          prisma.organization.count({
            where: {
              AND: [
                statusWhere('ACTIVE', now)!,
                notInternal,
                { subPayments: { some: { status: 'CONFIRMED' } } },
              ],
            },
          }),
          prisma.organization.count({ where: { AND: [statusWhere('TRIAL', now)!, notInternal] } }),
          prisma.subscriptionPayment.aggregate({
            where: { status: 'CONFIRMED', organization: notInternal },
            _sum: { amount: true },
          }),
          prisma.organizationMember.count({
            where: { role: { not: 'OWNER' }, organization: notInternal },
          }),
        ]);
      summary = {
        boutiques,
        active: payingActive,
        offered: accessActive - payingActive,
        trial,
        // L'expiration se calcule sur l'accès (une boutique offerte n'est ni
        // payante ni expirée).
        expired: boutiques - accessActive - trial,
        collected: collectedAgg._sum.amount ?? 0,
        sellers,
      };
    }

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, summary },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
