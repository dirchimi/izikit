import AuthShell from '@/components/boutique/auth/AuthShell';
import SignupForm from '@/components/boutique/auth/SignupForm';
import RedirectIfAuthed from '@/components/boutique/auth/RedirectIfAuthed';

export const metadata = { title: 'Inscription — Sahilley' };

export default function InscriptionPage() {
  return (
    <AuthShell>
      <RedirectIfAuthed />
      <SignupForm />
    </AuthShell>
  );
}
