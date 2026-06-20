'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { paymentLabelKey } from '@/lib/boutique/payment-label';
import {
  salesTransactions,
  salesSummary,
  saleMethods,
  saleMethodBadge,
  SALES_TODAY,
  type SaleMethod,
} from '@/lib/boutique/fixtures';

type Period = 'all' | 'today';
type MethodFilter = SaleMethod | 'all';

export default function VentesManager() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [method, setMethod] = useState<MethodFilter>('all');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salesTransactions.filter(
      (tx) =>
        (q === '' || tx.product.toLowerCase().includes(q) || tx.id.toLowerCase().includes(q)) &&
        (period === 'all' || tx.date === SALES_TODAY) &&
        (method === 'all' || tx.method === method),
    );
  }, [search, period, method]);

  const unsyncedVisible = visible.filter((tx) => !tx.synced).length;
  const methodTabs: MethodFilter[] = ['all', ...saleMethods];

  return (
    <>
      <TopBar
        title={t('nav.ventes')}
        subtitle={t('ventes.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
        {/* KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            accent
            label={t('ventes.kpi.caToday')}
            value={formatFCFA(salesSummary.caToday)}
            sublabel={t('common.fcfa')}
          />
          <KpiCard
            label={t('depenses.kpi.count')}
            value={String(salesSummary.txToday)}
            sublabel={t('ventes.kpi.salesUnit')}
          />
          <KpiCard
            label={t('ventes.kpi.syncPending')}
            value={String(salesSummary.syncPending)}
            sublabel={t('common.transactions')}
            valueClass="text-warning"
          />
          <KpiCard
            label={t('ventes.kpi.creditSales')}
            value={formatFCFA(salesSummary.creditSales)}
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

          <div className="border-border bg-surface flex items-center gap-2 rounded-md border px-3 py-2">
            <Icon i="calendar" size={14} className="text-muted-foreground" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="text-foreground font-body bg-surface text-sm outline-none"
            >
              <option value="all">{t('ventes.period.all')}</option>
              <option value="today">{t('common.today')}</option>
            </select>
          </div>

          <div className="border-border flex flex-wrap items-center overflow-hidden rounded-md border">
            {methodTabs.map((m) => {
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
                  {m === 'all' ? t('common.all') : t(paymentLabelKey(m))}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {unsyncedVisible > 0 && (
            <div className="text-muted-foreground font-body flex items-center gap-1 text-xs">
              <Icon i="cloud-off" size={12} className="text-warning" />
              <span>{t('ventes.unsynced', { n: unsyncedVisible })}</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-surface border-border rounded-lg border">
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
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
                <span className="font-body text-muted-foreground w-10 text-center text-xs font-semibold">
                  {t('ventes.col.sync')}
                </span>
              </div>

              {visible.map((tx) => (
                <div
                  key={tx.id}
                  className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                >
                  <span className="font-body text-muted-foreground w-20 font-mono text-xs">
                    {tx.id}
                  </span>
                  <span className="font-body text-muted-foreground w-24 text-xs">{tx.date}</span>
                  <span className="font-body text-muted-foreground w-14 text-xs">{tx.time}</span>
                  <span className="font-body text-foreground flex-1 text-sm font-medium">
                    {tx.product}
                  </span>
                  <span className="font-body text-muted-foreground w-8 text-center text-sm">
                    {tx.qty}
                  </span>
                  <span className="font-body text-foreground w-28 text-end text-sm font-bold">
                    {formatFCFA(tx.total)} {t('common.fcfa')}
                  </span>
                  <div className="flex w-28 justify-center">
                    <span
                      className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${saleMethodBadge[tx.method]}`}
                    >
                      {t(paymentLabelKey(tx.method))}
                    </span>
                  </div>
                  <div className="flex w-10 justify-center">
                    {tx.synced ? (
                      <Icon i="cloud" size={14} className="text-success" />
                    ) : (
                      <Icon i="cloud-off" size={14} className="text-warning" />
                    )}
                  </div>
                </div>
              ))}

              {visible.length === 0 && (
                <div className="text-muted-foreground font-body px-5 py-6 text-sm">
                  {t('ventes.empty')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
