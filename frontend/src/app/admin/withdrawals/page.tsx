'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { useCursorList } from '@/lib/admin/useCursorList';
import { AdminHeader, Badge, LoadMore } from '@/components/admin/ui';
import { formatFCFA } from '@/lib/boutique/format';

interface AdminWithdrawal {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  provider: string;
  requestedAt: string;
}

const TONE: Record<string, string> = {
  COMPLETED: 'green',
  PENDING: 'amber',
  PROCESSING: 'blue',
  CANCELLED: 'neutral',
  FAILED: 'red',
};

export default function AdminWithdrawalsPage() {
  const { toast } = useToast();
  const admin = useAdmin();
  const canCancel = admin.can.includes('withdrawals:cancel');

  const { items, setItems, hasMore, loading, error, load } =
    useCursorList<AdminWithdrawal>('/api/admin/withdrawals');
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void load(true, {});
  }, [load]);

  async function cancel(w: AdminWithdrawal) {
    const reason = window.prompt('Motif de l’annulation ?');
    if (!reason || !reason.trim()) return;
    setBusyId(w.id);
    try {
      const res = await api<{ withdrawal: { id: string; status: AdminWithdrawal['status'] } }>(
        `/api/admin/withdrawals/${w.id}/cancel`,
        { method: 'POST', body: { reason: reason.trim() } },
      );
      setItems((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, status: res.withdrawal.status } : x)),
      );
      toast('Retrait annulé.', 'success');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast(code === 'WITHDRAWAL_NOT_CANCELLABLE' ? 'Retrait non annulable.' : 'Échec.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Retraits" subtitle="Demandes de versement">
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
          <option value="PROCESSING">En cours</option>
          <option value="COMPLETED">Terminé</option>
          <option value="CANCELLED">Annulé</option>
          <option value="FAILED">Échoué</option>
        </select>
      </AdminHeader>

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      <div className="bg-surface border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-border text-muted-foreground font-body border-b text-left text-xs font-semibold uppercase">
              <th className="px-4 py-3 text-end">Montant</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Demandé le</th>
              <th className="px-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => {
              const cancellable = w.status === 'PENDING' || w.status === 'PROCESSING';
              return (
                <tr key={w.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                  <td className="text-foreground font-body px-4 py-3 text-end font-semibold">
                    {formatFCFA(w.amount)} {w.currency}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[w.status] ?? 'neutral'}>{w.status}</Badge>
                  </td>
                  <td className="text-muted-foreground font-body px-4 py-3">{w.provider}</td>
                  <td className="text-muted-foreground font-body px-4 py-3">
                    {new Date(w.requestedAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {canCancel && cancellable ? (
                      <button
                        type="button"
                        onClick={() => void cancel(w)}
                        disabled={busyId === w.id}
                        className="text-danger font-body text-xs font-semibold disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucun retrait.
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
