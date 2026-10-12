import type { Metadata } from 'next';
import { Fraunces, Inter, Lora } from 'next/font/google';
import './marketing.css';

import { LogoSplash } from '@/components/marketing/LogoSplash';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const lora = Lora({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-lora' });
// T-310 (AC6): Fraunces self-hosted for the logo splash; no request to fonts.googleapis.com.
// next/font rejects axes together with a fixed weight, so this is the variable font (weight
// axis) plus the opsz axis; the splash sets weight 500 and opsz 144 itself.
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  title: 'Lawie — AI Legal Drafting for Indian Advocates',
  description: 'Legal drafting for Indian advocates. Built around BNS, BNSS, and BSA.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${lora.variable} ${fraunces.variable}`}>
      <LogoSplash fontFamily={fraunces.style.fontFamily} />
      {children}
    </div>
  );
}
