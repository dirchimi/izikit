'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Garde à poser sur les pages d'authentification (connexion / inscription) :
 * si une session est déjà active, on redirige vers le tableau de bord au lieu
 * de remontrer le formulaire. AuthContext ne sonde `/api/auth/me` que si le
 * cookie CSRF existe (marqueur de session), donc un visiteur anonyme voit le
 * formulaire immédiatement, sans redirection ni requête inutile.
 */
export default function RedirectIfAuthed({ to = '/dashboard' }: { to?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(to);
  }, [loading, user, to, router]);

  return null;
}
