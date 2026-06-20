'use client';

import { createContext, useContext } from 'react';

/** Infos de l'admin courant (issu de GET /api/admin/me). `can` = capacités. */
export interface AdminInfo {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERADMIN';
  can: string[];
}

const AdminCtx = createContext<AdminInfo | null>(null);
export const AdminProvider = AdminCtx.Provider;

export function useAdmin(): AdminInfo {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdmin doit être utilisé dans AdminProvider');
  return ctx;
}
