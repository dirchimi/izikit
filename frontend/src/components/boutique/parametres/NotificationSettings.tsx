'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60';

/** Types d'alertes proposés à l'activation/désactivation. */
const ALERT_TYPES = [
  'LOW_STOCK',
  'EXPIRY_SOON',
  'RECEIVABLE_OVERDUE',
  'SALE_MADE',
  'BIG_EXPENSE',
] as const;
type AlertType = (typeof ALERT_TYPES)[number];

interface ChannelPref {
  email?: boolean;
  inApp?: boolean;
}
type PrefsMap = Record<string, ChannelPref>;

/**
 * Section Paramètres → « Notifications » : règle les 2 seuils (sur la boutique)
 * + active/désactive chaque type d'alerte (préférences in-app du patron).
 * Un seul bouton enregistre les deux côtés.
 */
export default function NotificationSettings({
  initialOverdueDays,
  initialBigExpense,
  initialExpiryAlertDays,
  onSavedThresholds,
}: {
  initialOverdueDays: number;
  initialBigExpense: number;
  initialExpiryAlertDays: number;
  onSavedThresholds: () => Promise<void> | void;
}) {
  const t = useT();
  const { toast } = useToast();

  const [overdueDays, setOverdueDays] = useState(String(initialOverdueDays));
  const [bigExpense, setBigExpense] = useState(String(initialBigExpense));
  const [expiryDays, setExpiryDays] = useState(String(initialExpiryAlertDays));
  // Activé par défaut (opt-out) : true tant que la préférence n'a pas été coupée.
  const [enabled, setEnabled] = useState<Record<AlertType, boolean>>({
    LOW_STOCK: true,
    EXPIRY_SOON: true,
    RECEIVABLE_OVERDUE: true,
    SALE_MADE: true,
    BIG_EXPENSE: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await api<{ prefs: PrefsMap }>('/api/notifications/prefs');
        if (!alive) return;
        setEnabled((prev) => {
          const next = { ...prev };
          for (const type of ALERT_TYPES) {
            next[type] = res.prefs[type]?.inApp !== false; // absent ⇒ activé
          }
          return next;
        });
      } catch {
        // garde les valeurs par défaut (tout activé) si la lecture échoue.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const days = Math.max(1, Math.min(365, Number.parseInt(overdueDays, 10) || 30));
      const big = Math.max(0, Number.parseInt(bigExpense, 10) || 0);
      const expiry = Math.max(1, Math.min(365, Number.parseInt(expiryDays, 10) || 30));

      await api('/api/org/current', {
        method: 'PATCH',
        body: { overdueDays: days, bigExpenseThreshold: big, expiryAlertDays: expiry },
      });

      const prefs: PrefsMap = {};
      for (const type of ALERT_TYPES) prefs[type] = { inApp: enabled[type] };
      await api('/api/notifications/prefs', { method: 'PATCH', body: { prefs } });

      setOverdueDays(String(days));
      setBigExpense(String(big));
      setExpiryDays(String(expiry));
      await onSavedThresholds();
      toast(t('parametres.notif.saved'), 'success');
    } catch {
      toast('Échec.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border-border rounded-lg border">
      <div className="border-border border-b px-5 py-4 md:px-6">
        <h2 className="font-headings text-foreground text-base font-bold">
          {t('parametres.notif.title')}
        </h2>
        <p className="text-muted-foreground font-body mt-0.5 text-xs">
          {t('parametres.notif.subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-5 px-5 py-5 md:px-6">
        {/* Seuils */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="notif-overdue">
              {t('parametres.notif.overdueDays')}
            </label>
            <input
              id="notif-overdue"
              type="number"
              min={1}
              max={365}
              value={overdueDays}
              onChange={(e) => setOverdueDays(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="notif-bigexpense">
              {t('parametres.notif.bigExpense')}
            </label>
            <input
              id="notif-bigexpense"
              type="number"
              min={0}
              step={1000}
              value={bigExpense}
              onChange={(e) => setBigExpense(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="notif-expiry">
              {t('parametres.notif.expiryDays')}
            </label>
            <input
              id="notif-expiry"
              type="number"
              min={1}
              max={365}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Interrupteurs par type */}
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{t('parametres.notif.types')}</span>
          <div className="border-border divide-border divide-y rounded-md border">
            {ALERT_TYPES.map((type) => (
              <label
                key={type}
                htmlFor={`notif-toggle-${type}`}
                className="flex cursor-pointer items-center justify-between px-3 py-2.5"
              >
                <span className="font-body text-foreground text-sm">
                  {t(`parametres.notif.type.${type}`)}
                </span>
                <input
                  id={`notif-toggle-${type}`}
                  type="checkbox"
                  checked={enabled[type]}
                  onChange={(e) => setEnabled((prev) => ({ ...prev, [type]: e.target.checked }))}
                  className="accent-primary h-5 w-5"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <Icon i="save" size={14} />
            {t('common.save')}
          </button>
        </div>
      </div>
    </form>
  );
}
