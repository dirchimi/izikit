'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { useCursorList } from '@/lib/admin/useCursorList';
import { AdminHeader, Badge, LoadMore } from '@/components/admin/ui';
import { formatFCFA } from '@/lib/boutique/format';

interface AdminSubPayment {
  id: string;
  plan: string;
  amount: number;
  method: string;
  months: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  periodEnd: string | null;
  note: string | null;
  createdAt: string;
  confirmedAt: string | null;
  organization: { id: string; name: string; slug: string };
}

const TONE: Record<string, string> = {
  CONFIRMED: 'green',
  PENDING: 'amber',
  REJECTED: 'red',
};
const PLAN_LABEL: Record<string, string> = { SOLO: 'Solo', BOUTIQUE: 'Boutique' };
const METHOD_LABEL: Record<string, string> = { CASH: 'Espèces', MOBILE: 'Mobile money' };

export default function AdminSubscriptionsPage() {
  const { toast } = useToast();
  const admin = useAdmin();
  const canConfirm = admin.can.includes('subscriptions:confirm');

  const { items, setItems, hasMore, loading, error, load } = useCursorList<AdminSubPayment>(
    '/api/admin/subscriptions',
  );
  const [status, setStatus] = useState('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void load(true, { status: 'PENDING' });
  }, [load]);

  async function confirm(p: AdminSubPayment) {
    if (
      !window.confirm(
        `Confirmer l’encaissement de ${formatFCFA(p.amount)} FCFA pour ${p.organization.name} ?`,
      )
    )
      return;
    setBusyId(p.id);
    try {
      const res = await api<{ status: AdminSubPayment['status']; currentPeriodEnd: string }>(
        `/api/admin/subscriptions/${p.id}/confirm`,
        { method: 'POST', body: {} },
      );
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: res.status } : x)));
      toast('Abonnement activé.', 'success');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast(code === 'SUB_PAYMENT_NOT_PENDING' ? 'Demande déjà traitée.' : 'Échec.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(p: AdminSubPayment) {
    const reason = window.prompt('Motif du refus ? (optionnel)') ?? '';
    if (reason === null) return;
    setBusyId(p.id);
    try {
      const res = await api<{ status: AdminSubPayment['status'] }>(
        `/api/admin/subscriptions/${p.id}/reject`,
        { method: 'POST', body: reason.trim() ? { reason: reason.trim() } : {} },
      );
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: res.status } : x)));
      toast('Demande refusée.', 'success');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast(code === 'SUB_PAYMENT_NOT_PENDING' ? 'Demande déjà traitée.' : 'Échec.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Abonnements" subtitle="Demandes de paiement (encaissement manuel)">
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
          <option value="CONFIRMED">Confirmé</option>
          <option value="REJECTED">Refusé</option>
        </select>
      </AdminHeader>

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      <div className="bg-surface border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-border text-muted-foreground font-body border-b text-left text-xs font-semibold uppercase">
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-end">Montant</th>
              <th className="px-4 py-3">Méthode</th>
              <th className="px-4 py-3 text-center">Durée</th>
              <th className="px-4 py-3">Demandé le</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                <td className="text-foreground font-body px-4 py-3 font-semibold">
                  {p.organization.name}
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {PLAN_LABEL[p.plan] ?? p.plan}
                </td>
                <td className="text-foreground font-body px-4 py-3 text-end font-semibold">
                  {formatFCFA(p.amount)} FCFA
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {METHOD_LABEL[p.method] ?? p.method}
                </td>
                <td className="text-muted-foreground font-body px-4 py-3 text-center">
                  {p.months} mois
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  {canConfirm && p.status === 'PENDING' ? (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => void confirm(p)}
                        disabled={busyId === p.id}
                        className="text-success font-body text-xs font-semibold disabled:opacity-50"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => void reject(p)}
                        disabled={busyId === p.id}
                        className="text-danger font-body text-xs font-semibold disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucune demande.
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
