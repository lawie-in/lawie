import { Calendar } from 'lucide-react';
import type { Metadata } from 'next';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Privacy Policy',
  description:
    'How Lawie collects, uses, and protects your data under the Digital Personal Data Protection Act, 2023.',
};

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />

      <header className="page-hero page-hero--left">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Legal
          </span>
          <h1 style={{ maxWidth: 'none' }}>Privacy Policy</h1>
          <p className="sub" style={{ marginLeft: 0 }}>
            What we collect, why, and your rights under the DPDP Act, 2023.
          </p>
        </div>
      </header>

      <section className="section bg-white">
        <div className="container">
          <div style={{ marginBottom: '44px' }}>
            <span className="legal-updated">
              <Calendar strokeWidth={1.5} /> Last updated: 1 June 2026
            </span>
            <p
              style={{
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-2)',
                maxWidth: '720px',
              }}
            >
              This policy explains how Lawie handles your information. We keep data collection to
              what is needed to generate your documents and run the Service.
            </p>
          </div>
          <div className="legal-wrap">
            <aside className="legal-sidebar">
              <p className="toc-label">On this page</p>
              <ul className="legal-toc">
                <li>
                  <a href="#collect">1. Information We Collect</a>
                </li>
                <li>
                  <a href="#use">2. How We Use Information</a>
                </li>
                <li>
                  <a href="#storage">3. Data Storage &amp; Security</a>
                </li>
                <li>
                  <a href="#encryption">4. Document Encryption</a>
                </li>
                <li>
                  <a href="#third-party">5. Third-Party Services</a>
                </li>
                <li>
                  <a href="#cookies">6. Cookies</a>
                </li>
                <li>
                  <a href="#rights">7. Your Rights Under the DPDP Act, 2023</a>
                </li>
                <li>
                  <a href="#children">8. Children&apos;s Privacy</a>
                </li>
                <li>
                  <a href="#retention">9. Data Retention</a>
                </li>
                <li>
                  <a href="#contact">10. Contact</a>
                </li>
              </ul>
            </aside>
            <div className="legal-content">
              <section id="collect">
                <h3>1. Information We Collect</h3>
                <p>
                  We collect the account details you provide (such as name, email, and enrolment
                  information), the case details you enter to generate documents, and basic
                  technical data such as device and usage logs.
                </p>
              </section>
              <section id="use">
                <h3>2. How We Use Information</h3>
                <p>
                  We use your information to generate the documents you request, operate and improve
                  the Service, process payments, and communicate with you about your account. We do
                  not sell your personal data.
                </p>
              </section>
              <section id="storage">
                <h3>3. Data Storage &amp; Security</h3>
                <p>
                  Data is stored on managed cloud infrastructure with access controls and encryption
                  in transit. We take reasonable technical and organisational measures to protect
                  your information against unauthorised access.
                </p>
              </section>
              <section id="encryption">
                <h3>4. Document Encryption</h3>
                <p>
                  Your generated documents and the case details within them are encrypted at rest
                  and transmitted over secure connections. Access is limited to processing your
                  requests and providing support.
                </p>
              </section>
              <section id="third-party">
                <h3>5. Third-Party Services</h3>
                <p>
                  We rely on a small number of trusted processors to run the Service:{' '}
                  <strong>Razorpay</strong> (payments), <strong>Anthropic</strong> (AI drafting),{' '}
                  <strong>MongoDB Atlas</strong> (database), <strong>AWS</strong> (hosting), and{' '}
                  <strong>Google Workspace</strong> (transactional email). Each processes data only
                  as needed to provide its function.
                </p>
              </section>
              <section id="cookies">
                <h3>6. Cookies</h3>
                <p>
                  We use essential cookies to keep you signed in and to remember preferences. We do
                  not use cookies for third-party advertising.
                </p>
              </section>
              <section id="rights">
                <h3>7. Your Rights Under the DPDP Act, 2023</h3>
                <p>
                  You have the right to access, correct, and request deletion of your personal data,
                  and to withdraw consent. To exercise these rights, write to{' '}
                  <a href="mailto:privacy@lawie.in">privacy@lawie.in</a>.
                </p>
              </section>
              <section id="children">
                <h3>8. Children&apos;s Privacy</h3>
                <p>
                  The Service is intended for practising advocates and is not directed at children.
                  We do not knowingly collect data from anyone under 18.
                </p>
              </section>
              <section id="retention">
                <h3>9. Data Retention</h3>
                <p>
                  We retain your data for as long as your account is active and as required to
                  comply with legal obligations. You may request deletion of your documents and
                  account at any time.
                </p>
              </section>
              <section id="contact">
                <h3>10. Contact</h3>
                <p>
                  For any privacy question or request, contact{' '}
                  <a href="mailto:privacy@lawie.in">privacy@lawie.in</a>.
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
