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
import { withTxRetry } from '@/lib/server/db/retry-transaction';
import { withIdempotency } from '@/lib/server/idempotency';
import { onExpenseCreated } from '@/lib/server/notifications/boutique-events';
import { notifyAfterResponse } from '@/lib/server/notifications/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { resolveClientCreatedAt } from '@/lib/server/time/client-entry-timestamp';

const Body = z.object({
  // Offline-first (Task 0.4) : identifiants générés côté client, tous
  // optionnels — un appelant online les omet et le comportement est inchangé.
  id: z.string().min(1).optional(),
  clientOpId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(160),
  amount: z.number().int().positive(),
  category: z.string().trim().min(1).max(40),
  note: z.string().trim().max(300).optional(),
  // Offline-first (Task 6.2) : horodatage de SAISIE côté client (ISO), pour
  // qu'une dépense saisie hors-ligne garde sa vraie heure au lieu de celle du
  // sync. Optionnel — un appelant online l'omet, comportement inchangé
  // (`Expense.createdAt`/`occurredAt` gardent leur `@default(now())`). Borné
  // côté serveur, voir `resolveClientCreatedAt` (repli sur `now()` hors
  // bornes, jamais un rejet). Appliqué aux DEUX colonnes (`createdAt` ET
  // `occurredAt`) faute d'un champ `occurredAt` métier distinct dans ce Body.
  createdAt: z.string().optional(),
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

    const { id, label, amount, category, note } = parsed.data;
    // `null` = l'appelant a omis `createdAt` → on n'ajoute PAS la clé dans les
    // données Prisma plus bas, laissant `@default(now())` s'appliquer (chemin
    // online inchangé à l'octet près). Sinon : Date bornée (ou repli `now()`
    // explicite si hors bornes/invalide — jamais un rejet de la dépense).
    const clientCreatedAt = resolveClientCreatedAt(parsed.data.createdAt);

    // Clé d'idempotence offline : `clientOpId` explicite sinon l'`id` client de
    // la dépense. `null` (aucun des deux) = chemin online pur, rien n'est mémoïsé.
    const clientOpId = parsed.data.clientOpId ?? id ?? null;

    // Rejoue la tx sur collision transitoire : conflit de sérialisation, ou
    // P2002 sur le numéro D- séquentiel / la clé d'idempotence (deux rejeux
    // concurrents de la même opération passant tous deux le findUnique initial
    // — withIdempotency laisse ce P2002 remonter jusqu'ici, le rejeu retombant
    // proprement sur la ligne gagnante).
    const { result: expense, replayed } = await withTxRetry(() =>
      prisma.$transaction((tx) =>
        withIdempotency(
          tx,
          { organizationId: org.orgId, clientOpId, endpoint: 'expenses' },
          async () => {
            const count = await tx.expense.count({ where: { organizationId: org.orgId } });
            const number = `D-${String(count + 1).padStart(4, '0')}`;
            return tx.expense.create({
              data: {
                ...(id ? { id } : {}),
                organizationId: org.orgId,
                number,
                label,
                amount,
                category,
                ...(note ? { note } : {}),
                createdById: org.userSub,
                // Task 6.2 — offline entry time (bounded), applied to BOTH
                // columns absent a distinct business "occurredAt" field in
                // this Body; omitted → DB default(now()) on both.
                ...(clientCreatedAt
                  ? { createdAt: clientCreatedAt, occurredAt: clientCreatedAt }
                  : {}),
              },
              select: EXPENSE_SELECT,
            });
          },
        ),
      ),
    );

    // Alerte post-réponse (best-effort) : « grosse dépense » si ≥ seuil et
    // saisie par un employé (le patron n'est pas notifié de ses propres dépenses).
    // JAMAIS sur un rejeu : l'effet date de la 1re exécution.
    if (!replayed) {
      notifyAfterResponse(() =>
        onExpenseCreated(prisma, {
          orgId: org.orgId,
          creatorId: org.userSub,
          expense: { id: expense.id, label: expense.label, amount: expense.amount },
        }),
      );
    }

    // Rejeu idempotent → 200 (la dépense existe déjà) ; création fraîche → 201.
    // `expense` provient soit de fn (objet JS avec occurredAt: Date), soit du
    // resultJson mémoïsé (JSON reparsé, occurredAt: string ISO) : expenseView
    // gère les deux formes (garde `instanceof Date`).
    return NextResponse.json(
      { expense: expenseView(expense) },
      { status: replayed ? 200 : 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
