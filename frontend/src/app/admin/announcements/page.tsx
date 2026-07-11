'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { AdminHeader, Panel } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';

export default function AdminAnnouncementsPage() {
  const { toast } = useToast();
  const admin = useAdmin();
  const isSuper = admin.role === 'SUPERADMIN';

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  async function send() {
    setSending(true);
    try {
      const res = await api<{ recipients: number; sent: number }>('/api/admin/announcements', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim() },
      });
      toast(`Annonce envoyée à ${res.sent} boutique(s).`, 'success');
      setTitle('');
      setBody('');
      setConfirming(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setSending(false);
    }
  }

  if (!isSuper) {
    return (
      <>
        <AdminHeader title="Annonces" subtitle="Diffuser un message aux boutiques" />
        <p className="text-muted-foreground font-body text-sm">Réservé aux super-admins.</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Annonces" subtitle="Diffuser un message à toutes les boutiques" />

      <Panel title="Nouvelle annonce">
        <div className="flex flex-col gap-4 px-4 py-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="ann-title" className="font-body text-foreground text-xs font-semibold">
              Titre
            </label>
            <input
              id="ann-title"
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Nouvelle fonctionnalité disponible"
              className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ann-body" className="font-body text-foreground text-xs font-semibold">
              Message
            </label>
            <textarea
              id="ann-body"
              rows={5}
              maxLength={1000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ton message, visible dans la cloche de notifications de chaque patron."
              className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
            />
            <span className="text-muted-foreground font-body text-xs">{body.length}/1000</span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canSend || sending}
              className="bg-primary text-primary-foreground font-body rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              Envoyer à toutes les boutiques
            </button>
          </div>
        </div>
      </Panel>

      <Modal
        open={confirming}
        onClose={() => (sending ? undefined : setConfirming(false))}
        title="Envoyer l’annonce"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground font-body text-sm">
            L’annonce <span className="text-foreground font-semibold">{title.trim()}</span> sera
            envoyée dans la cloche de notifications de <strong>tous les patrons de boutique</strong>
            .
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={sending}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {sending ? 'Envoi…' : 'Confirmer l’envoi'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
