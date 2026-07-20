/**
 * creances-adapters.ts — pure Dexie → UI-shape adapters for the offline
 * créances (receivables) screens (Task 5.2 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 5).
 *
 * Mirrors the small-pure-mapper pattern `expense-adapters.ts` / `pos-adapters.ts`
 * established: dependency-free functions, directly unit-testable with no render
 * harness, that `CreancesManager` / `RepaymentsView` apply to rows read live
 * from Dexie. Keeping the output shapes identical to what `GET /api/receivables`
 * and `GET /api/repayments` returned means the components' existing rendering
 * needs no other change once the data source switches from `useApi` to
 * `useLocalResource`.
 *
 * Two deliberate limitations vs the server versions, both DISPLAY-ONLY (never a
 * money value):
 *   1. `history[].label` — the server derives the article label from the
 *      credit sale's items. `aggregateDebtors`'s signature intentionally takes
 *      only customers/receivables/repayments (no sale items), and `ReceivableRow`
 *      carries no item names, so the label is `'—'` (the server's own fallback
 *      for an item-less receivable). The money fields (amount / amountPaid /
 *      status / debt / repaid / totalCredit) are exact.
 *   2. dates — `ReceivableRow`/`CustomerRow` carry only `updatedAt` (no
 *      `createdAt` in the Dexie mirror), so `since` / `lastSale` / `history[].date`
 *      use `updatedAt` as a proxy. This shifts a displayed date at most to the
 *      last-modification time; it never affects a balance.
 *
 * The repayment TIMELINE (per-debtor `repayments[]` and the `RepaymentsView`
 * list) is sourced from `db.repayments`, which holds only device-local
 * repayments (`/api/sync/pull` does not sync the Repayment table — see
 * `RepaymentRow`'s docblock). The debtor BALANCES (`debt`/`repaid`) come from
 * `receivables` (pulled + reconciled), so they stay authoritative regardless.
 */
import type { CustomerRow, ReceivableRow, RepaymentRow, ReceivableStatus } from './db';
import type { CreditStatus } from '@/lib/boutique/fixtures';

// ---------------------------------------------------------------------------
// Output shapes — byte-identical to the former `/api/receivables` and
// `/api/repayments` JSON the components render.
// ---------------------------------------------------------------------------

export interface ApiCredit {
  id: string;
  date: string; // ISO
  label: string;
  amount: number;
  amountPaid: number;
  status: CreditStatus; // credit | partial | paid
}

export interface ApiRepayment {
  id: string;
  date: string; // ISO
  amount: number;
  method: string; // cash | mobile
  note: string;
}

export interface ApiDebtor {
  id: string;
  name: string;
  phone: string;
  debt: number;
  repaid: number;
  totalCredit: number;
  since: string; // ISO
  lastSale: string; // ISO
  history: ApiCredit[];
  repayments: ApiRepayment[];
}

/** Row shape the global "Remboursements reçus" list (`RepaymentsView`) renders. */
export interface RepaymentListItem {
  id: string;
  customerName: string;
  amount: number;
  method: string; // cash | mobile
  note: string;
  createdAt: string; // ISO
}

export interface RepaymentsData {
  total: number;
  cash: number;
  mobile: number;
  count: number;
  repayments: RepaymentListItem[];
}

/** Maps a stored receivable status to the UI credit-status key (mirrors the
 * server's `uiStatus`). CANCELLED never reaches here — it's filtered out
 * before aggregation. */
function toCreditStatus(status: ReceivableStatus): CreditStatus {
  if (status === 'PAID') return 'paid';
  if (status === 'PARTIAL') return 'partial';
  return 'credit'; // OPEN
}

// ---------------------------------------------------------------------------
// Debtors aggregation — the local equivalent of `GET /api/receivables`.
// ---------------------------------------------------------------------------

/**
 * Joins locally-mirrored customers, receivables and repayments into the
 * `ApiDebtor[]` shape `CreancesManager` renders. Pure (no Dexie / clock),
 * so it is unit-testable directly.
 *
 * Rules mirror the server route:
 *   - a customer appears iff it has ≥1 receivable of ANY status
 *     (server: `receivables: { some: {} }`);
 *   - CANCELLED receivables are excluded from the money aggregation and the
 *     history (a cancelled credit sale no longer counts as debt);
 *   - `debt = Σ (amount − amountPaid)`, `repaid = Σ amountPaid`,
 *     `totalCredit = Σ amount` over the non-cancelled receivables;
 *   - `history` is newest-first; `repayments` is newest-first;
 *   - debtors are returned most-indebted first.
 */
