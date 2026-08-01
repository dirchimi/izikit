'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { stockStatusConfig } from '@/lib/boutique/fixtures';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { onStockChange } from '@/lib/boutique/realtime';
import { uploadImage } from '@/lib/upload';
import { db } from '@/lib/offline/db';
import { useLocalResource } from '@/lib/offline/useLocalResource';
import { getRole, pullResource } from '@/lib/offline/pull';
import { productRowToPos, type PosProduct } from '@/lib/offline/pos-adapters';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import ComboBox from '@/components/ui/ComboBox';
import Dropdown from '@/components/ui/Dropdown';
import Modal from '@/components/ui/Modal';
import ImageCropModal from '@/components/boutique/ImageCropModal';
import AddProductForm, { type NewProductInput } from './AddProductForm';
import EditProductForm, { type EditProductInput } from './EditProductForm';
import ExpiryBadge from './ExpiryBadge';
import ReapproForm from './ReapproForm';
import AdjustStockForm from './AdjustStockForm';
import MovementsHistoryModal from './MovementsHistoryModal';
import SupplierDebtsPanel, { type SupplierDebtRow } from './SupplierDebtsPanel';
import FloatingAddButton from '@/components/boutique/FloatingAddButton';
import { useConfirm } from '@/contexts/ConfirmContext';

// Offline-first (Task 5.3): identical shape to `pos-adapters.ts`'s `PosProduct`
// (raw catalogue columns + derived `status`), so `productRowToPos` is reused
// as-is to map the local Dexie mirror into what this screen already renders.
type ApiProduct = PosProduct;

type StatusFilter = 'all' | 'low' | 'out';

const STATUS_TABS: { key: StatusFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'stock.tab.all' },
  { key: 'low', labelKey: 'stock.status.low' },
  { key: 'out', labelKey: 'stock.status.out' },
];

function photoUploadError(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'FILE_TOO_LARGE':
        return t('stock.photo.tooLarge');
      case 'INVALID_MIME':
      case 'MAGIC_BYTE_MISMATCH':
        return t('stock.photo.invalidType');
      case 'STORAGE_NOT_CONFIGURED':
        return t('stock.photo.notConfigured');
      default:
        return t('stock.photo.failed');
    }
  }
  return t('stock.photo.failed');
}

/**
 * Vignette produit. Pour le Manager/Patron (`canManage`) c'est un bouton qui
 * ouvre le sélecteur de photo ; pour le Vendeur, une vignette statique (le
 * changement de photo passe par une route ADMIN, inutile de proposer le clic).
 */
function ProductThumb({
  product,
  uploading,
  canManage,
  sizeClass,
  iconSize,
  onPick,
  label,
}: {
  product: { imageUrl: string | null; name: string };
  uploading: boolean;
  canManage: boolean;
  sizeClass: string;
  iconSize: number;
  onPick: () => void;
  label: string;
}) {
  const inner = uploading ? (
    <Icon i="loader" size={iconSize} className="text-muted-foreground animate-spin" />
  ) : product.imageUrl ? (
    <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
  ) : (
    <Icon i="camera" size={iconSize} className="text-muted-foreground" />
  );
  const base = `bg-muted border-border flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-md border`;
  if (!canManage) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={uploading}
      aria-label={label}
      title={label}
      className={`${base} hover:border-primary transition-colors disabled:opacity-60`}
    >
      {inner}
    </button>
  );
}

