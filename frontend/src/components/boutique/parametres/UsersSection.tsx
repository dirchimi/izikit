'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';

export interface OrgMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string; // OWNER | ADMIN | MEMBER
}

const ROLE_LABEL_KEY: Record<string, string> = {
  OWNER: 'role.patron',
  ADMIN: 'role.gerant',
  MEMBER: 'role.vendeur',
};

/**
 * Carte « Utilisateurs » — branchée sur /api/org/members.
 * Lecture toujours visible ; ajout / changement de rôle / retrait réservés aux
 * gérants (canManage). Le garde « dernier propriétaire » est côté serveur.
 */
export default function UsersSection({
  members,
  currentUserId,
  canManage,
  onChanged,
}: {
  members: OrgMember[];
  currentUserId: string;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const t = useT();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [busy, setBusy] = useState(false);

  function errMessage(e: unknown): string {
    const code = e instanceof ApiError ? e.code : '';
    if (code === 'USER_NOT_REGISTERED') return t('parametres.users.errNotRegistered');
    if (code === 'ALREADY_MEMBER') return t('parametres.users.errAlready');
    if (code === 'LAST_OWNER') return t('parametres.users.errLastOwner');
    return e instanceof Error ? e.message : 'Error';
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/org/members', {
        method: 'POST',
        body: { email: email.trim(), role: newRole },
      });
      toast(t('parametres.users.added'), 'success');
      setEmail('');
      setAdding(false);
      await onChanged();
    } catch (err) {
      toast(errMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRole(m: OrgMember, role: 'MEMBER' | 'ADMIN') {
    setBusy(true);
    try {
      await api(`/api/org/members/${m.id}`, { method: 'PATCH', body: { role } });
      toast(t('parametres.users.roleUpdated'), 'success');
      await onChanged();
    } catch (err) {
      toast(errMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(m: OrgMember) {
    setBusy(true);
    try {
      await api(`/api/org/members/${m.id}`, { method: 'DELETE' });
      toast(t('parametres.users.removed'), 'success');
      await onChanged();
    } catch (err) {
      toast(errMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface border-border rounded-lg border">
      <div className="border-border flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('parametres.users.title')}
          </h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {t('parametres.users.subtitle')}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="border-border bg-surface text-foreground font-body flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
          >
            <Icon i="user-plus" size={13} />
            {t('parametres.users.add')}
          </button>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {canManage && adding && (
        <form
          onSubmit={handleAdd}
          className="border-border flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-end md:px-6"
        >
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-foreground font-body text-xs font-semibold" htmlFor="add-email">
              {t('parametres.users.email')}
            </label>
            <input
              id="add-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
            />
          </div>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'MEMBER' | 'ADMIN')}
            className="border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none"
          >
            <option value="MEMBER">{t('role.vendeur')}</option>
            <option value="ADMIN">{t('role.gerant')}</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {t('parametres.users.submit')}
          </button>
        </form>
      )}

      <div className="flex flex-col">
        {members.map((m) => {
          const you = m.userId === currentUserId;
          const isOwner = m.role === 'OWNER';
          const editable = canManage && !you && !isOwner;
          return (
            <div
              key={m.id}
              className="border-border flex items-center gap-4 border-b px-5 py-4 last:border-b-0 md:px-6"
            >
              <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                <Icon i="user" size={16} className="text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-foreground truncate text-sm font-semibold">
                    {m.name ?? m.email}
                  </span>
                  {you && (
                    <span className="text-muted-foreground bg-muted font-body shrink-0 rounded-sm px-1.5 py-0.5 text-xs">
                      {t('parametres.you')}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground font-body text-xs break-all">{m.email}</span>
              </div>

              {editable ? (
                <select
                  value={m.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'}
                  disabled={busy}
                  onChange={(e) => handleRole(m, e.target.value as 'MEMBER' | 'ADMIN')}
                  className="border-border bg-input text-foreground font-body shrink-0 rounded-md border px-2 py-1 text-xs outline-none disabled:opacity-60"
                >
                  <option value="MEMBER">{t('role.vendeur')}</option>
                  <option value="ADMIN">{t('role.gerant')}</option>
                </select>
              ) : (
                <span
                  className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${
                    isOwner
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t(ROLE_LABEL_KEY[m.role] ?? 'role.vendeur')}
                </span>
              )}

              {canManage && !you && !isOwner && (
                <button
                  type="button"
                  aria-label={`${t('parametres.users.remove')} ${m.name ?? m.email}`}
                  disabled={busy}
                  onClick={() => handleRemove(m)}
                  className="text-muted-foreground hover:text-danger ms-1 shrink-0 disabled:opacity-60"
                >
                  <Icon i="trash-2" size={14} />
                </button>
              )}
            </div>
          );
        })}

        {members.length <= 1 && (
          <p className="text-muted-foreground font-body px-5 py-4 text-xs md:px-6">
            {t('parametres.users.empty')}
          </p>
        )}
      </div>
    </div>
  );
}
