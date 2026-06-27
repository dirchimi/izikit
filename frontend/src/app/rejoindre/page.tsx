import { Suspense } from 'react';
import AuthShell from '@/components/boutique/auth/AuthShell';
import AcceptInvitationForm from '@/components/boutique/auth/AcceptInvitationForm';

export const metadata = { title: 'Rejoindre — Sahilley' };

// useSearchParams() exige une frontière <Suspense> sous l'App Router.
export default function RejoindrePage() {
  return (
    <AuthShell taglineKey="invite.tagline">
      <Suspense fallback={null}>
        <AcceptInvitationForm />
      </Suspense>
    </AuthShell>
  );
}
