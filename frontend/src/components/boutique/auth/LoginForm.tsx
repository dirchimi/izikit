'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';
import GoogleButton from './GoogleButton';
import { authDivider, authFieldWrap, authInput, authLabel, authSubmit } from './styles';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function loginError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        return t('auth.err.invalidCredentials');
      case 'LOCKED_OUT':
        return t('auth.err.lockedOut');
      case 'ACCOUNT_SUSPENDED':
        return t('auth.err.suspended');
      case 'TOO_MANY_LOGIN_ATTEMPTS':
        return t('auth.err.tooManyLogin');
      case 'VALIDATION_FAILED':
        return t('auth.err.validationLogin');
      default:
        return err.message || t('auth.err.loginFailed');
    }
  }
  return t('auth.err.network');
}

export default function LoginForm() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verifier-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(loginError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {/* E-mail */}
      <div className="flex flex-col gap-1">
        <label htmlFor="login-email" className={authLabel}>
          {t('auth.email')}
        </label>
        <div className={authFieldWrap}>
          <Icon i="mail" size={14} className="text-muted-foreground shrink-0" />
          <input
            id="login-email"
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

      {/* Mot de passe */}
      <div className="flex flex-col gap-1">
        <label htmlFor="login-pw" className={authLabel}>
          {t('auth.password')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="login-pw"
            type={showPw ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      {/* Se souvenir + mot de passe oublié */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setRemember((v) => !v)}
          className="flex items-center gap-2"
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              remember ? 'bg-primary border-primary' : 'border-border bg-input'
            }`}
          >
            {remember && <Icon i="check" size={10} className="text-primary-foreground" />}
          </span>
          <span className="text-foreground font-body text-xs">{t('auth.remember')}</span>
        </button>
        <button
          type="button"
          onClick={() => toast(t('auth.forgotSoon'), 'info')}
          className="text-primary font-body text-xs font-semibold"
        >
          {t('auth.forgot')}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-danger font-body text-xs">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={authSubmit}>
        {submitting ? t('auth.loggingIn') : t('auth.login')}
      </button>

      {/* Séparateur */}
      <div className={authDivider}>
        <span className="bg-border h-px flex-1" />
        {t('auth.or')}
        <span className="bg-border h-px flex-1" />
      </div>

      <GoogleButton label={t('auth.googleContinue')} />

      <p className="text-muted-foreground font-body text-center text-xs">
        {t('auth.noAccount')}{' '}
        <Link href="/inscription" className="text-primary font-semibold">
          {t('auth.signupLink')}
        </Link>
      </p>
    </form>
  );
}
