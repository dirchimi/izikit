'use client';

import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { paymentLabelKey } from '@/lib/boutique/payment-label';
import { debtors as seedDebtors, creditStatusConfig, type Debtor } from '@/lib/boutique/fixtures';
import RepaymentForm from './RepaymentForm';

export default function CreancesManager() {
  const { toast } = useToast();
  const t = useT();
  const [list, setList] = useState<Debtor[]>(seedDebtors);
  const [selectedId, setSelectedId] = useState<string>(seedDebtors[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const totalDebt = list.reduce((sum, d) => sum + d.debt, 0);
  const debtorCount = list.filter((d) => d.debt > 0).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
    );
  }, [list, search]);

  const selected = list.find((d) => d.id === selectedId);

  function recordRepayment(amount: number, method: string, note: string) {
    if (!selected) return;
    if (amount <= 0) {
      toast(t('creances.amountInvalid'), 'error');
      return;
    }
    if (selected.debt <= 0) {
      toast(t('creances.noDebt', { name: selected.name }), 'info');
      return;
    }
    const applied = Math.min(amount, selected.debt);
    setList((prev) =>
      prev.map((d) =>
        d.id === selected.id ? { ...d, debt: d.debt - applied, repaid: d.repaid + applied } : d,
      ),
    );
    const suffix = note ? ` — ${note}` : '';
    toast(
      t('creances.repaymentToast', {
        amount: formatFCFA(applied),
        method: t(paymentLabelKey(method)),
        name: selected.name,
        suffix,
      }),
      'success',
    );
  }

  return (
    <>
      <TopBar
        title={t('nav.creances')}
        subtitle={t('creances.subtitle')}
        actions={<ScreenTopActions />}
      />

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
          <div className="border-border border-b px-4 py-3">
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
          </div>

          {/* Liste */}
          <div className="flex flex-col">
            {visible.map((d) => {
              const active = d.id === selectedId;
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
                      <span
                        className={`font-body shrink-0 text-sm font-bold ${
                          active ? 'text-secondary-foreground' : 'text-danger'
                        }`}
                      >
                        {formatFCFA(d.debt)} {t('common.fcfa')}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground font-body truncate text-xs">
                        {d.phone}
                      </span>
                      <span className="text-muted-foreground font-body shrink-0 text-xs">
                        {d.lastSale}
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
          <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
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
                    {selected.phone} · {t('creances.clientSince', { since: selected.since })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => amountRef.current?.focus()}
                className="bg-primary text-primary-foreground font-body flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
              >
                <Icon i="circle-check" size={15} />
                {t('creances.recordRepayment')}
              </button>
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
                value={formatFCFA(selected.debt + selected.repaid)}
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
                        key={`${h.date}-${h.product}`}
                        className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                      >
                        <span className="font-body text-muted-foreground w-24 text-xs">
                          {h.date}
                        </span>
                        <span className="font-body text-foreground flex-1 text-sm font-medium">
                          {h.product}
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

            {/* Formulaire de remboursement */}
            <RepaymentForm
              key={selected.id}
              ref={amountRef}
              debtorName={selected.name}
              maxAmount={selected.debt}
              onSubmit={recordRepayment}
            />
          </div>
        )}
      </div>
    </>
  );
}
