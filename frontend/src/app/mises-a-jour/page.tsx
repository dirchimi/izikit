import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import ContentPage, { type ContentSection } from '@/components/boutique/landing/ContentPage';

export const metadata: Metadata = { title: 'Mises à jour — Sahilley' };

type PageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ContentSection[];
};

const CONTENT: Record<'fr' | 'en' | 'ar', PageContent> = {
  fr: {
    eyebrow: 'Nouveautés',
    title: 'Mises à jour',
    intro: 'Découvrez les nouveautés de Sahilley. Nous améliorons l’application en continu.',
    sections: [
      {
        heading: 'Juin 2026',
        bullets: [
          'Tableau de bord branché sur vos vraies données.',
          'Calendrier et menus repensés, plus premium.',
          'Reçu personnalisable avec votre logo, et envoi au client sur WhatsApp sous forme d’image.',
          'Consultation hors-ligne de vos données et application installable sur votre téléphone.',
          'Assistant de configuration à la première connexion.',
          'Accès complet sur mobile : thème, langue et recherche.',
          'Nouvelle page d’accueil.',
        ],
      },
      {
        heading: 'Bientôt',
        paragraphs: ['Ce sur quoi nous travaillons :'],
        bullets: [
          'Ventes 100% hors-ligne.',
          'Paiement par mobile money intégré.',
          'Plus de tutoriels, dont des vidéos.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'What’s new',
    title: 'Updates',
    intro: 'Discover what’s new in Sahilley. We improve the app continuously.',
    sections: [
      {
        heading: 'June 2026',
        bullets: [
          'Dashboard now powered by your real data.',
          'Redesigned calendar and menus, more premium.',
          'Customisable receipt with your logo, and sent to the customer on WhatsApp as an image.',
          'Offline access to your data and an app you can install on your phone.',
          'Setup assistant on your first login.',
          'Full access on mobile: theme, language and search.',
          'New home page.',
        ],
      },
      {
        heading: 'Coming soon',
        paragraphs: ['What we are working on:'],
        bullets: [
          '100% offline sales.',
          'Built-in mobile money payment.',
          'More tutorials, including videos.',
        ],
      },
    ],
  },
  ar: {
    eyebrow: 'الجديد',
    title: 'التحديثات',
    intro: 'اكتشف جديد Sahilley. نحن نحسّن التطبيق باستمرار.',
    sections: [
      {
        heading: 'يونيو 2026',
        bullets: [
          'لوحة التحكم متّصلة الآن ببياناتك الحقيقية.',
          'إعادة تصميم التقويم والقوائم بمظهر أكثر تميّزاً.',
          'إيصال قابل للتخصيص بشعارك، وإرساله إلى الزبون عبر واتساب على شكل صورة.',
          'الاطّلاع على بياناتك دون اتصال، وتطبيق قابل للتثبيت على هاتفك.',
          'مساعد للإعداد عند أول تسجيل دخول.',
          'وصول كامل على الهاتف: السمة واللغة والبحث.',
          'صفحة رئيسية جديدة.',
        ],
      },
      {
        heading: 'قريباً',
        paragraphs: ['ما نعمل عليه:'],
        bullets: [
          'مبيعات بدون اتصال بنسبة 100%.',
          'الدفع عبر المحفظة الإلكترونية (mobile money) مدمجاً.',
          'المزيد من الشروحات، بما فيها مقاطع الفيديو.',
        ],
      },
    ],
  },
};

export default async function Page() {
  const { locale } = await getServerT();
  const c = CONTENT[locale];
  return <ContentPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} sections={c.sections} />;
}
