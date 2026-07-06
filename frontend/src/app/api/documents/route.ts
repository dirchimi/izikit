// Phase 6 — GET + POST /api/documents.
//
// GET  : documents de la boutique (200 plus récents, issuedAt desc), tous types.
//        Le frontend répartit factures / proformas par `type`.
// POST : crée un document. Deux modes —
//   • FACTURE depuis une vente : { type:'FACTURE', saleId } → instantané des
//     lignes/total/destinataire de la vente. 409 DOC_EXISTS si déjà facturée.
//   • PROFORMA manuelle : { type:'PROFORMA', clientName, lines[], ... } → devis.
// Numéro séquentiel par (boutique, type) alloué en transaction Serializable.
// `lines` est figé (instantané JSON). Rôle min MEMBER, CSRF.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import {
  LINE_SCHEMA,
  coerceLines,
  linesTotal,
  docNumber,
  saleMethodToStatus,
  uiDocStatus,
  type DocLine,
} from '@/lib/server/documents/helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('FACTURE'),
    saleId: z.string().min(1),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal('PROFORMA'),
    clientName: z.string().trim().min(1).max(120),
    clientPhone: z.string().trim().max(40).optional(),
    customerId: z.string().min(1).optional(),
    lines: z.array(LINE_SCHEMA).min(1).max(50),
    // Remise globale (FCFA) sur le devis ; bornée au sous-total côté serveur.
    discount: z.number().int().nonnegative().optional(),
    validityDays: z.number().int().positive().max(365).optional(),
    note: z.string().trim().max(300).optional(),
  }),
]);

interface DbDocument {
  id: string;
  type: string;
  number: string;
  saleId: string | null;
  clientName: string;
  clientPhone: string | null;
  status: string;
  total: number;
  balanceAfter: number | null;
  note: string | null;
  lines: unknown;
  validityDays: number | null;
  issuedAt: Date | string;
}

function documentView(d: DbDocument) {
  return {
    id: d.id,
    type: d.type,
    number: d.number,
    saleId: d.saleId,
    clientName: d.clientName,
    clientPhone: d.clientPhone ?? '',
    status: uiDocStatus(d.status),
    total: d.total,
    balanceAfter: d.balanceAfter,
    note: d.note ?? '',
    lines: coerceLines(d.lines),
    validityDays: d.validityDays,
    issuedAt: d.issuedAt instanceof Date ? d.issuedAt.toISOString() : d.issuedAt,
  };
}

const DOC_SELECT = {
  id: true,
  type: true,
  number: true,
  saleId: true,
  clientName: true,
  clientPhone: true,
  status: true,
  total: true,
  balanceAfter: true,
  note: true,
  lines: true,
  validityDays: true,
  issuedAt: true,
} as const;

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

    const rows = await prisma.document.findMany({
      where: { organizationId: org.orgId },
      orderBy: { issuedAt: 'desc' },
      take: 200,
      select: DOC_SELECT,
    });

    return NextResponse.json(
      { documents: rows.map(documentView) },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

type PostResult =
  | { kind: 'SALE_NOT_FOUND' }
  | { kind: 'DOC_EXISTS' }
  | { kind: 'OK'; doc: DbDocument };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const org = await resolveOrg(req, ctx);
    if (org instanceof NextResponse) return org;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const input = parsed.data;
    const orgId = org.orgId;

    const result: PostResult = await prisma.$transaction(
      async (tx) => {
        let data: {
          clientName: string;
          clientPhone: string | null;
          status: string;
          total: number;
          lines: DocLine[];
          saleId: string | null;
          customerId: string | null;
          validityDays: number | null;
        };

        if (input.type === 'FACTURE') {
          const sale = await tx.sale.findUnique({
            where: { id: input.saleId },
            select: {
              organizationId: true,
              method: true,
              total: true,
              customerId: true,
              customer: { select: { name: true, phone: true } },
              items: { select: { name: true, qty: true, unitPrice: true } },
              document: { select: { id: true } },
            },
          });
          if (!sale || sale.organizationId !== orgId) return { kind: 'SALE_NOT_FOUND' };
          if (sale.document) return { kind: 'DOC_EXISTS' };

          data = {
            clientName: sale.customer?.name ?? 'Client comptant',
            clientPhone: sale.customer?.phone ?? null,
            status: saleMethodToStatus(sale.method),
            total: sale.total,
            lines: sale.items.map((it) => ({
              article: it.name,
              qty: it.qty,
              unitPrice: it.unitPrice,
            })),
            saleId: input.saleId,
            customerId: sale.customerId,
            validityDays: null,
          };
        } else {
          // PROFORMA : valide le client s'il est fourni
          let customerId: string | null = null;
          if (input.customerId) {
            const c = await tx.customer.findUnique({
              where: { id: input.customerId },
              select: { organizationId: true },
            });
            if (c && c.organizationId === orgId) customerId = input.customerId;
          }
          // Total NET = sous-total − remise (bornée). Le PDF/aperçu redérive la
          // remise (sous-total − total) → pas de colonne « discount » à stocker.
          const gross = linesTotal(input.lines);
          const discount = Math.min(input.discount ?? 0, gross);
          data = {
            clientName: input.clientName,
            clientPhone: input.clientPhone ?? null,
            status: 'PENDING',
            total: gross - discount,
            lines: input.lines,
            saleId: null,
            customerId,
            validityDays: input.validityDays ?? 30,
          };
        }

        const count = await tx.document.count({
          where: { organizationId: orgId, type: input.type },
        });
        const number = docNumber(input.type, count);

        const doc = await tx.document.create({
          data: {
            organizationId: orgId,
            type: input.type,
            number,
            clientName: data.clientName,
            status: data.status,
            total: data.total,
            lines: data.lines,
            createdById: org.userSub,
            ...(data.clientPhone ? { clientPhone: data.clientPhone } : {}),
            ...(data.saleId ? { saleId: data.saleId } : {}),
            ...(data.customerId ? { customerId: data.customerId } : {}),
            ...(data.validityDays != null ? { validityDays: data.validityDays } : {}),
            ...(input.note ? { note: input.note } : {}),
          },
          select: DOC_SELECT,
        });
        return { kind: 'OK', doc };
      },
      { isolationLevel: 'Serializable' },
    );

    if (result.kind === 'SALE_NOT_FOUND') {
      return NextResponse.json(
        { error: 'SALE_NOT_FOUND', message: 'Vente introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (result.kind === 'DOC_EXISTS') {
      return NextResponse.json(
        { error: 'DOC_EXISTS', message: 'Cette vente a déjà une facture' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { document: documentView(result.doc) },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
