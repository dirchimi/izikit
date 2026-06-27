import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import ContentPage, { type ContentSection } from '@/components/boutique/landing/ContentPage';

export const metadata: Metadata = { title: 'Installer l’application — Sahilley' };

type PageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ContentSection[];
};

const CONTENT: Record<'fr' | 'en' | 'ar', PageContent> = {
  fr: {
    eyebrow: 'Installer',
    title: 'Installer Sahilley',
    intro:
      'Sahilley est une application web installable : pas besoin de passer par un store. Installez-la directement depuis votre navigateur, en quelques secondes.',
    sections: [
      {
        heading: 'Sur Android (Chrome)',
        bullets: [
          'Ouvrez sahilley.com dans Chrome.',
          'Touchez le menu (⋮) en haut à droite.',
          'Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
        ],
      },
      {
        heading: 'Sur iPhone / iPad (Safari)',
        bullets: [
          'Ouvrez sahilley.com dans Safari.',
          'Touchez le bouton Partager (le carré avec une flèche).',
          'Choisissez « Sur l’écran d’accueil ».',
        ],
      },
      {
        heading: 'Sur ordinateur (Chrome / Edge)',
        bullets: [
          'Ouvrez sahilley.com.',
          'Cliquez sur l’icône d’installation dans la barre d’adresse.',
          'Cliquez sur « Installer ».',
        ],
      },
      {
        heading: 'Et ensuite ?',
        paragraphs: [
          'L’application s’ouvre comme une vraie app, en plein écran, et vous permet de consulter vos données même hors-ligne.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'Install',
    title: 'Install Sahilley',
    intro:
      'Sahilley is an installable web app: no need to go through a store. Install it directly from your browser, in just a few seconds.',
    sections: [
      {
        heading: 'On Android (Chrome)',
        bullets: [
          'Open sahilley.com in Chrome.',
          'Tap the menu (⋮) in the top right.',
          'Choose "Install app" or "Add to Home screen".',
        ],
      },
      {
        heading: 'On iPhone / iPad (Safari)',
        bullets: [
          'Open sahilley.com in Safari.',
          'Tap the Share button (the square with an arrow).',
          'Choose "Add to Home Screen".',
        ],
      },
      {
        heading: 'On desktop (Chrome / Edge)',
        bullets: [
          'Open sahilley.com.',
          'Click the install icon in the address bar.',
          'Click "Install".',
        ],
      },
      {
        heading: 'What happens next?',
        paragraphs: [
          'The app opens like a real app, full screen, and lets you view your data even when offline.',
        ],
      },
    ],
  },
  ar: {
    eyebrow: 'التثبيت',
    title: 'ثبّت Sahilley',
    intro:
      'Sahilley تطبيق ويب قابل للتثبيت: لا حاجة للمرور عبر متجر. ثبّته مباشرةً من متصفحك في ثوانٍ معدودة.',
    sections: [
      {
        heading: 'على أندرويد (Chrome)',
        bullets: [
          'افتح sahilley.com في Chrome.',
          'اضغط على القائمة (⋮) في أعلى اليمين.',
          'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
        ],
      },
      {
        heading: 'على iPhone / iPad (Safari)',
        bullets: [
          'افتح sahilley.com في Safari.',
          'اضغط على زر المشاركة (المربّع الذي يحمل سهماً).',
          'اختر «إضافة إلى الشاشة الرئيسية».',
        ],
      },
      {
        heading: 'على الكمبيوتر (Chrome / Edge)',
        bullets: [
          'افتح sahilley.com.',
          'انقر على أيقونة التثبيت في شريط العنوان.',
          'انقر على «تثبيت».',
        ],
      },
      {
        heading: 'وماذا بعد؟',
        paragraphs: [
          'يُفتح التطبيق كتطبيق حقيقي بملء الشاشة، ويتيح لك الاطّلاع على بياناتك حتى دون اتصال بالإنترنت.',
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
