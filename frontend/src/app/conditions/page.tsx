import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import ContentPage, { type ContentSection } from '@/components/boutique/landing/ContentPage';

export const metadata: Metadata = { title: 'Conditions d’utilisation — Sahilley' };

type PageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: ContentSection[];
};

const CONTENT: Record<'fr' | 'en' | 'ar', PageContent> = {
  fr: {
    eyebrow: 'Légal',
    title: 'Conditions d’utilisation',
    intro:
      'En créant un compte ou en utilisant Sahilley, vous acceptez les conditions ci-dessous. Lisez-les attentivement.',
    updated: 'Dernière mise à jour : juin 2026',
    sections: [
      {
        heading: '1. Le service',
        paragraphs: [
          'Sahilley est un outil de gestion de boutique : ventes et caisse, stock, ventes à crédit, dépenses et rapports. Le service évolue régulièrement ; certaines fonctionnalités peuvent être ajoutées, modifiées ou retirées.',
        ],
      },
      {
        heading: '2. Votre compte',
        paragraphs: [
          'Vous êtes responsable de la confidentialité de vos identifiants et de toute activité réalisée depuis votre compte. Fournissez des informations exactes et tenez-les à jour. Prévenez-nous en cas d’accès non autorisé.',
        ],
      },
      {
        heading: '3. Essai et abonnement',
        paragraphs: [
          'Un plan Gratuit limité est disponible en permanence. Le plan Premium démarre par un essai gratuit de 30 jours, sans carte bancaire. Pour vous abonner ensuite, contactez-nous (notamment sur WhatsApp). Les tarifs peuvent évoluer ; toute modification vous sera communiquée à l’avance.',
        ],
      },
      {
        heading: '4. Utilisation acceptable',
        paragraphs: [
          'Vous vous engagez à ne pas utiliser Sahilley à des fins illégales, à ne pas tenter de contourner la sécurité, ni de perturber le service ou d’y accéder de manière non autorisée.',
        ],
      },
      {
        heading: '5. Vos données',
        paragraphs: [
          'Les données que vous saisissez (produits, ventes, clients, etc.) restent les vôtres. Leur traitement est décrit dans notre Politique de confidentialité.',
        ],
      },
      {
        heading: '6. Disponibilité',
        paragraphs: [
          'Le service est fourni « en l’état ». Nous faisons de notre mieux pour assurer sa disponibilité, sans pouvoir garantir une absence totale d’interruption ou d’erreur.',
        ],
      },
      {
        heading: '7. Responsabilité',
        paragraphs: [
          'Dans la limite autorisée par la loi, Sahilley ne saurait être tenu responsable des pertes indirectes liées à l’utilisation du service. Conservez des copies de vos informations importantes.',
        ],
      },
      {
        heading: '8. Résiliation',
        paragraphs: [
          'Vous pouvez cesser d’utiliser Sahilley à tout moment. Nous pouvons suspendre un compte en cas de non-respect de ces conditions ou d’usage abusif.',
        ],
      },
      {
        heading: '9. Modifications',
        paragraphs: [
          'Nous pouvons mettre à jour ces conditions. La date de dernière mise à jour figure en haut de cette page ; l’usage continu du service vaut acceptation.',
        ],
      },
      {
        heading: '10. Contact',
        paragraphs: [
          'Une question sur ces conditions ? Écrivez-nous à info.sahilley@gmail.com ou via la page Contact.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'Legal',
    title: 'Terms of use',
    intro:
      'By creating an account or using Sahilley, you agree to the terms below. Please read them carefully.',
    updated: 'Last updated: June 2026',
    sections: [
      {
        heading: '1. The service',
        paragraphs: [
          'Sahilley is a shop-management tool: sales and checkout, inventory, credit sales, expenses and reports. The service evolves regularly; features may be added, changed or removed.',
        ],
      },
      {
        heading: '2. Your account',
        paragraphs: [
          'You are responsible for keeping your credentials confidential and for all activity under your account. Provide accurate information and keep it up to date. Tell us about any unauthorised access.',
        ],
      },
      {
        heading: '3. Trial and subscription',
        paragraphs: [
          'A limited Free plan is always available. The Premium plan starts with a 30-day free trial, no credit card. To subscribe afterwards, contact us (including on WhatsApp). Prices may change; any change will be communicated in advance.',
        ],
      },
      {
        heading: '4. Acceptable use',
        paragraphs: [
          'You agree not to use Sahilley for unlawful purposes, not to attempt to bypass security, and not to disrupt or gain unauthorised access to the service.',
        ],
      },
      {
        heading: '5. Your data',
        paragraphs: [
          'The data you enter (products, sales, customers, etc.) remains yours. Its processing is described in our Privacy Policy.',
        ],
      },
      {
        heading: '6. Availability',
        paragraphs: [
          'The service is provided "as is". We do our best to keep it available, without guaranteeing it will be free of interruption or error.',
        ],
      },
      {
        heading: '7. Liability',
        paragraphs: [
          'To the extent permitted by law, Sahilley is not liable for indirect losses arising from use of the service. Keep copies of your important information.',
        ],
      },
      {
        heading: '8. Termination',
        paragraphs: [
          'You may stop using Sahilley at any time. We may suspend an account in case of breach of these terms or abuse.',
        ],
      },
      {
        heading: '9. Changes',
        paragraphs: [
          'We may update these terms. The last-updated date appears at the top of this page; continued use means acceptance.',
        ],
      },
      {
        heading: '10. Contact',
        paragraphs: [
          'Questions about these terms? Email us at info.sahilley@gmail.com or use the Contact page.',
        ],
      },
    ],
  },
  ar: {
    eyebrow: 'قانوني',
    title: 'شروط الاستخدام',
    intro:
      'بإنشائك حساباً أو باستخدامك Sahilley، فإنك توافق على الشروط أدناه. يُرجى قراءتها بعناية.',
    updated: 'آخر تحديث: يونيو 2026',
    sections: [
      {
        heading: '1. الخدمة',
        paragraphs: [
          'Sahilley أداة لإدارة المتجر: المبيعات والصندوق، المخزون، البيع بالآجل، المصاريف والتقارير. تتطوّر الخدمة باستمرار؛ وقد تُضاف ميزات أو تُعدَّل أو تُزال.',
        ],
      },
      {
        heading: '2. حسابك',
        paragraphs: [
          'أنت مسؤول عن سرّية بيانات الدخول وعن كل نشاط يتم عبر حسابك. قدّم معلومات صحيحة وحدّثها، وأبلغنا بأي وصول غير مصرّح به.',
        ],
      },
      {
        heading: '3. التجربة والاشتراك',
        paragraphs: [
          'تتوفر خطة مجانية محدودة بشكل دائم. تبدأ خطة Premium بتجربة مجانية لمدة 30 يوماً دون بطاقة بنكية. وللاشتراك لاحقاً، تواصل معنا (عبر واتساب مثلاً). قد تتغيّر الأسعار، وسيتم إعلامك بأي تغيير مسبقاً.',
        ],
      },
      {
        heading: '4. الاستخدام المقبول',
        paragraphs: [
          'تلتزم بعدم استخدام Sahilley لأغراض غير قانونية، وعدم محاولة تجاوز الأمان، وعدم تعطيل الخدمة أو الوصول إليها بشكل غير مصرّح.',
        ],
      },
      {
        heading: '5. بياناتك',
        paragraphs: [
          'تبقى البيانات التي تُدخلها (المنتجات، المبيعات، الزبائن، إلخ) ملكاً لك. وتُوضَّح معالجتها في سياسة الخصوصية.',
        ],
      },
      {
        heading: '6. التوفّر',
        paragraphs: [
          'تُقدَّم الخدمة «كما هي». نبذل قصارى جهدنا لإبقائها متاحة، دون ضمان خلوّها التام من الانقطاع أو الخطأ.',
        ],
      },
      {
        heading: '7. المسؤولية',
        paragraphs: [
          'في حدود ما يسمح به القانون، لا يتحمّل Sahilley مسؤولية الخسائر غير المباشرة الناتجة عن استخدام الخدمة. احتفظ بنسخ من معلوماتك المهمة.',
        ],
      },
      {
        heading: '8. الإنهاء',
        paragraphs: [
          'يمكنك التوقف عن استخدام Sahilley في أي وقت. وقد نوقف حساباً في حال مخالفة هذه الشروط أو إساءة الاستخدام.',
        ],
      },
      {
        heading: '9. التعديلات',
        paragraphs: [
          'قد نُحدّث هذه الشروط. يظهر تاريخ آخر تحديث أعلى الصفحة؛ ويُعدّ استمرار الاستخدام موافقةً عليها.',
        ],
      },
      {
        heading: '10. التواصل',
        paragraphs: [
          'سؤال حول هذه الشروط؟ راسلنا على info.sahilley@gmail.com أو عبر صفحة التواصل.',
        ],
      },
    ],
  },
};

export default async function Page() {
  const { locale } = await getServerT();
  const c = CONTENT[locale];
  return (
    <ContentPage
      eyebrow={c.eyebrow}
      title={c.title}
      intro={c.intro}
      updated={c.updated}
      sections={c.sections}
    />
  );
}
