'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { AdminHeader, Badge } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { formatFCFA } from '@/lib/boutique/format';

interface DiscountCode {
  id: string;
  code: string;
  type: 'PERCENT' | 'AMOUNT' | string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

function fmtValue(c: DiscountCode): string {
  return c.type === 'PERCENT' ? `−${c.value} %` : `−${formatFCFA(c.value)} FCFA`;
}

function fmtUses(c: DiscountCode): string {
  return c.maxUses === null ? `${c.usedCount} / illimité` : `${c.usedCount} / ${c.maxUses}`;
}

// Un code est « épuisé/expiré » (inopérant) même s'il est encore actif.
function isExpired(c: DiscountCode): boolean {
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()) return true;
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return true;
  return false;
}

export default function AdminDiscountCodesPage() {
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<{ codes: DiscountCode[] }>(
    '/api/admin/discount-codes',
  );
  const codes = data?.codes ?? [];

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Champs du formulaire de création.
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('AMOUNT');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  function resetForm() {
    setCode('');
    setType('AMOUNT');
    setValue('');
    setMaxUses('');
    setExpiresAt('');
  }

  async function create() {
    const numValue = Number(value);
    if (!code.trim() || !Number.isFinite(numValue) || numValue <= 0) {
      toast('Renseignez un code et une valeur valide.', 'error');
      return;
    }
    if (type === 'PERCENT' && numValue > 100) {
      toast('Un pourcentage ne peut pas dépasser 100.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/api/admin/discount-codes', {
        method: 'POST',
        body: {
          code: code.trim(),
          type,
          value: Math.trunc(numValue),
          maxUses: maxUses.trim() ? Math.trunc(Number(maxUses)) : null,
          // L'input date donne un jour ; on borne à la fin de journée locale.
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        },
      });
      toast('Code créé.', 'success');
      setOpen(false);
      resetForm();
      await refresh();
    } catch (err) {
      const c = err instanceof ApiError ? err.code : '';
      toast(
        c === 'DISCOUNT_CODE_EXISTS'
          ? 'Ce code existe déjà.'
          : err instanceof ApiError
            ? err.message
            : 'Échec de la création.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: DiscountCode) {
    setTogglingId(c.id);
    try {
      await api(`/api/admin/discount-codes/${c.id}`, {
        method: 'PATCH',
        body: { active: !c.active },
      });
      toast(c.active ? 'Code désactivé.' : 'Code réactivé.', 'success');
      await refresh();
    } catch {
      toast('Échec.', 'error');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Codes promo" subtitle="Réductions sur l'abonnement">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-primary text-primary-foreground font-body inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
        >
          <Icon i="plus" size={15} /> Nouveau code
        </button>
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
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Réduction</th>
              <th className="px-4 py-3 text-center">Usages</th>
              <th className="px-4 py-3">Expiration</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                <td className="text-foreground font-body px-4 py-3 font-mono font-semibold">
                  {c.code}
                </td>
                <td className="text-foreground font-body px-4 py-3 font-semibold">{fmtValue(c)}</td>
                <td className="text-muted-foreground font-body px-4 py-3 text-center">
                  {fmtUses(c)}
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {c.expiresAt ? fmtDate(c.expiresAt) : '—'}
                </td>
                <td className="px-4 py-3">
                  {!c.active ? (
                    <Badge tone="neutral">Désactivé</Badge>
                  ) : isExpired(c) ? (
                    <Badge tone="red">Épuisé</Badge>
                  ) : (
                    <Badge tone="green">Actif</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  <button
                    type="button"
                    onClick={() => void toggle(c)}
                    disabled={togglingId === c.id}
                    className={`font-body text-xs font-semibold disabled:opacity-50 ${
                      c.active ? 'text-danger' : 'text-success'
                    }`}
                  >
                    {c.active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && codes.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucun code. Créez-en un pour offrir une réduction.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title="Nouveau code promo"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-foreground font-body text-sm font-medium">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex. LANCEMENT"
              className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 font-mono text-sm outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-sm font-medium">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'PERCENT' | 'AMOUNT')}
                className="border-border bg-input text-foreground rounded-md border px-3 py-2 text-sm outline-none"
              >
                <option value="AMOUNT">Montant (FCFA)</option>
                <option value="PERCENT">Pourcentage (%)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-sm font-medium">
                {type === 'PERCENT' ? 'Pourcentage' : 'Montant'}
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder={type === 'PERCENT' ? 'Ex. 20' : 'Ex. 100000'}
                className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-sm font-medium">
                Usages max <span className="text-muted-foreground">(optionnel)</span>
              </span>
              <input
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="Illimité"
                className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-foreground font-body text-sm font-medium">
                Expire le <span className="text-muted-foreground">(optionnel)</span>
              </span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="border-border bg-input text-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy}
              className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Création…' : 'Créer le code'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
