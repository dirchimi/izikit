import type { Metadata } from 'next';
import Icon from '@/components/ui/Icon';
import { getServerT } from '@/lib/i18n/server';
import ContentPage from '@/components/boutique/landing/ContentPage';
import ContactForm from '@/components/boutique/landing/ContactForm';
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
  CONTACT_WHATSAPP,
} from '@/lib/contact';

export const metadata: Metadata = { title: 'Contact — Sahilley' };

export default async function ContactPage() {
  const { t } = await getServerT();

  const methods = [
    {
      icon: 'message-circle',
      value: CONTACT_PHONE_DISPLAY,
      desc: t('contact.method.whatsapp.desc'),
      href: CONTACT_WHATSAPP,
      external: true,
    },
    {
      icon: 'mail',
      value: CONTACT_EMAIL,
      desc: t('contact.method.email.desc'),
      href: `mailto:${CONTACT_EMAIL}`,
      external: false,
    },
    {
      icon: 'phone',
      value: CONTACT_PHONE_DISPLAY,
      desc: t('contact.method.phone.desc'),
      href: `tel:${CONTACT_PHONE_E164}`,
      external: false,
    },
  ];

  return (
    <ContentPage
      eyebrow={t('contact.eyebrow')}
      title={t('contact.title')}
      intro={t('contact.intro')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {methods.map((m) => (
          <a
            key={m.icon}
            href={m.href}
            target={m.external ? '_blank' : undefined}
            rel={m.external ? 'noopener noreferrer' : undefined}
            className="bg-surface border-border hover-lift flex flex-col gap-2 rounded-xl border px-5 py-5 shadow-sm transition hover:border-primary/60"
          >
            <div className="bg-secondary flex h-10 w-10 items-center justify-center rounded-lg">
              <Icon i={m.icon} size={18} className="text-primary" />
            </div>
            <p className="font-body text-foreground text-sm font-bold break-all">
              <span dir="ltr">{m.value}</span>
            </p>
            <p className="text-muted-foreground font-body text-xs">{m.desc}</p>
          </a>
        ))}
      </div>

      <div className="mt-8">
        <ContactForm />
      </div>
    </ContentPage>
  );
}
