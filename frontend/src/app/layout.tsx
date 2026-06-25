import type { Metadata, Viewport } from 'next';
import { DM_Sans, Tajawal } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { getServerLocale } from '@/lib/i18n/server';
import { dir } from '@/lib/i18n/config';
import { getServerTheme } from '@/lib/theme/server';
import PwaRegistrar from '@/components/pwa/PwaRegistrar';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

// Police arabe moderne — appliquée uniquement en `lang="ar"` (voir globals.css).
const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-tajawal',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sahilley.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Sahilley — Gestion de boutique',
    template: '%s · Sahilley',
  },
  description:
    'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. En FCFA, trilingue, simple.',
  applicationName: 'Sahilley',
  keywords: [
    'gestion boutique',
    'caisse',
    'point de vente',
    'stock',
    'ventes à crédit',
    'créances',
    'dépenses',
    'FCFA',
    'Tchad',
    'CEMAC',
    'commerce',
  ],
  authors: [{ name: 'Sahilley' }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Sahilley',
    title: 'Sahilley — Gérez votre boutique',
    description:
      'Caisse, stock, ventes à crédit, dépenses et rapports. En FCFA, trilingue, simple.',
    url: SITE_URL,
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sahilley — Gérez votre boutique',
    description: 'Caisse, stock, ventes à crédit, dépenses et rapports. En FCFA, trilingue.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0a3d2e',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()]);
  return (
    <html
      lang={locale}
      dir={dir(locale)}
      className={`${dmSans.variable} ${tajawal.variable}${theme === 'dark' ? ' dark' : ''}`}
    >
      <body>
        <PwaRegistrar />
        <ToastProvider>
          <ConfirmProvider>
            <LocaleProvider initialLocale={locale}>
              <ThemeProvider initialTheme={theme}>
                <AuthProvider>{children}</AuthProvider>
              </ThemeProvider>
            </LocaleProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
