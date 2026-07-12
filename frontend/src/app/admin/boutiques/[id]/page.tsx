'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { formatFCFA } from '@/lib/boutique/format';
import { waLink } from '@/lib/wa';
import { AdminHeader, Badge, Panel, StatCard } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';

interface BoutiqueDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  internal: boolean;
  adminNote: string | null;
  owner: { id: string; name: string | null; email: string };
  settings: {
    phone: string | null;
    city: string | null;
    address: string | null;
    country: string;
    currency: string;
    businessType: string | null;
  } | null;
  subscription: {
    plan: string | null;
    status: 'ACTIVE' | 'TRIAL' | 'EXPIRED';
    daysLeft: number;
    activeUntil: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  stats: {
    collected: number;
    salesTotal: number;
    salesCount: number;
    receivablesOpen: number;
    sellers: number;
    products: number;
  };
  members: Array<{
    id: string;
    role: string;
    userId: string;
    userName: string | null;
    userEmail: string;
    joinedAt: string;
  }>;
  payments: Array<{
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
  }>;
  recentSales: Array<{
    id: string;
    number: string;
    total: number;
    method: string;
    status: 'ACTIVE' | 'CANCELLED';
    createdAt: string;
  }>;
}

const fcfa = (n: number) => `${formatFCFA(n)} FCFA`;

const SUB_TONE: Record<string, string> = { ACTIVE: 'green', TRIAL: 'amber', EXPIRED: 'red' };
const SUB_LABEL: Record<string, string> = { ACTIVE: 'Abonné', TRIAL: 'Essai', EXPIRED: 'Expiré' };
const PLAN_LABEL: Record<string, string> = {
  PREMIUM: 'Premium',
  SOLO: 'Solo',
  BOUTIQUE: 'Boutique',
};
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE: 'Mobile money',
  CREDIT: 'Crédit',
  MIXED: 'Mixte',
};
const ROLE_LABEL: Record<string, string> = { OWNER: 'Patron', ADMIN: 'Gérant', MEMBER: 'Vendeur' };
const ROLE_TONE: Record<string, string> = { OWNER: 'purple', ADMIN: 'blue', MEMBER: 'neutral' };
const PAY_TONE: Record<string, string> = { CONFIRMED: 'green', PENDING: 'amber', REJECTED: 'red' };
const PAY_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmé',
  PENDING: 'En attente',
  REJECTED: 'Refusé',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

// Ligne clé/valeur de la fiche d'identité.
function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon i={icon} size={16} className="text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-muted-foreground font-body text-xs">{label}</p>
        <div className="font-body text-foreground text-sm">{children}</div>
      </div>
    </div>
  );
}

