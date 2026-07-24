'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Dropdown from '@/components/ui/Dropdown';
import DatePicker from '@/components/ui/DatePicker';
import Modal from '@/components/ui/Modal';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/lib/useApi';
import { onSaleChange, onDocumentChange } from '@/lib/boutique/realtime';
import { api, ApiError } from '@/lib/api';
import { formatFCFA } from '@/lib/boutique/format';
import { db } from '@/lib/offline/db';
import { useLocalResource } from '@/lib/offline/useLocalResource';
import { getMemberNames, getRole, pullResource } from '@/lib/offline/pull';
import { createCancelOffline } from '@/lib/offline/mutations';
import { triggerDrain } from '@/lib/offline/sync-triggers';
import { aggregateSales } from '@/lib/offline/sales-adapters';
import { documentRowToApi } from '@/lib/offline/documents-adapters';
import RowSyncBadge from '@/components/boutique/sync/RowSyncBadge';
import ReceiptModal, { type ReceiptData } from './ReceiptModal';
import PdfPreviewModal from '@/components/boutique/documents/PdfPreviewModal';
import type { ApiDocument } from '@/components/boutique/documents/types';

type ApiMethod = 'CASH' | 'MOBILE' | 'CREDIT' | 'MIXED';

type Period = 'all' | 'today' | 'date';
type MethodFilter = 'CASH' | 'MOBILE' | 'CREDIT' | 'all';

const METHOD_LABEL: Record<ApiMethod, string> = {
  CASH: 'method.cash',
  MOBILE: 'method.mobile',
  CREDIT: 'method.credit',
  MIXED: 'method.mixed',
};
const METHOD_BADGE: Record<ApiMethod, string> = {
  CASH: 'bg-badge-cash text-badge-cash-foreground',
  MOBILE: 'bg-badge-mobile text-badge-mobile-foreground',
  CREDIT: 'bg-badge-credit text-badge-credit-foreground',
  MIXED: 'bg-secondary text-secondary-foreground',
};
const METHOD_TABS: MethodFilter[] = ['all', 'CASH', 'MOBILE', 'CREDIT'];

function sameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}
/** Date ISO → 'YYYY-MM-DD' local (pour comparer à un <input type="date">). */
function isoToYmd(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function VentesManager() {
  const t = useT();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [pickDate, setPickDate] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [seller, setSeller] = useState<string>('all');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  // Facture depuis une vente : PDF ouvert + vente en cours de facturation.
  const [pdfDoc, setPdfDoc] = useState<ApiDocument | null>(null);
  const [invoicing, setInvoicing] = useState<string | null>(null);

  // Offline-first (Task 5.5) : lecture locale (Dexie) au lieu du réseau — le
  // miroir est alimenté par pullAll() (voir AppShell) et par
  // createCancelOffline() plus bas pour les annulations saisies hors ligne.
  // `error`/`refresh` n'existent pas côté local (une lecture Dexie ne peut pas
  // « échouer » comme un fetch réseau) — AsyncState gère déjà ce cas (voir
  // StockManager/DepensesManager, même schéma).
  const { data: saleRows, loading } = useLocalResource(() => db.sales.toArray(), [], []);
  const { data: itemRows } = useLocalResource(() => db.saleItems.toArray(), [], []);
  const { data: customerRows } = useLocalResource(() => db.customers.toArray(), [], []);
  // Annuaire d'équipe (userId → nom) stocké par pullAll : sans lui le filtre
  // vendeurs affichait des ids techniques (cmr…) au lieu des noms.
  const { data: memberNames } = useLocalResource(() => getMemberNames(), [], {});
  const sales = useMemo(
    () => aggregateSales(saleRows, itemRows, customerRows, memberNames),
    [saleRows, itemRows, customerRows, memberNames],
  );

  // Le bouton « Annuler » n'est visible que pour le Patron (OWNER) et le
  // Manager (ADMIN) — le serveur applique la même règle (défense en profondeur).
  // Offline-first (Task 5.5) : /api/org/current échoue hors ligne — on préfère
  // le rôle en direct quand disponible, sinon on retombe sur meta.role
  // (alimenté par le dernier pullAll()) pour qu'un ADMIN/OWNER ne perde pas
  // l'accès juste parce que le réseau est coupé (comme StockManager).
  const { data: org } = useApi<{ role: string; organization: { name: string } }>(
    '/api/org/current',
  );
  const { data: localRole } = useLocalResource(() => getRole(), [], null);
  const effectiveRole = org?.role ?? localRole;
  const canCancel = effectiveRole === 'OWNER' || effectiveRole === 'ADMIN';
  const orgName = org?.organization.name ?? 'Boutique';

  // Factures déjà émises → on peut ouvrir le PDF au lieu de re-générer.
  // Offline-first (Task 5.5) : lues depuis le miroir local (db.documents).
  const { data: docRows } = useLocalResource(() => db.documents.toArray(), [], []);
  const factureBySaleId = useMemo(() => {
    const map = new Map<string, ApiDocument>();
    for (const row of docRows) {
      const d = documentRowToApi(row);
      if (d.type === 'FACTURE' && d.saleId) map.set(d.saleId, d);
    }
    return map;
  }, [docRows]);

  function docTitle(doc: ApiDocument): string {
    return `${t('documents.kind.facture')} ${doc.number}`;
  }
  function docShareText(doc: ApiDocument): string {
    return `${orgName} — ${t('documents.kind.facture')} ${doc.number}\n${t('common.total')}: ${formatFCFA(doc.total)} ${t('common.fcfa')}`;
  }

  /** 1 tap depuis une vente : ouvre la facture existante, sinon la génère puis l'ouvre. */
  async function openInvoice(saleId: string) {
    const existing = factureBySaleId.get(saleId);
    if (existing) {
      setPdfDoc(existing);
      return;
    }
    if (invoicing) return;
    setInvoicing(saleId);
    try {
      const { document } = await api<{ document: ApiDocument }>('/api/documents', {
        method: 'POST',
        body: { type: 'FACTURE', saleId },
      });
      toast(t('documents.invoiceCreated', { num: document.number }), 'success');
      onDocumentChange();
      // Offline-first (Task 5.5): the invoice list now reads from the local
      // Dexie mirror — refresh just that resource (best-effort) so the FACTURE
      // shows up immediately instead of waiting for the next pullAll().
      void pullResource('documents');
      setPdfDoc(document);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'DOC_EXISTS') {
        toast(t('documents.alreadyInvoiced'), 'info');
        onDocumentChange();
      } else {
        toast(t('async.error'), 'error');
      }
    } finally {
      setInvoicing(null);
    }
  }

  function closeCancel() {
    setCancelTarget(null);
    setCancelReason('');
  }

  /** `createCancelOffline` throws plain `Error`s whose `.message` carries a
   * stable code (SALE_NOT_FOUND / ALREADY_CANCELLED) — same convention as the
   * other offline mutations. CANCEL_WINDOW_EXPIRED is a server-side rule (the
   * offline op forwards to the outbox and, if refused, surfaces on the sync
   * screen) — mapped here too for defensiveness. */
  function cancelError(err: unknown): string {
    const code = err instanceof Error ? err.message : '';
    if (code === 'ALREADY_CANCELLED') return t('ventes.cancel.already');
    if (code === 'SALE_NOT_FOUND') return t('ventes.cancel.notFound');
    if (code === 'CANCEL_WINDOW_EXPIRED') return t('ventes.cancel.tooLate');
    return t('async.error');
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim() === '') {
      toast(t('ventes.cancel.reasonRequired'), 'error');
      return;
    }
    setCancelling(true);
    try {
      // Offline-first (Task 5.5): annulation optimiste locale (re-crédit stock +
      // reversal créance + vente CANCELLED) puis enqueue vers le serveur.
      await createCancelOffline({ saleId: cancelTarget.id, reason: cancelReason.trim() });
      triggerDrain();
      toast(t('ventes.cancel.success', { number: cancelTarget.number }), 'success');
      closeCancel();
      // Annulation → stock rendu, ventes/dashboard/créances/documents/rapports.
      onSaleChange();
    } catch (err) {
      toast(cancelError(err), 'error');
    } finally {
      setCancelling(false);
    }
  }

  function openReceipt(id: string) {
    const s = sales.find((x) => x.id === id);
    if (!s) return;
    setReceipt({
      number: s.number,
      createdAt: s.createdAt,
      method: s.method,
      total: s.total,
      subtotal: s.total + s.discount,
      discount: s.discount,
      payments: { cash: s.cashAmount, mobile: s.mobileAmount, credit: s.creditAmount },
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      items: s.items,
    });
  }
  const now = new Date();

  // Vendeurs distincts (traçabilité) : construit le filtre à partir des ventes.
  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sales) {
      if (s.sellerId) map.set(s.sellerId, s.sellerName ?? s.sellerId);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [sales]);

  // KPIs « du jour » dérivés des ventes chargées (hors ventes annulées).
  const todays = sales.filter((s) => s.status !== 'CANCELLED' && sameDay(s.createdAt, now));
  const caToday = todays.reduce((sum, s) => sum + s.total, 0);
  const countToday = todays.length;
  // Part vendue à crédit du jour = somme des parts crédit (couvre les mixtes).
  const creditToday = todays.reduce((sum, s) => sum + s.creditAmount, 0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales
      .filter(
        (s) =>
          (period === 'all' ||
            (period === 'today' && sameDay(s.createdAt, now)) ||
            (period === 'date' && pickDate !== '' && isoToYmd(s.createdAt) === pickDate)) &&
          (method === 'all' || s.method === method) &&
          (seller === 'all' || s.sellerId === seller),
      )
      .map((s) => {
        const d = new Date(s.createdAt);
        const label =
          (s.items[0]?.name ?? '—') + (s.items.length > 1 ? ` +${s.items.length - 1}` : '');
        return {
          id: s.id,
          number: s.number,
          date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
          time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          label,
          qty: s.items.reduce((sum, it) => sum + it.qty, 0),
          total: s.total,
          method: s.method,
          sellerName: s.sellerName,
          cancelled: s.status === 'CANCELLED',
          synced: s.synced,
        };
      })
      .filter(
        (r) => q === '' || r.label.toLowerCase().includes(q) || r.number.toLowerCase().includes(q),
      );
  }, [sales, search, period, pickDate, method, seller]);

  const todayYmd = isoToYmd(now.toISOString());
  const periodLabel =
    period === 'all'
      ? t('ventes.period.all')
      : period === 'today'
        ? t('common.today')
        : pickDate
          ? new Date(`${pickDate}T00:00:00`).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : t('common.pickDate');

  return (
    <>
      <TopBar
        title={t('nav.ventes')}
        subtitle={t('ventes.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
        {/* KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            accent
            label={t('ventes.kpi.caToday')}
            value={formatFCFA(caToday)}
            sublabel={t('common.fcfa')}
          />
          <KpiCard
            label={t('depenses.kpi.count')}
            value={String(countToday)}
            sublabel={t('ventes.kpi.salesUnit')}
          />
          <KpiCard
            label={t('ventes.kpi.creditSales')}
            value={formatFCFA(creditToday)}
            sublabel={t('common.fcfa')}
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
              placeholder={t('common.search.article')}
              aria-label={t('common.search.article')}
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
                label: t('ventes.period.all'),
                icon: 'layers',
                active: period === 'all',
                onClick: () => setPeriod('all'),
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

          <div className="border-border flex flex-wrap items-center overflow-hidden rounded-md border">
            {METHOD_TABS.map((m) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`font-body border-border border-s px-3 py-2 text-xs first:border-s-0 ${
                    active
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {m === 'all' ? t('common.all') : t(METHOD_LABEL[m])}
                </button>
              );
            })}
          </div>

          {/* Filtre vendeur (traçabilité) — visible dès qu'il y a plusieurs vendeurs */}
          {sellers.length > 1 && (
            <Dropdown
              align="start"
              width="w-52"
              trigger={
                <span className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Icon i="user" size={14} className="text-muted-foreground" />
                  {seller === 'all'
                    ? t('ventes.allSellers')
                    : (sellers.find((x) => x.id === seller)?.name ?? t('ventes.seller'))}
                  <Icon i="chevron-down" size={14} className="text-muted-foreground" />
                </span>
              }
              items={[
                {
                  label: t('ventes.allSellers'),
                  icon: 'users',
                  active: seller === 'all',
                  onClick: () => setSeller('all'),
                },
                ...sellers.map((s) => ({
                  label: s.name,
                  icon: 'user',
                  active: seller === s.id,
                  onClick: () => setSeller(s.id),
                })),
              ]}
            />
          )}
        </div>

        {/* Table */}
        <AsyncState
          loading={loading}
          error={null}
          isEmpty={sales.length === 0}
          emptyLabel={t('ventes.emptyAll')}
          emptyIcon="receipt"
        >
          <div className="bg-surface border-border hidden rounded-lg border lg:block">
            <div className="overflow-x-auto">
              <div className="min-w-[840px]">
                <div className="bg-muted border-border flex items-center gap-4 rounded-t-lg border-b px-5 py-3">
                  <span className="font-body text-muted-foreground w-20 text-xs font-semibold">
                    {t('depenses.col.num')}
                  </span>
                  <span className="font-body text-muted-foreground w-24 text-xs font-semibold">
                    {t('common.date')}
                  </span>
                  <span className="font-body text-muted-foreground w-14 text-xs font-semibold">
                    {t('ventes.col.time')}
                  </span>
                  <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                    {t('common.article')}
                  </span>
                  <span className="font-body text-muted-foreground w-8 text-center text-xs font-semibold">
                    {t('common.qty')}
                  </span>
                  <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                    {t('common.total')}
                  </span>
                  <span className="font-body text-muted-foreground w-28 text-center text-xs font-semibold">
                    {t('ventes.col.payment')}
                  </span>
                  <span className="font-body text-muted-foreground w-24 text-center text-xs font-semibold">
                    {t('ventes.col.actions')}
                  </span>
                </div>

                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={`border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0 ${
                      r.cancelled ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="font-body text-muted-foreground w-20 font-mono text-xs">
                      {r.number}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-xs">{r.date}</span>
                    <span className="font-body text-muted-foreground w-14 text-xs">{r.time}</span>
                    <span
                      className={`font-body flex-1 text-sm font-medium ${
                        r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {r.label}
                    </span>
                    <RowSyncBadge synced={r.synced} />
                    <span className="font-body text-muted-foreground w-8 text-center text-sm">
                      {r.qty}
                    </span>
                    <span
                      className={`font-body w-28 text-end text-sm font-bold ${
                        r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {formatFCFA(r.total)} {t('common.fcfa')}
                    </span>
                    <div className="flex w-28 justify-center">
                      {r.cancelled ? (
                        <span className="font-body bg-muted text-muted-foreground rounded-sm px-2 py-0.5 text-xs font-semibold">
                          {t('ventes.cancelled')}
                        </span>
                      ) : (
                        <span
                          className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${METHOD_BADGE[r.method]}`}
                        >
                          {t(METHOD_LABEL[r.method])}
                        </span>
                      )}
                    </div>
                    <div className="flex w-24 items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openReceipt(r.id)}
                        aria-label={t('receipt.title')}
                        title={t('receipt.title')}
                        className="text-primary hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                      >
                        <Icon i="receipt-text" size={16} />
                      </button>
                      {!r.cancelled && (
                        <button
                          type="button"
                          onClick={() => openInvoice(r.id)}
                          disabled={invoicing === r.id}
                          aria-label={
                            factureBySaleId.has(r.id)
                              ? t('ventes.invoiceView')
                              : t('ventes.invoiceGenerate')
                          }
                          title={
                            factureBySaleId.has(r.id)
                              ? t('ventes.invoiceView')
                              : t('ventes.invoiceGenerate')
                          }
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                            factureBySaleId.has(r.id)
                              ? 'text-success hover:bg-success/10'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <Icon
                            i={invoicing === r.id ? 'loader-2' : 'file-text'}
                            size={16}
                            className={invoicing === r.id ? 'animate-spin' : ''}
                          />
                        </button>
                      )}
                      {canCancel && !r.cancelled && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget({ id: r.id, number: r.number })}
                          aria-label={t('ventes.cancel')}
                          title={t('ventes.cancel')}
                          className="text-danger hover:bg-danger/10 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                        >
                          <Icon i="x-circle" size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {rows.length === 0 && (
                  <div className="text-muted-foreground font-body px-5 py-6 text-sm">
                    {t('ventes.empty')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cartes (mobile / tablette < lg) */}
          <div className="flex flex-col gap-3 lg:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`bg-surface border-border flex flex-col gap-2 rounded-lg border p-4 ${
                  r.cancelled ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-muted-foreground font-mono text-xs">
                    {r.number} · {r.date} {r.time}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <RowSyncBadge synced={r.synced} />
                    {r.cancelled ? (
                      <span className="font-body bg-muted text-muted-foreground shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold">
                        {t('ventes.cancelled')}
                      </span>
                    ) : (
                      <span
                        className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${METHOD_BADGE[r.method]}`}
                      >
                        {t(METHOD_LABEL[r.method])}
                      </span>
                    )}
                  </div>
                </div>
                {r.sellerName && sellers.length > 1 && (
                  <span className="font-body text-muted-foreground flex items-center gap-1 text-[11px]">
                    <Icon i="user" size={11} /> {r.sellerName}
                  </span>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-body text-sm font-medium ${
                      r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {r.label}
                  </span>
                  <span className="font-body text-muted-foreground shrink-0 text-xs">×{r.qty}</span>
                </div>
                <div className="border-border flex items-center justify-between gap-2 border-t pt-2">
                  <span
                    className={`font-body text-base font-bold ${
                      r.cancelled ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {formatFCFA(r.total)} {t('common.fcfa')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openReceipt(r.id)}
                      aria-label={t('receipt.title')}
                      className="text-primary hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    >
                      <Icon i="receipt-text" size={16} />
                    </button>
                    {!r.cancelled && (
                      <button
                        type="button"
                        onClick={() => openInvoice(r.id)}
                        disabled={invoicing === r.id}
                        aria-label={
                          factureBySaleId.has(r.id)
                            ? t('ventes.invoiceView')
                            : t('ventes.invoiceGenerate')
                        }
                        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                          factureBySaleId.has(r.id)
                            ? 'text-success hover:bg-success/10'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon
                          i={invoicing === r.id ? 'loader-2' : 'file-text'}
                          size={16}
                          className={invoicing === r.id ? 'animate-spin' : ''}
                        />
                      </button>
                    )}
                    {canCancel && !r.cancelled && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget({ id: r.id, number: r.number })}
                        aria-label={t('ventes.cancel')}
                        className="text-danger hover:bg-danger/10 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                      >
                        <Icon i="x-circle" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-5 py-6 text-sm">
                {t('ventes.empty')}
              </div>
            )}
          </div>
        </AsyncState>
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <PdfPreviewModal
        open={pdfDoc !== null}
        path={pdfDoc ? `/api/documents/${pdfDoc.id}/pdf` : null}
        fileName={pdfDoc ? `${pdfDoc.number}.pdf` : ''}
        title={pdfDoc ? docTitle(pdfDoc) : ''}
        shareText={pdfDoc ? docShareText(pdfDoc) : ''}
        phone={pdfDoc?.clientPhone ?? null}
        onClose={() => setPdfDoc(null)}
      />

      <Modal
        open={cancelTarget !== null}
        onClose={() => !cancelling && closeCancel()}
        title={t('ventes.cancel.title')}
        size="sm"
      >
        <p className="font-body text-foreground text-sm">
          {t('ventes.cancel.body', { number: cancelTarget?.number ?? '' })}
        </p>
        <div className="mt-4 flex flex-col gap-1">
          <label
            className="font-body text-foreground text-xs font-semibold"
            htmlFor="cancel-reason"
          >
            {t('ventes.cancel.reasonLabel')}
          </label>
          <textarea
            id="cancel-reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={t('ventes.cancel.reasonPlaceholder')}
            rows={2}
            className="border-border bg-input text-foreground font-body placeholder:text-muted-foreground focus:border-primary resize-none rounded-md border px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeCancel}
            disabled={cancelling}
            className="font-body border-border text-foreground hover:bg-muted rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmCancel}
            disabled={cancelling}
            className="font-body bg-danger text-danger-foreground rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {t('ventes.cancel.confirm')}
          </button>
        </div>
      </Modal>
    </>
  );
}
