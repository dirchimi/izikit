'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { useCursorList } from '@/lib/admin/useCursorList';
import { AdminHeader, Badge, LoadMore } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';
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
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  REJECTED: 'Refusé',
};
const PLAN_LABEL: Record<string, string> = {
  PREMIUM: 'Premium',
  SOLO: 'Solo',
  BOUTIQUE: 'Boutique',
};
const METHOD_LABEL: Record<string, string> = { CASH: 'Espèces', MOBILE: 'Mobile money' };

// Sélecteur de filtre réutilisable (même charte que le filtre de statut).
function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function AdminSubscriptionsPage() {
  const { toast } = useToast();
  const admin = useAdmin();
  const canConfirm = admin.can.includes('subscriptions:confirm');

  const { items, setItems, hasMore, loading, error, load } = useCursorList<AdminSubPayment>(
    '/api/admin/subscriptions',
  );
  const [status, setStatus] = useState('PENDING');
  const [plan, setPlan] = useState('');
  const [method, setMethod] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Action en cours de confirmation dans la modale (confirmer / refuser).
  const [action, setAction] = useState<{
    kind: 'confirm' | 'reject';
    payment: AdminSubPayment;
  } | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    void load(true, { status: 'PENDING' });
  }, [load]);

  // Recharge avec l'ensemble des filtres courants (les valeurs vides sont
  // ignorées côté hook → pas de paramètre superflu dans l'URL).
  function applyFilters(next: { status?: string; plan?: string; method?: string }) {
    const s = next.status ?? status;
    const p = next.plan ?? plan;
    const m = next.method ?? method;
    void load(true, { status: s, plan: p, method: m });
  }

  function openConfirm(payment: AdminSubPayment) {
    setReason('');
    setAction({ kind: 'confirm', payment });
  }
  function openReject(payment: AdminSubPayment) {
    setReason('');
    setAction({ kind: 'reject', payment });
  }

  async function runAction() {
    if (!action) return;
    const { kind, payment } = action;
    setBusyId(payment.id);
    try {
      if (kind === 'confirm') {
        const res = await api<{ status: AdminSubPayment['status']; currentPeriodEnd: string }>(
          `/api/admin/subscriptions/${payment.id}/confirm`,
          { method: 'POST', body: {} },
        );
        setItems((prev) =>
          prev.map((x) => (x.id === payment.id ? { ...x, status: res.status } : x)),
        );
        toast('Abonnement activé.', 'success');
      } else {
        const trimmed = reason.trim();
        const res = await api<{ status: AdminSubPayment['status'] }>(
          `/api/admin/subscriptions/${payment.id}/reject`,
          { method: 'POST', body: trimmed ? { reason: trimmed } : {} },
        );
        setItems((prev) =>
          prev.map((x) =>
            x.id === payment.id ? { ...x, status: res.status, note: trimmed || x.note } : x,
          ),
        );
        toast('Demande refusée.', 'success');
      }
      setAction(null);
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
        <FilterSelect
          value={status}
          onChange={(v) => {
            setStatus(v);
            applyFilters({ status: v });
          }}
          allLabel="Tous les statuts"
          options={[
            { value: 'PENDING', label: 'En attente' },
            { value: 'CONFIRMED', label: 'Confirmé' },
            { value: 'REJECTED', label: 'Refusé' },
          ]}
        />
        <FilterSelect
          value={plan}
          onChange={(v) => {
            setPlan(v);
            applyFilters({ plan: v });
          }}
          allLabel="Tous les plans"
          options={[{ value: 'PREMIUM', label: 'Premium' }]}
        />
        <FilterSelect
          value={method}
          onChange={(v) => {
            setMethod(v);
            applyFilters({ method: v });
          }}
          allLabel="Toutes les méthodes"
          options={[
            { value: 'CASH', label: 'Espèces' },
            { value: 'MOBILE', label: 'Mobile money' },
          ]}
        />
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
                  <Badge tone={TONE[p.status] ?? 'neutral'}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  {canConfirm && p.status === 'PENDING' ? (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => openConfirm(p)}
                        disabled={busyId === p.id}
                        className="text-success font-body text-xs font-semibold disabled:opacity-50"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => openReject(p)}
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

      <LoadMore
        show={hasMore}
        loading={loading}
        onClick={() => void load(false, { status, plan, method })}
      />

      {/* Modale de confirmation / refus (remplace window.confirm / prompt). */}
      <Modal
        open={!!action}
        onClose={() => (busyId ? undefined : setAction(null))}
        title={action?.kind === 'confirm' ? 'Confirmer l’encaissement' : 'Refuser la demande'}
        size="sm"
      >
        {action && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/40 border-border flex flex-col gap-1 rounded-lg border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-foreground font-body text-sm font-semibold">
                  {action.payment.organization.name}
                </span>
                <span className="font-headings text-foreground text-sm font-bold">
                  {formatFCFA(action.payment.amount)} FCFA
                </span>
              </div>
              <span className="text-muted-foreground font-body text-xs">
                {PLAN_LABEL[action.payment.plan] ?? action.payment.plan} · {action.payment.months}{' '}
                mois · {METHOD_LABEL[action.payment.method] ?? action.payment.method}
              </span>
            </div>

            {action.kind === 'confirm' ? (
              <p className="text-muted-foreground font-body text-sm">
                L’abonnement sera activé et la période d’accès prolongée de {action.payment.months}{' '}
                mois. Cette action est enregistrée dans le journal.
              </p>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-foreground font-body text-sm font-medium">
                  Motif du refus <span className="text-muted-foreground">(optionnel)</span>
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Ex. paiement non reçu, montant incorrect…"
                  className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
                />
              </label>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAction(null)}
                disabled={!!busyId}
                className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void runAction()}
                disabled={!!busyId}
                className={`font-body rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  action.kind === 'confirm'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {busyId
                  ? 'Traitement…'
                  : action.kind === 'confirm'
                    ? 'Confirmer l’encaissement'
                    : 'Refuser la demande'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
