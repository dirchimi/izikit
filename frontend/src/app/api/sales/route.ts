// Phase 3 — GET + POST /api/sales.
//
// POST = checkout : valide le stock, crée la vente + ses lignes (instantané
// nom/prix), décrémente le stock via des StockMovement OUT, le tout dans UNE
// transaction Serializable (pas de survente sous concurrence). Numéro de vente
// séquentiel par boutique (V-0001). method: cash | mobile | credit. Une vente
// à crédit exige un client.
//
// GET = historique (100 dernières ventes, lignes + client). Rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscription/guard';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { withTxRetry } from '@/lib/server/db/retry-transaction';
import { withIdempotency } from '@/lib/server/idempotency';
import { onSaleCommitted } from '@/lib/server/notifications/boutique-events';
import { notifyAfterResponse } from '@/lib/server/notifications/flush-after-response';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { resolveClientCreatedAt } from '@/lib/server/time/client-entry-timestamp';

const Body = z
  .object({
    // Offline-first (Task 0.3) : identifiants générés côté client, tous
    // optionnels — un appelant online les omet et le comportement est inchangé.
    // `id` : cuid client de la Sale (repris verbatim comme id serveur).
    id: z.string().min(1).optional(),
    // `clientOpId` : clé d'idempotence explicite. À défaut on retombe sur `id`.
    clientOpId: z.string().min(1).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          qty: z.number().int().positive(),
          // Ligne facturée au prix de gros (prixGros) plutôt qu'au détail.
          wholesale: z.boolean().optional(),
        }),
      )
      .min(1),
    // Paiement unique (compat). Absent si une ventilation `payments` est fournie.
    method: z.enum(['cash', 'mobile', 'credit']).optional(),
    // Paiement mixte : une ou plusieurs tranches par méthode. Leur somme doit
    // égaler le total (recalculé serveur-side). La part `credit` devient la créance.
    payments: z
      .array(
        z.object({
          method: z.enum(['cash', 'mobile', 'credit']),
          amount: z.number().int().nonnegative(),
        }),
      )
      .max(3)
      .optional(),
    customer: z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
    // Remise globale accordée sur la vente (FCFA). Bornée [0, brut] côté serveur.
    discount: z.number().int().nonnegative().optional(),
    // Offline-first (Task 6.2) : horodatage de SAISIE côté client (ISO), pour
    // qu'une vente faite hors-ligne garde sa vraie heure au lieu de celle du
    // sync. Optionnel — un appelant online l'omet, comportement inchangé
    // (`Sale.createdAt` garde son `@default(now())`). Borné côté serveur, voir
    // `resolveClientCreatedAt` (repli sur `now()` hors bornes, jamais un rejet).
    createdAt: z.string().optional(),
  })
  .refine((d) => d.method !== undefined || (d.payments?.length ?? 0) > 0, {
    message: 'method_or_payments_required',
  });

// Seul le SUCCÈS traverse withIdempotency (et est donc mémoïsé). Un rejet métier
// de VALIDATION (produit inconnu, client manquant, ventilation incohérente…) est
// levé comme SaleRejection : il fait AVORTER la $transaction (rollback complet —
// aucune Sale, aucun client matérialisé, aucune ligne OfflineOperation).
//
// Le stock insuffisant N'EST PLUS un rejet (Task 4.1). En offline-first, chaque
// vente est déjà contrôlée contre le stock LOCAL avant d'être mise en file
// (createSaleOffline lève INSUFFICIENT_STOCK_LOCAL). Si une vente en file trouve,
// au moment du sync, un stock serveur insuffisant, c'est qu'un AUTRE appareil a
// vendu ce stock pendant que celui-ci était offline — mais la marchandise a DÉJÀ
// quitté la boutique (la vente a réellement eu lieu). La refuser PERDRAIT une
// vente réelle. On ENREGISTRE donc la vente et on SIGNALE l'écart (stockConflicts)
// au lieu de rejeter, en bornant le stock à 0 (jamais négatif). Comme c'est
// désormais un succès (kind:'OK' avec stockConflicts), le résultat est mémoïsé :
// un rejeu renvoie la même vente + les mêmes stockConflicts.
type StockConflict = {
  productId: string;
  name: string;
  requested: number;
  available: number;
  shortfall: number;
};
type CheckoutResult = {
  kind: 'OK';
  saleId: string;
  number: string;
  total: number;
  publicToken: string;
  // Toujours présent (tableau vide si aucun conflit) : la mémoïsation JSON garde
  // ainsi une forme stable, identique entre exécution fraîche et rejeu.
  stockConflicts: StockConflict[];
};

