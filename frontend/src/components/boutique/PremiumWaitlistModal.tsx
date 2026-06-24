'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';

const FEATURES = [
  { icon: 'store', key: 'premium.feat.multi' },
  { icon: 'cloud', key: 'premium.feat.backup' },
  { icon: 'chart-no-axes-combined', key: 'premium.feat.reports' },
  { icon: 'headset', key: 'premium.feat.support' },
];

export default function PremiumWaitlistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api<{ interested: boolean }>('/api/premium/waitlist')
      .then((r) => alive && setJoined(r.interested))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  async function join() {
    setBusy(true);
    try {
      await api('/api/premium/waitlist', { method: 'POST' });
      setJoined(true);
      toast(t('premium.joinedToast'), 'success');
    } catch {
      toast('Échec.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg">
          <Icon i="sparkles" size={26} />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-headings text-foreground text-xl font-bold">
            {t('premium.modal.title')}
          </h3>
          <p className="text-muted-foreground font-body text-sm">{t('premium.modal.pitch')}</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2.5">
          {FEATURES.map((f) => (
            <div
              key={f.key}
              className="border-border bg-muted/40 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start"
            >
              <span className="text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                <Icon i={f.icon} size={15} />
              </span>
              <span className="font-body text-foreground text-xs font-semibold">{t(f.key)}</span>
            </div>
          ))}
        </div>

        {joined ? (
          <div className="bg-primary/10 text-primary font-body flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
            <Icon i="check-circle-2" size={18} />
            {t('premium.joined')}
          </div>
        ) : (
          <button
            type="button"
            onClick={join}
            disabled={busy}
            className="font-body flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Icon i="bell-ring" size={16} />
            {t('premium.join')}
          </button>
        )}
        <p className="text-muted-foreground font-body text-[11px]">{t('premium.modal.note')}</p>
      </div>
    </Modal>
  );
}
