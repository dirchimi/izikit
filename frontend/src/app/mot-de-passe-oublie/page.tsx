import AuthShell from '@/components/boutique/auth/AuthShell';
import ForgotPasswordForm from '@/components/boutique/auth/ForgotPasswordForm';

export const metadata = { title: 'Mot de passe oublié — Sahilley' };

export default function MotDePasseOubliePage() {
  return (
    <AuthShell taglineKey="auth.forgotTagline">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
