'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';
import { authInput, authFieldWrap, authLabel, authSubmit } from './styles';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function forgotError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'TOO_MANY_FORGOT_ATTEMPTS':
        return t('auth.err.tooManyForgot');
      case 'VALIDATION_FAILED':
        return t('auth.err.validationEmail');
      default:
        return err.message || t('auth.err.network');
    }
  }
  return t('auth.err.network');
}

export default function ForgotPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Réponse identique que l'e-mail existe ou non (anti-énumération) :
      // on guide donc toujours l'utilisateur vers l'écran de saisie du code.
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      toast(t('auth.forgotSent'), 'info');
      router.push(`/reinitialiser-mot-de-passe?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(forgotError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <p className="text-muted-foreground font-body -mt-1 text-center text-xs">
        {t('auth.forgotIntro')}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="fp-email" className={authLabel}>
          {t('auth.email')}
        </label>
        <div className={authFieldWrap}>
          <Icon i="mail" size={14} className="text-muted-foreground shrink-0" />
          <input
            id="fp-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            className={authInput}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-danger font-body text-xs">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={authSubmit}>
        {submitting ? t('auth.forgotSending') : t('auth.forgotSubmit')}
      </button>

      <p className="text-muted-foreground font-body text-center text-xs">
        <Link href="/connexion" className="text-primary font-semibold">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
