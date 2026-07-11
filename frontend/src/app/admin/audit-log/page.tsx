'use client';

import { useEffect, useState } from 'react';
import { useCursorList } from '@/lib/admin/useCursorList';
import { labelForAction } from '@/lib/admin/action-labels';
import { AdminHeader, Badge, LoadMore, SearchBar } from '@/components/admin/ui';

interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export default function AdminAuditLogPage() {
  const { items, hasMore, loading, error, load } =
    useCursorList<AuditEntry>('/api/admin/audit-log');
  const [action, setAction] = useState('');

  useEffect(() => {
    void load(true, {});
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Journal d'audit" subtitle="Toutes les actions admin">
        <SearchBar
          value={action}
          onChange={setAction}
          onSubmit={() => void load(true, { action })}
          placeholder="Action (ex: user.role_change)"
        />
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
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Cible</th>
              <th className="px-4 py-3">Acteur</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                <td className="text-muted-foreground font-body px-4 py-3 whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="blue">{labelForAction(a.action)}</Badge>
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {a.targetType}
                  <span className="opacity-50"> · {a.targetId.slice(0, 8)}…</span>
                </td>
                <td className="text-muted-foreground font-mono px-4 py-3 text-xs">
                  {a.actorId.slice(0, 8)}…
                </td>
                <td className="text-muted-foreground font-mono px-4 py-3 text-xs">{a.ip ?? '—'}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucune action enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore show={hasMore} loading={loading} onClick={() => void load(false, { action })} />
    </div>
  );
}
