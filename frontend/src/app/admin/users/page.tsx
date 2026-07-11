'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { useCursorList } from '@/lib/admin/useCursorList';
import { AdminHeader, Badge, LoadMore, SearchBar } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerifiedAt: string | null;
  createdAt: string;
}

const ROLE_TONE: Record<string, string> = {
  SUPERADMIN: 'purple',
  ADMIN: 'blue',
  USER: 'neutral',
};

export default function AdminUsersPage() {
  const { toast } = useToast();
  const admin = useAdmin();
  const canRole = admin.can.includes('users:role');
  const canRestore = admin.can.includes('users:status:restore');
  const isSuper = admin.role === 'SUPERADMIN';

  const { items, setItems, hasMore, loading, error, load } =
    useCursorList<AdminUser>('/api/admin/users');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    void load(true, { q, status, role });
  }

  useEffect(() => {
    void load(true, {});
  }, [load]);

  async function changeRole(u: AdminUser, newRole: AdminUser['role']) {
    setBusyId(u.id);
    try {
      const res = await api<{ user: { id: string; role: AdminUser['role'] } }>(
        `/api/admin/users/${u.id}/role`,
        { method: 'PATCH', body: { role: newRole } },
      );
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: res.user.role } : x)));
      toast('Rôle mis à jour.', 'success');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast(code === 'LAST_SUPERADMIN' ? 'Impossible : dernier super-admin.' : 'Échec.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast('Compte supprimé.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast(
        code === 'USER_OWNS_BOUTIQUE'
          ? 'Ce compte possède une boutique. Supprimez-la d’abord.'
          : code === 'CANNOT_DELETE_STAFF'
            ? 'Impossible de supprimer un administrateur.'
            : 'Échec.',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(u: AdminUser) {
    const next = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(u.id);
    try {
      const res = await api<{ user: { id: string; status: AdminUser['status'] } }>(
        `/api/admin/users/${u.id}/status`,
        { method: 'PATCH', body: { status: next } },
      );
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: res.user.status } : x)));
      toast(next === 'SUSPENDED' ? 'Utilisateur suspendu.' : 'Utilisateur réactivé.', 'success');
    } catch {
      toast('Échec.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Utilisateurs" subtitle="Comptes de la plateforme">
        <SearchBar value={q} onChange={setQ} onSubmit={reload} placeholder="Email ou nom…" />
      </AdminHeader>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="SUSPENDED">Suspendus</option>
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Tous les rôles</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPERADMIN">SUPERADMIN</option>
        </select>
        <button
          type="button"
          onClick={reload}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm font-semibold"
        >
          Filtrer
        </button>
      </div>

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      <div className="bg-surface border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-border text-muted-foreground font-body border-b text-left text-xs font-semibold uppercase">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Vérifié</th>
              <th className="px-4 py-3">Inscrit</th>
              <th className="px-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                <td className="text-foreground font-body px-4 py-3 font-medium">{u.email}</td>
                <td className="text-muted-foreground font-body px-4 py-3">{u.name ?? '—'}</td>
                <td className="px-4 py-3">
                  {canRole ? (
                    <select
                      value={u.role}
                      disabled={busyId === u.id}
                      onChange={(e) => void changeRole(u, e.target.value as AdminUser['role'])}
                      className="border-border bg-surface text-foreground font-body rounded-md border px-2 py-1 text-xs"
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPERADMIN">SUPERADMIN</option>
                    </select>
                  ) : (
                    <Badge tone={ROLE_TONE[u.role] ?? 'neutral'}>{u.role}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>
                    {u.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-3">{u.emailVerifiedAt ? '✓' : '—'}</td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    {u.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        onClick={() => void toggleStatus(u)}
                        disabled={busyId === u.id}
                        className="text-danger font-body text-xs font-semibold disabled:opacity-50"
                      >
                        Suspendre
                      </button>
                    ) : canRestore ? (
                      <button
                        type="button"
                        onClick={() => void toggleStatus(u)}
                        disabled={busyId === u.id}
                        className="text-primary font-body text-xs font-semibold disabled:opacity-50"
                      >
                        Réactiver
                      </button>
                    ) : null}
                    {isSuper && u.role === 'USER' && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(u)}
                        disabled={busyId === u.id}
                        className="text-danger font-body text-xs font-semibold underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucun utilisateur.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore
        show={hasMore}
        loading={loading}
        onClick={() => void load(false, { q, status, role })}
      />

      {/* Confirmation de suppression d'un compte (irréversible) */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        title="Supprimer le compte"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground font-body text-sm">
            Le compte{' '}
            <span className="text-foreground font-semibold break-all">{deleteTarget?.email}</span>{' '}
            sera <span className="text-danger font-semibold">définitivement supprimé</span>. Son
            email redeviendra libre. Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="bg-danger font-body rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
