import { FileText, CreditCard, Scale, Monitor, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import Accordion from '@/components/marketing/Accordion';
import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Frequently Asked Questions',
  description:
    'Answers to common questions about Lawie: documents, BNS/BNSS/BSA mappings, pricing, privacy, and how the AI-assisted drafting tool works.',
};

const productFaq = [
  {
    question: 'What documents does Lawie generate today?',
    answer:
      'Bail applications (regular and anticipatory), legal notices (S.80 CPC and S.138 NI Act), rent agreements, consumer complaints, vakalatnama, affidavits, maintenance petitions, and cheque bounce complaints. New templates are added regularly.',
  },
  {
    question: 'Are the BNS, BNSS, BSA mappings reliable?',
    answer:
      'Section mappings are built from the official IPC→BNS, CrPC→BNSS, and IEA→BSA correspondence tables. Every section cited in a generated document is validated against these mappings before it appears in your draft. You should always review the final document before filing.',
  },
  {
    question: 'Can I edit the document after Lawie generates it?',
    answer:
      'Yes. Every document opens in an editor where you can change any text, add annexures, or adjust the formatting. Lawie gives you a structured starting point and you stay in control of the final draft.',
  },
  {
    question: 'Which courts does Lawie format for?',
    answer:
      'District and High Courts across Bihar, Jharkhand, UP, and Delhi, with more states added regularly. You select your state, court type, and court name, and the cause title and formatting adjust accordingly.',
  },
  {
    question: 'Does Lawie handle Hindi documents?',
    answer:
      'English is fully supported today. Hindi drafting is on the roadmap and rolling out template by template.',
  },
];

const pricingFaq = [
  {
    question: 'How much does Lawie cost?',
    answer:
      'Lawie has a free tier that includes 5 Ink (lifetime). Solo is ₹799/month (50 Ink/month). Pro is ₹1,999/month (150 Ink/month).',
  },
  {
    question: "What's included in the free tier?",
    answer:
      'Five Ink lifetime for free users. All templates, court formatting, BNS validation, PDF/DOCX export. Free exports carry a Lawie watermark.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes, from your account settings. Cancellation stops all future charges and takes effect at the end of your current billing period.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'No. Subscriptions are billed in advance and are non-refundable for any portion of the subscription period. You can cancel anytime to stop future charges — see the Refund Policy for details.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'Payments are processed securely through Razorpay, which supports UPI, debit and credit cards, net banking, and popular wallets.',
  },
];

const legalFaq = [
  {
    question: 'Is Lawie a substitute for a lawyer?',
    answer:
      'No. Lawie is an AI-assisted drafting tool — not a substitute for legal advice. You remain responsible for reviewing and finalising every document before it is used or filed.',
  },
  {
    question: 'Are my case details private?',
    answer:
      'Your documents are encrypted in storage and transmitted over secure connections. Case details are processed only to generate the document you requested. See the Privacy Policy for how data is handled under the DPDP Act, 2023.',
  },
  {
    question: 'What disclaimer applies to generated documents?',
    answer:
      'Every document is produced by an AI-assisted tool and should be reviewed by the filing advocate before use. Lawie does not certify any document as court-approved or legally valid.',
  },
  {
    question: 'Who reviews the templates?',
    answer:
      'Templates are designed against current Indian court formats and validated against the official section mappings. Lawie is an AI-assisted tool — the filing advocate is responsible for reviewing each generated draft before use.',
  },
];

const technicalFaq = [
  {
    question: 'Do I need to install anything?',
    answer: 'No. Lawie runs entirely in your web browser. There is nothing to download or install.',
  },
  {
    question: 'Does Lawie work on mobile?',
    answer:
      'Yes. The site and the drafting flow work on modern mobile browsers, though a larger screen is more comfortable for reviewing long documents.',
  },
  {
    question: 'How fast does document generation happen?',
    answer:
      'Most documents are generated in under five minutes from a completed form, depending on the length and complexity of the document.',
  },
];

export default function FaqPage() {
  return (
    <>
      <style>{`
        .faq-cat{max-width:820px;margin:0 auto}
        .faq-cat+.faq-cat{margin-top:56px}
        .faq-cat-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .faq-cat-head .icon-tile{width:42px;height:42px}
        .faq-cat-head .icon-tile svg{width:21px;height:21px}
        .faq-cat-head h2{font-size:28px}
        .faq-foot{max-width:820px;margin:64px auto 0;text-align:center;padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card)}
        .faq-foot p{font-size:17px;color:var(--text-2);margin-bottom:18px}
      `}</style>

      <SiteNav activePage="faq" />

      <header className="page-hero">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            FAQ
          </span>
          <h1>Frequently asked questions.</h1>
          <p className="sub">
            Everything advocates ask about Lawie — the product, pricing, and the legal fine print.
          </p>
        </div>
      </header>

      <section className="section bg-cream">
        <div className="container">
          <div className="faq-cat">
            <div className="faq-cat-head">
              <div className="icon-tile icon-tile--gold">
                <FileText strokeWidth={1.5} />
              </div>
              <h2>Product</h2>
            </div>
            <Accordion items={productFaq} singleOpen />
          </div>
          <div className="faq-cat">
            <div className="faq-cat-head">
              <div className="icon-tile icon-tile--teal">
                <CreditCard strokeWidth={1.5} />
              </div>
              <h2>Pricing</h2>
            </div>
            <Accordion items={pricingFaq} singleOpen />
          </div>
          <div className="faq-cat">
            <div className="faq-cat-head">
              <div className="icon-tile">
                <Scale strokeWidth={1.5} />
              </div>
              <h2>Legal &amp; Compliance</h2>
            </div>
            <Accordion items={legalFaq} singleOpen />
          </div>
          <div className="faq-cat">
            <div className="faq-cat-head">
              <div className="icon-tile icon-tile--gold">
                <Monitor strokeWidth={1.5} />
              </div>
              <h2>Technical</h2>
            </div>
            <Accordion items={technicalFaq} singleOpen />
          </div>
          <div className="faq-foot">
            <p>Still have a question?</p>
            <Link className="btn btn-ghost" href="/contact">
              <Mail strokeWidth={1.5} /> Email contact@lawie.in
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
