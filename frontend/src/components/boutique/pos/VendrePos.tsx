'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import AsyncState from '@/components/boutique/AsyncState';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { computeExpiryStatus } from '@/lib/boutique/expiry';
import { onSaleChange } from '@/lib/boutique/realtime';
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
  expiryDate: string | null;
}

const METHODS: PaymentMethod[] = ['cash', 'mobile', 'credit'];
const METHOD_KEY: Record<PaymentMethod, string> = {
  cash: 'method.cash',
  mobile: 'method.mobile',
  credit: 'method.credit',
};
const METHOD_ICON: Record<PaymentMethod, string> = {
  cash: 'banknote',
  mobile: 'smartphone',
  credit: 'hand-coins',
};
/** Montants ventilés du paiement mixte (chaînes contrôlées par les inputs). */
type SplitAmounts = { cash: string; mobile: string; credit: string };
const num = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

export default function VendrePos() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useT();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tous');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [split, setSplit] = useState(false);
  const [amounts, setAmounts] = useState<SplitAmounts>({ cash: '', mobile: '', credit: '' });
  const [client, setClient] = useState<PickedClient | null>(null);
  const [cart, setCart] = useState<CartLineData[]>([]);
  const [discount, setDiscount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  // Produit en attente de choix « Détail / Gros » (ouvert à chaque ajout).
  const [choosing, setChoosing] = useState<ApiProduct | null>(null);

  const { data, loading, error, refresh } = useApi<{
    products: ApiProduct[];
    expiryAlertDays: number;
  }>('/api/products');
  const products = data?.products ?? [];
  const expiryAlertDays = data?.expiryAlertDays ?? 30;

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
  // Brut = somme des lignes ; la remise (bornée) le réduit → total NET encaissé.
  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const discountAmount = Math.min(num(discount), subtotal);
  const netTotal = subtotal - discountAmount;

  // Paiement mixte : somme ventilée + reste à répartir + part crédit (sur le NET).
  const splitSum = num(amounts.cash) + num(amounts.mobile) + num(amounts.credit);
  const remaining = netTotal - splitSum;
  const creditPortion = split ? num(amounts.credit) : method === 'credit' ? netTotal : 0;

  /** Ajoute un produit au panier au tarif choisi (détail ou gros). Un produit
   *  périmé déclenche une confirmation (« vendre quand même ? ») — jamais bloqué. */
  async function addToCart(product: ApiProduct, wholesale: boolean) {
    const exp = computeExpiryStatus(product.expiryDate, expiryAlertDays, new Date());
    if (exp?.status === 'expired') {
      const ok = await confirm({
        title: t('pos.expired.title'),
        message: t('pos.expired.message', { name: product.name, n: Math.abs(exp.daysLeft) }),
        confirmLabel: t('pos.expired.confirm'),
        cancelLabel: t('common.cancel'),
        variant: 'danger',
        icon: 'calendar-clock',
      });
      if (!ok) return;
    }
    const useWholesale = wholesale && product.prixGros > 0;
    const unitPrice = useWholesale ? product.prixGros : product.sellPrice;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, qty: l.qty + 1, wholesale: useWholesale, unitPrice }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice,
          qty: 1,
          sellPrice: product.sellPrice,
          prixGros: product.prixGros,
          wholesale: useWholesale,
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
  /** Quantité saisie directement (grosse commande) — bornée à ≥ 1. */
  function setQty(id: string, qty: number) {
    const q = Math.max(1, Math.floor(qty));
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, qty: q } : l)));
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
    // Scan → ajout direct au détail (le choix gros/détail reste sur la ligne).
    void addToCart(p, false);
    // Rupture : on avertit mais on laisse le choix (la ligne est ajoutée).
    if (p.qty <= 0) toast(t('pos.scan.outOfStock', { name: p.name }), 'info');
    else toast(t('pos.scan.added', { name: p.name }), 'success');
  }

  function checkoutError(err: unknown): string {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'INSUFFICIENT_STOCK') return t('pos.insufficientStock');
    if (code === 'CREDIT_NEEDS_CUSTOMER') return t('pos.creditNeedsClient');
    if (code === 'PAYMENT_MISMATCH') return t('pos.pay.mustEqualTotal');
    return t('async.error');
  }

  function resetPayment() {
    setSplit(false);
    setMethod('cash');
    setAmounts({ cash: '', mobile: '', credit: '' });
    setDiscount('');
  }

  async function validate() {
    if (cart.length === 0) {
      toast(t('pos.cartEmpty'), 'info');
      return;
    }
    // La ventilation mixte doit solder exactement le total.
    if (split && remaining !== 0) {
      toast(t('pos.pay.mustEqualTotal'), 'error');
      return;
    }
    // Une part à crédit exige un client débiteur.
    if (creditPortion > 0 && !client) {
      toast(t('pos.creditNeedsClient'), 'error');
      return;
    }

    // Ventilation envoyée au serveur : en mode mixte on ventile par méthode,
    // sinon on envoie la méthode unique (compat). Elle porte sur le NET.
    const breakdown = split
      ? { cash: num(amounts.cash), mobile: num(amounts.mobile), credit: num(amounts.credit) }
      : {
          cash: method === 'cash' ? netTotal : 0,
          mobile: method === 'mobile' ? netTotal : 0,
          credit: method === 'credit' ? netTotal : 0,
        };
    const payments = (['cash', 'mobile', 'credit'] as const)
      .filter((k) => breakdown[k] > 0)
      .map((k) => ({ method: k, amount: breakdown[k] }));

    setSubmitting(true);
    try {
      const res = await api<{
        sale: { id: string; number: string; total: number; publicToken: string };
      }>('/api/sales', {
        method: 'POST',
        body: {
          ...(split ? { payments } : { method }),
          ...(discountAmount > 0 ? { discount: discountAmount } : {}),
          items: cart.map((l) => ({ productId: l.productId, qty: l.qty, wholesale: l.wholesale })),
          // Client attaché à TOUTE vente si renseigné (existant via id, sinon créé
          // à la volée avec son numéro → reçu + WhatsApp direct).
          ...(client
            ? {
                customer: client.id
                  ? { id: client.id }
                  : { name: client.name, ...(client.phone ? { phone: client.phone } : {}) },
              }
            : {}),
        },
      });
      toast(t('pos.saleRecorded', { amount: formatFCFA(netTotal) }), 'success');
      // Reçu proposé tout de suite (imprimer / envoyer par WhatsApp).
      setReceipt({
        number: res.sale.number,
        createdAt: new Date().toISOString(),
        // Paiement mixte → 'MIXED' (sinon le reçu affichait une méthode unique
        // trompeuse même quand plusieurs modes étaient réglés).
        method: split ? 'MIXED' : (method.toUpperCase() as ReceiptMethod),
        total: netTotal,
        subtotal,
        discount: discountAmount,
        payments: breakdown,
        customerName: client?.name ?? null,
        customerPhone: client?.phone ?? null,
        items: cart.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice })),
        publicToken: res.sale.publicToken,
      });
      setCart([]);
      setClient(null);
      resetPayment();
      // Vente enregistrée → resynchronise stock, ventes, dashboard, créances,
      // documents et rapports sur tous les écrans (plus besoin d'actualiser).
      onSaleChange();
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

      <div className="flex flex-col lg:flex-row lg:items-start">
        {/* Catalogue produits — @container : la grille s'adapte à la largeur
            réelle du catalogue (indépendante de la taille de l'écran). */}
        <div className="border-border @container flex min-w-0 flex-1 flex-col lg:border-e">
          {/* Recherche + scan code-barres */}
          <div className="flex flex-col gap-2 px-4 pt-5 pb-3 md:px-6">
            <div className="border-border bg-input focus-within:border-primary flex items-center gap-2 rounded-md border px-3 py-2.5">
              <Icon i="search" size={15} className="text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.search.article')}
                aria-label={t('common.search.article')}
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
                  aria-label={t('pos.scan.field')}
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
                <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
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
                      onAdd={() => setChoosing(p)}
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

        {/* Panier — collant en pleine hauteur sur ≥lg : les totaux + « Valider »
            restent toujours visibles, seule la liste d'articles défile. */}
        <div className="bg-surface flex w-full flex-col lg:sticky lg:top-0 lg:max-h-[100dvh] lg:w-[300px] xl:w-[340px]">
          <div className="border-border flex items-center justify-between border-b px-5 py-4 lg:shrink-0">
            <h2 className="font-headings text-foreground text-base font-bold">{t('pos.cart')}</h2>
            <span className="font-body text-muted-foreground bg-muted rounded-sm px-2 py-0.5 text-xs">
              {t('pos.items', { n: itemCount })}
            </span>
          </div>

          {/* Lignes — zone de défilement interne sur ≥lg (min-h-0 requis pour
              que flex-1 puisse rétrécir sous la hauteur de son contenu). */}
          <div className="flex flex-1 flex-col gap-1 px-5 py-3 lg:min-h-0 lg:overflow-y-auto">
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
                  onSetQty={(q) => setQty(line.productId, q)}
                  onRemove={() => remove(line.productId)}
                  onToggleWholesale={(w) => toggleWholesale(line.productId, w)}
                />
              ))
            )}
          </div>

          {/* Paiement — épinglé en bas du panier (toujours visible). */}
          <div className="border-border flex flex-col gap-4 border-t px-5 py-5 lg:shrink-0">
            {/* Remise globale (FCFA) — réduit le total encaissé. */}
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="pos-discount"
                className="font-body text-muted-foreground flex items-center gap-1.5 text-xs font-semibold"
              >
                <Icon i="badge-percent" size={14} />
                {t('pos.discount')}
              </label>
              <div className="border-border bg-input focus-within:border-primary flex w-32 items-center gap-1 rounded-md border px-2 py-1.5">
                <input
                  id="pos-discount"
                  type="number"
                  min="0"
                  max={subtotal}
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-end text-sm outline-none"
                />
                <span className="text-muted-foreground text-[11px]">{t('common.fcfa')}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="font-body text-muted-foreground flex justify-between text-sm">
                <span>{t('common.subtotal')}</span>
                <span>
                  {formatFCFA(subtotal)} {t('common.fcfa')}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="font-body text-success flex justify-between text-sm">
                  <span>{t('pos.discount')}</span>
                  <span>
                    − {formatFCFA(discountAmount)} {t('common.fcfa')}
                  </span>
                </div>
              )}
              <div className="font-body text-foreground flex justify-between text-base font-bold">
                <span>{t('common.total')}</span>
                <span>
                  {formatFCFA(netTotal)} {t('common.fcfa')}
                </span>
              </div>
            </div>

            {/* Mode de paiement — simple (une méthode) ou mixte (ventilé) */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-body text-muted-foreground text-xs font-semibold">
                  {t('creances.form.method')}
                </p>
                <button
                  type="button"
                  onClick={() => setSplit((s) => !s)}
                  className="font-body text-primary text-xs font-semibold"
                >
                  {split ? t('pos.pay.simple') : t('pos.pay.split')}
                </button>
              </div>

              {!split ? (
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
              ) : (
                <div className="flex flex-col gap-2">
                  {METHODS.map((m) => (
                    <div key={m} className="flex items-center gap-2">
                      <span className="font-body text-muted-foreground flex w-24 shrink-0 items-center gap-1.5 text-xs">
                        <Icon i={METHOD_ICON[m]} size={13} />
                        {t(METHOD_KEY[m])}
                      </span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={amounts[m]}
                        onChange={(e) => setAmounts((a) => ({ ...a, [m]: e.target.value }))}
                        placeholder="0"
                        className="border-border bg-input text-foreground font-body focus:border-primary w-full rounded-md border px-2 py-1.5 text-end text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAmounts((a) => ({
                            ...a,
                            [m]: String(num(a[m]) + Math.max(0, remaining)),
                          }))
                        }
                        title={t('pos.pay.fill')}
                        className="border-border text-muted-foreground hover:border-primary font-body shrink-0 rounded-md border px-2 py-1.5 text-[11px]"
                      >
                        {t('pos.pay.fill')}
                      </button>
                    </div>
                  ))}
                  <div
                    className={`font-body flex justify-between text-xs font-semibold ${
                      remaining === 0 ? 'text-success' : 'text-warning'
                    }`}
                  >
                    <span>{t('pos.pay.remaining')}</span>
                    <span>
                      {formatFCFA(remaining)} {t('common.fcfa')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Sélecteur de client — disponible pour TOUS les paiements
                (optionnel ; requis dès qu'une part crédit est saisie). */}
            <div className="flex flex-col gap-1.5">
              <p
                className={`font-body flex items-center gap-1.5 text-xs font-semibold ${
                  creditPortion > 0 && !client
                    ? 'text-secondary-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {creditPortion > 0 && <Icon i="alert-circle" size={13} className="shrink-0" />}
                {creditPortion > 0 ? t('pos.clientRequired') : t('pos.client.optional')}
              </p>
              <ClientPicker value={client} onChange={setClient} required={creditPortion > 0} />
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

      {/* Choix Détail / Gros à l'ajout d'un produit. Le bouton « Gros » est
          désactivé si le produit n'a pas de prix de gros défini. */}
      <Modal
        open={choosing !== null}
        onClose={() => setChoosing(null)}
        title={choosing?.name ?? ''}
        size="sm"
      >
        {choosing && (
          <div className="flex flex-col gap-3">
            <p className="font-body text-muted-foreground text-sm">{t('pos.priceMode.prompt')}</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  void addToCart(choosing, false);
                  setChoosing(null);
                }}
                className="border-border hover:border-primary flex flex-col items-center gap-1 rounded-lg border px-4 py-4 transition-colors"
              >
                <span className="font-body text-muted-foreground text-xs font-semibold">
                  {t('pos.retail')}
                </span>
                <span className="font-headings text-foreground text-lg font-bold">
                  {formatFCFA(choosing.sellPrice)}
                </span>
                <span className="text-muted-foreground text-[11px]">{t('common.fcfa')}</span>
              </button>
              <button
                type="button"
                disabled={choosing.prixGros <= 0}
                onClick={() => {
                  void addToCart(choosing, true);
                  setChoosing(null);
                }}
                className="border-primary bg-primary/5 hover:bg-primary/10 flex flex-col items-center gap-1 rounded-lg border px-4 py-4 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="font-body text-primary text-xs font-semibold">
                  {t('pos.wholesale')}
                </span>
                <span className="font-headings text-foreground text-lg font-bold">
                  {choosing.prixGros > 0 ? formatFCFA(choosing.prixGros) : '—'}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {choosing.prixGros > 0 ? t('common.fcfa') : t('pos.priceMode.noWholesale')}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
