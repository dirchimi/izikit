import { Suspense } from 'react';
import AuthShell from '@/components/boutique/auth/AuthShell';
import ResetPasswordForm from '@/components/boutique/auth/ResetPasswordForm';

export const metadata = { title: 'Réinitialiser le mot de passe — Sahilley' };

// useSearchParams() exige une frontière <Suspense> sous l'App Router.
export default function ReinitialiserMotDePassePage() {
  return (
    <AuthShell taglineKey="auth.resetTagline">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
