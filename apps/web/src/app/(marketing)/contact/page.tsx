import { Mail, ShieldCheck, Scale, CreditCard, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Contact',
  description:
    'Get in touch with Lawie. Email contact@lawie.in — we typically reply within 24 hours.',
};

export default function ContactPage() {
  return (
    <>
      <style>{`
        .contact-card{max-width:560px;margin:0 auto;text-align:center}
        .contact-card .icon-tile{width:64px;height:64px;margin:0 auto 22px}
        .contact-card .icon-tile svg{width:30px;height:30px}
        .contact-card h3{font-size:24px;margin-bottom:8px}
        .contact-card .email{font-size:20px;font-weight:600;color:var(--gold);text-decoration:none}
        .contact-card .email:hover{text-decoration:underline}
        .contact-card p{color:var(--text-2);font-size:16px;margin-top:10px}
        .address{max-width:560px;margin:24px auto 0;text-align:center;font-size:15px;color:var(--text-muted);line-height:1.7;padding:22px;border:1px dashed var(--border-strong);border-radius:var(--r-card);background:var(--surface)}
        .address .lbl{display:block;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px}
        .route-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:920px;margin:56px auto 0}
        .route{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
        .route svg.ic{width:22px;height:22px;color:var(--navy);stroke-width:1.5}
        .route h4{font-size:18px}
        .route a.link-arrow{margin-top:auto}
        @media(max-width:768px){.route-grid{grid-template-columns:1fr}}
      `}</style>

      <SiteNav />

      <header className="page-hero">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Contact
          </span>
          <h1>Get in touch.</h1>
          <p className="sub">Email is the fastest way to reach us — no forms, no queues.</p>
        </div>
      </header>

      <section className="section bg-cream">
        <div className="container">
          <div className="card contact-card">
            <div className="icon-tile icon-tile--gold">
              <Mail strokeWidth={1.5} />
            </div>
            <h3>Email us</h3>
            <a className="email" href="mailto:contact@lawie.in">
              contact@lawie.in
            </a>
            <p>We typically reply within 24 hours.</p>
          </div>
          <div className="address">
            <span className="lbl">Registered Address</span>
            Lawie (Sole Proprietorship)
            <br />
            [Street address placeholder]
            <br />
            Patna, Bihar — [PIN]
          </div>
          <div className="route-grid">
            <article className="card route">
              <ShieldCheck className="ic" strokeWidth={1.5} />
              <h4>Privacy questions</h4>
              <p style={{ fontSize: '15px', color: 'var(--text-2)' }}>
                Data, deletion, and DPDP requests.
              </p>
              <a className="link-arrow" href="mailto:privacy@lawie.in">
                privacy@lawie.in <ArrowRight strokeWidth={1.5} />
              </a>
            </article>
            <article className="card route">
              <Scale className="ic" strokeWidth={1.5} />
              <h4>Legal questions</h4>
              <p style={{ fontSize: '15px', color: 'var(--text-2)' }}>
                Terms, compliance, and notices.
              </p>
              <a className="link-arrow" href="mailto:legal@lawie.in">
                legal@lawie.in <ArrowRight strokeWidth={1.5} />
              </a>
            </article>
            <article className="card route">
              <CreditCard className="ic" strokeWidth={1.5} />
              <h4>Pricing &amp; billing</h4>
              <p style={{ fontSize: '15px', color: 'var(--text-2)' }}>
                Plans, invoices, and payments.
              </p>
              <Link className="link-arrow" href="/pricing">
                See pricing <ArrowRight strokeWidth={1.5} />
              </Link>
            </article>
          </div>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
