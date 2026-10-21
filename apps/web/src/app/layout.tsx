import type { Metadata } from 'next';
import { Inter, Lora, Mukta, Tiro_Devanagari_Hindi } from 'next/font/google';

import AnalyticsConsent from '@/components/AnalyticsConsent';
import { THEME_INIT_SCRIPT } from '@/components/shell/theme';
import { ThemeProvider } from '@/components/shell/ThemeProvider';
import { AuthProvider } from '@/context/AuthContext';
import { SignupSourceCapture } from '@/lib/signup-source';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
// T-005 brand headings (describe-first screens). Exposed as a CSS variable, used via `font-heading`.
const lora = Lora({ subsets: ['latin'], weight: ['600'], variable: '--font-lora' });
// T-511 Night Library type (spec 2.3, Arjun 17 Oct). CSS variables only, used via `font-nl-body`
// and `font-nl-display` and the `nl-*` type classes; the body font stays Inter until pages move.
// preload is off so existing pages do not download the new fonts; a font file loads only when a
// Night Library element uses it.
const mukta = Mukta({
  subsets: ['latin', 'devanagari'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mukta',
  preload: false,
});
const tiro = Tiro_Devanagari_Hindi({
  subsets: ['latin', 'devanagari'],
  weight: '400',
  display: 'swap',
  variable: '--font-tiro',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Lawie: drafting assistant for advocates in India',
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
      <head>
        {/* T-511: sets data-theme / data-theme-pref on <html> before first paint (no flash). Only
            Night Library (`.nl`) styles read it; existing pages are unaffected. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${inter.className} ${lora.variable} ${mukta.variable} ${tiro.variable}`}>
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
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
