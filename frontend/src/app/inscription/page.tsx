import AuthShell from '@/components/boutique/auth/AuthShell';
import SignupForm from '@/components/boutique/auth/SignupForm';

export const metadata = { title: 'Inscription — Sahilley' };

export default function InscriptionPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
