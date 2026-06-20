'use client';

import { useEffect, useState } from 'react';
import { useCursorList } from '@/lib/admin/useCursorList';
import { AdminHeader, Badge, LoadMore } from '@/components/admin/ui';
import { formatFCFA } from '@/lib/boutique/format';

interface AdminOrder {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  customerEmail: string;
  provider: string;
  createdAt: string;
}

const TONE: Record<string, string> = {
  PAID: 'green',
  PENDING: 'amber',
  FAILED: 'red',
  EXPIRED: 'neutral',
};

export default function AdminOrdersPage() {
  const { items, hasMore, loading, error, load } = useCursorList<AdminOrder>('/api/admin/orders');
  const [status, setStatus] = useState('');

  useEffect(() => {
    void load(true, {});
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Commandes" subtitle="Paiements clients">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            void load(true, { status: e.target.value });
          }}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="PAID">Payée</option>
          <option value="FAILED">Échouée</option>
          <option value="EXPIRED">Expirée</option>
        </select>
      </AdminHeader>

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      <div className="bg-surface border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-border text-muted-foreground font-body border-b text-left text-xs font-semibold uppercase">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3 text-end">Montant</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                <td className="text-foreground font-body px-4 py-3 font-medium">
                  {o.customerEmail}
                </td>
                <td className="text-foreground font-body px-4 py-3 text-end font-semibold">
                  {formatFCFA(o.amount)} {o.currency}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">{o.provider}</td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucune commande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore show={hasMore} loading={loading} onClick={() => void load(false, { status })} />
    </div>
  );
}
