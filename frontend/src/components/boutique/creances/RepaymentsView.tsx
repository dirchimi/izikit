'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import DatePicker from '@/components/ui/DatePicker';
import AsyncState from '@/components/boutique/AsyncState';
import CashTile from '@/components/boutique/CashTile';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';

type Period = 'today' | 'week' | 'month' | 'year';

interface RepaymentRow {
  id: string;
  customerName: string;
  amount: number;
  method: string; // cash | mobile
  note: string;
  createdAt: string;
}
interface RepaymentsData {
  total: number;
  cash: number;
  mobile: number;
  count: number;
  repayments: RepaymentRow[];
}

const periods: { id: Period; key: string }[] = [
  { id: 'today', key: 'rapports.period.today' },
  { id: 'week', key: 'rapports.period.week' },
  { id: 'month', key: 'rapports.period.month' },
  { id: 'year', key: 'rapports.period.year' },
];

function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Vue « Remboursements reçus » (tous clients) avec filtre de période. */
export default function RepaymentsView() {
  const t = useT();
  const [period, setPeriod] = useState<Period | 'custom'>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = period === 'custom' && from && to ? `from=${from}&to=${to}` : `period=${period}`;
  const { data, loading, error, refresh } = useApi<RepaymentsData>(`/api/repayments?${query}`);

  function startCustom() {
    if (!from || !to) {
      const now = new Date();
      // Défaut : 6 derniers mois (le besoin exprimé).
      setFrom(toYmd(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())));
      setTo(toYmd(now));
    }
    setPeriod('custom');
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
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
        {data && (
          <div className="flex flex-col gap-5">
            {/* Totaux */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CashTile
                icon="hand-coins"
                label={t('cash.repaidTitle')}
                value={formatFCFA(data.total)}
                unit={t('common.fcfa')}
                tone="text-success"
              />
              <CashTile
                icon="banknote"
                label={t('cash.cash')}
                value={formatFCFA(data.cash)}
                unit={t('common.fcfa')}
                tone="text-primary"
              />
              <CashTile
                icon="smartphone"
                label={t('cash.mobile')}
                value={formatFCFA(data.mobile)}
                unit={t('common.fcfa')}
                tone="text-blue-600"
              />
            </div>

            {/* Liste */}
            <div className="bg-surface border-border rounded-lg border">
              <div className="border-border flex items-center justify-between border-b px-5 py-4">
                <h3 className="font-headings text-foreground text-base font-bold">
                  {t('creances.repayments.title')}
                </h3>
                <span className="text-muted-foreground font-body text-xs">
                  {t('repayments.count', { n: data.count })}
                </span>
              </div>
              {data.repayments.length === 0 ? (
                <p className="text-muted-foreground font-body px-5 py-8 text-center text-sm">
                  {t('repayments.empty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[560px]">
                    <div className="bg-muted border-border flex items-center gap-4 border-b px-5 py-3">
                      <span className="font-body text-muted-foreground w-24 text-xs font-semibold">
                        {t('common.date')}
                      </span>
                      <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                        {t('common.client')}
                      </span>
                      <span className="font-body text-muted-foreground w-24 text-center text-xs font-semibold">
                        {t('ventes.col.payment')}
                      </span>
                      <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                        {t('common.amount')}
                      </span>
                    </div>
                    {data.repayments.map((r) => (
                      <div
                        key={r.id}
                        className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                      >
                        <span className="font-body text-muted-foreground w-24 text-xs">
                          {fmtDate(r.createdAt)}
                        </span>
                        <span className="font-body text-foreground flex-1 truncate text-sm font-medium">
                          {r.customerName}
                          {r.note && (
                            <span className="text-muted-foreground ms-1 text-xs font-normal">
                              · {r.note}
                            </span>
                          )}
                        </span>
                        <span className="font-body text-muted-foreground flex w-24 items-center justify-center gap-1 text-xs">
                          <Icon i={r.method === 'mobile' ? 'smartphone' : 'banknote'} size={13} />
                          {t(r.method === 'mobile' ? 'method.mobile' : 'method.cash')}
                        </span>
                        <span className="font-body text-success w-28 text-end text-sm font-bold">
                          + {formatFCFA(r.amount)} {t('common.fcfa')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </AsyncState>
    </div>
  );
}
