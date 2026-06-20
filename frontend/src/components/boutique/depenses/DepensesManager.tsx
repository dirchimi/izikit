'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import {
  expenses as seedExpenses,
  expenseCategories,
  expenseCategoryColor,
  EXPENSE_TODAY,
  type Expense,
} from '@/lib/boutique/fixtures';
import AddExpenseForm, { type NewExpenseInput } from './AddExpenseForm';

type Period = 'month' | 'today';

export default function DepensesManager() {
  const { toast } = useToast();
  const t = useT();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [list, setList] = useState<Expense[]>(seedExpenses);

  const totalMonth = list.reduce((sum, e) => sum + e.amount, 0);
  const today = list.filter((e) => e.date === EXPENSE_TODAY).reduce((sum, e) => sum + e.amount, 0);
  const biggest = list.reduce<Expense | null>(
    (max, e) => (!max || e.amount > max.amount ? e : max),
    null,
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(
      (e) =>
        (q === '' || e.label.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) &&
        (period === 'month' || e.date === EXPENSE_TODAY) &&
        (categoryFilter === '' || e.category === categoryFilter),
    );
  }, [list, search, period, categoryFilter]);

  function addExpense(input: NewExpenseInput) {
    if (!input.label) {
      toast(t('depenses.labelRequired'), 'error');
      return;
    }
    const maxNum = list.reduce((m, e) => {
      const n = parseInt(e.id.replace(/\D/g, ''), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    const next: Expense = {
      id: `D-${maxNum + 1}`,
      date: EXPENSE_TODAY,
      label: input.label,
      category: input.category,
      amount: input.amount,
      note: input.note,
    };
    setList((prev) => [next, ...prev]);
    toast(t('depenses.added', { label: next.label, amount: formatFCFA(next.amount) }), 'success');
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
              value={String(list.length)}
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
            <div className="border-border bg-surface flex items-center gap-2 rounded-md border px-3 py-2">
              <Icon i="calendar" size={14} className="text-muted-foreground" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="text-foreground font-body bg-surface text-sm outline-none"
              >
                <option value="month">{t('common.thisMonth')}</option>
                <option value="today">{t('common.today')}</option>
              </select>
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none"
            >
              <option value="">{t('common.allCategories')}</option>
              {expenseCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-surface border-border rounded-lg border">
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
                  <span className="w-8" />
                </div>

                {visible.map((e) => (
                  <div
                    key={e.id}
                    className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                  >
                    <span className="font-body text-muted-foreground w-16 font-mono text-xs">
                      {e.id}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-xs">{e.date}</span>
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
                    <div className="flex w-8 justify-center">
                      <button
                        type="button"
                        aria-label={`${t('common.edit')} ${e.label}`}
                        onClick={() => toast(t('common.editSoonExpense'), 'info')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Icon i="pencil" size={13} />
                      </button>
                    </div>
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
        </div>

        {/* Formulaire d'ajout */}
        <AddExpenseForm onSubmit={addExpense} />
      </div>
    </>
  );
}
