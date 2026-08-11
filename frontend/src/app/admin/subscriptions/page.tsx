'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { revalidateResources } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { useCursorList } from '@/lib/admin/useCursorList';
import { AdminHeader, Badge, LoadMore, SuccessCheck } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';
import { formatFCFA } from '@/lib/boutique/format';

interface AdminSubPayment {
  id: string;
  plan: string;
  amount: number;
  // Trace du coupon (null = plein tarif) : prix catalogue + code utilisé.
  baseAmount: number | null;
  discountCode: string | null;
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
  ENTREPRISE: 'Entreprise',
  SOLO: 'Solo',
  BOUTIQUE: 'Boutique',
};
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  BANK: 'Virement bancaire',
  MOBILE: 'Mobile money', // historique
};

// Trace du coupon, affichée sous chaque montant : l'admin voit d'un coup
// d'œil qui a payé plein tarif et qui a utilisé quel code (et la remise).
function CouponHint({ code, base }: { code: string | null; base: number | null }) {
  if (!code) return null;
  return (
    <span className="text-primary font-body block text-xs font-medium">
      Code {code}
      {base !== null ? ` · catalogue ${formatFCFA(base)} FCFA` : ''}
    </span>
  );
}

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

  // Action en cours dans la modale (confirmer / refuser / corriger le montant).
  const [action, setAction] = useState<{
    kind: 'confirm' | 'reject' | 'amount';
    payment: AdminSubPayment;
  } | null>(null);
  const [reason, setReason] = useState('');
  // Montant (FCFA) éditable : pré-rempli avec le montant de la demande à la
  // confirmation, avec le montant enregistré pour une correction.
  const [amountStr, setAmountStr] = useState('');
  // Brève animation de succès dans la modale après une confirmation.
  const [celebrate, setCelebrate] = useState(false);

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
    setAmountStr(String(payment.amount));
    setAction({ kind: 'confirm', payment });
  }
  function openReject(payment: AdminSubPayment) {
    setReason('');
    setAction({ kind: 'reject', payment });
  }
  function openAmount(payment: AdminSubPayment) {
    setReason('');
    setAmountStr(String(payment.amount));
    setAction({ kind: 'amount', payment });
  }

  // Montant saisi → entier FCFA (null si vide/invalide → boutons désactivés).
  const parsedAmount = /^\d+$/.test(amountStr.trim()) ? Number(amountStr.trim()) : null;

  // Après une confirmation OU un refus, invalide les caches useApi qui
  // affichent ces montants ailleurs (dashboard admin « Paiements à valider »/
  // encaissé, fiche boutique) : sans ça, revenir au tableau de bord ressert
  // le cache périmé et le montant refusé semble toujours dû/encaissé.
  function revalidateAdminStats() {
    revalidateResources(['/api/admin/stats', '/api/admin/boutiques']);
  }

  async function runAction() {
    if (!action) return;
    const { kind, payment } = action;
    setBusyId(payment.id);
    try {
      if (kind === 'confirm') {
        const res = await api<{ status: AdminSubPayment['status']; currentPeriodEnd: string }>(
          `/api/admin/subscriptions/${payment.id}/confirm`,
          // Le montant saisi (pré-rempli avec celui de la demande, réduction
          // comprise) part avec la confirmation : c'est ce qui est encaissé.
          { method: 'POST', body: parsedAmount !== null ? { amount: parsedAmount } : {} },
        );
        setItems((prev) =>
          prev.map((x) =>
            x.id === payment.id
              ? { ...x, status: res.status, amount: parsedAmount ?? x.amount }
              : x,
          ),
        );
        revalidateAdminStats();
        // Animation « c'est fait ! » dans la modale, puis fermeture + toast.
        setCelebrate(true);
        setBusyId(null);
        setTimeout(() => {
          setCelebrate(false);
          setAction(null);
          toast('Abonnement activé 🎉', 'success');
        }, 1200);
        return;
      } else if (kind === 'amount') {
        if (parsedAmount === null) return;
        const res = await api<{ amount: number }>(`/api/admin/subscriptions/${payment.id}/amount`, {
          method: 'POST',
          body: { amount: parsedAmount },
        });
        setItems((prev) =>
          prev.map((x) => (x.id === payment.id ? { ...x, amount: res.amount } : x)),
        );
        revalidateAdminStats();
        toast('Montant corrigé.', 'success');
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
        revalidateAdminStats();
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
    <div className="stagger flex flex-col gap-5">
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
          options={[
            { value: 'PREMIUM', label: 'Premium' },
            { value: 'ENTREPRISE', label: 'Entreprise' },
          ]}
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
            { value: 'BANK', label: 'Virement bancaire' },
            { value: 'MOBILE', label: 'Mobile money' },
          ]}
        />
      </AdminHeader>

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      {/* Cartes (mobile) */}
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((p) => (
          <div key={p.id} className="bg-surface border-border rounded-xl border p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground font-body truncate text-sm font-semibold">
                  {p.organization.name}
                </p>
                <p className="text-muted-foreground font-body text-xs">
                  {PLAN_LABEL[p.plan] ?? p.plan} · {p.months} mois ·{' '}
                  {METHOD_LABEL[p.method] ?? p.method}
                </p>
                {p.note && (
                  <p
                    className={`font-body mt-1 text-xs ${
                      p.status === 'REJECTED' ? 'text-danger' : 'text-muted-foreground'
                    }`}
                  >
                    {p.note}
                  </p>
                )}
              </div>
              <Badge tone={TONE[p.status] ?? 'neutral'}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
            </div>
            <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
              <div className="min-w-0">
                <span className="font-headings text-foreground text-sm font-bold">
                  {formatFCFA(p.amount)} FCFA
                </span>
                <CouponHint code={p.discountCode} base={p.baseAmount} />
              </div>
              {canConfirm && p.status === 'PENDING' ? (
                <div className="flex items-center gap-4">
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
              ) : canConfirm && p.status === 'CONFIRMED' ? (
                <button
                  type="button"
                  onClick={() => openAmount(p)}
                  disabled={busyId === p.id}
                  className="text-primary font-body text-xs font-semibold disabled:opacity-50"
                >
                  Corriger le montant
                </button>
              ) : (
                <span className="text-muted-foreground font-body text-xs">
                  {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div className="bg-surface border-border text-muted-foreground font-body rounded-xl border px-4 py-8 text-center text-sm shadow-sm">
            Aucune demande.
          </div>
        )}
      </div>

      {/* Tableau (desktop) */}
      <div className="bg-surface border-border hidden overflow-x-auto rounded-xl border shadow-sm md:block">
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
                  <CouponHint code={p.discountCode} base={p.baseAmount} />
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
                  {p.note && (
                    <p
                      className={`font-body mt-1 max-w-[220px] text-xs ${
                        p.status === 'REJECTED' ? 'text-danger' : 'text-muted-foreground'
                      }`}
                    >
                      {p.note}
                    </p>
                  )}
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
                  ) : canConfirm && p.status === 'CONFIRMED' ? (
                    <button
                      type="button"
                      onClick={() => openAmount(p)}
                      disabled={busyId === p.id}
                      className="text-primary font-body text-xs font-semibold disabled:opacity-50"
                    >
                      Corriger le montant
                    </button>
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
        onClose={() => (busyId || celebrate ? undefined : setAction(null))}
        title={
          celebrate
            ? 'Encaissement confirmé'
            : action?.kind === 'confirm'
              ? 'Confirmer l’encaissement'
              : action?.kind === 'amount'
                ? 'Corriger le montant encaissé'
                : 'Refuser la demande'
        }
        size="sm"
      >
        {celebrate ? (
          <SuccessCheck label="Abonnement activé" />
        ) : action ? (
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
              <CouponHint code={action.payment.discountCode} base={action.payment.baseAmount} />
            </div>

            {action.kind === 'confirm' || action.kind === 'amount' ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-foreground font-body text-sm font-medium">
                    Montant réellement reçu (FCFA)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="border-border bg-input text-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
                  />
                  {action.payment.amount !== parsedAmount && parsedAmount !== null && (
                    <span className="text-muted-foreground font-body text-xs">
                      Enregistré actuellement : {formatFCFA(action.payment.amount)} FCFA
                    </span>
                  )}
                </label>
                <p className="text-muted-foreground font-body text-sm">
                  {action.kind === 'confirm'
                    ? `L’abonnement sera activé et la période d’accès prolongée de ${action.payment.months} mois. Cette action est enregistrée dans le journal.`
                    : 'Correction comptable pure : le statut et la période d’accès ne changent pas. L’ancien et le nouveau montant sont enregistrés dans le journal.'}
                </p>
              </>
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
                disabled={!!busyId || (action.kind !== 'reject' && parsedAmount === null)}
                className={`font-body rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  action.kind === 'reject'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {busyId
                  ? 'Traitement…'
                  : action.kind === 'confirm'
                    ? 'Confirmer l’encaissement'
                    : action.kind === 'amount'
                      ? 'Corriger le montant'
                      : 'Refuser la demande'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
