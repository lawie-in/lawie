import { PLANS } from '@lawie/shared';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lawie — Pricing',
  description:
    'Simple, transparent pricing. Free tier with 5 Ink (lifetime), once your email is verified, ' +
    `or Solo at ₹${PLANS.solo_monthly.priceInr.toLocaleString('en-IN')}/month ` +
    `for ${PLANS.solo_monthly.inkPerCycle} Ink/month.`,
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
