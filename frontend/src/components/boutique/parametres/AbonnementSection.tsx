'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import AsyncState from '@/components/boutique/AsyncState';
import { useApi } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import {
  PLANS,
  SUB_PERIODS,
  planPrice,
  isPlanId,
  type PlanId,
  type PaymentMethod,
  type SubStatus,
} from '@/lib/subscription/plans';

/** Nom i18n d'un plan, ou repli « aucun » si la valeur n'est pas un plan connu. */
function planNameKey(plan: string): string {
  return isPlanId(plan) ? PLANS[plan].nameKey : 'sub.noPlan';
}

interface Payment {
  id: string;
  plan: string;
  amount: number;
  method: string;
  months: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  periodEnd: string | null;
  createdAt: string;
}
interface SubResp {
  status: SubStatus;
  plan: PlanId | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  activeUntil: string | null;
  daysLeft: number;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  payments: Payment[];
}

const STATUS_TONE: Record<SubStatus, string> = {
  TRIAL: 'bg-warning/15 text-warning',
  ACTIVE: 'bg-success/15 text-success',
  EXPIRED: 'bg-danger/15 text-danger',
};
const PAYMENT_TONE: Record<string, string> = {
  PENDING: 'bg-warning/15 text-warning',
  CONFIRMED: 'bg-success/15 text-success',
  REJECTED: 'bg-danger/15 text-danger',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Paramètres → Abonnement (patron uniquement). Affiche le statut dérivé
 * (essai / actif / expiré), la date d'expiration, le plan, et permet de
 * choisir/renouveler un plan avec un mode de paiement (espèces / mobile).
 * L'encaissement est validé manuellement par un SUPERADMIN (v1).
 */
export default function AbonnementSection() {
  const t = useT();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<SubResp>('/api/subscription');

  const [choosing, setChoosing] = useState<PlanId | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [months, setMonths] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Code de réduction (facultatif) : le patron saisit un code puis « applique »
  // pour prévisualiser le prix remisé. `applied` mémorise l'aperçu validé par le
  // serveur pour la durée courante ; il est vidé si la durée change.
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{
    code: string;
    months: number;
    baseAmount: number;
    finalAmount: number;
  } | null>(null);

  const pending = data?.payments.find((p) => p.status === 'PENDING') ?? null;

  // Le code appliqué n'est valable que pour la durée sur laquelle il a été
  // prévisualisé (le prix de base change avec la durée).
  const activeDiscount = applied && applied.months === months ? applied : null;
  const displayTotal = activeDiscount
    ? activeDiscount.finalAmount
    : planPrice(choosing ?? 'PREMIUM', months);

  function resetDiscount() {
    setCode('');
    setApplied(null);
  }

  async function applyCode() {
    if (!choosing || !code.trim()) return;
    setApplying(true);
    try {
      const res = await api<{ baseAmount: number; finalAmount: number; code: string }>(
        '/api/subscription/discount/preview',
        { method: 'POST', body: { plan: choosing, months, code: code.trim() } },
      );
      setApplied({
        code: res.code,
        months,
        baseAmount: res.baseAmount,
        finalAmount: res.finalAmount,
      });
      toast(t('sub.discountApplied'), 'success');
    } catch (err) {
      setApplied(null);
      const c = err instanceof ApiError ? err.code : '';
      toast(c.startsWith('DISCOUNT_') ? t('sub.discountInvalid') : t('async.error'), 'error');
    } finally {
      setApplying(false);
    }
  }

  async function submitRequest() {
    if (!choosing) return;
    setSubmitting(true);
    try {
      const trimmed = code.trim();
      await api('/api/subscription/request', {
        method: 'POST',
        body: { plan: choosing, method, months, ...(trimmed ? { code: trimmed } : {}) },
      });
      toast(t('sub.requestSent'), 'success');
      setChoosing(null);
      resetDiscount();
      await refresh();
    } catch (err) {
      const c = err instanceof ApiError ? err.code : '';
      const msg =
        c === 'SUB_REQUEST_PENDING'
          ? t('sub.alreadyPending')
          : c.startsWith('DISCOUNT_')
            ? t('sub.discountInvalid')
            : t('async.error');
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={refresh} isEmpty={!data}>
      {data && (
        <div className="flex flex-col gap-6">
          {/* ── Carte statut ─────────────────────────────────────────── */}
          <div className="bg-surface border-border flex flex-col gap-4 rounded-lg border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon i="badge-check" size={18} className="text-primary" />
                <h3 className="font-headings text-foreground text-base font-bold">
                  {t('sub.title')}
                </h3>
              </div>
              <span
                className={`font-body rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[data.status]}`}
              >
                {t(`sub.status.${data.status.toLowerCase()}`)}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground font-body text-xs">{t('sub.currentPlan')}</p>
                <p className="font-headings text-foreground text-sm font-bold">
                  {data.plan ? t(PLANS[data.plan].nameKey) : t('sub.noPlan')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-body text-xs">
                  {data.status === 'ACTIVE' ? t('sub.renewsOn') : t('sub.expiresOn')}
                </p>
                <p className="font-headings text-foreground text-sm font-bold">
                  {fmtDate(data.activeUntil)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-body text-xs">{t('sub.daysLeft')}</p>
                <p className="font-headings text-foreground text-sm font-bold">
                  {data.status === 'EXPIRED'
                    ? t('sub.status.expired')
                    : t('sub.daysValue', { n: data.daysLeft })}
                </p>
              </div>
            </div>

            {data.status !== 'ACTIVE' && (
              <div className="bg-muted text-muted-foreground font-body flex items-start gap-2 rounded-md px-3 py-2 text-xs">
                <Icon i="info" size={14} className="mt-0.5 shrink-0" />
                <span>
                  {data.status === 'EXPIRED' ? t('sub.hint.expired') : t('sub.hint.trial')}
                </span>
              </div>
            )}
          </div>

          {/* ── Demande en attente ───────────────────────────────────── */}
          {pending && (
            <div className="border-warning/40 bg-warning/10 flex items-start gap-3 rounded-lg border p-4">
              <Icon i="clock" size={18} className="text-warning mt-0.5 shrink-0" />
              <div className="font-body text-sm">
                <p className="text-foreground font-semibold">{t('sub.pendingTitle')}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t('sub.pendingBody', {
                    plan: t(planNameKey(pending.plan)),
                    amount: `${formatFCFA(pending.amount)} ${t('common.fcfa')}`,
                    method: t(`sub.method.${pending.method.toLowerCase()}`),
                  })}
                </p>
              </div>
            </div>
          )}

          {/* ── Choix / renouvellement du plan ───────────────────────── */}
          <div className="flex flex-col gap-3">
            <h3 className="font-headings text-foreground text-sm font-bold">
              {data.status === 'ACTIVE' ? t('sub.renew') : t('sub.choosePlan')}
            </h3>
            <div className="bg-surface border-border flex flex-col gap-4 rounded-lg border p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-headings text-foreground text-base font-bold">
                    {t(PLANS.PREMIUM.nameKey)}
                  </span>
                  <p className="text-muted-foreground font-body mt-0.5 text-xs">
                    {t('sub.plan.premium.desc')}
                  </p>
                </div>
                {data.plan === 'PREMIUM' && data.status === 'ACTIVE' && (
                  <span className="bg-primary/15 text-primary font-body shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">
                    {t('sub.current')}
                  </span>
                )}
              </div>
              {/* Les 3 durées disponibles (remise croissante). */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {SUB_PERIODS.map((p) => (
                  <div
                    key={p.months}
                    className="border-border bg-background rounded-md border px-3 py-2.5 text-center"
                  >
                    <p className="text-muted-foreground font-body text-[11px] font-semibold uppercase">
                      {t(p.labelKey)}
                    </p>
                    <p className="font-headings text-foreground mt-0.5 text-sm font-bold">
                      {formatFCFA(p.price)} {t('common.fcfa')}
                    </p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setChoosing('PREMIUM');
                  setMethod('CASH');
                  setMonths(1);
                  resetDiscount();
                }}
                disabled={!!pending}
                className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {data.status === 'ACTIVE' ? t('sub.renew') : t('sub.choose')}
              </button>
            </div>
            {pending && (
              <p className="text-muted-foreground font-body text-xs">{t('sub.blockedByPending')}</p>
            )}
          </div>

          {/* ── Historique des paiements ─────────────────────────────── */}
          {data.payments.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-headings text-foreground text-sm font-bold">
                {t('sub.history')}
              </h3>
              <div className="bg-surface border-border overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-border text-muted-foreground font-body border-b text-left text-xs font-semibold uppercase">
                      <th className="px-4 py-2.5">{t('sub.col.date')}</th>
                      <th className="px-4 py-2.5">{t('sub.col.plan')}</th>
                      <th className="px-4 py-2.5 text-end">{t('common.total')}</th>
                      <th className="px-4 py-2.5">{t('sub.col.method')}</th>
                      <th className="px-4 py-2.5">{t('sub.col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} className="border-border border-b last:border-b-0">
                        <td className="text-muted-foreground font-body px-4 py-2.5">
                          {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="text-foreground font-body px-4 py-2.5">
                          {t(planNameKey(p.plan))}
                        </td>
                        <td className="text-foreground font-body px-4 py-2.5 text-end font-semibold">
                          {formatFCFA(p.amount)} {t('common.fcfa')}
                        </td>
                        <td className="text-muted-foreground font-body px-4 py-2.5">
                          {t(`sub.method.${p.method.toLowerCase()}`)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`font-body rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              PAYMENT_TONE[p.status] ?? 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {t(`sub.payment.${p.status.toLowerCase()}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modale : mode de paiement + durée ──────────────────────── */}
      <Modal
        open={choosing !== null}
        onClose={() => {
          setChoosing(null);
          resetDiscount();
        }}
        title={choosing ? t('sub.payTitle', { plan: t(PLANS[choosing].nameKey) }) : ''}
        size="sm"
      >
        {choosing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-xs font-semibold">
                {t('sub.duration')}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {SUB_PERIODS.map((p) => (
                  <button
                    key={p.months}
                    type="button"
                    onClick={() => {
                      setMonths(p.months);
                      setApplied(null);
                    }}
                    className={`font-body flex items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                      months === p.months
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <span>{t(p.labelKey)}</span>
                    <span className="font-bold">
                      {formatFCFA(p.price)} {t('common.fcfa')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-xs font-semibold">
                {t('sub.method')}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'MOBILE'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`font-body flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm ${
                      method === m
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <Icon i={m === 'CASH' ? 'banknote' : 'smartphone'} size={15} />
                    {t(`sub.method.${m.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Code de réduction (facultatif). */}
            <div className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-xs font-semibold">
                {t('sub.discountLabel')}
              </span>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setApplied(null);
                  }}
                  placeholder={t('sub.discountPlaceholder')}
                  className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary flex-1 rounded-md border px-3 py-2 font-mono text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={applyCode}
                  disabled={applying || !code.trim()}
                  className="border-border bg-surface text-foreground font-body shrink-0 rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {applying ? '…' : t('sub.discountApply')}
                </button>
              </div>
              {activeDiscount && (
                <p className="text-success font-body text-xs">
                  {t('sub.discountSaved', {
                    amount: `${formatFCFA(activeDiscount.baseAmount - activeDiscount.finalAmount)} ${t('common.fcfa')}`,
                  })}
                </p>
              )}
            </div>

            <div className="bg-muted flex items-center justify-between rounded-md px-3 py-2.5">
              <span className="text-muted-foreground font-body text-sm">{t('common.total')}</span>
              <span className="flex items-baseline gap-2">
                {activeDiscount && (
                  <span className="text-muted-foreground font-body text-xs line-through">
                    {formatFCFA(activeDiscount.baseAmount)}
                  </span>
                )}
                <span className="font-headings text-foreground text-base font-bold">
                  {formatFCFA(displayTotal)} {t('common.fcfa')}
                </span>
              </span>
            </div>

            <p className="text-muted-foreground font-body text-xs">
              {t(`sub.payHint.${method.toLowerCase()}`)}
            </p>

            <button
              type="button"
              onClick={submitRequest}
              disabled={submitting}
              className="bg-primary text-primary-foreground font-body flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <Icon
                i={submitting ? 'loader-2' : 'check'}
                size={15}
                className={submitting ? 'animate-spin' : ''}
              />
              {t('sub.confirmRequest')}
            </button>
          </div>
        )}
      </Modal>
    </AsyncState>
  );
}
