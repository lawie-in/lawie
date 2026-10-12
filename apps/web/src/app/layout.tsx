import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';

import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
// T-005 brand headings (describe-first screens). Exposed as a CSS variable, used via `font-heading`.
const lora = Lora({ subsets: ['latin'], weight: ['600'], variable: '--font-lora' });

export const metadata: Metadata = {
  title: 'Lawie — Drafting Assistant for Indian Advocates',
  description:
    'Stop Googling legal formats. Lawie is a drafting assistant for Indian advocates. Draft bail applications, legal notices, and more, then review before you file.',
  keywords: [
    'legal drafting',
    'drafting assistant',
    'Indian advocates',
    'bail application',
    'legal notice',
    'affidavit',
    'rent agreement',
  ],
  icons: {
    icon: '/app-icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${lora.variable}`}>
        {/* T-306: GA only on public allowlisted pages, page views without query or hash. */}
        <GoogleAnalytics />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
