// Page publique de reçu — /r/[token].
//
// PUBLIC (aucune authentification) : affiche le reçu d'une vente à partir de son
// jeton aléatoire, avec un bouton « Télécharger le PDF ». C'est la page ouverte
// par le client depuis le lien WhatsApp. Aucune donnée sensible : uniquement le
// reçu que le commerçant lui envoie.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/prisma';
import { formatFCFA } from '@/lib/boutique/format';

export const metadata = { title: 'Reçu — Sahilley' };

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sale = token
    ? await prisma.sale.findUnique({
        where: { publicToken: token },
        select: {
          number: true,
          total: true,
          discount: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
          items: { select: { name: true, qty: true, unitPrice: true } },
          organization: {
            select: {
              name: true,
              settings: { select: { city: true, phone: true, logoUrl: true, invoiceNote: true } },
            },
          },
        },
      })
    : null;

  if (!sale || sale.status === 'CANCELLED') notFound();

  const s = sale.organization.settings;
  const dateStr = new Date(sale.createdAt).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  // Brut des lignes ; si une remise a été accordée, on affiche sous-total +
  // remise pour que les lignes réconcilient avec le total net.
  const gross = sale.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
  const hasDiscount = sale.discount > 0 && gross > sale.total;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-7 shadow-sm">
          {/* En-tête boutique */}
          <div className="flex flex-col items-center text-center">
            {s?.logoUrl ? (
              <img src={s.logoUrl} alt="" className="mb-2 h-14 w-14 rounded-lg object-cover" />
            ) : (
              <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-600 text-xl font-bold text-white">
                {sale.organization.name.charAt(0).toUpperCase() || 'B'}
              </div>
            )}
            <h1 className="text-lg font-bold text-neutral-900">{sale.organization.name}</h1>
            {s?.city && <p className="text-xs text-neutral-500">{s.city}</p>}
            {s?.phone && <p className="text-xs text-neutral-500">{s.phone}</p>}
          </div>

          <div className="my-4 border-t border-dashed border-neutral-300" />

          <div className="flex justify-between text-xs text-neutral-500">
            <span>Reçu {sale.number}</span>
            <span>{dateStr}</span>
          </div>
          {sale.customer?.name && (
            <p className="mt-1 text-xs text-neutral-500">Client : {sale.customer.name}</p>
          )}

          <div className="my-4 border-t border-dashed border-neutral-300" />

          {/* Articles */}
          <div className="flex flex-col gap-2">
            {sale.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 text-neutral-800">
                  {it.name} <span className="text-neutral-400">×{it.qty}</span>
                </span>
                <span className="shrink-0 font-semibold text-neutral-900">
                  {formatFCFA(it.qty * it.unitPrice)}
                </span>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-neutral-300" />

          {hasDiscount && (
            <div className="mb-2 flex flex-col gap-1 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Sous-total</span>
                <span>{formatFCFA(gross)} FCFA</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Remise</span>
                <span>−{formatFCFA(sale.discount)} FCFA</span>
              </div>
            </div>
          )}

          <div className="flex justify-between text-base font-bold text-neutral-900">
            <span>Total</span>
            <span>{formatFCFA(sale.total)} FCFA</span>
          </div>

          {/* Téléchargement PDF */}
          <a
            href={`/api/public/receipts/${token}/pdf`}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
          >
            Télécharger le PDF
          </a>

          {s?.invoiceNote && (
            <p className="mt-4 text-center text-xs text-neutral-500">{s.invoiceNote}</p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-neutral-400">Propulsé par Sahilley</p>
      </div>
    </main>
  );
}
