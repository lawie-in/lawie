import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './marketing.css';

import { LogoSplash } from '@/components/marketing/LogoSplash';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const lora = Lora({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-lora' });

export const metadata: Metadata = {
  title: 'Lawie — AI Legal Drafting for Indian Advocates',
  description:
    'Draft court-ready legal documents in under 5 minutes. Built around BNS, BNSS, and BSA.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${lora.variable}`}>
      <LogoSplash />
      {children}
    </div>
  );
}
