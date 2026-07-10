'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import DatePicker from '@/components/ui/DatePicker';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import CashTile from '@/components/boutique/CashTile';
import AsyncState from '@/components/boutique/AsyncState';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';
import ReportBarChart from './ReportBarChart';

type Period = 'today' | 'week' | 'month' | 'year';

interface ReportData {
  period: Period | 'custom';
  summary: {
    revenue: number;
    sales: number;
    grossMargin: number;
    marginPct: number;
    expenses: number;
    netProfit: number;
    collectedCash: number;
    collectedMobile: number;
    creditGranted: number;
    repaidCash: number;
    repaidMobile: number;
  };
  series: { label: string; value: number }[];
  topProducts: { rank: number; name: string; qty: number; ca: number }[];
}

const periods: { id: Period; key: string }[] = [
  { id: 'today', key: 'rapports.period.today' },
  { id: 'week', key: 'rapports.period.week' },
  { id: 'month', key: 'rapports.period.month' },
  { id: 'year', key: 'rapports.period.year' },
];

/** Date → 'YYYY-MM-DD' local (pour les champs <input type="date">). */
function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
/** 'YYYY-MM-DD' → libellé court français (15 juin 2026). */
function frDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(';')).join('\r\n');
  // BOM pour qu'Excel lise l'UTF-8 (accents) correctement.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RapportsManager() {
  const { toast } = useToast();
  const t = useT();
  const [period, setPeriod] = useState<Period | 'custom'>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // En mode personnalisé avec les deux dates → on interroge par plage.
  const reportQuery =
    period === 'custom' && from && to ? `from=${from}&to=${to}` : `period=${period}`;
  const { data, loading, error, refresh } = useApi<ReportData>(`/api/reports?${reportQuery}`);
  const summary = data?.summary;

  // Libellé de la période (export CSV / WhatsApp).
  const periodText =
    period === 'custom'
      ? from && to
        ? `${frDate(from)} – ${frDate(to)}`
        : t('rapports.period.custom')
      : t(`rapports.period.${period}`);

  function startCustom() {
    if (!from || !to) {
      const now = new Date();
      setFrom(toYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)));
      setTo(toYmd(now));
    }
    setPeriod('custom');
  }

  function exportCsv() {
    if (!data || !summary) {
      toast(t('async.error'), 'error');
      return;
    }
    const rows: (string | number)[][] = [
      [t('rapports.exportTitle'), periodText],
      [],
      [t('rapports.kpi.revenue'), summary.revenue],
      [t('rapports.kpi.sales'), summary.sales],
      [t('rapports.kpi.margin'), summary.grossMargin],
      ['%', summary.marginPct],
      [t('nav.depenses'), summary.expenses],
      [t('rapports.kpi.netProfit'), summary.netProfit],
      [],
      [`${t('cash.title')} — ${t('cash.cash')}`, summary.collectedCash],
      [`${t('cash.title')} — ${t('cash.mobile')}`, summary.collectedMobile],
      [t('cash.repaidTitle'), summary.repaidCash + summary.repaidMobile],
      [t('cash.creditGranted'), summary.creditGranted],
      [],
      [t('rapports.topProducts')],
      ['#', t('common.product'), t('common.qty'), t('common.ca')],
      ...data.topProducts.map((p) => [p.rank, p.name, p.qty, p.ca]),
    ];
    downloadCsv(`rapport-${period}.csv`, rows);
    toast(t('rapports.exported'), 'success');
  }

  // (Mode personnalisé : on attend que les deux dates soient choisies.)
  const customIncomplete = period === 'custom' && (!from || !to);

  function openPdf() {
    if (!data) {
      toast(t('async.error'), 'error');
      return;
    }
    // Le navigateur ouvre le PDF (application/pdf inline) — impression / partage.
    window.open(`/api/reports/pdf?${reportQuery}`, '_blank', 'noopener,noreferrer');
  }

  function shareWhatsapp() {
    if (!summary) {
      toast(t('async.error'), 'error');
      return;
    }
    const text =
      `${t('rapports.exportTitle')} — ${periodText}\n` +
      `${t('rapports.kpi.revenue')}: ${formatFCFA(summary.revenue)} ${t('common.fcfa')}\n` +
      `${t('rapports.kpi.netProfit')}: ${formatFCFA(summary.netProfit)} ${t('common.fcfa')}`;
    // Pas de numéro : WhatsApp laisse l'utilisateur choisir le destinataire.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  const exportBtn = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={openPdf}
        disabled={loading || !data || customIncomplete}
        className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        <Icon i="file-text" size={14} />
        {t('rapports.exportPdf')}
      </button>
      <button
        type="button"
        onClick={shareWhatsapp}
        disabled={loading || !data || customIncomplete}
        className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        <Icon i="message-circle" size={14} />
        {t('rapports.whatsapp')}
      </button>
      <button
        type="button"
        onClick={exportCsv}
        disabled={loading || !data || customIncomplete}
        className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-60"
      >
        <Icon i="download" size={14} />
        {t('rapports.exportCsv')}
      </button>
    </div>
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
            <button
              type="button"
              onClick={startCustom}
              className={`font-body border-border shrink-0 border-s px-4 py-2 text-sm whitespace-nowrap ${
                period === 'custom'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {t('rapports.period.custom')}
            </button>
          </div>

          {/* Plage de dates personnalisée (du… au…) */}
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground font-body text-sm">{t('rapports.from')}</span>
              <DatePicker value={from} onChange={setFrom} max={to || undefined} />
              <span className="text-muted-foreground font-body text-sm">{t('rapports.to')}</span>
              <DatePicker value={to} onChange={setTo} min={from || undefined} />
            </div>
          )}
        </div>

        <AsyncState loading={loading} error={error} onRetry={refresh}>
          {summary && data && (
            <div className="flex flex-col gap-6">
              {/* KPI */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                  accent
                  label={t('rapports.kpi.revenue')}
                  value={formatFCFA(summary.revenue)}
                  sublabel={`${t('common.fcfa')} · ${t('cash.revenueHint')}`}
                />
                <KpiCard
                  label={t('rapports.kpi.sales')}
                  value={String(summary.sales)}
                  sublabel={t('common.transactions')}
                />
                <KpiCard
                  label={t('rapports.kpi.margin')}
                  value={formatFCFA(summary.grossMargin)}
                  sublabel={
                    <>
                      {t('common.fcfa')} ·{' '}
                      <span className="text-primary font-semibold">{summary.marginPct} %</span>
                    </>
                  }
                />
                <KpiCard
                  label={t('nav.depenses')}
                  value={formatFCFA(summary.expenses)}
                  sublabel={t('common.fcfa')}
                  valueClass="text-warning"
                />
                <KpiCard
                  label={t('rapports.kpi.netProfit')}
                  value={formatFCFA(summary.netProfit)}
                  sublabel={`${t('common.fcfa')} · ${t('cash.profitHint')}`}
                  valueClass={summary.netProfit < 0 ? 'text-danger' : 'text-primary'}
                />
              </div>

              {/* Argent réellement encaissé (caisse miroir) */}
              <div className="bg-surface border-border rounded-lg border px-5 py-5 md:px-6">
                <h2 className="font-headings text-foreground mb-4 text-base font-bold">
                  {t('cash.title')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <CashTile
                    icon="banknote"
                    label={t('cash.cash')}
                    value={formatFCFA(summary.collectedCash)}
                    unit={t('common.fcfa')}
                    tone="text-primary"
                  />
                  <CashTile
                    icon="smartphone"
                    label={t('cash.mobile')}
                    value={formatFCFA(summary.collectedMobile)}
                    unit={t('common.fcfa')}
                    tone="text-blue-600"
                  />
                  <CashTile
                    icon="hourglass"
                    label={t('cash.creditGranted')}
                    value={formatFCFA(summary.creditGranted)}
                    unit={t('common.fcfa')}
                    tone="text-warning"
                  />
                </div>
                {/* Remboursements de créances (sous-ensemble de l'encaissé). */}
                <div className="border-border mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <span className="text-muted-foreground font-body flex items-center gap-2 text-sm">
                    <Icon i="hand-coins" size={15} className="text-success" />
                    {t('cash.repaidTitle')}
                  </span>
                  <span className="font-body text-foreground text-sm font-bold">
                    {formatFCFA(summary.repaidCash + summary.repaidMobile)} {t('common.fcfa')}
                    <span className="text-muted-foreground ms-1 text-xs font-normal">
                      {t('cash.repaidHint')}
                    </span>
                  </span>
                </div>
              </div>

              {/* Graphe + Top produits */}
              <div className="flex flex-col gap-5 xl:flex-row">
                <div className="bg-surface border-border flex min-w-0 flex-1 flex-col gap-4 rounded-lg border px-5 py-5 md:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-headings text-foreground text-base font-bold">
                      {t('rapports.chartTitle')}
                    </h2>
                    <span className="text-muted-foreground font-body text-xs">
                      {t('rapports.chartSub')}
                    </span>
                  </div>
                  <ReportBarChart bars={data.series} />
                </div>

                <div className="bg-surface border-border flex flex-col gap-4 rounded-lg border px-5 py-5 md:px-6 xl:w-[380px]">
                  <h2 className="font-headings text-foreground text-base font-bold">
                    {t('rapports.topProducts')}
                  </h2>
                  {data.topProducts.length === 0 ? (
                    <p className="text-muted-foreground font-body text-sm">
                      {t('rapports.noProducts')}
                    </p>
                  ) : (
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
                      {data.topProducts.map((p) => (
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
                  )}
                </div>
              </div>

              {/* Note */}
              <div className="bg-muted flex items-center gap-3 rounded-lg px-5 py-3">
                <Icon i="info" size={14} className="text-muted-foreground shrink-0" />
                <p className="text-muted-foreground font-body text-xs">{t('rapports.note')}</p>
              </div>
            </div>
          )}
        </AsyncState>
      </div>
    </>
  );
}
