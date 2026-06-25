import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import LanguageSwitcher from '@/components/boutique/LanguageSwitcher';
import ThemeToggle from '@/components/boutique/ThemeToggle';
import { getServerT } from '@/lib/i18n/server';
import SectionHeading from './SectionHeading';
import DashboardPreview from './DashboardPreview';

const features = [
  {
    icon: 'shopping-cart',
    titleKey: 'landing.feat.sales.title',
    descKey: 'landing.feat.sales.desc',
    highlight: false,
  },
  {
    icon: 'package',
    titleKey: 'landing.feat.stock.title',
    descKey: 'landing.feat.stock.desc',
    highlight: false,
  },
  {
    icon: 'users',
    titleKey: 'landing.feat.credit.title',
    descKey: 'landing.feat.credit.desc',
    highlight: false,
  },
  {
    icon: 'wifi-off',
    titleKey: 'landing.feat.offline.title',
    descKey: 'landing.feat.offline.desc',
    highlight: true,
  },
];

const painPoints = [
  { icon: 'notebook', key: 'landing.problem.p1' },
  { icon: 'package-x', key: 'landing.problem.p2' },
  { icon: 'hand-coins', key: 'landing.problem.p3' },
];

const whyCards = [
  { icon: 'wifi-off', titleKey: 'landing.why.w1.title', descKey: 'landing.why.w1.desc' },
  { icon: 'smartphone', titleKey: 'landing.why.w2.title', descKey: 'landing.why.w2.desc' },
  { icon: 'coins', titleKey: 'landing.why.w3.title', descKey: 'landing.why.w3.desc' },
];

const plans = [
  {
    name: 'Solo',
    price: '3 500',
    descKey: 'landing.plan.solo.desc',
    itemKeys: [
      'landing.plan.solo.i1',
      'landing.plan.solo.i2',
      'landing.plan.solo.i3',
      'landing.plan.solo.i4',
      'landing.plan.solo.i5',
    ],
    accent: false,
  },
  {
    name: 'Boutique',
    price: '7 500',
    descKey: 'landing.plan.shop.desc',
    itemKeys: [
      'landing.plan.shop.i1',
      'landing.plan.shop.i2',
      'landing.plan.shop.i3',
      'landing.plan.shop.i4',
      'landing.plan.shop.i5',
    ],
    accent: true,
  },
];

const navLinks = [
  { labelKey: 'landing.nav.features', href: '#fonctionnalites' },
  { labelKey: 'landing.nav.pricing', href: '#tarifs' },
  { labelKey: 'landing.nav.contact', href: '#contact' },
];

const footerCols = [
  {
    titleKey: 'landing.footer.col.product',
    linkKeys: [
      'landing.nav.features',
      'landing.nav.pricing',
      'landing.footer.l.download',
      'landing.footer.l.updates',
    ],
  },
  {
    titleKey: 'landing.footer.col.help',
    linkKeys: [
      'landing.footer.l.helpCenter',
      'landing.nav.contact',
      'landing.footer.l.whatsapp',
      'landing.footer.l.tutorials',
    ],
  },
  {
    titleKey: 'landing.footer.col.legal',
    linkKeys: ['landing.footer.l.privacy', 'landing.footer.l.terms'],
  },
];

const socials = [
  { icon: 'message-circle', label: 'WhatsApp' },
  { icon: 'mail', label: 'E-mail' },
  { icon: 'phone', label: 'Téléphone' },
];

const ctaPrimary =
  'bg-primary text-primary-foreground font-body rounded-md font-bold transition hover:opacity-90 focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

