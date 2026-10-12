import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';

import AnalyticsConsent from '@/components/AnalyticsConsent';
import { AuthProvider } from '@/context/AuthContext';
import { SignupSourceCapture } from '@/lib/signup-source';
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
        {/* T-242: keeps utm_source/medium/campaign of the landing link in sessionStorage until
            sign-up. Renders nothing; first party only (Ajay, T-242 signed). */}
        <SignupSourceCapture />
        {/* T-310: the consent notice, first in the body content (design: focus order). GA loads
            only after Accept, only on T-306's public allowlist, page views without query or hash. */}
        <AnalyticsConsent />
        {/* T-310: focus target after a first-time choice. A div, not <main>: the dashboard, admin,
            login and review pages render their own <main>. tabindex is set only at focus time
            (AnalyticsConsent's returnFocus), so the whole app is not a focusable region. */}
        <div id="main" className="focus:outline-none">
          <AuthProvider>{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
