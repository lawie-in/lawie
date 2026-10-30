import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import AnalyticsConsent from '@/components/AnalyticsConsent';
import {
  DARK_SCHEME_QUERY,
  LIGHT_SCHEME_QUERY,
  THEME_COLOR,
  THEME_INIT_SCRIPT,
} from '@/components/shell/theme';
import { ThemeProvider } from '@/components/shell/ThemeProvider';
import { AuthProvider } from '@/context/AuthContext';
import { SignupSourceCapture } from '@/lib/signup-source';
import './globals.css';

// T-695: every font is served from the repo (src/fonts/<family>/), so the build never fetches
// fonts over the network. Each file is the font project's own release artifact, byte-identical
// (AJ-695); src/fonts/<family>/SOURCE.txt records its release, URL and sha256, next to OFL.txt.
// Same weights, styles, CSS variables and display as the next/font/google calls they replace;
// adjustFontFallback is Arial for the sans fonts and Times New Roman for the serif fonts, as before.
// Inter: the Inter 4.1 release's web/InterVariable.woff2. It also has an opsz axis (14-32); Google
// served Inter fixed at opsz 14, so the @font-face pins opsz 14 (a CSS descriptor; the file is
// unchanged). This call is identical to the one in (marketing)/layout.tsx on purpose, so both
// emit the same file URL and a marketing page fetches Inter once (T-695 rework).
const inter = localFont({
  src: '../fonts/inter/InterVariable.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  // Single quotes inside: Turbopack's next/font/local fails to parse a `"` in a declaration value.
  declarations: [{ prop: 'font-variation-settings', value: "'opsz' 14" }],
});
// T-005 brand headings (describe-first screens). Exposed as a CSS variable, used via `font-heading`.
// T-695 rework (T-584 budget): not preloaded. Lora paints only headings on some screens, never
// above the fold on every route; those headings show the size-adjusted fallback until it loads.
const lora = localFont({
  src: '../fonts/lora/Lora[wght].ttf',
  weight: '600',
  style: 'normal',
  display: 'swap',
  variable: '--font-lora',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
// T-511 Night Library type (spec 2.3, Arjun 17 Oct). CSS variables only, used via `font-nl-body`
// and `font-nl-display` and the `nl-*` type classes; the body font stays Inter until pages move.
// preload is off so existing pages do not download the new fonts; a font file loads only when a
// Night Library element uses it.
const mukta = localFont({
  src: [
    { path: '../fonts/mukta/Mukta-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/mukta/Mukta-Medium.ttf', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-mukta',
  preload: false,
});
const tiro = localFont({
  src: '../fonts/tiro-devanagari-hindi/TiroDevanagariHindi-Regular.ttf',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-tiro',
  preload: false,
  adjustFontFallback: 'Times New Roman',
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

/**
 * T-524: two `<meta name="theme-color">` tags, one per colour scheme, for first paint (Wall,
 * DESIGN.md Colors). ThemeProvider then keeps one unscoped meta on the resolved theme, so a
 * pinned Night or Daylight wins over the system scheme. Next merges this with its default
 * width/initial-scale viewport.
 * T-531 (DESIGN.md Navigation): `viewport-fit=cover`, so the page paints under the notch and
 * `env(safe-area-inset-*)` is non-zero; the top bar, bottom sheets, toasts and the consent sheet
 * pad themselves clear of it.
 */
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: DARK_SCHEME_QUERY, color: THEME_COLOR.night },
    { media: LIGHT_SCHEME_QUERY, color: THEME_COLOR.daylight },
  ],
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
