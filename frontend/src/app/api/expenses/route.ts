// Phase 5 — GET + POST /api/expenses.
//
// GET  : dépenses de la boutique (500 plus récentes, occurredAt desc). Le filtrage
//        période/catégorie + les KPI sont dérivés côté client à partir de cette
//        liste (cf. DepensesManager).
// POST : crée une dépense ; numéro séquentiel par boutique (D-0001) calculé dans
//        une petite transaction. `category` chaîne libre. Rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscription/guard';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { onExpenseCreated } from '@/lib/server/notifications/boutique-events';
import { notifyAfterResponse } from '@/lib/server/notifications/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  label: z.string().trim().min(1).max(160),
  amount: z.number().int().positive(),
  category: z.string().trim().min(1).max(40),
  note: z.string().trim().max(300).optional(),
});

const EXPENSE_SELECT = {
  id: true,
  number: true,
  label: true,
  category: true,
  amount: true,
  note: true,
  occurredAt: true,
} as const;

function expenseView(e: {
  id: string;
  number: string;
  label: string;
  category: string;
  amount: number;
  note: string | null;
  occurredAt: Date | string;
}) {
  return {
    id: e.id,
    number: e.number,
    label: e.label,
    category: e.category,
    amount: e.amount,
    note: e.note ?? '',
    occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt,
  };
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

    const rows = await prisma.expense.findMany({
      where: { organizationId: org.orgId },
      orderBy: { occurredAt: 'desc' },
      take: 500,
      select: EXPENSE_SELECT,
    });

    return NextResponse.json(
      { expenses: rows.map(expenseView) },
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
        { error: 'VALIDATION_FAILED', message: 'libellé, montant positif et catégorie requis' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { label, amount, category, note } = parsed.data;

    const expense = await prisma.$transaction(async (tx) => {
      const count = await tx.expense.count({ where: { organizationId: org.orgId } });
      const number = `D-${String(count + 1).padStart(4, '0')}`;
      return tx.expense.create({
        data: {
          organizationId: org.orgId,
          number,
          label,
          amount,
          category,
          ...(note ? { note } : {}),
          createdById: org.userSub,
        },
        select: EXPENSE_SELECT,
      });
    });

    // Alerte post-réponse (best-effort) : « grosse dépense » si ≥ seuil et
    // saisie par un employé (le patron n'est pas notifié de ses propres dépenses).
    notifyAfterResponse(() =>
      onExpenseCreated(prisma, {
        orgId: org.orgId,
        creatorId: org.userSub,
        expense: { id: expense.id, label: expense.label, amount: expense.amount },
      }),
    );

    return NextResponse.json(
      { expense: expenseView(expense) },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
