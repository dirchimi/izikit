import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import ContentPage, { type ContentSection } from '@/components/boutique/landing/ContentPage';

export const metadata: Metadata = { title: 'Politique de confidentialité — Sahilley' };

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
    title: 'Politique de confidentialité',
    intro:
      'Votre confiance compte. Voici quelles données nous traitons, pourquoi, et comment nous les protégeons.',
    updated: 'Dernière mise à jour : juillet 2026',
    sections: [
      {
        heading: '1. Données que nous collectons',
        bullets: [
          'Compte : votre e-mail, le nom de votre boutique et, si vous le fournissez, votre numéro de téléphone.',
          'Données d’usage : les informations que vous saisissez (produits, ventes, clients, dépenses).',
          'Données techniques : journaux de fonctionnement et cookies nécessaires au service.',
        ],
      },
      {
        heading: '2. Comment nous les utilisons',
        paragraphs: [
          'Uniquement pour fournir et sécuriser le service, vous apporter de l’assistance, l’améliorer, et vous envoyer les communications importantes liées à votre compte. Nous n’utilisons pas vos données à des fins publicitaires.',
        ],
      },
      {
        heading: '3. Cookies',
        paragraphs: [
          'Nous utilisons des cookies de session (connexion et sécurité) et des préférences (langue, thème). Pas de publicité ni de pistage tiers.',
        ],
      },
      {
        heading: '4. Partage des données',
        paragraphs: [
          'Nous ne vendons pas vos données. Nous faisons appel à des prestataires techniques de confiance — hébergement et base de données (région Europe), envoi d’e-mails, stockage des images — qui n’accèdent qu’au strict nécessaire pour faire fonctionner le service.',
        ],
      },
      {
        heading: '5. Qui, chez Sahilley, peut voir vos données ?',
        bullets: [
          'Vos vendeurs ne voient pas vos chiffres : bénéfices, rapports et statistiques sont réservés aux rôles que VOUS choisissez (Patron / Gérant).',
          'Notre équipe terrain et support ne voit pas vos montants : ses écrans d’administration affichent uniquement des signaux d’activité (boutique active ou non), jamais votre chiffre d’affaires ni vos créances.',
          'Seul le fondateur dispose d’un accès complet, utilisé uniquement pour l’assistance et la facturation — et chaque action d’administration est enregistrée dans un journal.',
          'Nous ne partageons jamais vos chiffres avec d’autres boutiques, des concurrents, ni qui que ce soit.',
        ],
      },
      {
        heading: '6. Sécurité',
        paragraphs: [
          'Les échanges sont chiffrés (HTTPS), les mots de passe sont hachés, et l’accès aux données est restreint. Aucun système n’est sûr à 100 %, mais nous prenons votre sécurité au sérieux.',
        ],
      },
      {
        heading: '7. Conservation',
        paragraphs: [
          'Nous conservons vos données tant que votre compte est actif. Vous pouvez demander leur suppression à tout moment.',
        ],
      },
      {
        heading: '8. Vos droits',
        paragraphs: [
          'Vous pouvez accéder à vos données, les corriger ou demander leur suppression. Écrivez-nous et nous donnerons suite dans des délais raisonnables.',
        ],
      },
      {
        heading: '9. Enfants',
        paragraphs: ['Sahilley est un outil professionnel et n’est pas destiné aux mineurs.'],
      },
      {
        heading: '10. Modifications',
        paragraphs: [
          'Nous pouvons mettre à jour cette politique. La date de dernière mise à jour figure en haut de cette page.',
        ],
      },
      {
        heading: '11. Contact',
        paragraphs: [
          'Pour toute question sur vos données : info.sahilley@gmail.com ou la page Contact.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    intro: 'Your trust matters. Here is what data we process, why, and how we protect it.',
    updated: 'Last updated: July 2026',
    sections: [
      {
        heading: '1. Data we collect',
        bullets: [
          'Account: your email, your shop name and, if you provide it, your phone number.',
          'Usage data: the information you enter (products, sales, customers, expenses).',
          'Technical data: operational logs and cookies required by the service.',
        ],
      },
      {
        heading: '2. How we use it',
        paragraphs: [
          'Only to provide and secure the service, support you, improve it, and send important account-related communications. We do not use your data for advertising.',
        ],
      },
      {
        heading: '3. Cookies',
        paragraphs: [
          'We use session cookies (login and security) and preferences (language, theme). No advertising or third-party tracking.',
        ],
      },
      {
        heading: '4. Data sharing',
        paragraphs: [
          'We do not sell your data. We rely on trusted technical providers — hosting and database (Europe region), email delivery, image storage — who only access what is strictly necessary to run the service.',
        ],
      },
      {
        heading: '5. Who at Sahilley can see your data?',
        bullets: [
          'Your sellers cannot see your figures: profits, reports and statistics are restricted to the roles YOU choose (Owner / Manager).',
          'Our field and support team cannot see your amounts: their back-office screens only show activity signals (shop active or not), never your revenue or receivables.',
          'Only the founder has full access, used strictly for support and billing — and every admin action is recorded in an audit log.',
          'We never share your figures with other shops, competitors, or anyone else.',
        ],
      },
      {
        heading: '6. Security',
        paragraphs: [
          'Traffic is encrypted (HTTPS), passwords are hashed, and data access is restricted. No system is 100% secure, but we take your security seriously.',
        ],
      },
      {
        heading: '7. Retention',
        paragraphs: [
          'We keep your data while your account is active. You can request deletion at any time.',
        ],
      },
      {
        heading: '8. Your rights',
        paragraphs: [
          'You can access, correct or request deletion of your data. Write to us and we will respond within a reasonable time.',
        ],
      },
      {
        heading: '9. Children',
        paragraphs: ['Sahilley is a professional tool and is not intended for minors.'],
      },
      {
        heading: '10. Changes',
        paragraphs: [
          'We may update this policy. The last-updated date appears at the top of this page.',
        ],
      },
      {
        heading: '11. Contact',
        paragraphs: [
          'For any question about your data: info.sahilley@gmail.com or the Contact page.',
        ],
      },
    ],
  },
  ar: {
    eyebrow: 'قانوني',
    title: 'سياسة الخصوصية',
    intro: 'ثقتك تهمّنا. إليك البيانات التي نعالجها، ولماذا، وكيف نحميها.',
    updated: 'آخر تحديث: يوليو 2026',
    sections: [
      {
        heading: '1. البيانات التي نجمعها',
        bullets: [
          'الحساب: بريدك الإلكتروني واسم متجرك، ورقم هاتفك إن قدّمته.',
          'بيانات الاستخدام: المعلومات التي تُدخلها (المنتجات، المبيعات، الزبائن، المصاريف).',
          'البيانات التقنية: سجلات التشغيل والكوكيز اللازمة للخدمة.',
        ],
      },
      {
        heading: '2. كيف نستخدمها',
        paragraphs: [
          'فقط لتقديم الخدمة وتأمينها، ودعمك، وتحسينها، وإرسال الرسائل المهمة المتعلقة بحسابك. لا نستخدم بياناتك لأغراض إعلانية.',
        ],
      },
      {
        heading: '3. الكوكيز',
        paragraphs: [
          'نستخدم كوكيز الجلسة (الدخول والأمان) وكوكيز التفضيلات (اللغة، السمة). دون إعلانات أو تتبّع من أطراف خارجية.',
        ],
      },
      {
        heading: '4. مشاركة البيانات',
        paragraphs: [
          'نحن لا نبيع بياناتك. نستعين بمزوّدين تقنيين موثوقين — الاستضافة وقاعدة البيانات (منطقة أوروبا)، وإرسال البريد، وتخزين الصور — لا يصلون إلا لما هو ضروري لتشغيل الخدمة.',
        ],
      },
      {
        heading: '5. من في Sahilley يمكنه رؤية بياناتك؟',
        bullets: [
          'بائعوك لا يرون أرقامك: الأرباح والتقارير والإحصاءات مقصورة على الأدوار التي تختارها أنت (المالك / المدير).',
          'فريقنا الميداني وفريق الدعم لا يرى مبالغك: شاشات الإدارة لديه تعرض مؤشرات نشاط فقط (متجر نشط أم لا)، وليس رقم أعمالك ولا ديونك أبداً.',
          'المؤسس وحده يملك وصولاً كاملاً، يُستخدم حصراً للدعم والفوترة — وكل إجراء إداري يُسجَّل في سجل تدقيق.',
          'لا نشارك أرقامك أبداً مع متاجر أخرى أو منافسين أو أي جهة كانت.',
        ],
      },
      {
        heading: '6. الأمان',
        paragraphs: [
          'الاتصالات مشفّرة (HTTPS)، وكلمات المرور مُجزّأة، والوصول إلى البيانات مقيّد. لا يوجد نظام آمن 100%، لكننا نأخذ أمنك على محمل الجدّ.',
        ],
      },
      {
        heading: '7. مدة الحفظ',
        paragraphs: ['نحتفظ ببياناتك ما دام حسابك نشطاً. ويمكنك طلب حذفها في أي وقت.'],
      },
      {
        heading: '8. حقوقك',
        paragraphs: [
          'يمكنك الاطّلاع على بياناتك أو تصحيحها أو طلب حذفها. راسلنا وسنستجيب خلال مدة معقولة.',
        ],
      },
      {
        heading: '9. الأطفال',
        paragraphs: ['Sahilley أداة مهنية وغير موجّهة للقاصرين.'],
      },
      {
        heading: '10. التعديلات',
        paragraphs: ['قد نُحدّث هذه السياسة. يظهر تاريخ آخر تحديث أعلى هذه الصفحة.'],
      },
      {
        heading: '11. التواصل',
        paragraphs: ['لأي سؤال حول بياناتك: info.sahilley@gmail.com أو صفحة التواصل.'],
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
