import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { getServerT } from '@/lib/i18n/server';
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
  CONTACT_WHATSAPP,
} from '@/lib/contact';

const footerCols = [
  {
    titleKey: 'landing.footer.col.product',
    links: [
      { key: 'landing.nav.features', href: '/#fonctionnalites' },
      { key: 'landing.nav.pricing', href: '/#tarifs' },
      { key: 'landing.footer.l.download', href: '/telecharger' },
      { key: 'landing.footer.l.updates', href: '/mises-a-jour' },
    ],
  },
  {
    titleKey: 'landing.footer.col.help',
    links: [
      { key: 'landing.footer.l.helpCenter', href: '/centre-aide' },
      { key: 'landing.nav.contact', href: '/contact' },
      { key: 'landing.footer.l.whatsapp', href: CONTACT_WHATSAPP },
      { key: 'landing.footer.l.tutorials', href: '/tutoriels' },
    ],
  },
  {
    titleKey: 'landing.footer.col.legal',
    links: [
      { key: 'landing.footer.l.privacy', href: '/confidentialite' },
      { key: 'landing.footer.l.terms', href: '/conditions' },
    ],
  },
];

const socials = [
  { icon: 'message-circle', label: 'WhatsApp', href: CONTACT_WHATSAPP },
  { icon: 'mail', label: 'E-mail', href: `mailto:${CONTACT_EMAIL}` },
  { icon: 'phone', label: 'Téléphone', href: `tel:${CONTACT_PHONE_E164}` },
];

function isExternal(href: string): boolean {
  return href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:');
}

/** Pied de page marketing partagé (landing + pages du footer). */
export default async function MarketingFooter() {
  const { t } = await getServerT();

  return (
    <footer id="contact" className="bg-sidebar scroll-mt-20 px-5 py-12 md:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-10 flex flex-col justify-between gap-10 md:flex-row">
          {/* Marque */}
          <div className="flex max-w-[280px] flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-md">
                <span className="font-headings text-primary-foreground text-sm font-bold">S</span>
              </div>
              <span className="font-headings text-primary-foreground text-base font-bold">
                Sahilley
              </span>
            </div>
            <p className="text-sidebar-foreground/70 font-body text-sm leading-relaxed">
              {t('landing.footer.brandDesc')}
            </p>
            <div className="flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.icon}
                  href={s.href}
                  aria-label={s.label}
                  target={s.href.startsWith('http') ? '_blank' : undefined}
                  rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="bg-sidebar-muted hover:bg-sidebar-active flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                >
                  <Icon i={s.icon} size={14} className="text-sidebar-foreground" />
                </a>
              ))}
            </div>
          </div>

          {/* Liens */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-16">
            {footerCols.map((col) => (
              <div key={col.titleKey} className="flex flex-col gap-3">
                <p className="text-sidebar-foreground/60 font-body text-xs font-semibold tracking-widest uppercase">
                  {t(col.titleKey)}
                </p>
                {col.links.map((l) =>
                  isExternal(l.href) ? (
                    <a
                      key={l.key}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sidebar-foreground/70 hover:text-sidebar-foreground font-body text-sm transition-colors"
                    >
                      {t(l.key)}
                    </a>
                  ) : (
                    <Link
                      key={l.key}
                      href={l.href}
                      className="text-sidebar-foreground/70 hover:text-sidebar-foreground font-body text-sm transition-colors"
                    >
                      {t(l.key)}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-sidebar-muted flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-sidebar-foreground/60 font-body text-xs">
            {t('landing.footer.copyright')}
          </p>
          <div className="text-sidebar-foreground/60 font-body flex flex-wrap items-center gap-2 text-xs">
            <a
              href={`tel:${CONTACT_PHONE_E164}`}
              className="hover:text-sidebar-foreground flex items-center gap-2 transition-colors"
            >
              <Icon i="phone" size={12} />
              <span>{CONTACT_PHONE_DISPLAY}</span>
            </a>
            <span className="mx-2">·</span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-sidebar-foreground flex items-center gap-2 transition-colors"
            >
              <Icon i="mail" size={12} />
              <span>{CONTACT_EMAIL}</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
