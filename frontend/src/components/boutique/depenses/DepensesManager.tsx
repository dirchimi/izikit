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
import { onExpenseChange } from '@/lib/boutique/realtime';
import { db } from '@/lib/offline/db';
import { useLocalResource } from '@/lib/offline/useLocalResource';
import { createExpenseOffline } from '@/lib/offline/mutations';
import { triggerDrain } from '@/lib/offline/sync-triggers';
import { expenseRowToApi, type ApiExpense } from '@/lib/offline/expense-adapters';
import { formatFCFA } from '@/lib/boutique/format';
import { isStockExpenseCategory } from '@/lib/reports/helpers';
import { expenseCategories, expenseCategoryColor } from '@/lib/boutique/fixtures';
import AddExpenseForm, { type NewExpenseInput } from './AddExpenseForm';
import FloatingAddButton from '@/components/boutique/FloatingAddButton';
import RowSyncBadge from '@/components/boutique/sync/RowSyncBadge';

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

  // Offline-first (Task 5.1) : lecture locale (Dexie) au lieu du réseau — le
  // miroir est alimenté par pullAll() (voir AppShell) et par
  // createExpenseOffline() ci-dessous pour les dépenses saisies hors ligne.
  const { data: expenseRows, loading } = useLocalResource(
    () => db.expenses.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  );
  const expenses = useMemo(() => expenseRows.map(expenseRowToApi), [expenseRows]);
  // Suggestions de catégorie : la liste de base (fixtures) + toutes les
  // catégories personnalisées déjà utilisées par la boutique — le filtre et le
  // formulaire d'ajout (ComboBox creatable) partagent la même liste.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(expenseCategories);
    for (const e of expenses) {
      const c = e.category.trim();
      if (c) set.add(c);
    }
    return [...set];
  }, [expenses]);
  const now = new Date();

  const monthExpenses = expenses.filter((e) => sameMonth(e.occurredAt, now));
  const totalMonth = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  // Partage du mois en deux : rachats de stock (non comptés dans le bénéfice —
  // déjà dans le coût des produits vendus) vs autres dépenses (charges).
  const stockMonth = monthExpenses
    .filter((e) => isStockExpenseCategory(e.category))
    .reduce((sum, e) => sum + e.amount, 0);
  const chargesMonth = totalMonth - stockMonth;
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
        (categoryFilter === '' ||
          e.category === categoryFilter ||
          // Filtrer « Rachat de stock » doit aussi remonter les anciennes
          // lignes enregistrées sous l'ex-libellé « Stock ».
          (isStockExpenseCategory(categoryFilter) && isStockExpenseCategory(e.category))),
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

  /** `createExpenseOffline` throws plain `Error`s whose `.message` carries a
   * stable code (NO_ORG/AMOUNT_INVALID) — same convention as VendrePos's
   * `checkoutError` for `createSaleOffline`. */
  function expenseError(err: unknown): string {
    const code = err instanceof Error ? err.message : '';
    if (code === 'AMOUNT_INVALID') return t('depenses.amountInvalid');
    if (code === 'NO_ORG') return t('depenses.noOrg');
    return t('async.error');
  }

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
      // Offline-first (Task 5.1) : écriture locale optimiste + mise en file
      // d'attente (jamais de réseau ici) — même schéma que createSaleOffline
      // pour la vente. `triggerDrain()` tente une synchro immédiate si en
      // ligne (single-flight, sans bloquer l'UI qui est déjà à jour).
      await createExpenseOffline({
        label: input.label,
        amount: input.amount,
        category: input.category,
        ...(input.note ? { note: input.note } : {}),
      });
      triggerDrain();
      toast(
        t('depenses.added', { label: input.label, amount: formatFCFA(input.amount) }),
        'success',
      );
      onExpenseChange();
      return true;
    } catch (err) {
      toast(expenseError(err), 'error');
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
        <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
          {/* KPI — le mois est partagé en deux volets côte à côte : rachats de
              stock (déjà dans le coût des produits vendus, donc hors bénéfice)
              vs autres dépenses (les vraies charges). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              accent
              label={t('depenses.kpi.totalMonth')}
              value={formatFCFA(totalMonth)}
              sublabel={t('common.fcfa')}
            />
            <KpiCard
              label={t('depenses.kpi.stockMonth')}
              value={formatFCFA(stockMonth)}
              sublabel={`${t('common.fcfa')} · ${t('rapports.kpi.stockIncludedNote')}`}
              valueClass="text-warning"
            />
            <KpiCard
              label={t('depenses.kpi.chargesMonth')}
              value={formatFCFA(chargesMonth)}
              sublabel={`${t('common.fcfa')} · ${t('depenses.kpi.chargesNote')}`}
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
            <div className="border-border bg-input focus-within:border-primary flex w-full items-center gap-2 rounded-md border px-3 py-2 sm:w-[260px]">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search.expense')}
                aria-label={t('common.search.expense')}
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
              options={categoryOptions}
              allLabel={t('common.allCategories')}
              searchable
              className="w-44"
            />
          </div>

          {/* Table */}
          <AsyncState
            loading={loading}
            error={null}
            isEmpty={expenses.length === 0}
            emptyLabel={t('depenses.emptyAll')}
            emptyIcon="receipt"
          >
            <div className="bg-surface border-border hidden rounded-lg border lg:block">
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
                      <RowSyncBadge synced={e.synced} />
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

            {/* Cartes (mobile / tablette < lg) */}
            <div className="flex flex-col gap-3 lg:hidden">
              {visible.map((e) => (
                <div
                  key={e.id}
                  className="bg-surface border-border flex flex-col gap-2 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-muted-foreground font-mono text-xs">
                      {e.number} · {fmtDate(e.occurredAt)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <RowSyncBadge synced={e.synced} />
                      <span
                        className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${expenseCategoryColor(e.category)}`}
                      >
                        {e.category}
                      </span>
                    </div>
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
        <AddExpenseForm onSubmit={addExpense} disabled={submitting} categories={categoryOptions} />
      </div>

      {/* Bouton flottant « + » (mobile) — le formulaire d'ajout étant en bas de
          page sous la liste, le FAB y amène directement sans scroller. */}
      <FloatingAddButton
        onClick={() =>
          document.getElementById('add-expense')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
        label={t('depenses.form.title')}
      />
    </>
  );
}