// Rejet métier typé. `payload`/`status` reproduisent à l'octet près la réponse
// HTTP qui était renvoyée avant le passage au throw (bodies + codes inchangés).
class SaleRejection extends Error {
  constructor(
    public payload: { error: string; message: string; productId?: string },
    public status: number,
  ) {
    super(payload.error);
    this.name = 'SaleRejection';
  }
}

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

    const rows = await prisma.sale.findMany({
      where: { organizationId: primary.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        method: true,
        total: true,
        discount: true,
        cashAmount: true,
        mobileAmount: true,
        creditAmount: true,
        status: true,
        createdAt: true,
        createdById: true,
        customer: { select: { name: true, phone: true } },
        items: { select: { name: true, qty: true, unitPrice: true } },
      },
    });

    // Nom du vendeur (traçabilité) : pas de relation Sale→User, on résout les
    // ids en un seul findMany. `name` peut être null (compte email) → email.
    const sellerIds = Array.from(
      new Set(rows.map((s) => s.createdById).filter((v): v is string => v !== null)),
    );
    const sellers =
      sellerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const sellerName = new Map(sellers.map((u) => [u.id, u.name ?? u.email]));

    const sales = rows.map((s) => ({
      id: s.id,
      number: s.number,
      method: s.method,
      total: s.total,
      discount: s.discount,
      cashAmount: s.cashAmount,
      mobileAmount: s.mobileAmount,
      creditAmount: s.creditAmount,
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      sellerId: s.createdById,
      sellerName: s.createdById ? (sellerName.get(s.createdById) ?? null) : null,
      customerName: s.customer?.name ?? null,
      customerPhone: s.customer?.phone ?? null,
      items: s.items,
    }));

    return NextResponse.json(
      { sales },
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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    // « Appli douce » : abonnement expiré (hors grâce) → écriture refusée.
    const locked = await requireActiveSubscription(primary.organizationId);
    if (locked) return locked;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const body = parsed.data;
    const orgId = primary.organizationId;
    const userSub = auth.user.sub;
    const items = body.items;
    const customerInput = body.customer;
    const paymentsInput = body.payments;
    const legacyMethod = body.method;
    // `null` = l'appelant a omis `createdAt` → on n'ajoute PAS la clé dans les
    // données Prisma plus bas, laissant `@default(now())` s'appliquer (chemin
    // online inchangé à l'octet près). Sinon : Date bornée (ou repli `now()`
    // explicite si hors bornes/invalide — jamais un rejet de la vente).
    const clientCreatedAt = resolveClientCreatedAt(body.createdAt);

    // Clé d'idempotence offline : `clientOpId` explicite sinon l'`id` client de
    // la vente. `null` (aucun des deux) = chemin online pur, rien n'est mémoïsé.
    const clientOpId = body.clientOpId ?? body.id ?? null;

    // Rejoue la tx sur collision transitoire (numéro de vente séquentiel,
    // conflit de sérialisation entre deux checkouts simultanés, ou P2002 sur la
    // clé d'idempotence quand deux rejeux concurrents de la même opération
    // passent tous deux le findUnique initial — withIdempotency laisse ce P2002
    // remonter jusqu'ici, le rejeu retombant proprement sur la ligne gagnante).
    let outcome: { result: CheckoutResult; replayed: boolean };
    try {
      outcome = await withTxRetry(() =>
        prisma.$transaction(
          (tx) =>
            withIdempotency<CheckoutResult>(
              tx,
              { organizationId: orgId, clientOpId, endpoint: 'sales' },
              async () => {
                const ids = items.map((i) => i.productId);
                const products = await tx.product.findMany({
                  where: { id: { in: ids }, organizationId: orgId },
                  select: {
                    id: true,
                    name: true,
                    sellPrice: true,
                    prixGros: true,
                    buyPrice: true,
                    qty: true,
                  },
                });
                const byId = new Map(products.map((p) => [p.id, p]));

                // Prix unitaire d'une ligne : gros si demandé ET défini (> 0), sinon détail.
                const unitPriceFor = (
                  p: { sellPrice: number; prixGros: number },
                  wholesale?: boolean,
                ) => (wholesale && p.prixGros > 0 ? p.prixGros : p.sellPrice);

                // Agrège les quantités par produit AVANT de contrôler le stock. Deux
                // lignes du même article (ex. double scan) doivent être vérifiées
                // ENSEMBLE : sinon chacune passe le contrôle isolément (qty ligne ≤ stock)
                // alors que le décrément cumulé ferait passer le stock négatif.
                const neededByProduct = new Map<string, number>();
                for (const item of items) {
                  neededByProduct.set(
                    item.productId,
                    (neededByProduct.get(item.productId) ?? 0) + item.qty,
                  );
                }
                // Task 4.1 : le stock insuffisant N'EST PLUS un rejet. On collecte
                // l'écart par produit (stockConflicts) ; la vente est enregistrée et le
                // décrément sera borné à 0 plus bas. PRODUCT_NOT_FOUND reste un rejet
                // dur (validation réelle, pas une course de stock).
                const stockConflicts: StockConflict[] = [];
                for (const [productId, needed] of neededByProduct) {
                  const p = byId.get(productId);
                  if (!p)
                    throw new SaleRejection(
                      { error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable', productId },
                      404,
                    );
                  if (needed > p.qty)
                    stockConflicts.push({
                      productId,
                      name: p.name,
                      requested: needed,
                      available: p.qty,
                      shortfall: needed - p.qty,
                    });
                }

                // Résolution du client (création à la volée si nom fourni sans id).
                let customerId: string | null = null;
                if (customerInput?.id) {
                  const c = await tx.customer.findUnique({
                    where: { id: customerInput.id },
                    select: { organizationId: true },
                  });
                  if (c) {
                    // Client déjà en base : ne l'utiliser que s'il appartient à la
                    // boutique (sinon customerId reste null — pas de fuite inter-org).
                    if (c.organizationId === orgId) customerId = customerInput.id;
                  } else if (customerInput.name) {
                    // Offline : client créé côté client avec ce cuid mais pas encore
                    // synchronisé — on le matérialise en réutilisant son id verbatim.
                    const created = await tx.customer.create({
                      data: {
                        id: customerInput.id,
                        organizationId: orgId,
                        name: customerInput.name,
                        phone: customerInput.phone ?? null,
                      },
                      select: { id: true },
                    });
                    customerId = created.id;
                  }
                } else if (customerInput?.name) {
                  const c = await tx.customer.create({
                    data: {
                      organizationId: orgId,
                      name: customerInput.name,
                      phone: customerInput.phone ?? null,
                    },
                    select: { id: true },
                  });
                  customerId = c.id;
                }
                // Brut = somme des lignes ; la remise (bornée) le réduit → total NET.
                const gross = items.reduce((sum, item) => {
                  const p = byId.get(item.productId);
                  return sum + item.qty * (p ? unitPriceFor(p, item.wholesale) : 0);
                }, 0);
                const discount = Math.min(Math.max(0, parsed.data.discount ?? 0), gross);
                const total = gross - discount;

                // Ventilation du paiement. Avec `payments` : somme par méthode, qui doit
                // égaler le total NET. Sinon : paiement unique via `method` (compat).
                const bd = { CASH: 0, MOBILE: 0, CREDIT: 0 };
                if (paymentsInput && paymentsInput.length > 0) {
                  for (const p of paymentsInput) {
                    bd[p.method.toUpperCase() as keyof typeof bd] += p.amount;
                  }
                  if (bd.CASH + bd.MOBILE + bd.CREDIT !== total)
                    throw new SaleRejection(
                      {
                        error: 'PAYMENT_MISMATCH',
                        message: 'La ventilation du paiement ne correspond pas au total',
                      },
                      422,
                    );
                } else {
                  bd[(legacyMethod ?? 'cash').toUpperCase() as keyof typeof bd] = total;
                }
                const creditAmount = bd.CREDIT;
                const parts = (['CASH', 'MOBILE', 'CREDIT'] as const).filter((k) => bd[k] > 0);
                const method = parts.length >= 2 ? 'MIXED' : (parts[0] ?? 'CASH');

                // La part crédit exige un client (sélectionné ou créé à la volée).
                if (creditAmount > 0 && !customerId)
                  throw new SaleRejection(
                    {
                      error: 'CREDIT_NEEDS_CUSTOMER',
                      message: 'Une vente à crédit exige un client',
                    },
                    422,
                  );

                const count = await tx.sale.count({ where: { organizationId: orgId } });
                const number = `V-${String(count + 1).padStart(4, '0')}`;
                // Jeton aléatoire (~96 bits, URL-safe) du lien public de reçu : seul
                // celui qui reçoit le lien peut ouvrir/télécharger le reçu, sans login.
                const publicToken = randomBytes(12).toString('base64url');

                const sale = await tx.sale.create({
                  data: {
                    // Offline : id cuid généré côté client, repris verbatim pour que
                    // la vente ait la même identité online/offline. Absent → Prisma
                    // génère (cuid). Le numéro V- reste séquentiel côté serveur.
                    ...(body.id ? { id: body.id } : {}),
                    organizationId: orgId,
                    number,
                    method,
                    total,
                    discount,
                    cashAmount: bd.CASH,
                    mobileAmount: bd.MOBILE,
                    creditAmount,
                    publicToken,
                    createdById: userSub,
                    // Task 6.2 — offline entry time (bounded), absent → DB default(now()).
                    ...(clientCreatedAt ? { createdAt: clientCreatedAt } : {}),
                    ...(customerId ? { customerId } : {}),
                    items: {
                      create: items.map((item) => {
                        const p = byId.get(item.productId);
                        return {
                          productId: item.productId,
                          name: p ? p.name : 'Article',
                          qty: item.qty,
                          unitPrice: p ? unitPriceFor(p, item.wholesale) : 0,
                          buyPrice: p ? p.buyPrice : 0,
                        };
                      }),
                    },
                  },
                  select: { id: true },
                });

                // Décrément + mouvement OUT agrégés PAR PRODUIT (neededByProduct), pas
                // par ligne : deux lignes du même article (double scan) donnent un seul
                // StockMovement dont `clientOpId` = `${saleId}:${productId}` reste unique
                // (la colonne est @unique — un mouvement par ligne collisionnerait).
                //
                // Task 4.1 — clamp anti-négatif : on décrémente de min(needed, dispo) et
                // on enregistre le mouvement du MÊME montant clampé. Le stock atterrit à
                // max(0, dispo − needed) sans jamais passer sous 0, et `qty = Σ delta`
                // reste vrai (mouvement clampé = décrément réel). L'écart non couvert est
                // déjà tracé dans stockConflicts. La vente/créance, elles, reflètent la
                // quantité RÉELLEMENT vendue (marchandise sortie), pas le stock résiduel.
                for (const [productId, needed] of neededByProduct) {
                  const available = byId.get(productId)?.qty ?? 0;
                  const decrementBy = Math.min(needed, available);
                  await tx.product.update({
                    where: { id: productId },
                    data: { qty: { decrement: decrementBy } },
                  });
                  await tx.stockMovement.create({
                    data: {
                      organizationId: orgId,
                      productId,
                      type: 'OUT',
                      delta: -decrementBy,
                      reason: 'sale',
                      createdById: userSub,
                      clientOpId: `${sale.id}:${productId}`,
                    },
                  });
                }

                // Part à crédit → ouvre une créance du montant restant dû (creditAmount).
                // customerId garanti ici (crédit sans client déjà renvoyé plus haut).
                if (creditAmount > 0 && customerId) {
                  await tx.receivable.create({
                    data: {
                      organizationId: orgId,
                      customerId,
                      saleId: sale.id,
                      amount: creditAmount,
                      status: 'OPEN',
                    },
                  });
                }

                return { kind: 'OK', saleId: sale.id, number, total, publicToken, stockConflicts };
              },
            ),
          { isolationLevel: 'Serializable' },
        ),
      );
    } catch (e) {
      // Un rejet métier a fait avorter la transaction (rollback : rien n'est
      // écrit, rien n'est mémoïsé). On restitue la réponse HTTP identique à
      // celle d'avant le refactor. Toute autre erreur (P2002 non résolu, bug…)
      // continue de remonter — withTxRetry n'aura pas rejoué SaleRejection.
      if (e instanceof SaleRejection) {
        return NextResponse.json(e.payload, {
          status: e.status,
          headers: { 'x-request-id': ctx.requestId },
        });
      }
      throw e;
    }

    const { result, replayed } = outcome;

    // Alertes post-réponse (best-effort) : « nouvelle vente » + « stock bas ».
    // JAMAIS sur un rejeu : la vente et ses effets datent de la 1re exécution ;
    // re-notifier à chaque retry offline spammerait le patron.
    if (!replayed) {
      notifyAfterResponse(() =>
        onSaleCommitted(prisma, {
          orgId,
          sellerId: userSub,
          sale: { id: result.saleId, number: result.number, total: result.total },
          productIds: items.map((i) => i.productId),
        }),
      );
    }

    // Rejeu idempotent → 200 (la vente existe déjà) ; création fraîche → 201.
    // `result` provient soit de fn (objet JS), soit du resultJson mémoïsé (JSON
    // reparsé) : il ne contient que des primitives (pas de Date), donc les deux
    // chemins sérialisent à l'identique — aucun champ n'est traité comme Date.
    return NextResponse.json(
      {
        sale: {
          id: result.saleId,
          number: result.number,
          total: result.total,
          publicToken: result.publicToken,
        },
        // Task 4.1 — écarts de stock détectés au sync (tableau vide si aucun). Le
        // POS affiche une alerte de réconciliation sans bloquer la vente. Sur un
        // rejeu, ce tableau provient du resultJson mémoïsé → identique à l'origine.
        // Fallback [] : un rejeu mémoïsé par du code pré-Task-4.1 n'a pas ce champ
        // dans son resultJson (undefined) — le contrat "toujours un tableau" doit
        // tenir même sur ces vieilles entrées mémoïsées.
        stockConflicts: result.stockConflicts ?? [],
      },
      { status: replayed ? 200 : 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
