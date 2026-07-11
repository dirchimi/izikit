'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60';

// Code d'erreur API → clé i18n dédiée.
const ERR_KEY: Record<string, string> = {
  INVALID_CREDENTIALS: 'security.err.invalidCredentials',
  PASSWORD_BANNED: 'security.err.banned',
  PASSWORD_TOO_SHORT: 'security.err.tooShort',
  PASSWORD_PWNED: 'security.err.pwned',
  PASSWORD_ALREADY_SET: 'security.err.alreadySet',
  VALIDATION_FAILED: 'security.err.validation',
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
  const t = useT();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronise le champ avec la valeur serveur (au chargement et après save).
  const serverName = user?.name ?? '';
  useEffect(() => {
    setName(serverName);
  }, [serverName]);

  if (!user) {
    return (
      <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
        {t('common.loading')}
      </div>
    );
  }

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');
  const userEmail = user.email;

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { name: name.trim() } });
      toast(t('security.nameSaved'), 'success');
      await refresh();
    } catch {
      toast(t('security.err.network'), 'error');
    } finally {
      setSavingName(false);
    }
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length === 0) {
      setError(t('security.err.newRequired'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('security.err.confirmMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast(t('security.pwUpdated'), 'success');
      } else {
        await api('/api/auth/set-password', { method: 'POST', body: { newPassword } });
        toast(t('security.pwSet'), 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      const key = err instanceof ApiError ? ERR_KEY[err.code] : undefined;
      setError(
        key
          ? t(key)
          : err instanceof ApiError && err.message
            ? err.message
            : t('security.err.network'),
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
      toast(t('security.resetSent'), 'info');
      router.push(`/reinitialiser-mot-de-passe?email=${encodeURIComponent(userEmail)}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'TOO_MANY_FORGOT_ATTEMPTS'
          ? t('security.err.tooManyResets')
          : t('security.err.network'),
      );
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Profil — nom affiché */}
      <form onSubmit={onSaveName} className="bg-surface border-border rounded-lg border">
        <div className="border-border border-b px-5 py-4 md:px-6">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('security.profileTitle')}
          </h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {t('security.profileSub')}
          </p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 md:px-6">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="sec-name">
              {t('security.nameLabel')}
            </label>
            <input
              id="sec-name"
              type="text"
              maxLength={80}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('security.namePlaceholder')}
              className={fieldClass}
            />
            <span className="text-muted-foreground font-body text-xs">
              {t('security.nameHint')}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground font-body text-xs break-all">
              {t('security.accountEmail')}: {userEmail}
            </span>
            <button
              type="submit"
              disabled={savingName || name.trim() === (user.name ?? '')}
              className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <Icon i="user" size={14} />
              {savingName ? t('security.saving') : t('security.saveName')}
            </button>
          </div>
        </div>
      </form>

      {/* Mot de passe */}
      <form onSubmit={onSubmitPassword} className="bg-surface border-border rounded-lg border">
        <div className="border-border border-b px-5 py-4 md:px-6">
          <h2 className="font-headings text-foreground text-base font-bold">
            {hasPassword ? t('security.changeTitle') : t('security.setTitle')}
          </h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {hasPassword ? t('security.changeSub') : t('security.setSub')}
          </p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 md:px-6">
          {hasPassword && (
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sec-current">
                {t('security.currentLabel')}
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
                {sendingReset ? t('security.sending') : t('security.forgot')}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sec-new">
                {t('security.newLabel')}
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
                {t('security.confirmLabel')}
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
              {submitting
                ? t('security.saving')
                : hasPassword
                  ? t('security.changeBtn')
                  : t('security.setBtn')}
            </button>
          </div>
        </div>
      </form>

      {/* Comptes liés */}
      <div className="bg-surface border-border rounded-lg border">
        <div className="border-border border-b px-5 py-4 md:px-6">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('security.linkedTitle')}
          </h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {t('security.linkedSub')}
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
                {googleLinked ? t('security.googleActive') : t('security.googleNotLinked')}
              </span>
            </div>
          </div>
          {googleLinked ? (
            <span className="bg-primary/10 text-primary font-body inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold">
              <Icon i="check" size={13} /> {t('security.linked')}
            </span>
          ) : (
            <a
              href="/api/auth/oauth/google/start?next=/parametres"
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
            >
              {t('security.linkGoogle')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
