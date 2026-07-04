'use client';

import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { formatFCFA } from '@/lib/boutique/format';
import { creditStatusConfig, type CreditStatus } from '@/lib/boutique/fixtures';
import PdfPreviewModal from '@/components/boutique/documents/PdfPreviewModal';
import RepaymentForm, { type RepayMethod } from './RepaymentForm';

interface ApiCredit {
  id: string;
  date: string; // ISO
  label: string;
  amount: number;
  amountPaid: number;
  status: CreditStatus; // credit | partial | paid
}
interface ApiRepayment {
  id: string;
  date: string; // ISO
  amount: number;
  method: string; // cash | mobile
  note: string;
}
interface ApiDebtor {
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function fmtSince(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

export default function CreancesManager() {
  const { toast } = useToast();
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSettled, setShowSettled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statementFor, setStatementFor] = useState<ApiDebtor | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const { data, loading, error, refresh } = useApi<{ debtors: ApiDebtor[] }>('/api/receivables');
  const debtors = data?.debtors ?? [];

  const totalDebt = debtors.reduce((sum, d) => sum + d.debt, 0);
  const debtorCount = debtors.filter((d) => d.debt > 0).length;
  const settledCount = debtors.filter((d) => d.debt <= 0).length;

  const visible = useMemo(() => {
    // Par défaut, les clients soldés (dette = 0) sortent de la liste active ;
    // un interrupteur permet de les réafficher (consultation de l'historique).
    const base = showSettled ? debtors : debtors.filter((d) => d.debt > 0);
    const q = search.trim().toLowerCase();
    if (q === '') return base;
    return base.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
    );
  }, [debtors, search, showSettled]);

  const selected = debtors.find((d) => d.id === selectedId) ?? visible[0] ?? null;

  async function recordRepayment(amount: number, method: RepayMethod, note: string, date: string) {
    if (!selected) return;
    if (amount <= 0) {
      toast(t('creances.amountInvalid'), 'error');
      return;
    }
    if (selected.debt <= 0) {
      toast(t('creances.noDebt', { name: selected.name }), 'info');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ applied: number }>(`/api/receivables/${selected.id}/repay`, {
        method: 'POST',
        body: { amount, method, ...(note ? { note } : {}), ...(date ? { date } : {}) },
      });
      const suffix = note ? ` — ${note}` : '';
      toast(
        t('creances.repaymentToast', {
          amount: formatFCFA(res.applied),
          method: t(method === 'cash' ? 'method.cash' : 'method.mobile'),
          name: selected.name,
          suffix,
        }),
        'success',
      );
      await refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'NO_DEBT') toast(t('creances.noDebt', { name: selected.name }), 'info');
      else toast(t('async.error'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopBar
        title={t('nav.creances')}
        subtitle={t('creances.subtitle')}
        actions={<ScreenTopActions />}
      />

      <AsyncState
        loading={loading}
        error={error}
        onRetry={refresh}
        isEmpty={debtors.length === 0}
        emptyLabel={t('creances.emptyAll')}
        emptyIcon="users"
      >
        <div className="flex flex-col lg:flex-row">
          {/* Liste des débiteurs */}
          <div className="border-border flex flex-col border-b lg:w-[380px] lg:border-e lg:border-b-0">
            {/* Bandeau total */}
            <div className="bg-primary px-6 py-5">
              <p className="text-primary-foreground font-body text-xs opacity-70">
                {t('creances.totalLabel')}
              </p>
              <p className="font-headings text-primary-foreground mt-1 text-3xl font-bold">
                {formatFCFA(totalDebt)}{' '}
                <span className="text-lg font-normal opacity-70">{t('common.fcfa')}</span>
              </p>
              <p className="text-primary-foreground font-body mt-1 text-xs opacity-60">
                {t('creances.debtorCount', { n: debtorCount })}
              </p>
            </div>

            {/* Recherche */}
            <div className="border-border flex flex-col gap-2 border-b px-4 py-3">
              <div className="border-border bg-input flex items-center gap-2 rounded-md border px-3 py-2">
                <Icon i="search" size={14} className="text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('common.search.client')}
                  className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                />
              </div>
              {/* Les clients soldés sortent de la liste active — réaffichables ici. */}
              {settledCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSettled((s) => !s)}
                  className="font-body text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-xs"
                >
                  <Icon i={showSettled ? 'eye-off' : 'eye'} size={13} />
                  {showSettled
                    ? t('creances.hideSettled')
                    : t('creances.showSettled', { n: settledCount })}
                </button>
              )}
            </div>