export default function StockManager() {
  const { toast } = useToast();
  const t = useT();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [reapproTarget, setReapproTarget] = useState<ApiProduct | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<ApiProduct | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ApiProduct | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Offline-first (Task 5.3): lecture locale (Dexie) au lieu du réseau — le
  // miroir est alimenté par pullAll() (voir AppShell) et par
  // createAdjustOffline() plus bas pour les mouvements saisis hors ligne.
  // `loading`/`error` n'existent pas côté local (une lecture Dexie ne peut
  // pas "échouer" comme un fetch réseau) — `error` reste `null` en
  // permanence et `refresh()` est un no-op, `AsyncState` gère déjà ce cas
  // (voir DepensesManager, même schéma).
  const { data: productRows, loading } = useLocalResource(() => db.products.toArray(), [], []);
  const products = useMemo(() => productRows.map(productRowToPos), [productRows]);

  // Gestion du catalogue/stock (créer/éditer/supprimer, réappro, ajuster, photo)
  // réservée au Manager (ADMIN) et au Patron (OWNER) — le serveur applique la
  // même règle (`requireOrgRole('ADMIN')`) quoi qu'il arrive côté client. Le
  // Vendeur ne voit que la consultation + l'historique.
  //
  // Offline-first (Task 5.3): `/api/org/current` échoue hors ligne — on
  // préfère son rôle en direct quand disponible (source la plus fraîche,
  // couvre aussi un changement de rôle récent), sinon on retombe sur
  // `meta.role` (alimenté par le dernier pullAll()) pour qu'un
  // ADMIN/OWNER ne perde pas l'accès juste parce que le réseau est coupé.
  const { data: org } = useApi<{ role: string; settings: { expiryAlertDays: number } }>(
    '/api/org/current',
  );
  const { data: localRole } = useLocalResource(() => getRole(), [], null);
  const effectiveRole = org?.role ?? localRole;
  const canManage = effectiveRole === 'OWNER' || effectiveRole === 'ADMIN';
  const expiryAlertDays = org?.settings.expiryAlertDays ?? 30;

  // Dettes fournisseurs (stock pris « en prêt ») — info financière réservée au
  // Patron/Manager ; on n'interroge pas l'API côté Vendeur. Poll léger 30s.
  const { data: debtData, refresh: refreshDebts } = useApi<{
    debts: SupplierDebtRow[];
    totalOwed: number;
  }>('/api/supplier-debts', { skip: !canManage, pollMs: 30_000 });
  const debts = debtData?.debts ?? [];
  const totalOwed = debtData?.totalOwed ?? 0;
  const [showDebts, setShowDebts] = useState(false);

  // Catégories propres à la boutique : dérivées des produits déjà saisis
  // (chaque boutique a donc SES catégories, créées au fil de l'ajout).
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  function openPhotoPicker(productId: string) {
    setPhotoTargetId(productId);
    photoInputRef.current?.click();
  }

  // Sélection du fichier → ouverture du recadrage (l'upload attend la validation).
  function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !photoTargetId) return;
    if (!file.type.startsWith('image/')) {
      toast(t('stock.photo.invalidType'), 'error');
      return;
    }
    setCropFile(file);
  }

  async function uploadCroppedPhoto(cropped: File) {
    const productId = photoTargetId;
    setCropFile(null);
    if (!productId) return;
    setUploadingPhotoId(productId);
    try {
      const { url } = await uploadImage(cropped);
      await api(`/api/products/${productId}`, { method: 'PATCH', body: { imageUrl: url } });
      toast(t('stock.photo.updated'), 'success');
      onStockChange();
      // Offline-first (Task 5.3): the product list now reads from the local
      // Dexie mirror, not this network response — refresh just that resource
      // (best-effort, matching AppShell's own error-swallowing pull) so the
      // photo shows up immediately instead of waiting for the next pullAll().
      void pullResource('products');
    } catch (err) {
      toast(photoUploadError(err, t), 'error');
    } finally {
      setUploadingPhotoId(null);
      setPhotoTargetId(null);
    }
  }

  function cancelPhotoCrop() {
    setCropFile(null);
    setPhotoTargetId(null);
  }

  const totalProduits = products.length;
  const stockValue = products.reduce((sum, p) => sum + p.qty * p.buyPrice, 0);
  const lowCount = products.filter((p) => p.status === 'low').length;
  const outCount = products.filter((p) => p.status === 'out').length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (q === '' || p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q)) &&
        (categoryFilter === '' || p.category === categoryFilter) &&
        (statusFilter === 'all' || p.status === statusFilter),
    );
  }, [products, search, categoryFilter, statusFilter]);

  async function addProduct(input: NewProductInput): Promise<boolean> {
    if (!input.name) {
      toast(t('stock.nameRequired'), 'error');
      return false;
    }
    try {
      const res = await api<{ product: { name: string; ref: string } }>('/api/products', {
        method: 'POST',
        body: {
          name: input.name,
          category: input.category,
          buyPrice: input.buyPrice,
          sellPrice: input.sellPrice,
          prixGros: input.prixGros,
          unite: input.unite,
          qty: input.qty,
          threshold: input.threshold,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
          ...(input.barcode ? { barcode: input.barcode } : {}),
          ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}),
          ...(input.supplierDebt ? { supplierDebt: input.supplierDebt } : {}),
        },
      });
      toast(t('stock.added', { name: res.product.name, ref: res.product.ref }), 'success');
      onStockChange();
      void refreshDebts();
      // Offline-first (Task 5.3) — see `uploadCroppedPhoto`'s comment above.
      void pullResource('products');
      return true;
    } catch (err) {
      toast(productWriteError(err), 'error');
      return false;
    }
  }

  function productWriteError(err: unknown): string {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'BARCODE_TAKEN') return t('stock.barcodeTaken');
    if (code === 'REF_TAKEN') return t('stock.refTaken');
    return t('async.error');
  }

  async function updateProduct(id: string, patch: EditProductInput): Promise<boolean> {
    if (!patch.name) {
      toast(t('stock.nameRequired'), 'error');
      return false;
    }
    try {
      await api(`/api/products/${id}`, { method: 'PATCH', body: patch });
      toast(t('stock.updated', { name: patch.name }), 'success');
      onStockChange();
      // Offline-first (Task 5.3) — see `uploadCroppedPhoto`'s comment above.
      void pullResource('products');
      return true;
    } catch (err) {
      toast(productWriteError(err), 'error');
      return false;
    }
  }

  function afterMovement() {
    setReapproTarget(null);
    setAdjustTarget(null);
    onStockChange();
    void refreshDebts(); // un réappro « en prêt » a pu créer une dette
  }

  async function deleteProduct(p: ApiProduct) {
    const ok = await confirm({
      title: t('stock.delete.confirmTitle'),
      message: t('stock.delete.confirmMsg', { name: p.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
      icon: 'trash-2',
    });
    if (!ok) return;
    setDeletingId(p.id);
    try {
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      // Offline-first (Task 5.3): a delete has no server-side echo `pullResource`
      // could bulkPut (the row is simply gone, and this pull design has no
      // delete-tombstone mechanism) — remove it from the local mirror
      // directly so it doesn't linger as a ghost row in this Dexie-backed list.
      await db.products.delete(p.id);
      toast(t('stock.deleted', { name: p.name }), 'success');
      onStockChange();
    } catch {
      toast(t('async.error'), 'error');
      setDeletingId(null);
      return;
    } finally {
      setDeletingId(null);
    }

    // Dettes fournisseurs liées à ce produit (réappro « en prêt ») : la dette
    // SURVIT volontairement à la suppression du produit (argent réellement dû,
    // pas de cascade silencieuse) — mais si la fiche était une erreur, on
    // propose explicitement de les supprimer aussi, une par une.
    const linked = debts.filter((d) => d.productId === p.id);
    for (const d of linked) {
      const removeIt = await confirm({
        title: t('stock.debts.deleteLinkedTitle'),
        message: t('stock.debts.deleteLinkedMsg', {
          label: d.label,
          supplier: d.supplierName || t('stock.debts.noSupplier'),
          amount: formatFCFA(d.remaining),
        }),
        confirmLabel: t('common.delete'),
        cancelLabel: t('stock.debts.keepDebt'),
        variant: 'danger',
        icon: 'trash-2',
      });
      if (!removeIt) continue;
      try {
        await api(`/api/supplier-debts/${d.id}`, { method: 'DELETE' });
        toast(t('stock.debts.deletedToast'), 'success');
      } catch {
        toast(t('async.error'), 'error');
      }
    }
    if (linked.length > 0) void refreshDebts();
  }

  return (
    <>
      <TopBar
        title={t('nav.stock')}
        subtitle={t('stock.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex min-w-0 flex-col">
        {/* Liste produits */}
        <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
          {/* KPI */}
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
              canManage ? 'xl:grid-cols-5' : 'xl:grid-cols-3'
            }`}
          >
            <KpiCard
              accent={!canManage}
              label={t('stock.kpi.totalProducts')}
              value={String(totalProduits)}
              sublabel={t('stock.kpi.refs')}
            />
            {/* Valeur du stock = patrimoine de la boutique (Σ prix d'achat ×
                quantité) — info financière réservée au Patron/Manager, comme
                les dettes fournisseurs ci-dessous. */}
            {canManage && (
              <KpiCard
                accent
                label={t('stock.kpi.stockValue')}
                value={formatFCFA(stockValue)}
                sublabel={t('common.fcfa')}
              />
            )}
            <KpiCard
              label={t('stock.kpi.low')}
              value={String(lowCount)}
              sublabel={t('stock.kpi.products')}
              valueClass="text-warning"
            />
            <KpiCard
              label={t('stock.kpi.out')}
              value={String(outCount)}
              sublabel={t('stock.kpi.products')}
              valueClass="text-danger"
            />
            {/* À payer (dettes fournisseurs) — cliquable, ouvre le panneau. Patron/
                Manager uniquement. Mis en avant en rouge quand il reste à payer. */}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowDebts((v) => !v)}
                aria-expanded={showDebts}
                className={`bg-surface border-border hover:border-primary flex flex-col gap-1 rounded-lg border px-5 py-4 text-start transition-colors ${
                  showDebts ? 'border-primary' : ''
                }`}
              >
                <span className="text-muted-foreground font-body flex items-center justify-between text-xs">
                  {t('stock.kpi.toPay')}
                  <Icon i={showDebts ? 'chevron-up' : 'chevron-down'} size={13} />
                </span>
                <span
                  className={`font-headings text-2xl font-bold ${
                    totalOwed > 0 ? 'text-danger' : 'text-foreground'
                  }`}
                >
                  {formatFCFA(totalOwed)}
                </span>
                <span className="text-muted-foreground font-body text-xs">
                  {debts.length > 0
                    ? t('stock.kpi.toPaySub', { n: debts.length })
                    : t('common.fcfa')}
                </span>
              </button>
            )}
          </div>

          {/* Panneau des dettes fournisseurs (caché par défaut) */}
          {canManage && showDebts && (
            <SupplierDebtsPanel
              debts={debts}
              totalOwed={totalOwed}
              onPaid={refreshDebts}
              onClose={() => setShowDebts(false)}
            />
          )}

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-border bg-input focus-within:border-primary flex w-full items-center gap-2 rounded-md border px-3 py-2 sm:w-[260px]">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search.product')}
                aria-label={t('common.search.product')}
                className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
              />
            </div>
            <ComboBox
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories}
              allLabel={t('common.allCategories')}
              searchable={categories.length > 8}
              className="w-full sm:w-[200px]"
            />
            <div className="border-border flex items-center overflow-hidden rounded-md border">
              {STATUS_TABS.map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`font-body border-border border-s px-3 py-2 text-xs first:border-s-0 ${
                      active
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>

            {/* Ajouter un produit — Manager/Patron uniquement */}
            {canManage && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold sm:ms-auto"
              >
                <Icon i="plus" size={15} />
                {t('stock.form.title')}
              </button>
            )}
          </div>

          {/* Champ fichier partagé pour changer la photo d'un produit */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePhotoFile}
            className="hidden"
          />

          {/* Table */}
          <AsyncState
            loading={loading}
            error={null}
            isEmpty={products.length === 0}
            emptyLabel={t('stock.emptyAll')}
            emptyIcon="package"
          >
            <div className="bg-surface border-border hidden rounded-lg border lg:block">
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                  {/* En-tête */}
                  <div className="bg-muted border-border flex items-center gap-4 rounded-t-lg border-b px-5 py-3">
                    <span className="font-body text-muted-foreground w-16 text-xs font-semibold">
                      {t('stock.col.ref')}
                    </span>
                    <span className="font-body text-muted-foreground flex-1 text-xs font-semibold">
                      {t('common.product')}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-xs font-semibold">
                      {t('common.category')}
                    </span>
                    {/* Prix d'achat = info financière (marge déductible) —
                        Patron/Manager seulement, comme la valeur du stock. */}
                    {canManage && (
                      <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                        {t('stock.col.buyPrice')}
                      </span>
                    )}
                    <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                      {t('stock.col.sellPrice')}
                    </span>
                    <span className="font-body text-muted-foreground w-16 text-center text-xs font-semibold">
                      {t('stock.col.stock')}
                    </span>
                    <span className="font-body text-muted-foreground w-16 text-center text-xs font-semibold">
                      {t('stock.col.threshold')}
                    </span>
                    <span className="font-body text-muted-foreground w-24 text-center text-xs font-semibold">
                      {t('common.status')}
                    </span>
                    <span className="w-24" />
                  </div>

                  {visible.map((p) => {
                    const s = stockStatusConfig[p.status];
                    return (
                      <div
                        key={p.id}
                        className="border-border flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                      >
                        <span className="font-body text-muted-foreground w-16 font-mono text-xs">
                          {p.ref}
                        </span>
                        <div className="flex flex-1 items-center gap-2">
                          <ProductThumb
                            product={p}
                            uploading={uploadingPhotoId === p.id}
                            canManage={canManage}
                            sizeClass="h-9 w-9"
                            iconSize={13}
                            onPick={() => openPhotoPicker(p.id)}
                            label={t('stock.photo.change')}
                          />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="font-body text-foreground text-sm font-medium">
                              {p.name}
                            </span>
                            <ExpiryBadge
                              expiryDate={p.expiryDate}
                              alertDays={expiryAlertDays}
                              className="w-fit"
                            />
                          </div>
                        </div>
                        <span className="font-body text-muted-foreground w-24 text-xs">
                          {p.category}
                        </span>
                        {canManage && (
                          <span className="font-body text-muted-foreground w-28 text-end text-sm">
                            {formatFCFA(p.buyPrice)} {t('common.fcfa')}
                          </span>
                        )}
                        <span className="font-body text-foreground w-28 text-end text-sm font-semibold">
                          {formatFCFA(p.sellPrice)} {t('common.fcfa')}
                        </span>
                        <span
                          className={`font-body w-16 text-center text-sm font-bold ${
                            p.status === 'out'
                              ? 'text-danger'
                              : p.status === 'low'
                                ? 'text-warning'
                                : 'text-foreground'
                          }`}
                        >
                          {p.qty}
                        </span>
                        <span className="font-body text-muted-foreground w-16 text-center text-xs">
                          {p.threshold}
                        </span>
                        <div className="flex w-24 justify-center">
                          <span
                            className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${s.cls}`}
                          >
                            {t(`stock.status.${p.status}`)}
                          </span>
                        </div>
                        <div className="flex w-24 items-center justify-center gap-1">
                          <Dropdown
                            align="end"
                            width="w-56"
                            trigger={
                              <span
                                aria-label={t('stock.actions.more')}
                                title={t('stock.actions.more')}
                                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                              >
                                <Icon i="ellipsis-vertical" size={15} />
                              </span>
                            }
                            items={[
                              ...(canManage
                                ? [
                                    {
                                      label: t('stock.reappro.action'),
                                      icon: 'package-plus',
                                      onClick: () => setReapproTarget(p),
                                    },
                                    {
                                      label: t('stock.adjust.action'),
                                      icon: 'sliders-horizontal',
                                      onClick: () => setAdjustTarget(p),
                                    },
                                  ]
                                : []),
                              {
                                label: t('stock.history.action'),
                                icon: 'history',
                                onClick: () => setHistoryTarget(p),
                              },
                            ]}
                          />
                          {canManage && (
                            <button
                              type="button"
                              aria-label={`${t('common.edit')} ${p.name}`}
                              title={t('common.edit')}
                              onClick={() => setEditing(p)}
                              className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                            >
                              <Icon i="pencil" size={13} />
                            </button>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              aria-label={`${t('common.delete')} ${p.name}`}
                              title={t('common.delete')}
                              onClick={() => deleteProduct(p)}
                              disabled={deletingId === p.id}
                              className="text-muted-foreground hover:bg-danger/10 hover:text-danger flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50"
                            >
                              <Icon
                                i={deletingId === p.id ? 'loader-2' : 'trash-2'}
                                size={13}
                                className={deletingId === p.id ? 'animate-spin' : ''}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {visible.length === 0 && (
                    <div className="text-muted-foreground font-body px-5 py-6 text-sm">
                      {t('stock.empty')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cartes (mobile / tablette < lg) */}
            <div className="flex flex-col gap-3 lg:hidden">
              {visible.map((p) => {
                const s = stockStatusConfig[p.status];
                return (
                  <div
                    key={p.id}
                    className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4"
                  >
                    <div className="flex items-start gap-3">
                      <ProductThumb
                        product={p}
                        uploading={uploadingPhotoId === p.id}
                        canManage={canManage}
                        sizeClass="h-11 w-11"
                        iconSize={14}
                        onPick={() => openPhotoPicker(p.id)}
                        label={t('stock.photo.change')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-body text-foreground truncate text-sm font-semibold">
                            {p.name}
                          </span>
                          <span
                            className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${s.cls}`}
                          >
                            {t(`stock.status.${p.status}`)}
                          </span>
                        </div>
                        <span className="font-body text-muted-foreground font-mono text-xs">
                          {p.ref} · {p.category}
                        </span>
                        <ExpiryBadge
                          expiryDate={p.expiryDate}
                          alertDays={expiryAlertDays}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="font-body grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {canManage && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t('stock.col.buyPrice')}</span>
                          <span className="text-foreground">{formatFCFA(p.buyPrice)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{t('stock.col.sellPrice')}</span>
                        <span className="text-foreground font-semibold">
                          {formatFCFA(p.sellPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{t('stock.col.stock')}</span>
                        <span
                          className={`font-bold ${
                            p.status === 'out'
                              ? 'text-danger'
                              : p.status === 'low'
                                ? 'text-warning'
                                : 'text-foreground'
                          }`}
                        >
                          {p.qty} {p.unite}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{t('stock.col.threshold')}</span>
                        <span className="text-foreground">{p.threshold}</span>
                      </div>
                    </div>

                    <div className="border-border flex items-center justify-end gap-1 border-t pt-2">
                      <Dropdown
                        align="end"
                        width="w-56"
                        trigger={
                          <span
                            aria-label={t('stock.actions.more')}
                            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                          >
                            <Icon i="ellipsis-vertical" size={16} />
                          </span>
                        }
                        items={[
                          ...(canManage
                            ? [
                                {
                                  label: t('stock.reappro.action'),
                                  icon: 'package-plus',
                                  onClick: () => setReapproTarget(p),
                                },
                                {
                                  label: t('stock.adjust.action'),
                                  icon: 'sliders-horizontal',
                                  onClick: () => setAdjustTarget(p),
                                },
                              ]
                            : []),
                          {
                            label: t('stock.history.action'),
                            icon: 'history',
                            onClick: () => setHistoryTarget(p),
                          },
                        ]}
                      />
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`${t('common.edit')} ${p.name}`}
                          onClick={() => setEditing(p)}
                          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                        >
                          <Icon i="pencil" size={14} />
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`${t('common.delete')} ${p.name}`}
                          onClick={() => deleteProduct(p)}
                          disabled={deletingId === p.id}
                          className="text-muted-foreground hover:bg-danger/10 hover:text-danger flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
                        >
                          <Icon
                            i={deletingId === p.id ? 'loader-2' : 'trash-2'}
                            size={14}
                            className={deletingId === p.id ? 'animate-spin' : ''}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-5 py-6 text-sm">
                  {t('stock.empty')}
                </div>
              )}
            </div>
          </AsyncState>
        </div>
      </div>

      {/* Bouton flottant « + » (mobile) — ajoute sans scroller jusqu'en bas. */}
      {canManage && (
        <FloatingAddButton onClick={() => setAdding(true)} label={t('stock.form.title')} />
      )}

      {/* Formulaire d'ajout — en modale, ouvert au clic sur « Ajouter un produit » */}
      <Modal open={adding} onClose={() => setAdding(false)} title={t('stock.form.title')} size="md">
        <AddProductForm
          onSubmit={addProduct}
          onDone={() => setAdding(false)}
          categories={categories}
        />
      </Modal>

      {/* Édition d'un produit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t('stock.edit.title')}
        size="md"
      >
        {editing && (
          <EditProductForm
            product={editing}
            categories={categories}
            onSave={updateProduct}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Réapprovisionnement (entrée de stock) */}
      <Modal
        open={reapproTarget !== null}
        onClose={() => setReapproTarget(null)}
        title={t('stock.reappro.title')}
        size="sm"
      >
        {reapproTarget && <ReapproForm product={reapproTarget} onSuccess={afterMovement} />}
      </Modal>

      {/* Ajustement de stock (correction) */}
      <Modal
        open={adjustTarget !== null}
        onClose={() => setAdjustTarget(null)}
        title={t('stock.adjust.title')}
        size="sm"
      >
        {adjustTarget && <AdjustStockForm product={adjustTarget} onSuccess={afterMovement} />}
      </Modal>

      {/* Historique des mouvements */}
      <MovementsHistoryModal product={historyTarget} onClose={() => setHistoryTarget(null)} />

      {/* Recadrage de la photo produit avant upload */}
      <ImageCropModal
        file={cropFile}
        aspect={1}
        onCancel={cancelPhotoCrop}
        onConfirm={uploadCroppedPhoto}
      />
    </>
  );
}
