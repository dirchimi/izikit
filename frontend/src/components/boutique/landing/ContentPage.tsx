import type { ReactNode } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { getServerT } from '@/lib/i18n/server';
import MarketingHeader from './MarketingHeader';
import MarketingFooter from './MarketingFooter';

export interface ContentSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface ContentPageProps {
  eyebrow?: string;
  title: string;
  intro?: string;
  /** Texte « Dernière mise à jour : … » (pages légales). */
  updated?: string;
  sections?: ContentSection[];
  /** Contenu personnalisé (ex. formulaire) rendu après l'intro. */
  children?: ReactNode;
}

/**
 * Coquille partagée des pages du footer (Contact, Conditions, Confidentialité,
 * Centre d'aide, Tutoriels, Télécharger, Mises à jour). En-tête + pied de page
 * marketing + un article centré dans la charte. Le contenu est piloté par
 * données (`sections`) pour rester cohérent et trilingue, ou par `children`
 * pour les pages riches (formulaire de contact).
 */
export default async function ContentPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
  children,
}: ContentPageProps) {
  const { t } = await getServerT();

  // overflow-x-CLIP (pas hidden) : même correctif que LandingPage — `hidden`
  // cassait le `sticky top-0` du MarketingHeader.
  return (
    <div className="bg-background font-body flex min-h-screen flex-col overflow-x-clip">
      <MarketingHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 md:px-8 md:py-16">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground font-body mb-8 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
        >
          <Icon i="arrow-left" size={15} />
          {t('landing.backHome')}
        </Link>

        <header className="flex flex-col gap-3 border-b border-border pb-8">
          {eyebrow && (
            <span className="text-primary font-body text-xs font-bold tracking-widest uppercase">
              {eyebrow}
            </span>
          )}
          <h1 className="font-headings text-foreground text-3xl font-bold md:text-4xl">{title}</h1>
          {intro && (
            <p className="text-muted-foreground font-body text-base leading-relaxed">{intro}</p>
          )}
          {updated && <p className="text-muted-foreground/80 font-body text-xs">{updated}</p>}
        </header>

        {children && <div className="mt-8">{children}</div>}

        {sections && sections.length > 0 && (
          <div className="mt-8 flex flex-col gap-8">
            {sections.map((s, i) => (
              <section key={s.heading ?? `sec-${i}`} className="flex flex-col gap-3">
                {s.heading && (
                  <h2 className="font-headings text-foreground text-lg font-bold">{s.heading}</h2>
                )}
                {s.paragraphs?.map((p, pi) => (
                  <p
                    key={`p-${pi}`}
                    className="text-muted-foreground font-body text-sm leading-relaxed"
                  >
                    {p}
                  </p>
                ))}
                {s.bullets && s.bullets.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {s.bullets.map((b, bi) => (
                      <li
                        key={`b-${bi}`}
                        className="text-muted-foreground font-body flex items-start gap-2.5 text-sm leading-relaxed"
                      >
                        <Icon i="check" size={15} className="text-primary mt-0.5 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </main>

      <MarketingFooter />
    </div>
  );
}
