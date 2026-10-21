import type { Metadata } from 'next';
import { Fraunces, Inter, Lora } from 'next/font/google';
import './marketing.css';

import { LogoSplash } from '@/components/marketing/LogoSplash';
import { MarketingFrame } from '@/components/marketing/MarketingFrame';

// T-517: these three fonts serve only the old marketing pages (MarketingFrame drops them on the
// Night Library pages, which use Mukta + Tiro from the root layout). preload is off so the
// landing and pricing pages do not download them; the old pages still load them when used (the
// splash waits for Fraunces with document.fonts.load).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', preload: false });
const lora = Lora({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-lora',
  preload: false,
});
// T-310 (AC6): Fraunces self-hosted for the logo splash; no request to fonts.googleapis.com.
// next/font rejects axes together with a fixed weight, so this is the variable font (weight
// axis) plus the opsz axis; the splash sets weight 500 and opsz 144 itself.
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-fraunces',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Lawie — AI Legal Drafting for Indian Advocates',
  description:
    'Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.',
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
