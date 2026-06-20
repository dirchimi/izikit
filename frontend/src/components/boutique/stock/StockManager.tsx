'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { posCategories, stockStatusConfig } from '@/lib/boutique/fixtures';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { uploadImage } from '@/lib/upload';
import KpiCard from '@/components/boutique/KpiCard';
import AsyncState from '@/components/boutique/AsyncState';
import AddProductForm, { type NewProductInput } from './AddProductForm';

interface ApiProduct {
  id: string;
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  threshold: number;
  status: 'ok' | 'low' | 'out';
  imageUrl: string | null;
}

type StatusFilter = 'all' | 'low' | 'out';

const STATUS_TABS: { key: StatusFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'stock.tab.all' },
  { key: 'low', labelKey: 'stock.status.low' },
  { key: 'out', labelKey: 'stock.status.out' },
];

const categoryOptions = posCategories.filter((c) => c !== 'Tous');

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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data, loading, error, refresh } = useApi<{ products: ApiProduct[] }>('/api/products');
  const products = data?.products ?? [];

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);

  function openPhotoPicker(productId: string) {
    setPhotoTargetId(productId);
    photoInputRef.current?.click();
  }

  async function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const productId = photoTargetId;
    if (!file || !productId) return;
    if (!file.type.startsWith('image/')) {
      toast(t('stock.photo.invalidType'), 'error');
      return;
    }
    setUploadingPhotoId(productId);
    try {
      const { url } = await uploadImage(file);
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
          qty: input.qty,
          threshold: input.threshold,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        },
      });
      toast(t('stock.added', { name: res.product.name, ref: res.product.ref }), 'success');
      await refresh();
      return true;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast(code === 'REF_TAKEN' ? t('stock.refTaken') : t('async.error'), 'error');
      return false;
    }
  }

  return (
    <>
      <TopBar
        title={t('nav.stock')}
        subtitle={t('stock.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-col xl:flex-row">
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
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none"
            >
              <option value="">{t('common.allCategories')}</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
            <div className="bg-surface border-border rounded-lg border">
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
                    <span className="w-8" />
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
                        <div className="flex w-8 justify-center">
                          <button
                            type="button"
                            aria-label={`${t('common.edit')} ${p.name}`}
                            onClick={() => toast(t('common.editSoonProduct'), 'info')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Icon i="pencil" size={13} />
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
          </AsyncState>
        </div>

        {/* Formulaire d'ajout */}
        <AddProductForm onSubmit={addProduct} />
      </div>
    </>
  );
}
