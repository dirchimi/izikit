import AuthShell from '@/components/boutique/auth/AuthShell';
import LoginForm from '@/components/boutique/auth/LoginForm';
import RedirectIfAuthed from '@/components/boutique/auth/RedirectIfAuthed';

export const metadata = { title: 'Connexion — Sahilley' };

export default function ConnexionPage() {
  return (
    <AuthShell>
      <RedirectIfAuthed />
      <LoginForm />
    </AuthShell>
  );
}
