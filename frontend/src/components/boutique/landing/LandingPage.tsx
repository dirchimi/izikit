import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { getServerT } from '@/lib/i18n/server';
import SectionHeading from './SectionHeading';
import DashboardPreview from './DashboardPreview';
import Reveal from './Reveal';
import MarketingHeader from './MarketingHeader';
import MarketingFooter from './MarketingFooter';
import PricingPlans from './PricingPlans';

const heroTrust = [
  { icon: 'wifi-off', key: 'landing.hero.trust.offline' },
  { icon: 'coins', key: 'landing.hero.trust.fcfa' },
  { icon: 'languages', key: 'landing.hero.trust.langs' },
];

const assurances = [
  { icon: 'shield-check', key: 'landing.trust.a1' },
  { icon: 'message-circle', key: 'landing.trust.a2' },
  { icon: 'badge-check', key: 'landing.trust.a3' },
];

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

const howSteps = [
  { n: '1', icon: 'store', titleKey: 'landing.how.s1.title', descKey: 'landing.how.s1.desc' },
  {
    n: '2',
    icon: 'package-plus',
    titleKey: 'landing.how.s2.title',
    descKey: 'landing.how.s2.desc',
  },
  {
    n: '3',
    icon: 'trending-up',
    titleKey: 'landing.how.s3.title',
    descKey: 'landing.how.s3.desc',
  },
];

const whyCards = [
  { icon: 'wifi-off', titleKey: 'landing.why.w1.title', descKey: 'landing.why.w1.desc' },
  { icon: 'smartphone', titleKey: 'landing.why.w2.title', descKey: 'landing.why.w2.desc' },
  { icon: 'coins', titleKey: 'landing.why.w3.title', descKey: 'landing.why.w3.desc' },
];

const faqs = [
  { qKey: 'landing.faq.q1', aKey: 'landing.faq.a1' },
  { qKey: 'landing.faq.q2', aKey: 'landing.faq.a2' },
  { qKey: 'landing.faq.q3', aKey: 'landing.faq.a3' },
  { qKey: 'landing.faq.q4', aKey: 'landing.faq.a4' },
  { qKey: 'landing.faq.q5', aKey: 'landing.faq.a5' },
];

const ctaPrimary =
  'bg-primary text-primary-foreground font-body rounded-md font-bold transition hover:opacity-90 focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

