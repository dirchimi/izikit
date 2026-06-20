'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';
import { authInput, authFieldWrap, authLabel, authSubmit } from './styles';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function resetError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'VERIFICATION_CODE_INVALID':
        return t('auth.err.codeInvalid');
      case 'VERIFICATION_CODE_EXPIRED':
        return t('auth.err.codeExpired');
      case 'PASSWORD_TOO_SHORT':
        return t('auth.err.pwShort');
      case 'PASSWORD_BANNED':
        return t('auth.err.pwBanned');
      case 'PASSWORD_PWNED':
        return t('auth.err.pwPwned');
      case 'TOO_MANY_RESET_ATTEMPTS':
        return t('auth.err.tooManyReset');
      case 'VALIDATION_FAILED':
        return t('auth.err.validationCode');
      default:
        return err.message || t('auth.err.network');
    }
  }
  return t('auth.err.network');
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const t = useT();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      // Pas de cookie émis ici — l'utilisateur se reconnecte avec son nouveau
      // mot de passe (conforme au backend reset-password).
      toast(t('auth.resetSuccess'), 'success');
      router.push('/connexion');
    } catch (err) {
      setError(resetError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <p className="text-muted-foreground font-body -mt-1 text-center text-xs">
        {t('auth.resetIntro')}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="rp-email" className={authLabel}>
          {t('auth.email')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="rp-email"
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

      <div className="flex flex-col gap-1">
        <label htmlFor="rp-code" className={authLabel}>
          {t('auth.code')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="rp-code"
            type="text"
            required
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            className={`${authInput} font-mono tracking-[0.3em] uppercase`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rp-pw" className={authLabel}>
          {t('auth.newPassword')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="rp-pw"
            type={showPw ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className={authInput}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? t('auth.hidePw') : t('auth.showPw')}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Icon i={showPw ? 'eye' : 'eye-off'} size={14} />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-danger font-body text-xs">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={authSubmit}>
        {submitting ? t('auth.resetting') : t('auth.resetSubmit')}
      </button>

      <p className="text-muted-foreground font-body text-center text-xs">
        <Link href="/connexion" className="text-primary font-semibold">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
