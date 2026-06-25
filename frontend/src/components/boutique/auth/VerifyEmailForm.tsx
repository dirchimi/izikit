'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LocaleContext';
import { authInput, authFieldWrap, authLabel, authSubmit } from './styles';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function verifyError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'VERIFICATION_CODE_INVALID':
        return t('auth.err.codeInvalid');
      case 'VERIFICATION_CODE_EXPIRED':
        return t('auth.err.codeExpired');
      case 'TOO_MANY_VERIFY_ATTEMPTS':
        return t('auth.err.tooManyVerify');
      case 'VALIDATION_FAILED':
        return t('auth.err.validationCode');
      default:
        return err.message || t('auth.err.verifyFailed');
    }
  }
  return t('auth.err.verifyNetwork');
}

export default function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const t = useT();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(verifyError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) void verify(qEmail, qCode.toUpperCase());
    // Au montage uniquement (les query params sont lus une fois).
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(email, code);
  }

  // Renvoi du code — la route est anti-énumération (200 dans tous les cas), donc
  // on affiche un message neutre qui ne révèle pas si l'email a un compte.
  async function resend() {
    if (!email.trim()) {
      setError(t('auth.err.validationEmail'));
      return;
    }
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      setNotice(t('auth.codeResent'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESEND_ATTEMPTS') {
        setError(t('auth.err.tooManyResend'));
      } else if (err instanceof ApiError && err.code === 'RATE_LIMIT_UNAVAILABLE') {
        setError(t('auth.err.resendUnavailable'));
      } else {
        setError(t('auth.err.verifyNetwork'));
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <p className="text-muted-foreground font-body -mt-1 text-center text-xs">
        {t('auth.verifyIntro')}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="ve-email" className={authLabel}>
          {t('auth.email')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="ve-email"
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
        <label htmlFor="ve-code" className={authLabel}>
          {t('auth.code')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="ve-code"
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

      {error && (
        <p role="alert" className="text-danger font-body text-xs">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="text-primary font-body text-xs">
          {notice}
        </p>
      )}

      <button type="submit" disabled={submitting} className={authSubmit}>
        {submitting ? t('auth.verifying') : t('auth.verify')}
      </button>

      {/* Renvoyer le code (compte non vérifié dont le code s'est perdu). */}
      <p className="text-muted-foreground font-body text-center text-xs">
        {t('auth.codeNotReceived')}{' '}
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="text-primary font-semibold disabled:opacity-60"
        >
          {resending ? t('auth.resending') : t('auth.resendCode')}
        </button>
      </p>

      {/* Sorties pour quelqu'un qui a en fait déjà un compte (email déjà inscrit). */}
      <div className="border-border mt-1 flex flex-col items-center gap-1 border-t pt-3">
        <p className="text-muted-foreground font-body text-center text-xs">
          {t('auth.haveAccount')}{' '}
          <Link href="/connexion" className="text-primary font-semibold">
            {t('auth.login')}
          </Link>
        </p>
        <Link href="/mot-de-passe-oublie" className="text-muted-foreground font-body text-xs">
          {t('auth.forgot')}
        </Link>
      </div>
    </form>
  );
}
