import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lawie — Pricing',
  description:
    'Simple, transparent pricing. Free tier with 5 Ink lifetime, or Solo at ₹799/month for 50 Ink/month.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
