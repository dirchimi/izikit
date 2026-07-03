'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Dropdown from '@/components/ui/Dropdown';
import ComboBox from '@/components/ui/ComboBox';
import DatePicker from '@/components/ui/DatePicker';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { formatFCFA } from '@/lib/boutique/format';
import { expenseCategories, expenseCategoryColor } from '@/lib/boutique/fixtures';
import AddExpenseForm, { type NewExpenseInput } from './AddExpenseForm';

interface ApiExpense {
  id: string;
  number: string;
  label: string;
  category: string;
  amount: number;
  note: string;
  occurredAt: string; // ISO
}

type Period = 'month' | 'today' | 'date';

/** Date ISO → 'YYYY-MM-DD' local (pour comparer à un <input type="date">). */
function isoToYmd(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function sameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}
function sameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DepensesManager() {
  const { toast } = useToast();
  const t = useT();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [pickDate, setPickDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, error, refresh } = useApi<{ expenses: ApiExpense[] }>('/api/expenses');
  const expenses = data?.expenses ?? [];
  const now = new Date();

  const monthExpenses = expenses.filter((e) => sameMonth(e.occurredAt, now));
  const totalMonth = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const today = expenses
    .filter((e) => sameDay(e.occurredAt, now))
    .reduce((sum, e) => sum + e.amount, 0);
  const biggest = expenses.reduce<ApiExpense | null>(
    (max, e) => (!max || e.amount > max.amount ? e : max),
    null,
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (q === '' || e.label.toLowerCase().includes(q) || e.number.toLowerCase().includes(q)) &&
        (period === 'month'
          ? sameMonth(e.occurredAt, now)
          : period === 'today'
            ? sameDay(e.occurredAt, now)
            : pickDate !== '' && isoToYmd(e.occurredAt) === pickDate) &&
        (categoryFilter === '' || e.category === categoryFilter),
    );
  }, [expenses, search, period, pickDate, categoryFilter]);

  const todayYmd = isoToYmd(now.toISOString());
  const periodLabel =
    period === 'month'
      ? t('common.thisMonth')
      : period === 'today'
        ? t('common.today')
        : pickDate
          ? new Date(`${pickDate}T00:00:00`).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : t('common.pickDate');

  async function addExpense(input: NewExpenseInput) {
    if (!input.label) {
      toast(t('depenses.labelRequired'), 'error');
      return;
    }
    if (input.amount <= 0) {
      toast(t('depenses.amountInvalid'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/expenses', {
        method: 'POST',
        body: {
          label: input.label,
          amount: input.amount,
          category: input.category,
          ...(input.note ? { note: input.note } : {}),
        },
      });
      toast(
        t('depenses.added', { label: input.label, amount: formatFCFA(input.amount) }),
        'success',
      );
      await refresh();
      return true;
    } catch {
      toast(t('async.error'), 'error');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopBar
        title={t('nav.depenses')}
        subtitle={t('depenses.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-col xl:flex-row">
        <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
          {/* KPI */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              accent
              label={t('depenses.kpi.totalMonth')}
              value={formatFCFA(totalMonth)}
              sublabel={t('common.fcfa')}
            />
            <KpiCard
              label={t('depenses.kpi.today')}
              value={formatFCFA(today)}
              sublabel={t('common.fcfa')}
            />
            <KpiCard
              label={t('depenses.kpi.count')}
              value={String(expenses.length)}
              sublabel={t('depenses.kpi.countUnit')}
            />
            <KpiCard
              label={t('depenses.kpi.biggest')}
              value={biggest ? formatFCFA(biggest.amount) : '0'}
              sublabel={biggest ? biggest.category : '—'}
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
                placeholder={t('common.search.expense')}
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
                  label: t('common.thisMonth'),
                  icon: 'calendar-range',
                  active: period === 'month',
                  onClick: () => setPeriod('month'),
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
            <ComboBox
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={expenseCategories}
              allLabel={t('common.allCategories')}
              searchable
              className="w-44"
            />
          </div>

          {/* Table */}
          <AsyncState
            loading={loading}
            error={error}
            onRetry={refresh}
            isEmpty={expenses.length === 0}
            emptyLabel={t('depenses.emptyAll')}
            emptyIcon="receipt"
          >
            <div className="bg-surface border-border hidden rounded-lg border md:block">
              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="bg-muted border-border flex items-center gap-4 rounded-t-lg border-b px-5 py-3">
                    <span className="font-body text-muted-foreground w-16 text-xs font-semibold">
                      {t('depenses.col.num')}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-xs font-semibold">
                      {t('common.date')}
                    </span>
                    <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                      {t('depenses.col.label')}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-center text-xs font-semibold">
                      {t('common.category')}
                    </span>
                    <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                      {t('common.amount')}
                    </span>
                    <span className="font-body text-muted-foreground w-28 text-xs font-semibold">
                      {t('common.note')}
                    </span>
                  </div>

                  {visible.map((e) => (
                    <div
                      key={e.id}
                      className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                    >
                      <span className="font-body text-muted-foreground w-16 font-mono text-xs">
                        {e.number}
                      </span>
                      <span className="font-body text-muted-foreground w-24 text-xs">
                        {fmtDate(e.occurredAt)}
                      </span>
                      <span className="font-body text-foreground flex-1 text-sm font-medium">
                        {e.label}
                      </span>
                      <div className="flex w-24 justify-center">
                        <span
                          className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${expenseCategoryColor(e.category)}`}
                        >
                          {e.category}
                        </span>
                      </div>
                      <span className="font-body text-foreground w-28 text-end text-sm font-bold">
                        {formatFCFA(e.amount)} {t('common.fcfa')}
                      </span>
                      <span className="font-body text-muted-foreground w-28 truncate text-xs">
                        {e.note}
                      </span>
                    </div>
                  ))}

                  {visible.length === 0 && (
                    <div className="text-muted-foreground font-body px-5 py-6 text-sm">
                      {t('depenses.empty')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cartes (mobile / tablette < md) */}
            <div className="flex flex-col gap-3 md:hidden">
              {visible.map((e) => (
                <div
                  key={e.id}
                  className="bg-surface border-border flex flex-col gap-2 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-muted-foreground font-mono text-xs">
                      {e.number} · {fmtDate(e.occurredAt)}
                    </span>
                    <span
                      className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${expenseCategoryColor(e.category)}`}
                    >
                      {e.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-foreground text-sm font-medium">{e.label}</span>
                    <span className="font-body text-foreground shrink-0 text-base font-bold">
                      {formatFCFA(e.amount)} {t('common.fcfa')}
                    </span>
                  </div>
                  {e.note && (
                    <p className="font-body text-muted-foreground border-border border-t pt-2 text-xs">
                      {e.note}
                    </p>
                  )}
                </div>
              ))}
              {visible.length === 0 && (
                <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-5 py-6 text-sm">
                  {t('depenses.empty')}
                </div>
              )}
            </div>
          </AsyncState>
        </div>

        {/* Formulaire d'ajout */}
        <AddExpenseForm onSubmit={addExpense} disabled={submitting} />
      </div>
    </>
  );
}
