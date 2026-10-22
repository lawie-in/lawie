import { Calendar } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';
import { SupplierContactLine, SupplierTermsSentence } from '@/components/marketing/SupplierDetails';

export const metadata: Metadata = {
  title: 'Lawie — Terms of Service',
  description:
    'The Terms of Service that govern your use of Lawie, a drafting assistant for Indian advocates.',
};

export default function TermsPage() {
  return (
    <>
      <SiteNav />

      <header className="page-hero page-hero--left">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Legal
          </span>
          <h1 style={{ maxWidth: 'none' }}>Terms of Service</h1>
          <p className="sub" style={{ marginLeft: 0 }}>
            The agreement that governs your use of Lawie.
          </p>
        </div>
      </header>

      <section className="section bg-white">
        <div className="container">
          <div style={{ marginBottom: '44px' }}>
            <span className="legal-updated">
              <Calendar strokeWidth={1.5} /> Last updated: 22 October 2026
            </span>
            <p
              style={{
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-2)',
                maxWidth: '720px',
              }}
            >
              Please read these Terms carefully. They explain your rights and responsibilities when
              using Lawie, and the limits of what a drafting assistant can do.
            </p>
          </div>
          <div className="legal-wrap">
            <aside className="legal-sidebar">
              <p className="toc-label">On this page</p>
              <ul className="legal-toc">
                <li>
                  <a href="#acceptance">1. Acceptance of Terms</a>
                </li>
                <li>
                  <a href="#description">2. Description of Service</a>
                </li>
                <li>
                  <a href="#disclaimer">3. Drafting Disclaimer</a>
                </li>
                <li>
                  <a href="#responsibilities">4. User Responsibilities</a>
                </li>
                <li>
                  <a href="#account">5. Account Registration</a>
                </li>
                <li>
                  <a href="#billing">6. Subscription &amp; Billing</a>
                </li>
                <li>
                  <a href="#ip">7. Intellectual Property</a>
                </li>
                <li>
                  <a href="#privacy">8. Data Privacy</a>
                </li>
                <li>
                  <a href="#liability">9. Limitation of Liability</a>
                </li>
                <li>
                  <a href="#indemnity">10. Indemnity</a>
                </li>
                <li>
                  <a href="#termination">11. Termination</a>
                </li>
                <li>
                  <a href="#law">12. Governing Law</a>
                </li>
                <li>
                  <a href="#changes">13. Changes to Terms</a>
                </li>
                <li>
                  <a href="#contact">14. Contact</a>
                </li>
              </ul>
            </aside>
            <div className="legal-content">
              <section id="acceptance">
                <h3>1. Acceptance of Terms</h3>
                <p>
                  By accessing or using Lawie (&quot;the Service&quot;), you agree to be bound by
                  these Terms of Service.{' '}
                  {/* T-436: Ajay 5b (Addenda 1, 7 and 8); hidden when the supplier details are unavailable. */}
                  <SupplierTermsSentence />
                  If you do not agree, you must not use the Service.
                </p>
              </section>
              <section id="description">
                <h3>2. Description of Service</h3>
                <p>
                  Lawie is a drafting assistant for advocates. It creates first drafts of legal
                  documents for the advocate to review, edit and download. Criminal drafts use BNS,
                  BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law
                  applies. The Service does not provide legal advice or representation.
                </p>
              </section>
              <section id="disclaimer">
                <h3>3. Drafting Disclaimer</h3>
                <p>
                  <strong>
                    Lawie is a drafting assistant. The advocate is responsible for legal accuracy
                    and filing.
                  </strong>{' '}
                  Generated documents may contain errors and must be reviewed by a qualified
                  advocate before they are relied upon, filed, or used. Lawie does not certify any
                  document as court-approved or legally valid, and makes no guarantee as to outcome.
                </p>
              </section>
              <section id="responsibilities">
                <h3>4. User Responsibilities</h3>
                <p>
                  You are responsible for the accuracy of the information you enter and for
                  reviewing, verifying, and finalising every generated document before use. You
                  agree to use the Service only for lawful purposes and in compliance with the rules
                  of the Bar Council of India and applicable court rules.
                </p>
              </section>
              <section id="account">
                <h3>5. Account Registration</h3>
                <p>
                  You must provide accurate registration information and keep your credentials
                  secure. You are responsible for all activity under your account. We may suspend
                  accounts that violate these Terms.
                </p>
              </section>
              <section id="billing">
                <h3>6. Subscription &amp; Billing</h3>
                <p>
                  Paid plans are billed in advance on a monthly or annual basis through our payment
                  processor. Drafts are paid for with Ink. Most documents use 2 Ink; short ones use
                  1. You are charged only after a draft is generated; a failed generation is not
                  charged. Plan Ink is given for each month of your plan, including on annual plans.
                  Plan Ink left unused at the end of that month expires and does not carry over.
                  Top-up Ink you buy separately does not expire while your account is open. It ends
                  when your account is closed. Subscriptions renew automatically until cancelled.
                  You may cancel at any time from your account settings; cancellation stops future
                  charges and takes effect at the end of the current billing period. All payments
                  are non-refundable, as set out in our <Link href="/refunds">Refund Policy</Link>.
                  This does not affect any right you have under law.
                </p>
              </section>
              <section id="ip">
                <h3>7. Intellectual Property</h3>
                <p>
                  The Service, including its templates, software, and brand, is owned by Lawie.
                  Documents you generate using your own case details are yours to use. You may not
                  copy, resell, or redistribute the Service or its templates.
                </p>
              </section>
              <section id="privacy">
                <h3>8. Data Privacy</h3>
                <p>
                  Your use of the Service is also governed by our{' '}
                  <Link href="/privacy">Privacy Policy</Link>, which explains what information we
                  collect and how it is processed under the Digital Personal Data Protection Act,
                  2023.
                </p>
              </section>
              <section id="liability">
                <h3>9. Limitation of Liability</h3>
                <p>
                  To the maximum extent permitted by law, Lawie is not liable for any indirect,
                  incidental, or consequential damages, or for any loss arising from your reliance
                  on a generated document. Our total liability is limited to the amount you paid for
                  the Service in the three months preceding the claim. Nothing in these Terms limits
                  any liability that cannot be limited by law.
                </p>
              </section>
              <section id="indemnity">
                <h3>10. Indemnity</h3>
                <p>
                  You agree to indemnify and hold Lawie harmless from any claims, losses, or
                  expenses arising out of your use of the Service or your violation of these Terms.
                </p>
              </section>
              <section id="termination">
                <h3>11. Termination</h3>
                <p>
                  You may stop using the Service at any time. We may suspend or terminate access if
                  you breach these Terms or use the Service unlawfully. Provisions that by their
                  nature should survive termination will survive.
                </p>
              </section>
              <section id="law">
                <h3>12. Governing Law</h3>
                <p>
                  These Terms are governed by the laws of India. Any dispute is subject to the
                  exclusive jurisdiction of the courts at Ranchi, Jharkhand. Nothing in this section
                  limits any right you have to approach a Consumer Commission where you live or
                  work.
                </p>
              </section>
              <section id="changes">
                <h3>13. Changes to Terms</h3>
                <p>
                  We may update these Terms from time to time. Material changes will be notified
                  through the Service. Continued use after changes take effect constitutes
                  acceptance.
                </p>
              </section>
              <section id="contact">
                <h3>14. Contact</h3>
                {/* T-436: Ajay 5c (Addendum 1: legal name only); hidden when unavailable. */}
                <SupplierContactLine />
                <p>
                  Questions about these Terms can be sent to{' '}
                  <a href="mailto:legal@lawie.in">legal@lawie.in</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
