import { PLANS } from '@lawie/shared';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lawie — Pricing',
  description:
    'Free tier with 5 Ink (one time), once your email is verified, ' +
    `or Solo at ₹${PLANS.solo_monthly.priceInr.toLocaleString('en-IN')}/month ` +
    `for ${PLANS.solo_monthly.inkPerCycle} Ink/month.`,
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
