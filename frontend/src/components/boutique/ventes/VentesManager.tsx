'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Dropdown from '@/components/ui/Dropdown';
import DatePicker from '@/components/ui/DatePicker';
import Modal from '@/components/ui/Modal';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { formatFCFA } from '@/lib/boutique/format';
import ReceiptModal, { type ReceiptData } from './ReceiptModal';

type ApiMethod = 'CASH' | 'MOBILE' | 'CREDIT';
interface ApiSale {
  id: string;
  number: string;
  method: ApiMethod;
  total: number;
  status: string; // ACTIVE | CANCELLED
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
}

type Period = 'all' | 'today' | 'date';
type MethodFilter = ApiMethod | 'all';

const METHOD_LABEL: Record<ApiMethod, string> = {
  CASH: 'method.cash',
  MOBILE: 'method.mobile',
  CREDIT: 'method.credit',
};
const METHOD_BADGE: Record<ApiMethod, string> = {
  CASH: 'bg-badge-cash text-badge-cash-foreground',
  MOBILE: 'bg-badge-mobile text-badge-mobile-foreground',
  CREDIT: 'bg-badge-credit text-badge-credit-foreground',
};
const METHOD_TABS: MethodFilter[] = ['all', 'CASH', 'MOBILE', 'CREDIT'];

function sameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}
/** Date ISO → 'YYYY-MM-DD' local (pour comparer à un <input type="date">). */
function isoToYmd(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function VentesManager() {
  const t = useT();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [pickDate, setPickDate] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const { data, loading, error, refresh } = useApi<{ sales: ApiSale[] }>('/api/sales');
  const sales = data?.sales ?? [];

  // Le bouton « Annuler » n'est visible que pour le Patron (OWNER) et le
  // Manager (ADMIN) — le serveur applique la même règle (défense en profondeur).
  const { data: org } = useApi<{ role: string }>('/api/org/current');
  const canCancel = org?.role === 'OWNER' || org?.role === 'ADMIN';

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api(`/api/sales/${cancelTarget.id}/cancel`, { method: 'POST' });
      toast(t('ventes.cancel.success', { number: cancelTarget.number }), 'success');
      setCancelTarget(null);
      await refresh();
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setCancelling(false);
    }
  }

  function openReceipt(id: string) {
    const s = sales.find((x) => x.id === id);
    if (!s) return;
    setReceipt({
      number: s.number,
      createdAt: s.createdAt,
      method: s.method,
      total: s.total,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      items: s.items,
    });
  }
  const now = new Date();

  // KPIs « du jour » dérivés des ventes chargées (hors ventes annulées).
  const todays = sales.filter((s) => s.status !== 'CANCELLED' && sameDay(s.createdAt, now));
  const caToday = todays.reduce((sum, s) => sum + s.total, 0);
  const countToday = todays.length;
  const creditToday = todays
    .filter((s) => s.method === 'CREDIT')
    .reduce((sum, s) => sum + s.total, 0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales
      .filter(
        (s) =>
          (period === 'all' ||
            (period === 'today' && sameDay(s.createdAt, now)) ||
            (period === 'date' && pickDate !== '' && isoToYmd(s.createdAt) === pickDate)) &&
          (method === 'all' || s.method === method),
      )
      .map((s) => {
        const d = new Date(s.createdAt);
        const label =
          (s.items[0]?.name ?? '—') + (s.items.length > 1 ? ` +${s.items.length - 1}` : '');
        return {
          id: s.id,
          number: s.number,
          date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
          time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          label,
          qty: s.items.reduce((sum, it) => sum + it.qty, 0),
          total: s.total,
          method: s.method,
          cancelled: s.status === 'CANCELLED',
        };
      })
      .filter(
        (r) => q === '' || r.label.toLowerCase().includes(q) || r.number.toLowerCase().includes(q),
      );
  }, [sales, search, period, pickDate, method]);

  const todayYmd = isoToYmd(now.toISOString());
  const periodLabel =
    period === 'all'
      ? t('ventes.period.all')
      : period === 'today'
        ? t('common.today')
        : pickDate
          ? new Date(`${pickDate}T00:00:00`).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : t('common.pickDate');

  return (
    <>
      <TopBar
        title={t('nav.ventes')}
        subtitle={t('ventes.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
        {/* KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            accent
            label={t('ventes.kpi.caToday')}
            value={formatFCFA(caToday)}
            sublabel={t('common.fcfa')}
          />
          <KpiCard
            label={t('depenses.kpi.count')}
            value={String(countToday)}
            sublabel={t('ventes.kpi.salesUnit')}
          />
          <KpiCard
            label={t('ventes.kpi.creditSales')}
            value={formatFCFA(creditToday)}
            sublabel={t('common.fcfa')}
          />
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="border-border bg-input flex w-full items-center gap-2 rounded-md border px-3 py-2 sm:w-[260px]">
            <Icon i="search" size={14} className="text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search.article')}
              className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            />
          </div>

          <Dropdown
            align="start"
            width="w-52"
            trigger={
              <span className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Icon i="calendar" size={14} className="text-muted-foreground" />
                {periodLabel}
                <Icon i="chevron-down" size={14} className="text-muted-foreground" />
              </span>
            }
            items={[
              {
                label: t('ventes.period.all'),
                icon: 'layers',
                active: period === 'all',
                onClick: () => setPeriod('all'),
              },
              {
                label: t('common.today'),
                icon: 'sun',
                active: period === 'today',
                onClick: () => setPeriod('today'),
              },
              {
                label: t('common.pickDate'),
                icon: 'calendar',
                active: period === 'date',
                onClick: () => {
                  setPeriod('date');
                  if (!pickDate) setPickDate(todayYmd);
                },
              },
            ]}
          />
          {period === 'date' && (
            <DatePicker value={pickDate} onChange={setPickDate} max={todayYmd} />
          )}

          <div className="border-border flex flex-wrap items-center overflow-hidden rounded-md border">
            {METHOD_TABS.map((m) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`font-body border-border border-s px-3 py-2 text-xs first:border-s-0 ${
                    active
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {m === 'all' ? t('common.all') : t(METHOD_LABEL[m])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <AsyncState
          loading={loading}
          error={error}
          onRetry={refresh}
          isEmpty={sales.length === 0}
          emptyLabel={t('ventes.emptyAll')}
          emptyIcon="receipt"
        >
          <div className="bg-surface border-border hidden rounded-lg border md:block">
            <div className="overflow-x-auto">
              <div className="min-w-[840px]">
                <div className="bg-muted border-border flex items-center gap-4 rounded-t-lg border-b px-5 py-3">
                  <span className="font-body text-muted-foreground w-20 text-xs font-semibold">
                    {t('depenses.col.num')}
                  </span>
                  <span className="font-body text-muted-foreground w-24 text-xs font-semibold">
                    {t('common.date')}
                  </span>
                  <span className="font-body text-muted-foreground w-14 text-xs font-semibold">
                    {t('ventes.col.time')}
                  </span>
                  <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                    {t('common.article')}
                  </span>
                  <span className="font-body text-muted-foreground w-8 text-center text-xs font-semibold">
                    {t('common.qty')}
                  </span>
                  <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                    {t('common.total')}
                  </span>
                  <span className="font-body text-muted-foreground w-28 text-center text-xs font-semibold">
                    {t('ventes.col.payment')}
                  </span>
                  <span className="font-body text-muted-foreground w-16 text-center text-xs font-semibold">
                    {t('receipt.title')}
                  </span>
                </div>

                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={`border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0 ${
                      r.cancelled ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="font-body text-muted-foreground w-20 font-mono text-xs">
                      {r.number}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-xs">{r.date}</span>
                    <span className="font-body text-muted-foreground w-14 text-xs">{r.time}</span>
                    <span
                      className={`font-body flex-1 text-sm font-medium ${
                        r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {r.label}
                    </span>
                    <span className="font-body text-muted-foreground w-8 text-center text-sm">
                      {r.qty}
                    </span>
                    <span
                      className={`font-body w-28 text-end text-sm font-bold ${
                        r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {formatFCFA(r.total)} {t('common.fcfa')}
                    </span>
                    <div className="flex w-28 justify-center">
                      {r.cancelled ? (
                        <span className="font-body bg-muted text-muted-foreground rounded-sm px-2 py-0.5 text-xs font-semibold">
                          {t('ventes.cancelled')}
                        </span>
                      ) : (
                        <span
                          className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${METHOD_BADGE[r.method]}`}
                        >
                          {t(METHOD_LABEL[r.method])}
                        </span>
                      )}
                    </div>
                    <div className="flex w-16 items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openReceipt(r.id)}
                        aria-label={t('receipt.title')}
                        title={t('receipt.title')}
                        className="text-primary hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                      >
                        <Icon i="receipt-text" size={16} />
                      </button>
                      {canCancel && !r.cancelled && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget({ id: r.id, number: r.number })}
                          aria-label={t('ventes.cancel')}
                          title={t('ventes.cancel')}
                          className="text-danger hover:bg-danger/10 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                        >
                          <Icon i="x-circle" size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {rows.length === 0 && (
                  <div className="text-muted-foreground font-body px-5 py-6 text-sm">
                    {t('ventes.empty')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cartes (mobile / tablette < md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`bg-surface border-border flex flex-col gap-2 rounded-lg border p-4 ${
                  r.cancelled ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-muted-foreground font-mono text-xs">
                    {r.number} · {r.date} {r.time}
                  </span>
                  {r.cancelled ? (
                    <span className="font-body bg-muted text-muted-foreground shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold">
                      {t('ventes.cancelled')}
                    </span>
                  ) : (
                    <span
                      className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${METHOD_BADGE[r.method]}`}
                    >
                      {t(METHOD_LABEL[r.method])}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-body text-sm font-medium ${
                      r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {r.label}
                  </span>
                  <span className="font-body text-muted-foreground shrink-0 text-xs">×{r.qty}</span>
                </div>
                <div className="border-border flex items-center justify-between gap-2 border-t pt-2">
                  <span
                    className={`font-body text-base font-bold ${
                      r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {formatFCFA(r.total)} {t('common.fcfa')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openReceipt(r.id)}
                      aria-label={t('receipt.title')}
                      className="text-primary hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    >
                      <Icon i="receipt-text" size={16} />
                    </button>
                    {canCancel && !r.cancelled && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget({ id: r.id, number: r.number })}
                        aria-label={t('ventes.cancel')}
                        className="text-danger hover:bg-danger/10 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                      >
                        <Icon i="x-circle" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-5 py-6 text-sm">
                {t('ventes.empty')}
              </div>
            )}
          </div>
        </AsyncState>
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <Modal
        open={cancelTarget !== null}
        onClose={() => !cancelling && setCancelTarget(null)}
        title={t('ventes.cancel.title')}
        size="sm"
      >
        <p className="font-body text-foreground text-sm">
          {t('ventes.cancel.body', { number: cancelTarget?.number ?? '' })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setCancelTarget(null)}
            disabled={cancelling}
            className="font-body border-border text-foreground hover:bg-muted rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmCancel}
            disabled={cancelling}
            className="font-body bg-danger text-danger-foreground rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {t('ventes.cancel.confirm')}
          </button>
        </div>
      </Modal>
    </>
  );
}
