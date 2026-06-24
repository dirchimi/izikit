/**
 * Hooks de notifications boutique — branchés sur les flux métier (vente,
 * dépense, ajustement de stock) et sur le cron (créances en retard).
 *
 * Toutes ces fonctions sont best-effort : appelées via `after()` côté route
 * (post-réponse) pour ne jamais ralentir la caisse. Le destinataire est
 * toujours le propriétaire de la boutique. Règle anti-bruit : pour la vente et
 * la dépense, on ne notifie PAS le patron de ses propres actions (il vient de
 * les faire) — seules les actions d'un employé remontent. Stock bas et créance
 * en retard sont des états → toujours notifiés.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { notifyUser, resolveOwnerId } from './notify-owner';
import {
  bigExpenseNotification,
  lowStockNotification,
  receivableOverdueNotification,
  saleMadeNotification,
} from './templates';

const DAY_MS = 86_400_000;

/** Clé de jour (YYYY-MM-DD) pour la déduplication journalière du stock bas. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Après une vente validée : alerte « nouvelle vente » (si un employé l'a faite)
 * + alerte « stock bas » pour chaque produit repassé sous son seuil.
 */
export async function onSaleCommitted(
  prisma: PrismaClient,
  args: {
    orgId: string;
    sellerId: string;
    sale: { id: string; number: string; total: number };
    productIds: string[];
    currency?: string;
    now?: Date;
  },
): Promise<void> {
  const ownerId = await resolveOwnerId(prisma, args.orgId);
  if (!ownerId) return;
  const currency = args.currency ?? 'XAF';

  if (args.sellerId !== ownerId) {
    await notifyUser(prisma, ownerId, saleMadeNotification(args.sale, currency));
  }

  if (args.productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: args.productIds }, organizationId: args.orgId },
      select: { id: true, name: true, qty: true, threshold: true },
    });
    const key = dayKey(args.now ?? new Date());
    for (const p of products) {
      if (p.threshold > 0 && p.qty <= p.threshold) {
        await notifyUser(prisma, ownerId, lowStockNotification(p.id, p.name, p.qty, key));
      }
    }
  }
}

/** Après une dépense : alerte « grosse dépense » si ≥ seuil ET saisie par un employé. */
export async function onExpenseCreated(
  prisma: PrismaClient,
  args: {
    orgId: string;
    creatorId: string;
    expense: { id: string; label: string; amount: number };
  },
): Promise<void> {
  const ownerId = await resolveOwnerId(prisma, args.orgId);
  if (!ownerId || args.creatorId === ownerId) return;

  const settings = await prisma.boutiqueSettings.findUnique({
    where: { organizationId: args.orgId },
    select: { bigExpenseThreshold: true, currency: true },
  });
  const threshold = settings?.bigExpenseThreshold ?? 50_000;
  if (args.expense.amount >= threshold) {
    await notifyUser(
      prisma,
      ownerId,
      bigExpenseNotification(args.expense, settings?.currency ?? 'XAF'),
    );
  }
}

/** Après un ajustement de stock : alerte « stock bas » si le produit est sous son seuil. */
export async function onProductAdjusted(
  prisma: PrismaClient,
  args: { orgId: string; productId: string; now?: Date },
): Promise<void> {
  const ownerId = await resolveOwnerId(prisma, args.orgId);
  if (!ownerId) return;

  const p = await prisma.product.findUnique({
    where: { id: args.productId },
    select: { id: true, name: true, qty: true, threshold: true, organizationId: true },
  });
  if (!p || p.organizationId !== args.orgId) return;
  if (p.threshold > 0 && p.qty <= p.threshold) {
    await notifyUser(
      prisma,
      ownerId,
      lowStockNotification(p.id, p.name, p.qty, dayKey(args.now ?? new Date())),
    );
  }
}

/**
 * Balaye les créances impayées au-delà du délai réglé par boutique
 * (`overdueDays`) et notifie chaque propriétaire. Une alerte par créance
 * (dédup). Appelé par le cron quotidien. Renvoie le nombre d'alertes émises.
 */
export async function notifyOverdueReceivables(
  prisma: PrismaClient,
  args: { now: Date },
): Promise<{ notified: number }> {
  const settingsRows = await prisma.boutiqueSettings.findMany({
    select: { organizationId: true, overdueDays: true, currency: true },
  });

  let notified = 0;
  for (const s of settingsRows) {
    const cutoff = new Date(args.now.getTime() - s.overdueDays * DAY_MS);
    const overdue = await prisma.receivable.findMany({
      where: {
        organizationId: s.organizationId,
        status: { in: ['OPEN', 'PARTIAL'] },
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        amount: true,
        amountPaid: true,
        customer: { select: { name: true } },
      },
    });
    if (overdue.length === 0) continue;

    const ownerId = await resolveOwnerId(prisma, s.organizationId);
    if (!ownerId) continue;

    for (const r of overdue) {
      const remaining = r.amount - r.amountPaid;
      const res = await notifyUser(
        prisma,
        ownerId,
        receivableOverdueNotification(r.id, r.customer?.name ?? 'Client', remaining, s.currency),
      );
      if (res) notified++;
    }
  }
  return { notified };
}