export function aggregateDebtors(
  customers: CustomerRow[],
  receivables: ReceivableRow[],
  repayments: RepaymentRow[],
): ApiDebtor[] {
  const recByCustomer = new Map<string, ReceivableRow[]>();
  for (const r of receivables) {
    const arr = recByCustomer.get(r.customerId);
    if (arr) arr.push(r);
    else recByCustomer.set(r.customerId, [r]);
  }

  const repByCustomer = new Map<string, RepaymentRow[]>();
  for (const p of repayments) {
    const arr = repByCustomer.get(p.customerId);
    if (arr) arr.push(p);
    else repByCustomer.set(p.customerId, [p]);
  }

  const debtors: ApiDebtor[] = [];
  for (const c of customers) {
    const recs = recByCustomer.get(c.id);
    if (!recs || recs.length === 0) continue; // server: only customers WITH a receivable

    // Non-cancelled, oldest-first (updatedAt proxy for createdAt — see docblock).
    const active = recs
      .filter((r) => r.status !== 'CANCELLED')
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));

    let debt = 0;
    let repaid = 0;
    let totalCredit = 0;
    let lastSale = c.updatedAt;
    const history: ApiCredit[] = active.map((r) => {
      debt += r.amount - r.amountPaid;
      repaid += r.amountPaid;
      totalCredit += r.amount;
      if (r.updatedAt > lastSale) lastSale = r.updatedAt;
      return {
        id: r.id,
        date: r.updatedAt,
        label: '—',
        amount: r.amount,
        amountPaid: r.amountPaid,
        status: toCreditStatus(r.status),
      };
    });
    history.reverse(); // newest first

    const reps = (repByCustomer.get(c.id) ?? [])
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const repaymentsOut: ApiRepayment[] = reps.map((p) => ({
      id: p.id,
      date: p.createdAt,
      amount: p.amount,
      method: (p.method ?? 'cash').toLowerCase(),
      note: p.note ?? '',
    }));

    debtors.push({
      id: c.id,
      name: c.name,
      phone: c.phone ?? '',
      debt,
      repaid,
      totalCredit,
      since: c.updatedAt,
      lastSale,
      history,
      repayments: repaymentsOut,
    });
  }

  debtors.sort((a, b) => b.debt - a.debt); // most indebted first
  return debtors;
}

// ---------------------------------------------------------------------------
// Repayments list aggregation — the local equivalent of `GET /api/repayments`.
// ---------------------------------------------------------------------------

export type RepayPeriod = 'today' | 'week' | 'month' | 'year';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** `[from, to)` epoch-ms window for a named period, anchored on `now` —
 * mirrors the server's `periodRange`. */
export function repaymentWindow(period: RepayPeriod, now: Date): { from: number; to: number } {
  const today = startOfDay(now);
  if (period === 'today') return { from: today.getTime(), to: addDays(today, 1).getTime() };
  if (period === 'week')
    return { from: addDays(today, -6).getTime(), to: addDays(today, 1).getTime() };
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
    };
  }
  return {
    from: new Date(now.getFullYear(), 0, 1).getTime(),
    to: new Date(now.getFullYear() + 1, 0, 1).getTime(),
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** `[from, to)` epoch-ms window for a custom 'YYYY-MM-DD'..'YYYY-MM-DD' range
 * (both inclusive; `to` is the day after `toYmd`). `null` on invalid input —
 * mirrors the server's `parseDateRange` (minus the 366-day guard, which the
 * DatePicker bounds already enforce). */
export function customRepaymentWindow(
  fromYmd: string,
  toYmd: string,
): { from: number; to: number } | null {
  if (!YMD.test(fromYmd) || !YMD.test(toYmd)) return null;
  const [fy, fm, fd] = fromYmd.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toYmd.split('-').map(Number) as [number, number, number];
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return null;
  return { from: startOfDay(from).getTime(), to: addDays(startOfDay(to), 1).getTime() };
}

/**
 * Filters local repayments to a window, joins customer names, and computes the
 * totals `RepaymentsView` renders (total / cash / mobile / count + a
 * newest-first list). Pure — the caller computes the window (see
 * `repaymentWindow` / `customRepaymentWindow`).
 */
export function aggregateRepayments(
  repayments: RepaymentRow[],
  customers: CustomerRow[],
  window: { from: number; to: number },
): RepaymentsData {
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  const inWindow = repayments
    .filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return !Number.isNaN(t) && t >= window.from && t < window.to;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)); // desc

  let cash = 0;
  let mobile = 0;
  for (const r of inWindow) {
    if ((r.method ?? 'cash').toLowerCase() === 'mobile') mobile += r.amount;
    else cash += r.amount;
  }

  return {
    total: cash + mobile,
    cash,
    mobile,
    count: inWindow.length,
    repayments: inWindow.map((r) => ({
      id: r.id,
      customerName: nameById.get(r.customerId) ?? '—',
      amount: r.amount,
      method: (r.method ?? 'cash').toLowerCase(),
      note: r.note ?? '',
      createdAt: r.createdAt,
    })),
  };
}
