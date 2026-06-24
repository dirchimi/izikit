import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import StatCard from '@/components/boutique/StatCard';
import PremiumBanner from '@/components/boutique/PremiumBanner';
import OnboardingModal from '@/components/boutique/OnboardingModal';
import MiniBarChart from '@/components/boutique/MiniBarChart';
import StockAlertRow from '@/components/boutique/StockAlertRow';
import RecentSaleRow from '@/components/boutique/RecentSaleRow';
import { getServerT } from '@/lib/i18n/server';
import {
  dashboardKpis,
  weeklySales,
  weeklyTodayIndex,
  stockAlerts,
  recentSales,
} from '@/lib/boutique/fixtures';

export const metadata = { title: 'Tableau de bord — Sahilley' };

// Libellé/unité i18n par KPI, repérés sur leur libellé français d'origine.
const KPI_KEYS: Record<string, { labelKey: string; unitKey: string }> = {
  'CA du jour': { labelKey: 'dash.kpi.revenue', unitKey: 'common.fcfa' },
  'Ventes aujourd’hui': { labelKey: 'dash.kpi.salesToday', unitKey: 'ventes.kpi.salesUnit' },
  'Créances en cours': { labelKey: 'dash.kpi.receivables', unitKey: 'common.fcfa' },
  'Dépenses du jour': { labelKey: 'dash.kpi.expensesToday', unitKey: 'common.fcfa' },
};

export default async function DashboardPage() {
  const { t } = await getServerT();
  const pendingSync = recentSales.filter((s) => !s.synced).length;

  return (
    <>
      <TopBar title={t('nav.dashboard')} subtitle={t('dash.date')} />
      <OnboardingModal />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* KPI */}
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboardKpis.map((kpi) => {
            const meta = KPI_KEYS[kpi.label];
            return (
              <StatCard
                key={kpi.label}
                label={meta ? t(meta.labelKey) : kpi.label}
                value={kpi.value}
                unit={meta ? t(meta.unitKey) : kpi.unit}
                icon={kpi.icon}
                trend={kpi.trend}
                trendUp={kpi.trendUp}
                accent={kpi.accent ?? false}
                vsLabel={t('dash.vsYesterday')}
              />
            );
          })}
        </div>

        {/* Graphe + alertes stock */}
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Ventes de la semaine */}
          <div className="bg-surface border-border flex-1 rounded-lg border px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-headings text-foreground text-base font-bold">
                  {t('dash.weekTitle')}
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs">{t('dash.weekSub')}</p>
              </div>
              <div className="text-muted-foreground font-body flex items-center gap-1 text-xs">
                <Icon i="calendar" size={12} />
                <span>Jan 9 – 15</span>
              </div>
            </div>
            <MiniBarChart data={weeklySales} todayIndex={weeklyTodayIndex} />
            <div className="mt-3 flex justify-between">
              <span className="text-muted-foreground font-body text-xs">0 {t('common.fcfa')}</span>
              <span className="text-muted-foreground font-body text-xs">
                200 000 {t('common.fcfa')}
              </span>
            </div>
          </div>

          {/* Alertes stock */}
          <div className="bg-surface border-border w-full rounded-lg border lg:w-[280px]">
            <div className="border-border flex items-center justify-between border-b px-4 py-4">
              <h2 className="font-headings text-foreground text-base font-bold">
                {t('dash.stockAlerts')}
              </h2>
              <span className="bg-danger text-danger-foreground font-body rounded-sm px-2 py-0.5 text-xs font-bold">
                {stockAlerts.length}
              </span>
            </div>
            {stockAlerts.map((s) => (
              <StockAlertRow key={s.name} {...s} />
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
        </div>

        {/* Ventes récentes */}
        <div className="bg-surface border-border rounded-lg border">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4">
            <h2 className="font-headings text-foreground text-base font-bold">
              {t('dash.recentSales')}
            </h2>
            <div className="flex items-center gap-3">
              <div className="text-muted-foreground font-body flex items-center gap-1 text-xs">
                <Icon i="cloud-off" size={12} className="text-warning" />
                <span>{t('dash.pendingSync', { n: pendingSync })}</span>
              </div>
              <Link href="/ventes" className="text-primary font-body text-xs font-semibold">
                {t('dash.seeAll')}
              </Link>
            </div>
          </div>

          {/* Table scrollable horizontalement sous lg */}
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* En-tête */}
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
                <span className="font-body text-muted-foreground w-5 text-center text-xs font-semibold">
                  {t('ventes.col.sync')}
                </span>
              </div>
              {recentSales.map((sale, i) => (
                <RecentSaleRow
                  key={`${sale.time}-${i}`}
                  time={sale.time}
                  product={sale.product}
                  qty={sale.qty}
                  total={sale.total}
                  method={t(`method.${sale.method}`)}
                  fcfa={t('common.fcfa')}
                  synced={sale.synced}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Teaser premium — capte l'intérêt (liste d'attente) */}
        <PremiumBanner />
      </div>
    </>
  );
}
