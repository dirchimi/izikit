'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';
import GoogleButton from './GoogleButton';
import { authDivider, authFieldWrap, authInput, authLabel, authSubmit } from './styles';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function signupError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'PASSWORD_BANNED':
        return t('auth.err.pwBanned');
      case 'PASSWORD_TOO_SHORT':
        return err.message || t('auth.err.pwShort');
      case 'PASSWORD_PWNED':
        return t('auth.err.pwPwned');
      case 'TOO_MANY_SIGNUP_ATTEMPTS':
        return t('auth.err.tooManySignup');
      case 'VALIDATION_FAILED':
        return t('auth.err.validationEmail');
      default:
        return err.message || t('auth.err.signupFailed');
    }
  }
  return t('auth.err.signupNetwork');
}

export default function SignupForm() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('auth.err.pwMismatch'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', { method: 'POST', body: { email, password } });
      router.push(`/verifier-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(signupError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <p className="text-muted-foreground font-body -mt-1 text-center text-xs">
        {t('auth.signupIntro')}
      </p>

      {/* E-mail */}
      <div className="flex flex-col gap-1">
        <label htmlFor="su-email" className={authLabel}>
          {t('auth.email')}
        </label>
        <div className={authFieldWrap}>
          <Icon i="mail" size={14} className="text-muted-foreground shrink-0" />
          <input
            id="su-email"
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
        <label htmlFor="su-pw" className={authLabel}>
          {t('auth.password')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="su-pw"
            type={showPw ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
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
        <span className="text-muted-foreground font-body text-xs">{t('auth.pwHint')}</span>
      </div>

      {/* Confirmation */}
      <div className="flex flex-col gap-1">
        <label htmlFor="su-confirm" className={authLabel}>
          {t('auth.confirmPw')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="su-confirm"
            type={showPw ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
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
        {submitting ? t('auth.creating') : t('auth.createAccount')}
      </button>

      {/* Séparateur */}
      <div className={authDivider}>
        <span className="bg-border h-px flex-1" />
        {t('auth.or')}
        <span className="bg-border h-px flex-1" />
      </div>

      <GoogleButton label={t('auth.googleSignup')} />

      <p className="text-muted-foreground font-body text-center text-xs">
        {t('auth.haveAccount')}{' '}
        <Link href="/connexion" className="text-primary font-semibold">
          {t('auth.login')}
        </Link>
      </p>
    </form>
  );
}
