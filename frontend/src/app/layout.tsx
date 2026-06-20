import type { Metadata } from 'next';
import { DM_Sans, Tajawal } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { getServerLocale } from '@/lib/i18n/server';
import { dir } from '@/lib/i18n/config';
import { getServerTheme } from '@/lib/theme/server';

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

export const metadata: Metadata = {
  title: 'Sahilley — Gestion de boutique',
  description: 'Caisse, stock, ventes, créances et dépenses pour votre boutique.',
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
        <ToastProvider>
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <AuthProvider>{children}</AuthProvider>
            </ThemeProvider>
          </LocaleProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
