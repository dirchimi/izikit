import type { ReactNode } from 'react';
import { getServerT } from '@/lib/i18n/server';
import LanguageSwitcher from '@/components/boutique/LanguageSwitcher';
import ThemeToggle from '@/components/boutique/ThemeToggle';

/**
 * Gabarit des écrans d'authentification (Connexion / Inscription / Vérification) :
 * fond pleine page centré, sélecteur de langue (fonctionnel) et carte logo.
 * Composant serveur — la langue est lue côté serveur (cookie) ; le switcher est
 * un îlot client. `taglineKey` est une clé i18n (défaut : « Gestion de boutique »).
 */
export default async function AuthShell({
  taglineKey = 'auth.tagline',
  children,
}: {
  taglineKey?: string;
  children: ReactNode;
}) {
  const { t } = await getServerT();
  return (
    <main className="bg-background relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute top-5 end-6 hidden items-center gap-2 sm:flex">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="bg-surface border-border flex w-full max-w-[420px] flex-col items-center gap-6 rounded-xl border px-6 py-9 sm:px-10 sm:py-10">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-primary flex h-14 w-14 items-center justify-center rounded-xl">
            <span className="font-headings text-primary-foreground text-2xl font-bold">S</span>
          </div>
          <span className="font-headings text-foreground text-xl font-bold tracking-tight">
            Sahilley
          </span>
          <span className="text-muted-foreground font-body text-xs">{t(taglineKey)}</span>
        </div>

        {children}
      </div>
    </main>
  );
}
