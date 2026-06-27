import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import ContentPage, { type ContentSection } from '@/components/boutique/landing/ContentPage';

export const metadata: Metadata = { title: 'Tutoriels — Sahilley' };

type PageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ContentSection[];
};

const CONTENT: Record<'fr' | 'en' | 'ar', PageContent> = {
  fr: {
    eyebrow: 'Tutoriels',
    title: 'Tutoriels',
    intro: 'Des guides courts et concrets pour prendre Sahilley en main en quelques minutes.',
    sections: [
      {
        heading: 'Enregistrer une vente',
        bullets: [
          'Ouvrez « Vendre ».',
          'Touchez les produits pour les ajouter au panier.',
          'Choisissez le mode de paiement : espèces, mobile money ou crédit.',
          'Validez la vente.',
          'Imprimez le reçu ou envoyez-le au client sur WhatsApp.',
        ],
      },
      {
        heading: 'Ajouter un produit',
        bullets: [
          'Allez dans « Stock », puis « Ajouter un produit ».',
          'Saisissez le nom, le prix et la quantité.',
          'Optionnel : ajoutez une photo et un code-barres.',
          'Enregistrez : le produit apparaît dans votre catalogue et en caisse.',
        ],
      },
      {
        heading: 'Vendre à crédit',
        bullets: [
          'Au moment d’encaisser, choisissez « Crédit ».',
          'Sélectionnez le client (ou créez-le sur place).',
          'Retrouvez le solde dû dans « Créances ».',
          'Enregistrez chaque remboursement au fur et à mesure.',
        ],
      },
      {
        heading: 'Lire vos rapports',
        bullets: [
          'Ouvrez « Rapports ».',
          'Choisissez la période : jour, semaine, mois, ou des dates précises.',
          'Consultez votre chiffre d’affaires, votre marge et vos meilleurs produits.',
          'Exportez en PDF ou CSV si besoin.',
        ],
      },
      {
        heading: 'Besoin d’un coup de main ?',
        paragraphs: ['Écrivez-nous sur WhatsApp au +90 552 786 36 55 ou via la page Contact.'],
      },
    ],
  },
  en: {
    eyebrow: 'Tutorials',
    title: 'Tutorials',
    intro: 'Short, practical guides to get up and running with Sahilley in a few minutes.',
    sections: [
      {
        heading: 'Record a sale',
        bullets: [
          'Open "Vendre".',
          'Tap products to add them to the cart.',
          'Choose the payment method: cash, mobile money or credit.',
          'Confirm the sale.',
          'Print the receipt or send it to the customer on WhatsApp.',
        ],
      },
      {
        heading: 'Add a product',
        bullets: [
          'Go to "Stock", then "Ajouter un produit".',
          'Enter the name, price and quantity.',
          'Optional: add a photo and a barcode.',
          'Save: the product appears in your catalogue and at checkout.',
        ],
      },
      {
        heading: 'Sell on credit',
        bullets: [
          'When taking payment, choose "Crédit".',
          'Select the customer (or create one on the spot).',
          'Find the outstanding balance in "Créances".',
          'Record each repayment as it comes in.',
        ],
      },
      {
        heading: 'Read your reports',
        bullets: [
          'Open "Rapports".',
          'Choose the period: day, week, month, or specific dates.',
          'Check your revenue, your margin and your best-selling products.',
          'Export to PDF or CSV if needed.',
        ],
      },
      {
        heading: 'Need a hand?',
        paragraphs: ['Write to us on WhatsApp at +90 552 786 36 55 or via the Contact page.'],
      },
    ],
  },
  ar: {
    eyebrow: 'شروحات',
    title: 'شروحات',
    intro: 'أدلّة قصيرة وعملية لتتقن استخدام Sahilley في دقائق معدودة.',
    sections: [
      {
        heading: 'تسجيل عملية بيع',
        bullets: [
          'افتح «Vendre».',
          'انقر على المنتجات لإضافتها إلى السلة.',
          'اختر طريقة الدفع: نقداً، أو موبايل موني، أو بالآجل.',
          'أكّد عملية البيع.',
          'اطبع الإيصال أو أرسله إلى الزبون عبر واتساب.',
        ],
      },
      {
        heading: 'إضافة منتج',
        bullets: [
          'انتقل إلى «Stock»، ثم «Ajouter un produit».',
          'أدخل الاسم والسعر والكمية.',
          'اختياري: أضف صورة ورمزاً شريطياً.',
          'احفظ: يظهر المنتج في كتالوجك وعند الصندوق.',
        ],
      },
      {
        heading: 'البيع بالآجل',
        bullets: [
          'عند التحصيل، اختر «Crédit».',
          'اختر الزبون (أو أنشئه على الفور).',
          'تجد الرصيد المستحق في «Créances».',
          'سجّل كل دفعة سداد أولاً بأول.',
        ],
      },
      {
        heading: 'قراءة تقاريرك',
        bullets: [
          'افتح «Rapports».',
          'اختر الفترة: يوم، أسبوع، شهر، أو تواريخ محددة.',
          'اطّلع على رقم أعمالك وهامش ربحك وأفضل منتجاتك.',
          'صدّرها بصيغة PDF أو CSV عند الحاجة.',
        ],
      },
      {
        heading: 'بحاجة إلى مساعدة؟',
        paragraphs: ['راسلنا على واتساب على الرقم +90 552 786 36 55 أو عبر صفحة التواصل.'],
      },
    ],
  },
};

export default async function Page() {
  const { locale } = await getServerT();
  const c = CONTENT[locale];
  return <ContentPage eyebrow={c.eyebrow} title={c.title} intro={c.intro} sections={c.sections} />;
}
