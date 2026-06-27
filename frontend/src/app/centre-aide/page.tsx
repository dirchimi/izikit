import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import ContentPage, { type ContentSection } from '@/components/boutique/landing/ContentPage';

export const metadata: Metadata = { title: 'Centre d’aide — Sahilley' };

type PageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ContentSection[];
};

const CONTENT: Record<'fr' | 'en' | 'ar', PageContent> = {
  fr: {
    eyebrow: 'Aide',
    title: 'Centre d’aide',
    intro: 'Trouvez rapidement comment utiliser Sahilley. Et si vous ne trouvez pas, on est là.',
    sections: [
      {
        heading: 'Démarrer',
        paragraphs: [
          'Créez un compte gratuitement, puis laissez-vous guider par l’assistant de configuration en 4 étapes (nom, type d’activité, ville, téléphone). Vous pouvez ensuite ajouter vos produits et commencer à vendre.',
        ],
      },
      {
        heading: 'Ventes & caisse',
        paragraphs: [
          'Dans Vendre, touchez les produits pour les ajouter au panier, choisissez le mode de paiement (espèces, mobile money ou crédit), puis validez. Vous pouvez imprimer le reçu ou l’envoyer au client sur WhatsApp.',
        ],
      },
      {
        heading: 'Stock',
        paragraphs: [
          'Dans Stock, ajoutez ou modifiez vos produits, leur prix et leur quantité. Vous pouvez ajouter une photo et un code-barres. Sahilley vous alerte quand un produit passe sous le seuil de stock bas.',
        ],
      },
      {
        heading: 'Ventes à crédit',
        paragraphs: [
          'Au moment d’encaisser, choisissez Crédit et sélectionnez le client. Retrouvez ensuite qui vous doit combien dans Créances, et enregistrez chaque remboursement.',
        ],
      },
      {
        heading: 'Compte & sécurité',
        paragraphs: [
          'Dans Paramètres, changez votre mot de passe, ajoutez des employés à votre boutique, et choisissez la langue (français, anglais, arabe) et le thème (clair ou sombre).',
        ],
      },
      {
        heading: 'Toujours bloqué ?',
        paragraphs: [
          'Écrivez-nous sur WhatsApp au +90 552 786 36 55, ou passez par la page Contact. On répond vite.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'Help',
    title: 'Help center',
    intro: 'Quickly find how to use Sahilley. And if you can’t find it, we’re here.',
    sections: [
      {
        heading: 'Getting started',
        paragraphs: [
          'Create an account for free, then let the 4-step setup assistant guide you (name, type of business, city, phone). You can then add your products and start selling.',
        ],
      },
      {
        heading: 'Sales & checkout',
        paragraphs: [
          'In Sell, tap products to add them to the cart, choose the payment method (cash, mobile money or credit), then confirm. You can print the receipt or send it to the customer on WhatsApp.',
        ],
      },
      {
        heading: 'Inventory',
        paragraphs: [
          'In Stock, add or edit your products, their price and quantity. You can add a photo and a barcode. Sahilley alerts you when a product falls below the low-stock threshold.',
        ],
      },
      {
        heading: 'Credit sales',
        paragraphs: [
          'When taking payment, choose Credit and select the customer. Then see who owes you how much in Receivables, and record each repayment.',
        ],
      },
      {
        heading: 'Account & security',
        paragraphs: [
          'In Settings, change your password, add employees to your shop, and choose the language (French, English, Arabic) and the theme (light or dark).',
        ],
      },
      {
        heading: 'Still stuck?',
        paragraphs: [
          'Write to us on WhatsApp at +90 552 786 36 55, or use the Contact page. We answer fast.',
        ],
      },
    ],
  },
  ar: {
    eyebrow: 'المساعدة',
    title: 'مركز المساعدة',
    intro: 'اعرف بسرعة كيف تستخدم Sahilley. وإن لم تجد ما تبحث عنه، فنحن هنا.',
    sections: [
      {
        heading: 'البداية',
        paragraphs: [
          'أنشئ حساباً مجاناً، ثم دع مساعد الإعداد المكوّن من 4 خطوات يرشدك (الاسم، نوع النشاط، المدينة، الهاتف). بعد ذلك يمكنك إضافة منتجاتك والبدء في البيع.',
        ],
      },
      {
        heading: 'المبيعات والصندوق',
        paragraphs: [
          'في «البيع»، اضغط على المنتجات لإضافتها إلى السلة، واختر طريقة الدفع (نقداً أو محفظة هاتف أو آجل)، ثم أكِّد. ويمكنك طباعة الإيصال أو إرساله إلى الزبون عبر واتساب.',
        ],
      },
      {
        heading: 'المخزون',
        paragraphs: [
          'في «المخزون»، أضِف منتجاتك أو عدّلها، مع سعرها وكميتها. ويمكنك إضافة صورة وباركود. وينبّهك Sahilley عندما ينخفض منتج تحت حدّ المخزون المنخفض.',
        ],
      },
      {
        heading: 'البيع بالآجل',
        paragraphs: [
          'عند التحصيل، اختر «الآجل» وحدّد الزبون. ثم اعرف من يدين لك وبكم في «الديون»، وسجّل كل سداد.',
        ],
      },
      {
        heading: 'الحساب والأمان',
        paragraphs: [
          'في «الإعدادات»، غيّر كلمة المرور، وأضِف موظفين إلى متجرك، واختر اللغة (الفرنسية، الإنجليزية، العربية) والسمة (فاتحة أو داكنة).',
        ],
      },
      {
        heading: 'ما زلت عالقاً؟',
        paragraphs: [
          'راسلنا على واتساب على الرقم +90 552 786 36 55، أو عبر صفحة التواصل. نردّ بسرعة.',
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
