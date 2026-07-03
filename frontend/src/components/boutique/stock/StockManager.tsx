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
import { uploadImage } from '@/lib/upload';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import ComboBox from '@/components/ui/ComboBox';
import Dropdown from '@/components/ui/Dropdown';
import Modal from '@/components/ui/Modal';
import ImageCropModal from '@/components/boutique/ImageCropModal';
import AddProductForm, { type NewProductInput } from './AddProductForm';
import EditProductForm, { type EditProductInput } from './EditProductForm';
import ReapproForm from './ReapproForm';
import AdjustStockForm from './AdjustStockForm';
import MovementsHistoryModal from './MovementsHistoryModal';
import { useConfirm } from '@/contexts/ConfirmContext';

interface ApiProduct {
  id: string;
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  qty: number;
  threshold: number;
  status: 'ok' | 'low' | 'out';
  imageUrl: string | null;
  barcode: string | null;
}

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

  const { data, loading, error, refresh } = useApi<{ products: ApiProduct[] }>('/api/products');
  const products = data?.products ?? [];

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
      await refresh();
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
        },
      });
      toast(t('stock.added', { name: res.product.name, ref: res.product.ref }), 'success');
      await refresh();
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
      await refresh();
      return true;
    } catch (err) {
      toast(productWriteError(err), 'error');
      return false;
    }
  }

  function afterMovement() {
    setReapproTarget(null);
    setAdjustTarget(null);
    void refresh();
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
      toast(t('stock.deleted', { name: p.name }), 'success');
      await refresh();
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <TopBar
        title={t('nav.stock')}
        subtitle={t('stock.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-col">
        {/* Liste produits */}
        <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
          {/* KPI */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t('stock.kpi.totalProducts')}
              value={String(totalProduits)}
              sublabel={t('stock.kpi.refs')}
            />
            <KpiCard
              accent
              label={t('stock.kpi.stockValue')}
              value={formatFCFA(stockValue)}
              sublabel={t('common.fcfa')}
            />
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
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-border bg-input flex w-full items-center gap-2 rounded-md border px-3 py-2 sm:w-[260px]">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search.product')}
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

            {/* Ajouter un produit — ouvre la modale (plus de formulaire collé) */}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold sm:ms-auto"
            >
              <Icon i="plus" size={15} />
              {t('stock.form.title')}
            </button>
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
            error={error}
            onRetry={refresh}
            isEmpty={products.length === 0}
            emptyLabel={t('stock.emptyAll')}
            emptyIcon="package"
          >
            <div className="bg-surface border-border hidden rounded-lg border md:block">
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
                    <span className="font-body text-muted-foreground w-28 text-end text-xs font-semibold">
                      {t('stock.col.buyPrice')}
                    </span>
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
                          <button
                            type="button"
                            onClick={() => openPhotoPicker(p.id)}
                            disabled={uploadingPhotoId === p.id}
                            aria-label={t('stock.photo.change')}
                            title={t('stock.photo.change')}
                            className="bg-muted border-border hover:border-primary flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border transition-colors disabled:opacity-60"
                          >
                            {uploadingPhotoId === p.id ? (
                              <Icon
                                i="loader"
                                size={13}
                                className="text-muted-foreground animate-spin"
                              />
                            ) : p.imageUrl ? (
                              // next/image non utilisable (URLs Cloudinary distantes non déclarées).
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Icon i="camera" size={13} className="text-muted-foreground" />
                            )}
                          </button>
                          <span className="font-body text-foreground text-sm font-medium">
                            {p.name}
                          </span>
                        </div>
                        <span className="font-body text-muted-foreground w-24 text-xs">
                          {p.category}
                        </span>
                        <span className="font-body text-muted-foreground w-28 text-end text-sm">
                          {formatFCFA(p.buyPrice)} {t('common.fcfa')}
                        </span>
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
                              {
                                label: t('stock.history.action'),
                                icon: 'history',
                                onClick: () => setHistoryTarget(p),
                              },
                            ]}
                          />
                          <button
                            type="button"
                            aria-label={`${t('common.edit')} ${p.name}`}
                            title={t('common.edit')}
                            onClick={() => setEditing(p)}
                            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                          >
                            <Icon i="pencil" size={13} />
                          </button>
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

            {/* Cartes (mobile / tablette < md) */}
            <div className="flex flex-col gap-3 md:hidden">
              {visible.map((p) => {
                const s = stockStatusConfig[p.status];
                return (
                  <div
                    key={p.id}
                    className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => openPhotoPicker(p.id)}
                        disabled={uploadingPhotoId === p.id}
                        aria-label={t('stock.photo.change')}
                        className="bg-muted border-border flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border disabled:opacity-60"
                      >
                        {uploadingPhotoId === p.id ? (
                          <Icon
                            i="loader"
                            size={14}
                            className="text-muted-foreground animate-spin"
                          />
                        ) : p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Icon i="camera" size={14} className="text-muted-foreground" />
                        )}
                      </button>
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
                      </div>
                    </div>

                    <div className="font-body grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{t('stock.col.buyPrice')}</span>
                        <span className="text-foreground">{formatFCFA(p.buyPrice)}</span>
                      </div>
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
                          {
                            label: t('stock.history.action'),
                            icon: 'history',
                            onClick: () => setHistoryTarget(p),
                          },
                        ]}
                      />
                      <button
                        type="button"
                        aria-label={`${t('common.edit')} ${p.name}`}
                        onClick={() => setEditing(p)}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                      >
                        <Icon i="pencil" size={14} />
                      </button>
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
