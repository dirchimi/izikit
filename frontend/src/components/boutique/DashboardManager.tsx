'use client';

import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import LiveDateTime from '@/components/boutique/LiveDateTime';
import StatCard from '@/components/boutique/StatCard';
import CashTile from '@/components/boutique/CashTile';
import MiniBarChart from '@/components/boutique/MiniBarChart';
import StockAlertRow from '@/components/boutique/StockAlertRow';
import RecentSaleRow from '@/components/boutique/RecentSaleRow';
import AsyncState from '@/components/boutique/AsyncState';
import { useT, useLocale } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';

interface DashboardData {
  today: {
    revenue: number;
    sales: number;
    expenses: number;
    collectedCash: number;
    collectedMobile: number;
    creditGranted: number;
  };
  yesterday: { revenue: number; sales: number; expenses: number };
  receivablesOpen: number;
  weekly: { label: string; value: number }[];
  weekMaxRevenue: number;
  weekTodayIndex: number;
  stockAlerts: { name: string; remaining: number; critical: boolean }[];
  expiryAlerts: { name: string; daysLeft: number; expired: boolean }[];
  recentSales: {
    id: string;
    at: string;
    product: string;
    qty: number;
    total: number;
    method: string;
  }[];
}

const BCP47: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar' };

function pctTrend(today: number, yest: number): { trend: string; up: boolean } {
  if (yest === 0) return { trend: today > 0 ? '+100%' : '0%', up: today >= 0 };
  const pct = Math.round(((today - yest) / yest) * 100);
  return { trend: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
}

export default function DashboardManager() {
  const t = useT();
  const { locale } = useLocale();
  const bcp = BCP47[locale] ?? 'fr-FR';
  // Écran « vivant » : rafraîchi toutes les 20 s (onglet visible) → les ventes
  // des vendeurs tombent en direct sans actualiser.
  const { data, loading, error, refresh } = useApi<DashboardData>('/api/dashboard', {
    pollMs: 20_000,
  });

  return (
    <>
      <TopBar title={t('nav.dashboard')} subtitle={<LiveDateTime />} />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        <AsyncState loading={loading} error={error} onRetry={refresh}>
          {data &&
            (() => {
              const revT = pctTrend(data.today.revenue, data.yesterday.revenue);
              const salesT = pctTrend(data.today.sales, data.yesterday.sales);
              return (
                <div className="flex flex-col gap-6">
                  {/* KPI */}
                  <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      accent
                      label={t('dash.kpi.revenue')}
                      value={formatFCFA(data.today.revenue)}
                      unit={t('common.fcfa')}
                      icon="trending-up"
                      trend={revT.trend}
                      trendUp={revT.up}
                      vsLabel={t('dash.vsYesterday')}
                    />
                    <StatCard
                      label={t('dash.kpi.salesToday')}
                      value={String(data.today.sales)}
                      unit={t('ventes.kpi.salesUnit')}
                      icon="shopping-cart"
                      trend={salesT.trend}
                      trendUp={salesT.up}
                      vsLabel={t('dash.vsYesterday')}
                    />
                    <StatCard
                      label={t('dash.kpi.receivables')}
                      value={formatFCFA(data.receivablesOpen)}
                      unit={t('common.fcfa')}
                      icon="hand-coins"
                    />
                    <StatCard
                      label={t('dash.kpi.expensesToday')}
                      value={formatFCFA(data.today.expenses)}
                      unit={t('common.fcfa')}
                      icon="wallet"
                    />
                  </div>

                  {/* Argent réellement encaissé aujourd'hui (caisse miroir) */}
                  <div className="bg-surface border-border rounded-lg border px-6 py-5">
                    <div className="mb-4">
                      <h2 className="font-headings text-foreground text-base font-bold">
                        {t('cash.today')}
                      </h2>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {t('cash.revenueHint')}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <CashTile
                        icon="banknote"
                        label={t('cash.cash')}
                        value={formatFCFA(data.today.collectedCash)}
                        unit={t('common.fcfa')}
                        tone="text-primary"
                      />
                      <CashTile
                        icon="smartphone"
                        label={t('cash.mobile')}
                        value={formatFCFA(data.today.collectedMobile)}
                        unit={t('common.fcfa')}
                        tone="text-blue-600"
                      />
                      <CashTile
                        icon="hourglass"
                        label={t('cash.creditGranted')}
                        value={formatFCFA(data.today.creditGranted)}
                        unit={t('common.fcfa')}
                        tone="text-warning"
                      />
                    </div>
                    {/* Solde net : espèces réellement en caisse après dépenses du jour. */}
                    <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                      <span className="text-foreground font-body flex items-center gap-2 text-sm font-semibold">
                        <Icon i="wallet" size={16} className="text-primary" />
                        {t('cash.netCash')}
                        <span className="text-muted-foreground text-xs font-normal">
                          {t('cash.netCashHint')}
                        </span>
                      </span>
                      <span
                        className={`font-body text-lg font-bold ${
                          data.today.collectedCash - data.today.expenses < 0
                            ? 'text-danger'
                            : 'text-primary'
                        }`}
                      >
                        {formatFCFA(data.today.collectedCash - data.today.expenses)}{' '}
                        {t('common.fcfa')}
                      </span>
                    </div>
                  </div>

                  {/* Graphe + alertes stock */}
                  <div className="flex flex-col gap-5 xl:flex-row">
                    <div className="bg-surface border-border min-w-0 flex-1 rounded-lg border px-6 py-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h2 className="font-headings text-foreground text-base font-bold">
                            {t('dash.weekTitle')}
                          </h2>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {t('dash.weekSub')}
                          </p>
                        </div>
                      </div>
                      <MiniBarChart data={data.weekly} todayIndex={data.weekTodayIndex} />
                      <div className="mt-3 flex justify-between">
                        <span className="text-muted-foreground font-body text-xs">
                          0 {t('common.fcfa')}
                        </span>
                        <span className="text-muted-foreground font-body text-xs">
                          {formatFCFA(data.weekMaxRevenue)} {t('common.fcfa')}
                        </span>
                      </div>
                    </div>

                    {/* Alertes stock */}
                    <div className="bg-surface border-border w-full rounded-lg border xl:w-[280px]">
                      <div className="border-border flex items-center justify-between border-b px-4 py-4">
                        <h2 className="font-headings text-foreground text-base font-bold">
                          {t('dash.stockAlerts')}
                        </h2>
                        <span
                          className={`font-body rounded-sm px-2 py-0.5 text-xs font-bold ${
                            data.stockAlerts.length > 0
                              ? 'bg-danger text-danger-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {data.stockAlerts.length}
                        </span>
                      </div>
                      {data.stockAlerts.length === 0 ? (
                        <p className="text-muted-foreground font-body px-4 py-5 text-sm">
                          {t('dash.noAlerts')}
                        </p>
                      ) : (
                        data.stockAlerts.map((s) => (
                          <StockAlertRow
                            key={s.name}
                            name={s.name}
                            remaining={s.remaining}
                            unit=""
                            critical={s.critical}
                          />
                        ))
                      )}
                      <div className="px-4 py-3">
                        <Link
                          href="/stock"
                          className="text-primary font-body flex items-center gap-1 text-xs font-semibold"
                        >
                          {t('dash.seeAllStock')}{' '}
                          <Icon i="arrow-right" size={12} className="rtl:rotate-180" />
                        </Link>
                      </div>
                    </div>

                    {/* Alertes de péremption */}
                    {data.expiryAlerts.length > 0 && (
                      <div className="bg-surface border-border w-full rounded-lg border xl:w-[280px]">
                        <div className="border-border flex items-center justify-between border-b px-4 py-4">
                          <h2 className="font-headings text-foreground text-base font-bold">
                            {t('dash.expiryAlerts')}
                          </h2>
                          <span className="bg-warning text-warning-foreground font-body rounded-sm px-2 py-0.5 text-xs font-bold">
                            {data.expiryAlerts.length}
                          </span>
                        </div>
                        {data.expiryAlerts.map((a) => (
                          <div
                            key={a.name}
                            className="border-border flex items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0"
                          >
                            <span className="font-body text-foreground truncate text-sm">
                              {a.name}
                            </span>
                            <span
                              className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${
                                a.expired
                                  ? 'bg-danger/10 text-danger'
                                  : 'bg-warning/10 text-warning'
                              }`}
                            >
                              {a.expired
                                ? t('expiry.badge.expired')
                                : a.daysLeft === 0
                                  ? t('expiry.badge.today')
                                  : t('expiry.badge.inDays', { n: a.daysLeft })}
                            </span>
                          </div>
                        ))}
                        <div className="px-4 py-3">
                          <Link
                            href="/stock"
                            className="text-primary font-body flex items-center gap-1 text-xs font-semibold"
                          >
                            {t('dash.seeAllStock')}{' '}
                            <Icon i="arrow-right" size={12} className="rtl:rotate-180" />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ventes récentes */}
                  <div className="bg-surface border-border rounded-lg border">
                    <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4">
                      <h2 className="font-headings text-foreground text-base font-bold">
                        {t('dash.recentSales')}
                      </h2>
                      <Link href="/ventes" className="text-primary font-body text-xs font-semibold">
                        {t('dash.seeAll')}
                      </Link>
                    </div>

                    {data.recentSales.length === 0 ? (
                      <p className="text-muted-foreground font-body px-4 py-6 text-sm">
                        {t('dash.noSales')}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="min-w-[560px]">
                          <div className="bg-muted flex items-center gap-4 px-4 py-2">
                            <span className="font-body text-muted-foreground w-10 text-xs font-semibold">
                              {t('ventes.col.time')}
                            </span>
                            <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                              {t('common.article')}
                            </span>
                            <span className="font-body text-muted-foreground w-6 text-center text-xs font-semibold">
                              {t('common.qty')}
                            </span>
                            <span className="font-body text-muted-foreground w-24 text-end text-xs font-semibold">
                              {t('common.total')}
                            </span>
                            <span className="font-body text-muted-foreground w-20 text-center text-xs font-semibold">
                              {t('ventes.col.payment')}
                            </span>
                          </div>
                          {data.recentSales.map((s) => (
                            <RecentSaleRow
                              key={s.id}
                              time={new Date(s.at).toLocaleTimeString(bcp, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              product={s.product}
                              qty={s.qty}
                              total={s.total}
                              method={t(`method.${s.method}`)}
                              fcfa={t('common.fcfa')}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
        </AsyncState>
      </div>
    </>
  );
}