            {/* Liste */}
            <div className="flex flex-col">
              {visible.map((d) => {
                const active = d.id === (selected?.id ?? '');
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`border-border flex items-center gap-3 border-b px-4 py-4 text-start ${
                      active ? 'bg-secondary' : 'hover:bg-input'
                    }`}
                  >
                    <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                      <Icon i="user" size={16} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-body truncate text-sm font-semibold ${
                            active ? 'text-secondary-foreground' : 'text-foreground'
                          }`}
                        >
                          {d.name}
                        </span>
                        {d.debt > 0 ? (
                          <span
                            className={`font-body shrink-0 text-sm font-bold ${
                              active ? 'text-secondary-foreground' : 'text-danger'
                            }`}
                          >
                            {formatFCFA(d.debt)} {t('common.fcfa')}
                          </span>
                        ) : (
                          <span className="font-body text-success shrink-0 text-xs font-semibold">
                            {t('credit.status.paid')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-body truncate text-xs">
                          {d.phone}
                        </span>
                        <span className="text-muted-foreground font-body shrink-0 text-xs">
                          {fmtDate(d.lastSale)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {visible.length === 0 && (
                <div className="text-muted-foreground font-body px-4 py-6 text-sm">
                  {t('creances.emptySearch')}
                </div>
              )}
            </div>
          </div>

          {/* Détail du débiteur */}
          {selected && (
            <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
              {/* En-tête client */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
                    <Icon i="user" size={22} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-headings text-foreground text-lg font-bold">
                      {selected.name}
                    </h2>
                    <p className="text-muted-foreground font-body mt-0.5 text-xs">
                      {selected.phone} ·{' '}
                      {t('creances.clientSince', { since: fmtSince(selected.since) })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatementFor(selected)}
                    className="border-border bg-surface text-foreground font-body flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
                  >
                    <Icon i="scroll-text" size={15} />
                    {t('creances.statement')}
                  </button>
                  <button
                    type="button"
                    onClick={() => amountRef.current?.focus()}
                    className="bg-primary text-primary-foreground font-body flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
                  >
                    <Icon i="circle-check" size={15} />
                    {t('creances.recordRepayment')}
                  </button>
                </div>
              </div>

              {/* Synthèse de la dette */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  label={t('creances.kpi.balance')}
                  value={formatFCFA(selected.debt)}
                  sublabel={t('common.fcfa')}
                  valueClass="text-danger"
                />
                <KpiCard
                  label={t('creances.kpi.totalCredit')}
                  value={formatFCFA(selected.totalCredit)}
                  sublabel={t('common.fcfa')}
                />
                <KpiCard
                  label={t('creances.kpi.repaid')}
                  value={formatFCFA(selected.repaid)}
                  sublabel={t('common.fcfa')}
                  valueClass="text-primary"
                />
              </div>

              {/* Historique des achats à crédit */}
              <div className="bg-surface border-border rounded-lg border">
                <div className="border-border border-b px-5 py-4">
                  <h3 className="font-headings text-foreground text-base font-bold">
                    {t('creances.history')}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[560px]">
                    <div className="bg-muted border-border flex items-center gap-4 border-b px-5 py-3">
                      <span className="font-body text-muted-foreground w-24 text-xs font-semibold">
                        {t('common.date')}
                      </span>
                      <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                        {t('common.article')}
                      </span>
                      <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                        {t('common.amount')}
                      </span>
                      <span className="font-body text-muted-foreground w-24 text-center text-xs font-semibold">
                        {t('common.status')}
                      </span>
                    </div>

                    {selected.history.map((h) => {
                      const s = creditStatusConfig[h.status];
                      return (
                        <div
                          key={h.id}
                          className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                        >
                          <span className="font-body text-muted-foreground w-24 text-xs">
                            {fmtDate(h.date)}
                          </span>
                          <span className="font-body text-foreground flex-1 text-sm font-medium">
                            {h.label}
                          </span>
                          <span className="font-body text-foreground w-28 text-end text-sm font-bold">
                            {formatFCFA(h.amount)} {t('common.fcfa')}
                          </span>
                          <div className="flex w-24 justify-center">
                            <span
                              className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${s.cls}`}
                            >
                              {t(`credit.status.${h.status}`)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Remboursements reçus (timeline) */}
              {selected.repayments.length > 0 && (
                <div className="bg-surface border-border rounded-lg border">
                  <div className="border-border border-b px-5 py-4">
                    <h3 className="font-headings text-foreground text-base font-bold">
                      {t('creances.repayments.title')}
                    </h3>
                  </div>
                  <div className="flex flex-col">
                    {selected.repayments.map((p) => (
                      <div
                        key={p.id}
                        className="border-border flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                      >
                        <div className="bg-success/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                          <Icon i="arrow-down-left" size={15} className="text-success" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-body text-foreground text-sm font-semibold">
                              {t(p.method === 'mobile' ? 'method.mobile' : 'method.cash')}
                            </span>
                            {p.note && (
                              <span className="text-muted-foreground font-body truncate text-xs">
                                · {p.note}
                              </span>
                            )}
                          </div>
                          <span className="text-muted-foreground font-body text-xs">
                            {fmtDate(p.date)}
                          </span>
                        </div>
                        <span className="font-body text-success shrink-0 text-sm font-bold">
                          + {formatFCFA(p.amount)} {t('common.fcfa')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulaire de remboursement */}
              <RepaymentForm
                key={selected.id}
                ref={amountRef}
                debtorName={selected.name}
                maxAmount={selected.debt}
                disabled={submitting}
                onSubmit={recordRepayment}
              />
            </div>
          )}
        </div>
      </AsyncState>

      <PdfPreviewModal
        open={statementFor !== null}
        path={statementFor ? `/api/receivables/${statementFor.id}/statement/pdf` : null}
        fileName={statementFor ? `releve-${statementFor.name}.pdf` : ''}
        title={statementFor ? t('creances.statementTitle', { name: statementFor.name }) : ''}
        shareText={
          statementFor
            ? `${t('creances.statementTitle', { name: statementFor.name })}\n${t('creances.kpi.balance')}: ${formatFCFA(statementFor.debt)} ${t('common.fcfa')}`
            : ''
        }
        phone={statementFor?.phone ?? null}
        onClose={() => setStatementFor(null)}
      />
    </>
  );
}
