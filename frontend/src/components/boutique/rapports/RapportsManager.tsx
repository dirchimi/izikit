'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { reportSummary, reportTopProducts } from '@/lib/boutique/fixtures';
import ReportBarChart from './ReportBarChart';

const periods = [
  { id: 'today', key: 'rapports.period.today' },
  { id: 'week', key: 'rapports.period.week' },
  { id: 'month', key: 'rapports.period.month' },
  { id: 'year', key: 'rapports.period.year' },
  { id: 'custom', key: 'rapports.period.custom' },
];

export default function RapportsManager() {
  const { toast } = useToast();
  const t = useT();
  const [period, setPeriod] = useState('week');
  const isCustom = period === 'custom';

  const exportBtn = (
    <button
      type="button"
      onClick={() => toast(t('rapports.exportSoon'), 'info')}
      className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
    >
      <Icon i="download" size={14} />
      {t('rapports.exportPdf')}
    </button>
  );

  return (
    <>
      <TopBar
        title={t('nav.rapports')}
        subtitle={t('rapports.subtitle')}
        actions={<ScreenTopActions extra={exportBtn} />}
      />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* Sélecteur de période */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-body text-foreground text-sm font-semibold">
            {t('rapports.periodLabel')}
          </span>
          <div className="border-border flex items-center overflow-x-auto rounded-md border">
            {periods.map((p) => {
              const active = p.id === period;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`font-body border-border shrink-0 border-s px-4 py-2 text-sm whitespace-nowrap first:border-s-0 ${
                    active
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t(p.key)}
                </button>
              );
            })}
          </div>
          <div
            className={`border-border bg-input flex items-center gap-2 rounded-md border px-3 py-2 ${
              isCustom ? '' : 'pointer-events-none opacity-40'
            }`}
            aria-hidden={!isCustom}
          >
            <Icon i="calendar" size={13} className="text-muted-foreground" />
            <span className="text-muted-foreground font-body text-sm">01 jan 2025</span>
            <span className="text-muted-foreground mx-1 text-xs">→</span>
            <span className="text-muted-foreground font-body text-sm">15 jan 2025</span>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            accent
            label={t('rapports.kpi.revenue')}
            value={formatFCFA(reportSummary.revenue)}
            sublabel={t('common.fcfa')}
          />
          <KpiCard
            label={t('rapports.kpi.sales')}
            value={String(reportSummary.sales)}
            sublabel={t('common.transactions')}
          />
          <KpiCard
            label={t('rapports.kpi.margin')}
            value={formatFCFA(reportSummary.grossMargin)}
            sublabel={
              <>
                {t('common.fcfa')} ·{' '}
                <span className="text-primary font-semibold">{reportSummary.marginPct} %</span>
              </>
            }
          />
          <KpiCard
            label={t('nav.depenses')}
            value={formatFCFA(reportSummary.expenses)}
            sublabel={t('common.fcfa')}
            valueClass="text-warning"
          />
          <KpiCard
            label={t('rapports.kpi.netProfit')}
            value={formatFCFA(reportSummary.netProfit)}
            sublabel={t('common.fcfa')}
            valueClass="text-danger"
          />
        </div>

        {/* Graphe + Top produits */}
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="bg-surface border-border flex flex-1 flex-col gap-4 rounded-lg border px-5 py-5 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-headings text-foreground text-base font-bold">
                {t('rapports.chartTitle')}
              </h2>
              <span className="text-muted-foreground font-body text-xs">
                {t('rapports.chartSub')}
              </span>
            </div>
            <ReportBarChart />
          </div>

          <div className="bg-surface border-border flex flex-col gap-4 rounded-lg border px-5 py-5 md:px-6 lg:w-[380px]">
            <h2 className="font-headings text-foreground text-base font-bold">
              {t('rapports.topProducts')}
            </h2>
            <div className="flex flex-col">
              <div className="border-border flex items-center gap-3 border-b pb-2">
                <span className="font-body text-muted-foreground w-6 text-center text-xs font-semibold">
                  #
                </span>
                <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                  {t('common.product')}
                </span>
                <span className="font-body text-muted-foreground w-10 text-center text-xs font-semibold">
                  {t('common.qty')}
                </span>
                <span className="font-body text-muted-foreground w-24 text-end text-xs font-semibold">
                  {t('common.ca')}
                </span>
              </div>
              {reportTopProducts.map((p) => (
                <div
                  key={p.rank}
                  className="border-border flex items-center gap-3 border-b py-3 last:border-b-0"
                >
                  <span
                    className={`font-headings w-6 text-center text-sm font-bold ${
                      p.rank === 1 ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {p.rank}
                  </span>
                  <span className="font-body text-foreground flex-1 text-sm font-medium">
                    {p.name}
                  </span>
                  <span className="font-body text-muted-foreground w-10 text-center text-sm">
                    {p.qty}
                  </span>
                  <span className="font-body text-foreground w-24 text-end text-sm font-bold">
                    {formatFCFA(p.ca)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="bg-muted flex items-center gap-3 rounded-lg px-5 py-3">
          <Icon i="info" size={14} className="text-muted-foreground shrink-0" />
          <p className="text-muted-foreground font-body text-xs">{t('rapports.note')}</p>
        </div>
      </div>
    </>
  );
}
