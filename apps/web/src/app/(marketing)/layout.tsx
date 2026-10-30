import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './marketing.css';

import { LogoSplash } from '@/components/marketing/LogoSplash';
import { MarketingFrame } from '@/components/marketing/MarketingFrame';

// T-517: these three fonts serve only the old marketing pages (MarketingFrame drops them on the
// Night Library pages, which use Mukta + Tiro from the root layout). preload is off for Lora and
// Fraunces so the landing and pricing pages do not download them; the old pages still load them
// when used (the splash waits for Fraunces with document.fonts.load). Inter is the root layout's
// preloaded file (see below).
// T-695: served from the repo (src/fonts/<family>/, release artifacts, byte-identical, with OFL.txt
// and SOURCE.txt); same weights, CSS variables and display as the next/font/google calls before.
// Inter: identical to the root layout's call on purpose (same options, so the same file URL; the
// root layout already preloads it), so a marketing page fetches Inter once.
const inter = localFont({
  src: '../../fonts/inter/InterVariable.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  declarations: [{ prop: 'font-variation-settings', value: "'opsz' 14" }],
});
// The variable font (weight axis 400-700), declared for 500 to 700: the weights 500, 600 and 700
// asked for before.
const lora = localFont({
  src: '../../fonts/lora/Lora[wght].ttf',
  weight: '500 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-lora',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
// T-310 (AC6): Fraunces self-hosted for the logo splash; no request to fonts.googleapis.com.
// The variable font (weight and opsz axes; SOFT and WONK stay at the font's defaults, as Google
// served them); the splash sets weight 500 and opsz 144 itself.
const fraunces = localFont({
  src: '../../fonts/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-fraunces',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});

export const metadata: Metadata = {
  title: 'Lawie — AI Legal Drafting for Indian Advocates',
  description:
    'Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingFrame
      legacyClassName={`${inter.variable} ${lora.variable} ${fraunces.variable}`}
      splash={<LogoSplash fontFamily={fraunces.style.fontFamily} />}
    >
      {children}
    </MarketingFrame>
  );
}
