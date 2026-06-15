import { Calendar } from 'lucide-react';
import type { Metadata } from 'next';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Refund Policy',
  description:
    'Lawie subscriptions are billed in advance and are non-refundable. You can cancel anytime to stop future charges.',
};

export default function RefundsPage() {
  return (
    <>
      <style>{`
        .refund-card{max-width:680px;margin:0 auto}
        .refund-card p{font-size:17px;line-height:1.8;color:var(--text-2);margin-bottom:18px}
        .refund-card p:last-child{margin-bottom:0}
        .refund-card strong{color:var(--navy);font-weight:600}
      `}</style>

      <SiteNav />

      <header className="page-hero">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Legal
          </span>
          <h1>Refund Policy</h1>
        </div>
      </header>

      <section className="section bg-cream">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <span className="legal-updated">
              <Calendar strokeWidth={1.5} /> Last updated: 1 June 2026
            </span>
          </div>
          <div className="card refund-card">
            <p>
              Lawie operates on a monthly and annual subscription basis. Subscriptions are billed in
              advance.{' '}
              <strong>We do not offer refunds for any portion of the subscription period.</strong>
            </p>
            <p>
              You can cancel your subscription at any time from your account settings. Cancellation
              stops all future charges. Cancellation does not refund payments already made.
            </p>
            <p>
              For billing questions, contact us at{' '}
              <a
                href="mailto:contact@lawie.in"
                style={{ color: 'var(--gold)', fontWeight: 500, textDecoration: 'none' }}
              >
                contact@lawie.in
              </a>
              .
            </p>
            <p>This policy is governed by Indian law.</p>
          </div>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
