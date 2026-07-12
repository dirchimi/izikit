'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { AdminHeader, Panel, SuccessCheck } from '@/components/admin/ui';
import Icon from '@/components/ui/Icon';

type Level = 'INFO' | 'WARNING' | 'SUCCESS';

interface BannerState {
  message: string;
  level: Level;
  active: boolean;
}

const LEVELS: Array<{ value: Level; label: string; icon: string }> = [
  { value: 'INFO', label: 'Info', icon: 'info' },
  { value: 'WARNING', label: 'Avertissement', icon: 'triangle-alert' },
  { value: 'SUCCESS', label: 'Bonne nouvelle', icon: 'party-popper' },
];

// Couleurs du bandeau selon le niveau (mêmes tokens que l'affichage boutique).
const LEVEL_TONE: Record<Level, string> = {
  INFO: 'bg-primary/10 text-primary border-primary/30',
  WARNING: 'bg-warning/10 text-warning border-warning/30',
  SUCCESS: 'bg-success/10 text-success border-success/30',
};

export default function AdminBannerPage() {
  const { toast } = useToast();
  const admin = useAdmin();
  const isSuper = admin.role === 'SUPERADMIN';

  const [state, setState] = useState<BannerState>({ message: '', level: 'INFO', active: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!isSuper) return;
    void (async () => {
      try {
        const res = await api<{ banner: BannerState | null }>('/api/admin/banner');
        if (res.banner) setState(res.banner);
      } catch {
        // pas de bannière encore : on garde les valeurs par défaut
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuper]);

  async function save(active: boolean) {
    setSaving(true);
    try {
      await api('/api/admin/banner', {
        method: 'PUT',
        body: { message: state.message.trim(), level: state.level, active },
      });
      setState((s) => ({ ...s, active }));
      setCelebrate(true);
      setTimeout(() => {
        setCelebrate(false);
        toast(active ? 'Bannière activée 🎉' : 'Bannière désactivée', 'success');
      }, 1000);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!isSuper) {
    return (
      <>
        <AdminHeader title="Bannière" subtitle="Message global affiché aux boutiques" />
        <p className="text-muted-foreground font-body text-sm">Réservé aux super-admins.</p>
      </>
    );
  }

  const canActivate = state.message.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader
        title="Bannière d’info globale"
        subtitle="Un bandeau affiché en haut de l’app à tous les patrons et vendeurs"
      />

      <Panel title="Message">
        <div className="flex flex-col gap-4 px-4 py-5">
          {celebrate ? (
            <SuccessCheck label={state.active ? 'Bannière activée' : 'Bannière désactivée'} />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bnr-msg"
                  className="font-body text-foreground text-xs font-semibold"
                >
                  Texte du bandeau
                </label>
                <textarea
                  id="bnr-msg"
                  rows={3}
                  maxLength={280}
                  value={state.message}
                  disabled={loading}
                  onChange={(e) => setState((s) => ({ ...s, message: e.target.value }))}
                  placeholder="Ex : Maintenance prévue dimanche de 22h à 23h."
                  className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
                />
                <span className="text-muted-foreground font-body text-xs">
                  {state.message.length}/280
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-body text-foreground text-xs font-semibold">Niveau</span>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setState((s) => ({ ...s, level: l.value }))}
                      className={`font-body inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
                        state.level === l.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-surface text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon i={l.icon} size={15} /> {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aperçu tel qu'il apparaîtra dans l'app boutique */}
              <div className="flex flex-col gap-1">
                <span className="font-body text-muted-foreground text-xs font-semibold uppercase">
                  Aperçu
                </span>
                <div
                  className={`font-body flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${LEVEL_TONE[state.level]}`}
                >
                  <Icon i={LEVELS.find((l) => l.value === state.level)?.icon ?? 'info'} size={16} />
                  <span>{state.message.trim() || 'Votre message apparaîtra ici…'}</span>
                </div>
              </div>

              <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <span className="font-body text-sm">
                  {state.active ? (
                    <span className="text-success inline-flex items-center gap-1.5 font-semibold">
                      <Icon i="circle-check" size={16} /> Bannière visible actuellement
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Bannière masquée</span>
                  )}
                </span>
                <div className="flex gap-2">
                  {state.active && (
                    <button
                      type="button"
                      onClick={() => void save(false)}
                      disabled={saving || loading}
                      className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
                    >
                      Masquer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void save(true)}
                    disabled={saving || loading || !canActivate}
                    className="bg-primary text-primary-foreground font-body rounded-md px-5 py-2.5 text-sm font-bold transition active:scale-95 disabled:opacity-50"
                  >
                    {saving
                      ? 'Enregistrement…'
                      : state.active
                        ? 'Mettre à jour'
                        : 'Afficher à tous'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
