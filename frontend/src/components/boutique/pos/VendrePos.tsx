'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import {
  posCategories,
  posProducts,
  posClients,
  type PaymentMethod,
  type PosProduct,
} from '@/lib/boutique/fixtures';
import ProductCard from './ProductCard';
import CartLine, { type CartLineData } from './CartLine';

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
  const [method, setMethod] = useState<PaymentMethod>('credit');
  const [client, setClient] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');

  // Panier pré-rempli pour refléter l'écran Banani au chargement.
  const [cart, setCart] = useState<CartLineData[]>([
    { name: 'Tissu wax 6y', unitPrice: 9000, qty: 2 },
    { name: 'Huile Tournesol 2L', unitPrice: 2500, qty: 3 },
  ]);

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posProducts.filter(
      (p) =>
        (category === 'Tous' || p.category === category) &&
        (q === '' || p.name.toLowerCase().includes(q)),
    );
  }, [query, category]);

  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return posClients.filter((c) => q === '' || c.toLowerCase().includes(q));
  }, [clientQuery]);

  const itemCount = cart.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.name === product.name);
      if (existing) {
        return prev.map((l) => (l.name === product.name ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { name: product.name, unitPrice: product.price, qty: 1 }];
    });
  }
  function inc(name: string) {
    setCart((prev) => prev.map((l) => (l.name === name ? { ...l, qty: l.qty + 1 } : l)));
  }
  function dec(name: string) {
    setCart((prev) =>
      prev.flatMap((l) => (l.name === name ? (l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l])),
    );
  }
  function remove(name: string) {
    setCart((prev) => prev.filter((l) => l.name !== name));
  }

  function validate() {
    if (cart.length === 0) {
      toast(t('pos.cartEmpty'), 'info');
      return;
    }
    if (method === 'credit' && !client) {
      toast(t('pos.creditNeedsClient'), 'error');
      return;
    }
    toast(t('pos.saleRecorded', { amount: formatFCFA(subtotal) }), 'success');
    setCart([]);
    setClient(null);
  }

  return (
    <>
      <TopBar title={t('nav.vendre')} subtitle={t('pos.subtitle')} actions={<ScreenTopActions />} />

      <div className="flex flex-col lg:flex-row">
        {/* Catalogue produits */}
        <div className="border-border flex flex-1 flex-col lg:border-e">
          {/* Recherche */}
          <div className="px-4 pt-5 pb-3 md:px-6">
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
          </div>

          {/* Chips catégories */}
          <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-6">
            {posCategories.map((cat) => {
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
          {visibleProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 px-4 pb-6 sm:grid-cols-3 md:px-6 lg:grid-cols-4">
              {visibleProducts.map((p) => (
                <ProductCard key={p.name} product={p} onAdd={addToCart} />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground font-body px-6 pb-6 text-sm">
              {t('pos.empty', { q: query })}
            </div>
          )}
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
            {cart.map((line) => (
              <CartLine
                key={line.name}
                line={line}
                onInc={() => inc(line.name)}
                onDec={() => dec(line.name)}
                onRemove={() => remove(line.name)}
              />
            ))}
            <div className="text-muted-foreground border-border mt-2 flex items-center gap-2 rounded-md border border-dashed px-3 py-3">
              <Icon i="plus" size={14} />
              <span className="font-body text-xs">{t('pos.addHint')}</span>
            </div>
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

            {/* Sélecteur client débiteur (crédit) */}
            {method === 'credit' && (
              <div className="bg-secondary flex flex-col gap-2 rounded-md px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon i="alert-circle" size={13} className="text-secondary-foreground shrink-0" />
                  <p className="font-body text-secondary-foreground text-xs font-semibold">
                    {client ? t('pos.clientLabel', { name: client }) : t('pos.clientRequired')}
                  </p>
                </div>
                <div className="border-border bg-surface flex items-center gap-2 rounded-md border px-3 py-2">
                  <Icon i="search" size={13} className="text-muted-foreground" />
                  <input
                    type="search"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder={t('common.search.client')}
                    className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-xs outline-none"
                  />
                </div>
                {visibleClients.length > 0 && (
                  <div className="border-border bg-surface flex flex-col overflow-hidden rounded-md border">
                    {visibleClients.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setClient(c)}
                        className={`flex items-center gap-3 px-3 py-2.5 text-start transition-colors ${
                          i > 0 ? 'border-border border-t' : ''
                        } ${client === c ? 'bg-secondary' : 'hover:bg-muted'}`}
                      >
                        <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                          <Icon i="user" size={12} className="text-muted-foreground" />
                        </div>
                        <span className="font-body text-foreground text-sm font-medium">{c}</span>
                        {client === c && (
                          <Icon i="check" size={14} className="text-primary ms-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toast(t('pos.newClientSoon'), 'info')}
                  className="font-body text-primary mt-1 flex items-center gap-2 text-xs font-semibold"
                >
                  <Icon i="user-plus" size={13} />
                  {t('pos.newClient')}
                </button>
              </div>
            )}

            {/* Valider */}
            <button
              type="button"
              onClick={validate}
              className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md py-3 text-base font-bold"
            >
              <Icon i="check" size={17} />
              {t('pos.validate')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
