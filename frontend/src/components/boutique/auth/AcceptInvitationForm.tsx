'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';
import { authFieldWrap, authInput, authLabel, authSubmit } from './styles';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface InviteInfo {
  email: string;
  orgName: string;
  role: string;
}

function acceptError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'PASSWORD_BANNED':
        return t('auth.err.pwBanned');
      case 'PASSWORD_TOO_SHORT':
        return err.message || t('auth.err.pwShort');
      case 'INVITATION_INVALID':
        return t('invite.err.invalid');
      case 'TOO_MANY_ATTEMPTS':
        return t('auth.err.tooManySignup');
      default:
        return err.message || t('async.error');
    }
  }
  return t('auth.err.signupNetwork');
}

export default function AcceptInvitationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const t = useT();
  const token = params.get('token') ?? '';

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    let alive = true;
    void api<InviteInfo>(`/api/invitations/${token}`)
      .then((d) => {
        if (alive) {
          setInfo(d);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (alive) setStatus('invalid');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ ok?: boolean; alreadyAccount?: boolean; csrfToken?: string }>(
        `/api/invitations/${token}/accept`,
        { method: 'POST', body: { name, password } },
      );
      if (res.alreadyAccount) {
        // L'email a déjà un compte : le membre est ajouté, il se connecte.
        router.push('/connexion');
        return;
      }
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(acceptError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return <p className="text-muted-foreground font-body text-sm">{t('common.loading')}</p>;
  }

  if (status === 'invalid' || !info) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="bg-danger/10 text-danger flex h-12 w-12 items-center justify-center rounded-full">
          <Icon i="circle-x" size={24} />
        </span>
        <p className="font-body text-foreground text-sm font-semibold">{t('invite.err.invalid')}</p>
        <Link href="/connexion" className="text-primary font-body text-sm font-semibold">
          {t('auth.login')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <p className="text-muted-foreground font-body -mt-1 text-center text-xs">
        {t('invite.intro', { org: info.orgName })}
      </p>

      {/* Email (fixé par l'invitation) */}
      <div className="flex flex-col gap-1">
        <label className={authLabel}>{t('auth.email')}</label>
        <div className={authFieldWrap}>
          <Icon i="mail" size={14} className="text-muted-foreground shrink-0" />
          <input type="email" value={info.email} readOnly className={`${authInput} opacity-70`} />
        </div>
      </div>

      {/* Nom */}
      <div className="flex flex-col gap-1">
        <label htmlFor="inv-name" className={authLabel}>
          {t('invite.name')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="inv-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('invite.namePlaceholder')}
            className={authInput}
            autoFocus
          />
        </div>
      </div>

      {/* Mot de passe */}
      <div className="flex flex-col gap-1">
        <label htmlFor="inv-pw" className={authLabel}>
          {t('auth.password')}
        </label>
        <div className={authFieldWrap}>
          <input
            id="inv-pw"
            type={showPw ? 'text' : 'password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
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

      {error && (
        <p role="alert" className="text-danger font-body text-xs">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={authSubmit}>
        {submitting ? t('invite.joining') : t('invite.join')}
      </button>
    </form>
  );
}
