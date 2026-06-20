import { Suspense } from 'react';
import AuthShell from '@/components/boutique/auth/AuthShell';
import VerifyEmailForm from '@/components/boutique/auth/VerifyEmailForm';

export const metadata = { title: 'Vérification — Sahilley' };

// useSearchParams() exige une frontière <Suspense> sous l'App Router.
export default function VerifierEmailPage() {
  return (
    <AuthShell taglineKey="auth.verifyTagline">
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
