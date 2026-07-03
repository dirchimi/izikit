'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import AsyncState from '@/components/boutique/AsyncState';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { formatFCFA } from '@/lib/boutique/format';
import { type PaymentMethod } from '@/lib/boutique/fixtures';
import ProductCard from './ProductCard';
import CartLine, { type CartLineData } from './CartLine';
import ClientPicker, { type PickedClient } from './ClientPicker';
import BarcodeScannerModal from './BarcodeScannerModal';
import LiveDateTime from '@/components/boutique/LiveDateTime';
import ReceiptModal, {
  type ReceiptData,
  type ReceiptMethod,
} from '@/components/boutique/ventes/ReceiptModal';

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

const METHODS: PaymentMethod[] = ['cash', 'mobile', 'credit'];
const METHOD_KEY: Record<PaymentMethod, string> = {
  cash: 'method.cash',
  mobile: 'method.mobile',
  credit: 'method.credit',
};

export default function VendrePos() {
  const { toast } = useToast();
  const t = useT();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tous');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [client, setClient] = useState<PickedClient | null>(null);
  const [cart, setCart] = useState<CartLineData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const { data, loading, error, refresh } = useApi<{ products: ApiProduct[] }>('/api/products');
  const products = data?.products ?? [];

  // Chips catégories : « Tous » + les catégories réelles de la boutique.
  const categories = useMemo(
    () => ['Tous', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort()],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === 'Tous' || p.category === category) &&
        (q === '' || p.name.toLowerCase().includes(q)),
    );
  }, [products, query, category]);

  const itemCount = cart.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  function addToCart(product: ApiProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.sellPrice,
          qty: 1,
          sellPrice: product.sellPrice,
          prixGros: product.prixGros,
          wholesale: false,
        },
      ];
    });
  }
  function inc(id: string) {
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, qty: l.qty + 1 } : l)));
  }
  function dec(id: string) {
    setCart((prev) =>
      prev.flatMap((l) =>
        l.productId === id ? (l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l],
      ),
    );
  }
  function remove(id: string) {
    setCart((prev) => prev.filter((l) => l.productId !== id));
  }
  /** Bascule une ligne détail ⇄ gros et recalcule son prix unitaire effectif. */
  function toggleWholesale(id: string, wholesale: boolean) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === id
          ? { ...l, wholesale, unitPrice: wholesale && l.prixGros > 0 ? l.prixGros : l.sellPrice }
          : l,
      ),
    );
  }

  /** Ajout au panier par code-barres (lecteur physique OU caméra). */
  function addByBarcode(raw: string) {
    const code = raw.trim();
    if (code === '') return;
    const p = products.find((x) => x.barcode === code);
    if (!p) {
      toast(t('pos.scan.notFound', { code }), 'error');
      return;
    }
    addToCart(p);
    // Rupture : on avertit mais on laisse le choix (la ligne est ajoutée).
    if (p.qty <= 0) toast(t('pos.scan.outOfStock', { name: p.name }), 'info');
    else toast(t('pos.scan.added', { name: p.name }), 'success');
  }

  function checkoutError(err: unknown): string {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'INSUFFICIENT_STOCK') return t('pos.insufficientStock');
    if (code === 'CREDIT_NEEDS_CUSTOMER') return t('pos.creditNeedsClient');
    return t('async.error');
  }

  async function validate() {
    if (cart.length === 0) {
      toast(t('pos.cartEmpty'), 'info');
      return;
    }
    if (method === 'credit' && !client) {
      toast(t('pos.creditNeedsClient'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ sale: { id: string; number: string; total: number } }>('/api/sales', {
        method: 'POST',
        body: {
          method,
          items: cart.map((l) => ({ productId: l.productId, qty: l.qty, wholesale: l.wholesale })),
          // Client attaché à TOUTE vente si renseigné (existant via id, sinon créé).
          ...(client ? { customer: client.id ? { id: client.id } : { name: client.name } } : {}),
        },
      });
      toast(t('pos.saleRecorded', { amount: formatFCFA(subtotal) }), 'success');
      // Reçu proposé tout de suite (imprimer / envoyer par WhatsApp).
      setReceipt({
        number: res.sale.number,
        createdAt: new Date().toISOString(),
        method: method.toUpperCase() as ReceiptMethod,
        total: subtotal,
        customerName: client?.name ?? null,
        customerPhone: client?.phone ?? null,
        items: cart.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice })),
      });
      setCart([]);
      setClient(null);
      await refresh(); // le stock a changé
    } catch (err) {
      toast(checkoutError(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopBar
        title={t('nav.vendre')}
        subtitle={<LiveDateTime withTime />}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-col lg:flex-row">
        {/* Catalogue produits */}
        <div className="border-border flex flex-1 flex-col lg:border-e">
          {/* Recherche + scan code-barres */}
          <div className="flex flex-col gap-2 px-4 pt-5 pb-3 md:px-6">
            <div className="border-border bg-input flex items-center gap-2 rounded-md border px-3 py-2.5">
              <Icon i="search" size={15} className="text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.search.article')}
                className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
              />
            </div>
            {/* Champ de scan actif en permanence : un lecteur USB/Bluetooth tape le
                code puis envoie Entrée → on ajoute au panier. Bouton caméra sur mobile. */}
            <div className="flex items-center gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addByBarcode(barcode);
                  setBarcode('');
                }}
                className="border-border bg-input focus-within:border-primary flex flex-1 items-center gap-2 rounded-md border px-3 py-2.5"
              >
                <Icon i="scan-barcode" size={15} className="text-muted-foreground shrink-0" />
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder={t('pos.scan.field')}
                  autoFocus
                  autoComplete="off"
                  className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                />
              </form>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                aria-label={t('pos.scan.camera')}
                title={t('pos.scan.camera')}
                className="border-border bg-surface text-foreground hover:border-primary flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border transition-colors"
              >
                <Icon i="camera" size={17} />
              </button>
            </div>
          </div>

          {/* Chips catégories */}
          <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-6">
            {categories.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`font-body rounded-sm border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'text-muted-foreground border-border hover:border-primary'
                  }`}
                >
                  {cat === 'Tous' ? t('common.all') : cat}
                </button>
              );
            })}
          </div>

          {/* Grille produits */}
          <div className="px-4 pb-6 md:px-6">
            <AsyncState
              loading={loading}
              error={error}
              onRetry={refresh}
              isEmpty={products.length === 0}
              emptyLabel={t('pos.catalogEmpty')}
              emptyIcon="package"
            >
              {visibleProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {visibleProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={{
                        name: p.name,
                        price: p.sellPrice,
                        stock: p.qty,
                        category: p.category,
                        low: p.status !== 'ok',
                        imageUrl: p.imageUrl,
                      }}
                      onAdd={() => addToCart(p)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground font-body text-sm">
                  {t('pos.empty', { q: query })}
                </div>
              )}
            </AsyncState>
          </div>
        </div>

        {/* Panier */}
        <div className="bg-surface flex w-full flex-col lg:w-[340px]">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-headings text-foreground text-base font-bold">{t('pos.cart')}</h2>
            <span className="font-body text-muted-foreground bg-muted rounded-sm px-2 py-0.5 text-xs">
              {t('pos.items', { n: itemCount })}
            </span>
          </div>

          {/* Lignes */}
          <div className="flex flex-1 flex-col gap-1 px-5 py-3">
            {cart.length === 0 ? (
              <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                  <Icon i="shopping-cart" size={20} />
                </div>
                <span className="font-body text-xs">{t('pos.addHint')}</span>
              </div>
            ) : (
              cart.map((line) => (
                <CartLine
                  key={line.productId}
                  line={line}
                  onInc={() => inc(line.productId)}
                  onDec={() => dec(line.productId)}
                  onRemove={() => remove(line.productId)}
                  onToggleWholesale={(w) => toggleWholesale(line.productId, w)}
                />
              ))
            )}
          </div>

          {/* Paiement */}
          <div className="border-border flex flex-col gap-4 border-t px-5 py-5">
            <div className="flex flex-col gap-1">
              <div className="font-body text-muted-foreground flex justify-between text-sm">
                <span>{t('common.subtotal')}</span>
                <span>
                  {formatFCFA(subtotal)} {t('common.fcfa')}
                </span>
              </div>
              <div className="font-body text-foreground flex justify-between text-base font-bold">
                <span>{t('common.total')}</span>
                <span>
                  {formatFCFA(subtotal)} {t('common.fcfa')}
                </span>
              </div>
            </div>

            {/* Mode de paiement */}
            <div>
              <p className="font-body text-muted-foreground mb-2 text-xs font-semibold">
                {t('creances.form.method')}
              </p>
              <div className="flex gap-2">
                {METHODS.map((m) => {
                  const active = method === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`font-body flex-1 rounded-md border py-2 text-xs transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary font-semibold'
                          : 'border-border text-muted-foreground hover:border-primary'
                      }`}
                    >
                      {t(METHOD_KEY[m])}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sélecteur de client — disponible pour TOUS les paiements
                (optionnel ; requis seulement pour le crédit). */}
            <div className="flex flex-col gap-1.5">
              <p
                className={`font-body flex items-center gap-1.5 text-xs font-semibold ${
                  method === 'credit' && !client
                    ? 'text-secondary-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {method === 'credit' && <Icon i="alert-circle" size={13} className="shrink-0" />}
                {method === 'credit' ? t('pos.clientRequired') : t('pos.client.optional')}
              </p>
              <ClientPicker value={client} onChange={setClient} required={method === 'credit'} />
            </div>

            {/* Valider */}
            <button
              type="button"
              onClick={validate}
              disabled={submitting}
              className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md py-3 text-base font-bold disabled:opacity-60"
            >
              <Icon i="check" size={17} />
              {t('pos.validate')}
            </button>
          </div>
        </div>
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          setScannerOpen(false);
          addByBarcode(code);
        }}
      />
    </>
  );
}
