// Phase 7 — logique des rapports (pure, testable). Les fonctions reçoivent `now`
// en paramètre (jamais d'horloge implicite) → déterministes et testables.

export type Period = 'today' | 'week' | 'month' | 'year';
export const PERIODS: Period[] = ['today', 'week', 'month', 'year'];

export interface Bucket {
  label: string;
  from: Date;
  to: Date; // exclusif
}
export interface AggItem {
  name: string;
  qty: number;
  unitPrice: number;
  productId: string | null;
}
export interface TopProduct {
  rank: number;
  name: string;
  qty: number;
  ca: number; // chiffre d'affaires (FCFA)
}

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

export function parsePeriod(value: string | null): Period {
  return PERIODS.includes(value as Period) ? (value as Period) : 'week';
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Fenêtre [from, to) couverte par la période, ancrée sur `now`. */
export function periodRange(period: Period, now: Date): { from: Date; to: Date } {
  const today = startOfDay(now);
  if (period === 'today') return { from: today, to: addDays(today, 1) };
  if (period === 'week') return { from: addDays(today, -6), to: addDays(today, 1) };
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
}

/**
 * Découpe la période en compartiments ordonnés pour le graphe :
 *  today → 1 barre (le jour) · week → 7 jours · month → jours du 1er à aujourd'hui
 *  · year → 12 mois.
 */
export function buildBuckets(period: Period, now: Date): Bucket[] {
  const today = startOfDay(now);

  if (period === 'today') {
    return [{ label: WEEKDAYS[today.getDay()] ?? '', from: today, to: addDays(today, 1) }];
  }
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, m) => ({
      label: MONTHS[m] ?? '',
      from: new Date(now.getFullYear(), m, 1),
      to: new Date(now.getFullYear(), m + 1, 1),
    }));
  }
  // week / month → compartiments journaliers
  const start =
    period === 'week' ? addDays(today, -6) : new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets: Bucket[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const label = period === 'week' ? (WEEKDAYS[d.getDay()] ?? '') : String(d.getDate());
    buckets.push({ label, from: d, to: addDays(d, 1) });
  }
  return buckets;
}

/** Index du compartiment contenant `date` (−1 si hors fenêtre). */
export function bucketIndexFor(buckets: Bucket[], date: Date): number {
  return buckets.findIndex((b) => date >= b.from && date < b.to);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' (local) → Date, ou null si invalide (ex. 2026-02-31). */
function ymdToDate(ymd: string): Date | null {
  if (!YMD.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Plage personnalisée à partir de deux dates 'YYYY-MM-DD' (incluses). Renvoie
 * `{ from, to }` (`to` exclusif = lendemain du dernier jour), ou null si dates
 * invalides, ordre inversé, ou plage > 366 jours (garde-fou).
 */
export function parseDateRange(fromYmd: string, toYmd: string): { from: Date; to: Date } | null {
  const f = ymdToDate(fromYmd);
  const t = ymdToDate(toYmd);
  if (!f || !t || f.getTime() > t.getTime()) return null;
  const from = startOfDay(f);
  const to = addDays(startOfDay(t), 1);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days > 366) return null;
  return { from, to };
}

/**
 * Compartiments du graphe pour une plage libre : journaliers si ≤ 62 jours,
 * sinon mensuels (sinon le graphe aurait trop de barres).
 */
export function buildBucketsRange(from: Date, to: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 62) {
    for (let d = from; d < to; d = addDays(d, 1)) {
      buckets.push({ label: String(d.getDate()), from: d, to: addDays(d, 1) });
    }
  } else {
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur < to) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      buckets.push({ label: MONTHS[cur.getMonth()] ?? '', from: cur, to: next });
      cur = next;
    }
  }
  return buckets;
}

/** Marge en % du chiffre d'affaires (0 si CA nul). */
export function marginPct(grossMargin: number, revenue: number): number {
  return revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0;
}

/** Top produits par chiffre d'affaires (regroupe par produit, ou par nom si supprimé). */
export function rankTopProducts(items: AggItem[], limit = 5): TopProduct[] {
  const map = new Map<string, { name: string; qty: number; ca: number }>();
  for (const it of items) {
    const key = it.productId ?? `name:${it.name}`;
    const cur = map.get(key) ?? { name: it.name, qty: 0, ca: 0 };
    cur.qty += it.qty;
    cur.ca += it.qty * it.unitPrice;
    map.set(key, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.ca - a.ca)
    .slice(0, limit)
    .map((p, i) => ({ rank: i + 1, name: p.name, qty: p.qty, ca: p.ca }));
}
