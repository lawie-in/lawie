import { Calendar } from 'lucide-react';
import type { Metadata } from 'next';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Refund Policy',
  description: "Lawie's refund policy for plans and Ink top-up packs.",
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
              <Calendar strokeWidth={1.5} /> Last updated: 22 October 2026
            </span>
          </div>
          <div className="card refund-card">
            <p>
              Payments for plans and Ink top-up packs are non-refundable once the plan period has
              started or the Ink has been added to your account.
            </p>
            <p>
              If you were charged twice for the same purchase, or charged by mistake, write to
              contact@lawie.in within 30 days. We will check and refund the extra amount to the
              original payment method, and issue a GST credit note.
            </p>
            <p>
              Cancelling a plan stops future charges and takes effect at the end of the current
              billing period.
            </p>
            <p>This does not affect any right you have under law.</p>
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
