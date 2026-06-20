import AuthShell from '@/components/boutique/auth/AuthShell';
import LoginForm from '@/components/boutique/auth/LoginForm';

export const metadata = { title: 'Connexion — Sahilley' };

export default function ConnexionPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