export default async function LandingPage({ authenticated = false }: { authenticated?: boolean }) {
  const { t } = await getServerT();

  return (
    <div className="bg-background font-body flex flex-col">
      {/* ── HEADER (sticky) ── */}
      <header className="bg-surface/90 border-border sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 md:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-primary flex h-9 w-9 items-center justify-center rounded-lg">
              <span className="font-headings text-primary-foreground text-base font-bold">S</span>
            </div>
            <span className="font-headings text-foreground text-lg font-bold tracking-tight">
              Sahilley
            </span>
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-muted-foreground hover:text-foreground font-body text-sm font-medium transition-colors"
              >
                {t(l.labelKey)}
              </a>
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

      {/* ── HERO ── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-5 pt-14 pb-0 text-center md:px-10 md:pt-20">
        <div className="bg-secondary text-secondary-foreground font-body flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-semibold">
          <Icon i="wifi-off" size={12} />
          {t('landing.hero.badge')}
        </div>
        <h1 className="font-headings text-foreground max-w-[760px] text-4xl leading-[1.15] font-bold sm:text-5xl lg:text-[52px]">
          {t('landing.hero.title1')}
          <br />
          <span className="text-primary">{t('landing.hero.title2')}</span>
        </h1>
        <p className="text-muted-foreground font-body max-w-[520px] text-base md:text-lg">
          {t('landing.hero.subtitle')}
        </p>
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/inscription"
            className={`${ctaPrimary} w-full px-8 py-3.5 text-base sm:w-auto`}
          >
            {t('landing.cta.start')}
          </Link>
          <a
            href="#apercu"
            className="text-muted-foreground hover:text-foreground font-body flex items-center gap-2 text-sm font-semibold transition-colors"
          >
            <Icon i="circle-play" size={16} className="text-primary" />
            {t('landing.cta.demo')}
          </a>
        </div>

        <DashboardPreview />
      </section>

      {/* ── LE PROBLÈME ── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-16 md:px-10 md:py-20">
        <SectionHeading
          eyebrow={t('landing.problem.eyebrow')}
          title={t('landing.problem.title')}
          subtitle={t('landing.problem.subtitle')}
        />
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          {painPoints.map((p) => (
            <div
              key={p.icon}
              className="bg-surface border-border flex items-start gap-4 rounded-lg border px-5 py-4"
            >
              <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                <Icon i={p.icon} size={16} className="text-muted-foreground" />
              </div>
              <p className="text-foreground font-body text-sm leading-relaxed">{t(p.key)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FONCTIONNALITÉS ── */}
      <section
        id="fonctionnalites"
        className="bg-surface scroll-mt-20 px-5 py-16 md:px-10 md:py-20"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-12">
          <SectionHeading eyebrow={t('landing.feat.eyebrow')} title={t('landing.feat.title')} />
          <div className="grid w-full max-w-[1100px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.titleKey}
                className={`flex flex-col gap-3 rounded-xl border px-6 py-6 transition ${
                  f.highlight
                    ? 'bg-primary border-primary'
                    : 'bg-background border-border hover:border-primary/60 hover:shadow-sm'
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    f.highlight ? 'bg-primary-foreground/20' : 'bg-secondary'
                  }`}
                >
                  <Icon
                    i={f.icon}
                    size={18}
                    className={f.highlight ? 'text-primary-foreground' : 'text-primary'}
                  />
                </div>
                <p
                  className={`font-headings text-base font-bold ${
                    f.highlight ? 'text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {t(f.titleKey)}
                </p>
                <p
                  className={`font-body text-sm leading-relaxed ${
                    f.highlight ? 'text-primary-foreground opacity-80' : 'text-muted-foreground'
                  }`}
                >
                  {t(f.descKey)}
                </p>
                {f.highlight && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <Icon i="star" size={12} className="text-primary-foreground" />
                    <span className="text-primary-foreground font-body text-xs font-semibold">
                      {t('landing.feat.keyPoint')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POURQUOI NOUS ── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-16 md:px-10 md:py-20">
        <SectionHeading eyebrow={t('landing.why.eyebrow')} title={t('landing.why.title')} />
        <div className="grid w-full max-w-[900px] grid-cols-1 gap-6 md:grid-cols-3">
          {whyCards.map((item) => (
            <div
              key={item.titleKey}
              className="bg-surface border-border hover:border-primary/60 flex flex-col gap-3 rounded-xl border px-6 py-6 transition hover:shadow-sm"
            >
              <div className="bg-secondary flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon i={item.icon} size={18} className="text-primary" />
              </div>
              <p className="font-headings text-foreground text-base font-bold">
                {t(item.titleKey)}
              </p>
              <p className="text-muted-foreground font-body text-sm leading-relaxed">
                {t(item.descKey)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TARIFS ── */}
      <section id="tarifs" className="bg-surface scroll-mt-20 px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-12">
          <SectionHeading
            eyebrow={t('landing.pricing.eyebrow')}
            title={t('landing.pricing.title')}
            subtitle={t('landing.pricing.subtitle')}
          />
          <div className="grid w-full max-w-[720px] grid-cols-1 gap-6 sm:grid-cols-2">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col gap-5 rounded-xl border px-8 py-8 ${
                  plan.accent ? 'bg-primary border-primary' : 'bg-background border-border'
                }`}
              >
                {plan.accent && (
                  <span className="bg-primary-foreground text-primary font-body absolute -top-3 end-6 rounded-full px-3 py-0.5 text-xs font-bold shadow-sm">
                    {t('landing.pricing.popular')}
                  </span>
                )}
                <div>
                  <p
                    className={`font-body mb-1 text-xs font-semibold tracking-widest uppercase ${
                      plan.accent ? 'text-primary-foreground opacity-70' : 'text-muted-foreground'
                    }`}
                  >
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span
                      className={`font-headings text-[40px] leading-none font-bold ${
                        plan.accent ? 'text-primary-foreground' : 'text-foreground'
                      }`}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`font-body pb-1 text-sm ${
                        plan.accent ? 'text-primary-foreground opacity-70' : 'text-muted-foreground'
                      }`}
                    >
                      {t('landing.pricing.period')}
                    </span>
                  </div>
                  <p
                    className={`font-body mt-1 text-sm ${
                      plan.accent ? 'text-primary-foreground opacity-80' : 'text-muted-foreground'
                    }`}
                  >
                    {t(plan.descKey)}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  {plan.itemKeys.map((item) => (
                    <div key={item} className="flex items-center gap-2.5">
                      <Icon
                        i="check"
                        size={14}
                        className={plan.accent ? 'text-primary-foreground' : 'text-primary'}
                      />
                      <span
                        className={`font-body text-sm ${
                          plan.accent ? 'text-primary-foreground' : 'text-foreground'
                        }`}
                      >
                        {t(item)}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/inscription"
                  className={`font-body mt-auto w-full rounded-md border py-3 text-center text-sm font-bold transition hover:opacity-90 ${
                    plan.accent
                      ? 'bg-primary-foreground text-primary border-transparent'
                      : 'bg-primary text-primary-foreground border-primary'
                  }`}
                >
                  {t('landing.pricing.cta')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-5 py-20 text-center md:px-10 md:py-24">
        <h2 className="font-headings text-foreground max-w-[600px] text-3xl font-bold md:text-[40px]">
          {t('landing.final.title')}
        </h2>
        <p className="text-muted-foreground font-body max-w-[440px] text-base">
          {t('landing.final.subtitle')}
        </p>
        <Link href="/inscription" className={`${ctaPrimary} px-10 py-4 text-base`}>
          {t('landing.final.cta')}
        </Link>
        <p className="text-muted-foreground font-body text-xs">{t('landing.final.fineprint')}</p>
      </section>

      {/* ── FOOTER ── */}
      <footer id="contact" className="bg-sidebar scroll-mt-20 px-5 py-12 md:px-10">
        <div className="mx-auto max-w-6xl">
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
                    href="#contact"
                    aria-label={s.label}
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
                  {col.linkKeys.map((lk) => (
                    <a
                      key={lk}
                      href="#contact"
                      className="text-sidebar-foreground/70 hover:text-sidebar-foreground font-body text-sm transition-colors"
                    >
                      {t(lk)}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="border-sidebar-muted flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
            <p className="text-sidebar-foreground/60 font-body text-xs">
              {t('landing.footer.copyright')}
            </p>
            <div className="text-sidebar-foreground/60 font-body flex flex-wrap items-center gap-2 text-xs">
              <Icon i="phone" size={12} />
              <span>+235 66 XX XX XX</span>
              <span className="mx-2">·</span>
              <Icon i="mail" size={12} />
              <span>contact@sahilley.com</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
