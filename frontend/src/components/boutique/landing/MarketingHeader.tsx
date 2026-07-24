import Link from 'next/link';
import { cookies } from 'next/headers';
import Icon from '@/components/ui/Icon';
import LanguageSwitcher from '@/components/boutique/LanguageSwitcher';
import ThemeToggle from '@/components/boutique/ThemeToggle';
import { verifyToken, COOKIE_NAME, CSRF_COOKIE_NAME } from '@/lib/server/auth';
import { RECENT_APP_COOKIE } from '@/lib/constants';
import { getServerT } from '@/lib/i18n/server';
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
  CONTACT_WHATSAPP,
} from '@/lib/contact';

// Ancres de la landing : préfixées par « / » pour fonctionner depuis n'importe
// quelle page (ex. /contact → /#tarifs renvoie à l'accueil sur la section).
const navLinks = [
  { labelKey: 'landing.nav.features', href: '/#fonctionnalites' },
  { labelKey: 'landing.nav.pricing', href: '/#tarifs' },
  { labelKey: 'landing.nav.contact', href: '/contact' },
];

const ctaPrimary =
  'bg-primary text-primary-foreground font-body rounded-md font-bold transition hover:opacity-90 focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

/**
 * En-tête marketing partagé (landing + pages du footer). Server component :
 * lit lui-même le cookie de session pour afficher « Mon tableau de bord » à un
 * utilisateur connecté, sinon « Se connecter » + « Essai gratuit ».
 */
export default async function MarketingHeader() {
  const { t } = await getServerT();
  const store = await cookies();
  // Le jeton d'accès expire en 15 min : s'y fier seul ferait afficher « Se
  // connecter » à un utilisateur pourtant connecté (sa session de 7 jours vit
  // encore). Le cookie CSRF (7 jours, posé à la connexion, effacé à la
  // déconnexion) est un marqueur de session fiable et lisible ici → on l'utilise
  // en repli. Pire cas : session en réalité morte → la garde du dashboard
  // renverra vers /connexion.
  //
  // ET on exige en plus le marqueur « a ouvert l'app dans les 72 h »
  // (RECENT_APP_COOKIE, posé par AppShell) : la session glisse de 7 jours à
  // chaque visite du site — condition nécessaire au mode hors-ligne — donc
  // sans ce marqueur, quelqu'un qui n'a pas OUVERT l'app depuis des semaines
  // verrait « Mon tableau de bord » indéfiniment. Au-delà de 72 h sans
  // utiliser l'app, la landing redevient la vitrine normale.
  const token = store.get(COOKIE_NAME)?.value;
  const recentlyUsedApp = !!store.get(RECENT_APP_COOKIE)?.value;
  const hasSession = !!store.get(CSRF_COOKIE_NAME)?.value;
  const authenticated =
    recentlyUsedApp && (hasSession || (token ? !!(await verifyToken(token)) : false));

  return (
    <>
      {/* Barre utilitaire (contact aligné) — défile avec la page */}
      <div className="bg-sidebar text-sidebar-foreground/80 font-body text-xs">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-2 md:px-10">
          <div className="flex items-center gap-4">
            <a
              href={`tel:${CONTACT_PHONE_E164}`}
              className="hover:text-sidebar-foreground flex items-center gap-1.5 transition-colors"
            >
              <Icon i="phone" size={12} />
              <span dir="ltr">{CONTACT_PHONE_DISPLAY}</span>
            </a>
            <a
              href={CONTACT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sidebar-foreground hidden items-center gap-1.5 transition-colors sm:flex"
            >
              <Icon i="message-circle" size={12} />
              <span>WhatsApp</span>
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-sidebar-foreground hidden items-center gap-1.5 transition-colors md:flex"
            >
              <Icon i="mail" size={12} />
              <span dir="ltr">{CONTACT_EMAIL}</span>
            </a>
          </div>
          <Link
            href="/centre-aide"
            className="hover:text-sidebar-foreground flex items-center gap-1.5 transition-colors"
          >
            <Icon i="life-buoy" size={12} />
            <span>{t('landing.footer.l.helpCenter')}</span>
          </Link>
        </div>
      </div>

      <header className="bg-surface/90 border-border sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3.5 md:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/logo-mark.svg"
              alt=""
              className="ring-primary/20 h-9 w-9 rounded-lg shadow-sm ring-1"
            />
            <span className="font-headings text-foreground text-lg font-bold tracking-tight">
              Sahilley
            </span>
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-muted-foreground hover:text-foreground font-body text-sm font-medium transition-colors"
              >
                {t(l.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            {authenticated ? (
              <Link
                href="/dashboard"
                className={`${ctaPrimary} flex items-center gap-2 px-5 py-2 text-sm`}
              >
                <Icon i="layout-dashboard" size={15} />
                {t('landing.cta.myDashboard')}
              </Link>
            ) : (
              <>
                <Link
                  href="/connexion"
                  className="text-foreground font-body hidden text-sm font-semibold sm:inline-flex"
                >
                  {t('landing.cta.login')}
                </Link>
                <Link href="/inscription" className={`${ctaPrimary} px-5 py-2 text-sm`}>
                  {t('landing.cta.trial')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
