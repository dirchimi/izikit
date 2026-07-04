'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60';

const ERR: Record<string, string> = {
  INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
  PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
  PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
  PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
  PASSWORD_ALREADY_SET: 'Un mot de passe est déjà défini.',
  VALIDATION_FAILED: 'Champs invalides.',
};

/**
 * Section Paramètres → « Sécurité & connexion » (charte Sahilley).
 * - Définir un mot de passe (compte créé via Google) OU le changer.
 * - Lier le compte Google (connexion en un clic) — vice-versa couvert.
 */
export default function SecuritySection() {
  const user = useUser();
  const { refresh } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
        Chargement…
      </div>
    );
  }

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');
  const userEmail = user.email;

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length === 0) {
      setError('Saisis un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas.');
      return;
    }
    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', { method: 'POST', body: { newPassword } });
        toast('Mot de passe défini. Tu peux maintenant te connecter par email.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? (ERR[err.code] ?? err.message) : 'Erreur réseau. Réessaie.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // « Mot de passe oublié ? » — pour les comptes connectés via Google qui ont
  // défini un mot de passe puis l'ont oublié : on envoie l'e-mail de
  // réinitialisation à l'adresse du compte (déjà connue) et on redirige vers
  // l'écran de saisie du code. Évite le cul-de-sac de « Changer » qui exige le
  // mot de passe actuel.
  async function onForgotCurrentPassword() {
    setError(null);
    setSendingReset(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: userEmail } });
      toast('E-mail de réinitialisation envoyé. Vérifie ta boîte mail.', 'info');
      router.push(`/reinitialiser-mot-de-passe?email=${encodeURIComponent(userEmail)}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'TOO_MANY_FORGOT_ATTEMPTS'
          ? 'Trop de demandes de réinitialisation. Réessaie dans un moment.'
          : 'Erreur réseau. Réessaie.',
      );
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mot de passe */}
      <form onSubmit={onSubmitPassword} className="bg-surface border-border rounded-lg border">
        <div className="border-border border-b px-5 py-4 md:px-6">
          <h2 className="font-headings text-foreground text-base font-bold">
            {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
          </h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {hasPassword
              ? 'Les autres sessions seront déconnectées.'
              : 'Tu t’es connecté via Google. Définis un mot de passe pour te connecter aussi par email.'}
          </p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 md:px-6">
          {hasPassword && (
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sec-current">
                Mot de passe actuel
              </label>
              <input
                id="sec-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={onForgotCurrentPassword}
                disabled={sendingReset}
                className="text-primary font-body mt-0.5 self-start text-xs font-semibold hover:underline disabled:opacity-60"
              >
                {sendingReset ? 'Envoi…' : 'Mot de passe oublié ?'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sec-new">
                Nouveau mot de passe
              </label>
              <input
                id="sec-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sec-confirm">
                Confirmer
              </label>
              <input
                id="sec-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-danger font-body text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <Icon i="lock" size={14} />
              {submitting ? 'Enregistrement…' : hasPassword ? 'Changer' : 'Définir'}
            </button>
          </div>
        </div>
      </form>

      {/* Comptes liés */}
      <div className="bg-surface border-border rounded-lg border">
        <div className="border-border border-b px-5 py-4 md:px-6">
          <h2 className="font-headings text-foreground text-base font-bold">Comptes liés</h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            Connecte-toi en un clic via Google.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-5 md:px-6">
          <div className="flex items-center gap-3">
            <span className="bg-muted text-foreground flex h-9 w-9 items-center justify-center rounded-lg">
              <Icon i="chrome" size={18} />
            </span>
            <div className="flex flex-col">
              <span className="font-body text-foreground text-sm font-semibold">Google</span>
              <span className="text-muted-foreground font-body text-xs">
                {googleLinked ? 'Connexion Google active.' : 'Non lié pour le moment.'}
              </span>
            </div>
          </div>
          {googleLinked ? (
            <span className="bg-primary/10 text-primary font-body inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold">
              <Icon i="check" size={13} /> Lié
            </span>
          ) : (
            <a
              href="/api/auth/oauth/google/start?next=/parametres"
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Lier Google
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