export default async function LandingPage() {
  const { t } = await getServerT();

  return (
    <div className="bg-background font-body flex flex-col overflow-x-hidden">
      <MarketingHeader />

      {/* ── HERO ── */}
      <section className="relative mx-auto flex w-full max-w-[1440px] flex-col items-center px-5 pt-14 pb-0 text-center md:px-10 md:pt-20">
        {/* Halo décoratif (profondeur) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden"
        >
          <div className="bg-primary/15 mt-[-150px] h-[460px] w-[760px] rounded-full blur-[130px]" />
        </div>

        <div className="stagger flex w-full flex-col items-center gap-6">
          <div className="bg-secondary text-secondary-foreground font-body flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-semibold">
            <Icon i="wifi-off" size={12} />
            {t('landing.hero.badge')}
          </div>
          <h1 className="font-headings text-foreground w-full max-w-[760px] text-[28px] leading-[1.15] font-bold sm:text-5xl lg:text-[52px]">
            {t('landing.hero.title1')}
            <br />
            <span className="text-primary">{t('landing.hero.title2')}</span>
          </h1>
          <p className="text-muted-foreground font-body max-w-[520px] text-base md:text-lg">
            {t('landing.hero.subtitle')}
          </p>

          {/* Pastilles de confiance */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {heroTrust.map((p) => (
              <div
                key={p.key}
                className="border-border bg-surface text-foreground font-body flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm"
              >
                <Icon i={p.icon} size={12} className="text-primary" />
                {t(p.key)}
              </div>
            ))}
          </div>

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
          <p className="text-muted-foreground font-body text-xs">{t('landing.hero.fineprint')}</p>

          <DashboardPreview />
        </div>
      </section>

      {/* ── BANDEAU CONFIANCE (pré-lancement, honnête) ── */}
      <Reveal className="mx-auto w-full max-w-[1440px] px-5 pt-14 md:px-10">
        <div className="border-border bg-surface flex flex-col items-center gap-5 rounded-2xl border px-6 py-7 text-center shadow-sm md:flex-row md:justify-between md:text-start">
          <div className="flex flex-col gap-1">
            <p className="font-headings text-foreground text-lg font-bold">
              {t('landing.trust.title')}
            </p>
            <p className="text-muted-foreground font-body text-sm">{t('landing.trust.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {assurances.map((a) => (
              <div key={a.icon} className="flex items-center gap-2">
                <Icon i={a.icon} size={16} className="text-primary" />
                <span className="font-body text-foreground text-sm font-semibold">{t(a.key)}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── LE PROBLÈME ── */}
      <section className="px-5 py-16 md:px-10 md:py-20">
        <Reveal className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-10">
          <SectionHeading
            eyebrow={t('landing.problem.eyebrow')}
            title={t('landing.problem.title')}
            subtitle={t('landing.problem.subtitle')}
          />
          <div className="flex w-full max-w-[640px] flex-col gap-4">
            {painPoints.map((p) => (
              <div
                key={p.icon}
                className="bg-surface border-border flex items-start gap-4 rounded-lg border px-5 py-4 shadow-sm"
              >
                <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                  <Icon i={p.icon} size={16} className="text-muted-foreground" />
                </div>
                <p className="text-foreground font-body text-sm leading-relaxed">{t(p.key)}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── FONCTIONNALITÉS ── */}
      <section
        id="fonctionnalites"
        className="bg-surface scroll-mt-20 px-5 py-16 md:px-10 md:py-20"
      >
        <Reveal className="mx-auto flex max-w-[1440px] flex-col items-center gap-12">
          <SectionHeading eyebrow={t('landing.feat.eyebrow')} title={t('landing.feat.title')} />
          <div className="grid w-full max-w-[1280px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.titleKey}
                className={`flex flex-col gap-3 rounded-xl border px-6 py-6 ${
                  f.highlight
                    ? 'bg-primary border-primary shadow-[0_24px_48px_-20px] shadow-primary/50'
                    : 'bg-background border-border hover-lift shadow-sm hover:border-primary/60'
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
        </Reveal>
      </section>

      {/* ── COMMENT ÇA MARCHE ── */}
      <section className="px-5 py-16 md:px-10 md:py-20">
        <Reveal className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-12">
          <SectionHeading eyebrow={t('landing.how.eyebrow')} title={t('landing.how.title')} />
          <div className="grid w-full max-w-[1080px] grid-cols-1 gap-6 md:grid-cols-3">
            {howSteps.map((s) => (
              <div
                key={s.titleKey}
                className="bg-surface border-border relative flex flex-col gap-3 rounded-xl border px-6 py-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-primary text-primary-foreground font-headings flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold">
                    {s.n}
                  </span>
                  <Icon i={s.icon} size={18} className="text-primary" />
                </div>
                <p className="font-headings text-foreground text-base font-bold">{t(s.titleKey)}</p>
                <p className="text-muted-foreground font-body text-sm leading-relaxed">
                  {t(s.descKey)}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── POURQUOI NOUS ── */}
      <section className="bg-surface px-5 py-16 md:px-10 md:py-20">
        <Reveal className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-10">
          <SectionHeading eyebrow={t('landing.why.eyebrow')} title={t('landing.why.title')} />
          <div className="grid w-full max-w-[1080px] grid-cols-1 gap-6 md:grid-cols-3">
            {whyCards.map((item) => (
              <div
                key={item.titleKey}
                className="bg-background border-border hover-lift flex flex-col gap-3 rounded-xl border px-6 py-6 shadow-sm hover:border-primary/60"
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
        </Reveal>
      </section>

      {/* ── FAQ ── */}
      <section className="px-5 py-16 md:px-10 md:py-20">
        <Reveal className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-10">
          <SectionHeading eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')} />
          <div className="flex w-full max-w-[760px] flex-col gap-3">
            {faqs.map((f) => (
              <details
                key={f.qKey}
                className="group bg-surface border-border rounded-xl border px-5 py-4 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span className="font-headings text-foreground text-sm font-bold sm:text-base">
                    {t(f.qKey)}
                  </span>
                  <Icon
                    i="chevron-down"
                    size={18}
                    className="text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="text-muted-foreground font-body mt-3 text-sm leading-relaxed">
                  {t(f.aKey)}
                </p>
              </details>
            ))}
          </div>
          <a
            href="https://wa.me/905527863655"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground font-body flex items-center gap-2 text-sm font-semibold transition-colors"
          >
            <Icon i="message-circle" size={15} className="text-primary" />
            {t('landing.faq.more')} — {t('landing.faq.contact')}
          </a>
        </Reveal>
      </section>

      {/* ── TARIFS ── */}
      <section id="tarifs" className="bg-surface scroll-mt-20 px-5 py-16 md:px-10 md:py-20">
        <Reveal className="mx-auto flex max-w-[1440px] flex-col items-center gap-12">
          <SectionHeading
            eyebrow={t('landing.pricing.eyebrow')}
            title={t('landing.pricing.title')}
            subtitle={t('landing.pricing.subtitle')}
          />
          <PricingPlans />
        </Reveal>
      </section>

      {/* ── CTA FINAL (panneau vert foncé, clôture premium) ── */}
      <section className="px-5 py-16 md:px-10 md:py-24">
        <Reveal className="bg-sidebar mx-auto flex w-full max-w-5xl flex-col items-center gap-6 rounded-3xl px-6 py-16 text-center shadow-sm md:py-20">
          <h2 className="font-headings text-sidebar-foreground max-w-[600px] text-3xl font-bold md:text-[40px]">
            {t('landing.final.title')}
          </h2>
          <p className="text-sidebar-foreground/70 font-body max-w-[440px] text-base">
            {t('landing.final.subtitle')}
          </p>
          <Link
            href="/inscription"
            className="bg-primary text-primary-foreground font-body rounded-md px-10 py-4 text-base font-bold transition hover:opacity-90"
          >
            {t('landing.final.cta')}
          </Link>
          <p className="text-sidebar-foreground/60 font-body text-xs">
            {t('landing.final.fineprint')}
          </p>
        </Reveal>
      </section>

      <MarketingFooter />
    </div>
  );
}