export default function AdminBoutiqueDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { toast } = useToast();
  const admin = useAdmin();
  const { data, loading, error, refresh } = useApi<{ boutique: BoutiqueDetail }>(
    `/api/admin/boutiques/${id}`,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeName, setWipeName] = useState('');
  const [wiping, setWiping] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [grantDays, setGrantDays] = useState(30);
  const [granting, setGranting] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [note, setNote] = useState('');
  const [noteSeeded, setNoteSeeded] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Amorce le champ note avec la valeur serveur au premier chargement (sans
  // écraser une saisie en cours lors des rafraîchissements suivants).
  useEffect(() => {
    if (data && !noteSeeded) {
      setNote(data.boutique.adminNote ?? '');
      setNoteSeeded(true);
    }
  }, [data, noteSeeded]);

  async function saveNote() {
    setSavingNote(true);
    try {
      await api(`/api/admin/boutiques/${id}/note`, { method: 'PUT', body: { note } });
      toast('Note enregistrée.', 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleInternal(next: boolean) {
    setBusy(true);
    try {
      await api(`/api/admin/boutiques/${id}`, { method: 'PATCH', body: { internal: next } });
      toast(next ? 'Boutique marquée comme interne.' : 'Marquage interne retiré.', 'success');
      setConfirming(false);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function wipeData() {
    setWiping(true);
    try {
      await api(`/api/admin/boutiques/${id}/wipe-data`, {
        method: 'POST',
        body: { confirmName: wipeName.trim() },
      });
      toast('Données de la boutique vidées.', 'success');
      setWipeOpen(false);
      setWipeName('');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setWiping(false);
    }
  }

  async function sendReminder() {
    setReminding(true);
    try {
      const res = await api<{ emailed: boolean }>(`/api/admin/boutiques/${id}/remind`, {
        method: 'POST',
        body: {},
      });
      toast(
        res.emailed ? 'Rappel envoyé (notification + email).' : 'Rappel envoyé (notification).',
        'success',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setReminding(false);
    }
  }

  async function grantAccess(days: number) {
    if (days < 1) return;
    setGranting(true);
    try {
      await api(`/api/admin/boutiques/${id}/grant-access`, { method: 'POST', body: { days } });
      toast(`Accès prolongé de ${days} jour(s).`, 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setGranting(false);
    }
  }

  async function deleteBoutique() {
    setDeleting(true);
    try {
      const res = await api<{ deletedUsers: number }>(`/api/admin/boutiques/${id}/delete`, {
        method: 'POST',
        body: { confirmName: deleteName.trim() },
      });
      toast(`Boutique supprimée. ${res.deletedUsers} compte(s) supprimé(s).`, 'success');
      router.push('/admin/boutiques');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <>
        <AdminHeader title="Boutique" subtitle="Fiche détail" />
        <p role="alert" className="text-danger font-body text-sm">
          {error === 'Boutique introuvable' ? 'Cette boutique est introuvable.' : error}
        </p>
        <Link href="/admin/boutiques" className="text-primary font-body mt-3 inline-block text-sm">
          ← Retour aux boutiques
        </Link>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AdminHeader title="Boutique" subtitle="Fiche détail" />
        <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
          {loading ? 'Chargement…' : 'Aucune donnée.'}
        </div>
      </>
    );
  }

  const b = data.boutique;
  const sub = b.subscription;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/boutiques"
          className="text-muted-foreground font-body mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <Icon i="arrow-left" size={14} /> Boutiques
        </Link>
        <AdminHeader title={b.name} subtitle={`Inscrite le ${fmtDate(b.createdAt)}`}>
          {b.internal ? <Badge tone="purple">Interne</Badge> : null}
          <Badge tone={SUB_TONE[sub.status] ?? 'neutral'}>
            {SUB_LABEL[sub.status] ?? sub.status}
          </Badge>
          {sub.plan ? <Badge tone="neutral">{PLAN_LABEL[sub.plan] ?? sub.plan}</Badge> : null}
        </AdminHeader>
      </div>

      {/* Identité + statut d'abonnement */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Identité">
          <div className="divide-border divide-y">
            <InfoRow icon="user" label="Patron">
              {b.owner.name ?? '—'}
              <span className="text-muted-foreground"> · {b.owner.email}</span>
            </InfoRow>
            <InfoRow icon="phone" label="Téléphone">
              {b.settings?.phone ? (
                <span className="flex flex-wrap items-center gap-2">
                  <a href={`tel:${b.settings.phone}`} className="hover:underline">
                    {b.settings.phone}
                  </a>
                  {waLink(b.settings.phone) && (
                    <a
                      href={waLink(b.settings.phone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    >
                      <Icon i="message-circle" size={12} /> WhatsApp
                    </a>
                  )}
                </span>
              ) : (
                '—'
              )}
            </InfoRow>
            <InfoRow icon="map-pin" label="Ville / adresse">
              {b.settings?.city ?? '—'}
              {b.settings?.address ? (
                <span className="text-muted-foreground"> · {b.settings.address}</span>
              ) : null}
            </InfoRow>
            <InfoRow icon="tag" label="Type de commerce">
              {b.settings?.businessType ?? '—'}
            </InfoRow>
          </div>
        </Panel>

        <Panel
          title="Abonnement"
          action={
            admin.role === 'SUPERADMIN' ? (
              <button
                type="button"
                onClick={() => void sendReminder()}
                disabled={reminding}
                className="text-primary font-body inline-flex items-center gap-1 text-xs font-semibold hover:underline disabled:opacity-50"
              >
                <Icon i="bell" size={13} /> {reminding ? 'Envoi…' : 'Envoyer un rappel'}
              </button>
            ) : undefined
          }
        >
          <div className="divide-border divide-y">
            <InfoRow icon="badge-check" label="Statut">
              <Badge tone={SUB_TONE[sub.status] ?? 'neutral'}>
                {SUB_LABEL[sub.status] ?? sub.status}
              </Badge>
              {sub.status !== 'EXPIRED' ? (
                <span className="text-muted-foreground"> · {sub.daysLeft} j restants</span>
              ) : null}
            </InfoRow>
            <InfoRow icon="calendar" label="Accès valable jusqu'au">
              {sub.activeUntil ? fmtDate(sub.activeUntil) : '—'}
            </InfoRow>
            <InfoRow icon="gift" label="Fin d'essai">
              {sub.trialEndsAt ? fmtDate(sub.trialEndsAt) : '—'}
            </InfoRow>
            <InfoRow icon="credit-card" label="Fin d'abonnement payé">
              {sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : '—'}
            </InfoRow>
            <InfoRow icon="receipt" label="Dernière vente">
              {b.recentSales[0] ? fmtDate(b.recentSales[0].createdAt) : 'Aucune vente'}
            </InfoRow>
          </div>
        </Panel>
      </div>

      {/* Notes internes (mini-CRM) — SUPERADMIN uniquement */}
      {admin.role === 'SUPERADMIN' && (
        <Panel title="Notes internes">
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-muted-foreground font-body text-xs">
              Suivi commercial, contexte, historique d’échanges. Visible uniquement par les
              super-admins — jamais par le patron ni les vendeurs.
            </p>
            <textarea
              rows={4}
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : Client rencontré au marché central. Rappeler après le 15 pour le renouvellement."
              className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground font-body text-xs">{note.length}/4000</span>
              <button
                type="button"
                onClick={() => void saveNote()}
                disabled={savingNote || note.trim() === (b.adminNote ?? '').trim()}
                className="bg-primary text-primary-foreground font-body inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold transition active:scale-95 disabled:opacity-50"
              >
                <Icon i="save" size={15} /> {savingNote ? 'Enregistrement…' : 'Enregistrer la note'}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* Compte interne / offert — SUPERADMIN uniquement */}
      {admin.role === 'SUPERADMIN' && (
        <div className="bg-surface border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-body text-foreground text-sm font-semibold">
              Compte interne / offert
            </p>
            <p className="text-muted-foreground font-body text-xs">
              {b.internal
                ? 'Accès gratuit permanent · exclue de toutes les statistiques.'
                : 'Test, associé ou compte offert : accès gratuit, exclue des stats. Ses paiements d’abonnement seront supprimés.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (b.internal ? void toggleInternal(false) : setConfirming(true))}
            disabled={busy}
            className={`font-body shrink-0 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              b.internal
                ? 'border-border bg-surface text-foreground border'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {b.internal ? 'Retirer le marquage' : 'Marquer comme interne'}
          </button>
        </div>
      )}

      {/* Prolonger l'accès (gratuit) — SUPERADMIN uniquement */}
      {admin.role === 'SUPERADMIN' && (
        <div className="bg-surface border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-body text-foreground text-sm font-semibold">
              Prolonger l’accès (gratuit)
            </p>
            <p className="text-muted-foreground font-body text-xs">
              Ajoute des jours d’accès sans encaissement (geste commercial, cash reçu en main). Ne
              compte pas dans le chiffre d’affaires.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[15, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => void grantAccess(d)}
                disabled={granting}
                className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                +{d} j
              </button>
            ))}
            <span className="text-border">|</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={grantDays}
              onChange={(e) => setGrantDays(Math.max(1, Number(e.target.value) || 0))}
              className="border-border bg-input text-foreground font-body w-20 rounded-md border px-2 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void grantAccess(grantDays)}
              disabled={granting}
              className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {granting ? '…' : 'Prolonger'}
            </button>
          </div>
        </div>
      )}

      {/* Agrégats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Encaissé" value={fcfa(b.stats.collected)} icon="wallet" accent />
        <StatCard label="Chiffre d'affaires" value={fcfa(b.stats.salesTotal)} icon="receipt" />
        <StatCard label="Ventes" value={String(b.stats.salesCount)} icon="shopping-bag" />
        <StatCard
          label="Créances ouvertes"
          value={fcfa(b.stats.receivablesOpen)}
          icon="notebook-pen"
        />
        <StatCard label="Vendeurs" value={String(b.stats.sellers)} icon="users" />
        <StatCard label="Produits" value={String(b.stats.products)} icon="package" />
      </div>

      {/* Équipe */}
      <Panel title={`Équipe (${b.members.length})`}>
        {b.members.length === 0 ? (
          <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
            Aucun membre.
          </p>
        ) : (
          b.members.map((m) => (
            <div
              key={m.id}
              className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="font-body text-foreground truncate text-sm font-medium">
                  {m.userName ?? '—'}
                </p>
                <p className="text-muted-foreground font-body text-xs">{m.userEmail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={ROLE_TONE[m.role] ?? 'neutral'}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                <span className="text-muted-foreground font-body text-xs">
                  {fmtDate(m.joinedAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </Panel>

      {/* Historique paiements + dernières ventes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Historique des abonnements">
          {b.payments.length === 0 ? (
            <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
              Aucun paiement.
            </p>
          ) : (
            b.payments.map((p) => (
              <div
                key={p.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground text-sm font-medium">
                    {PLAN_LABEL[p.plan] ?? p.plan} · {p.months} mois
                  </p>
                  <p className="text-muted-foreground font-body text-xs">
                    {METHOD_LABEL[p.method] ?? p.method} · {fmtDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-headings text-foreground text-sm font-bold">
                    {fcfa(p.amount)}
                  </span>
                  <Badge tone={PAY_TONE[p.status] ?? 'neutral'}>
                    {PAY_LABEL[p.status] ?? p.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Dernières ventes">
          {b.recentSales.length === 0 ? (
            <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
              Aucune vente.
            </p>
          ) : (
            b.recentSales.map((v) => (
              <div
                key={v.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground text-sm font-medium">
                    N° {v.number}
                    {v.status === 'CANCELLED' ? (
                      <span className="text-danger"> · annulée</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground font-body text-xs">
                    {METHOD_LABEL[v.method] ?? v.method} · {fmtDate(v.createdAt)}
                  </p>
                </div>
                <span
                  className={`font-headings shrink-0 text-sm font-bold ${
                    v.status === 'CANCELLED'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {fcfa(v.total)}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* Zone de danger — SUPERADMIN uniquement */}
      {admin.role === 'SUPERADMIN' && (
        <div className="border-danger/40 bg-danger/5 flex flex-col gap-4 rounded-lg border p-4">
          <p className="text-danger font-body text-sm font-semibold">Zone de danger</p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground font-body min-w-0 text-xs">
              <span className="text-foreground font-semibold">Vider les données</span> — efface
              produits, ventes, clients, créances, dettes, dépenses, documents. La boutique,
              l’équipe et l’abonnement sont conservés.
            </p>
            <button
              type="button"
              onClick={() => setWipeOpen(true)}
              disabled={wiping}
              className="border-danger text-danger hover:bg-danger/10 font-body shrink-0 rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Vider les données
            </button>
          </div>

          <div className="border-danger/20 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground font-body min-w-0 text-xs">
              <span className="text-foreground font-semibold">Supprimer complètement</span> — la
              boutique <em>et</em> les comptes (patron + vendeurs orphelins) disparaissent, les
              emails redeviennent libres. Pour retirer un compte de test ou abandonné.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
              className="bg-danger font-body shrink-0 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Supprimer complètement
            </button>
          </div>
        </div>
      )}

      {/* Confirmation du marquage interne (destructif : supprime les paiements) */}
      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title="Marquer comme interne"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground font-body text-sm">
            <span className="text-foreground font-semibold">{b.name}</span> deviendra un compte
            interne : accès gratuit permanent, exclue de toutes les statistiques, et ses paiements
            d’abonnement seront <span className="text-danger font-semibold">supprimés</span>. À
            réserver aux comptes test, associés ou offerts.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void toggleInternal(true)}
              disabled={busy}
              className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Traitement…' : 'Marquer comme interne'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation du vidage des données (irréversible) — saisie du nom exigée */}
      <Modal
        open={wipeOpen}
        onClose={() => (wiping ? undefined : (setWipeOpen(false), setWipeName('')))}
        title="Vider les données de la boutique"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground font-body text-sm">
            Toutes les données de <span className="text-foreground font-semibold">{b.name}</span>{' '}
            seront <span className="text-danger font-semibold">définitivement supprimées</span>{' '}
            (produits, ventes, clients, créances, dettes, dépenses, documents). La boutique,
            l’équipe et l’abonnement restent en place. Cette action est irréversible.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="wipe-name" className="font-body text-foreground text-xs font-semibold">
              Pour confirmer, tape le nom exact : <span className="text-foreground">{b.name}</span>
            </label>
            <input
              id="wipe-name"
              type="text"
              value={wipeName}
              onChange={(e) => setWipeName(e.target.value)}
              placeholder={b.name}
              autoComplete="off"
              className="border-border bg-input text-foreground font-body focus:border-danger rounded-md border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => (setWipeOpen(false), setWipeName(''))}
              disabled={wiping}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void wipeData()}
              disabled={wiping || wipeName.trim() !== b.name.trim()}
              className="bg-danger font-body rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {wiping ? 'Suppression…' : 'Vider définitivement'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation de la suppression complète (boutique + comptes) */}
      <Modal
        open={deleteOpen}
        onClose={() => (deleting ? undefined : (setDeleteOpen(false), setDeleteName('')))}
        title="Supprimer complètement la boutique"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground font-body text-sm">
            <span className="text-foreground font-semibold">{b.name}</span> et toutes ses données
            seront <span className="text-danger font-semibold">définitivement supprimées</span>. Le
            compte du patron et des vendeurs (s’ils n’ont pas d’autre boutique) seront aussi
            supprimés — leurs emails redeviendront libres. Cette action est irréversible.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="del-name" className="font-body text-foreground text-xs font-semibold">
              Pour confirmer, tape le nom exact : <span className="text-foreground">{b.name}</span>
            </label>
            <input
              id="del-name"
              type="text"
              value={deleteName}
              onChange={(e) => setDeleteName(e.target.value)}
              placeholder={b.name}
              autoComplete="off"
              className="border-border bg-input text-foreground font-body focus:border-danger rounded-md border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => (setDeleteOpen(false), setDeleteName(''))}
              disabled={deleting}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void deleteBoutique()}
              disabled={deleting || deleteName.trim() !== b.name.trim()}
              className="bg-danger font-body rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
