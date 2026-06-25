/**
 * Recherche globale boutique — interroge plusieurs modèles (produits, clients,
 * ventes, dépenses) scopés à une organisation, en une passe parallèle. Lecture
 * seule. Renvoie des groupes de résultats prêts pour l'UI (libellé + sous-titre
 * + lien). Insensible à la casse (Postgres `mode: 'insensitive'`).
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { formatFCFA } from '@/lib/boutique/format';

export interface SearchHit {
  id: string;
  label: string;
  sub: string;
  href: string;
}
export interface GlobalSearchResult {
  products: SearchHit[];
  customers: SearchHit[];
  sales: SearchHit[];
  expenses: SearchHit[];
  total: number;
}

const PER_GROUP = 5;
const MIN_LEN = 2;

export async function globalSearch(
  prisma: PrismaClient,
  orgId: string,
  rawQuery: string,
): Promise<GlobalSearchResult> {
  const q = rawQuery.trim();
  const empty: GlobalSearchResult = {
    products: [],
    customers: [],
    sales: [],
    expenses: [],
    total: 0,
  };
  if (q.length < MIN_LEN) return empty;

  const ci = { contains: q, mode: 'insensitive' as const };

  const [products, customers, sales, expenses] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: orgId, OR: [{ name: ci }, { ref: ci }, { barcode: ci }] },
      take: PER_GROUP,
      select: { id: true, name: true, ref: true, qty: true, sellPrice: true },
    }),
    prisma.customer.findMany({
      where: { organizationId: orgId, OR: [{ name: ci }, { phone: ci }] },
      take: PER_GROUP,
      select: { id: true, name: true, phone: true },
    }),
    prisma.sale.findMany({
      where: { organizationId: orgId, number: ci },
      take: PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, total: true },
    }),
    prisma.expense.findMany({
      where: { organizationId: orgId, OR: [{ label: ci }, { number: ci }] },
      take: PER_GROUP,
      orderBy: { occurredAt: 'desc' },
      select: { id: true, number: true, label: true, amount: true },
    }),
  ]);

  const result: GlobalSearchResult = {
    products: products.map((p) => ({
      id: p.id,
      label: p.name,
      sub: `${p.ref} · ${p.qty} en stock · ${formatFCFA(p.sellPrice)} FCFA`,
      href: '/stock',
    })),
    customers: customers.map((c) => ({
      id: c.id,
      label: c.name,
      sub: c.phone ?? 'Client',
      href: '/creances',
    })),
    sales: sales.map((s) => ({
      id: s.id,
      label: `Vente ${s.number}`,
      sub: `${formatFCFA(s.total)} FCFA`,
      href: '/ventes',
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      label: e.label,
      sub: `${e.number} · ${formatFCFA(e.amount)} FCFA`,
      href: '/depenses',
    })),
    total: 0,
  };
  result.total =
    result.products.length + result.customers.length + result.sales.length + result.expenses.length;
  return result;
}
