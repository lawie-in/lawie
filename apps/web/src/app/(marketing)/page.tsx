import {
  ArrowRight,
  ArrowDown,
  Check,
  Scale,
  FileSignature,
  FileText,
  Home,
  ShieldAlert,
  Megaphone,
  Users,
  Receipt,
  Download,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import Accordion from '@/components/marketing/Accordion';
import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Court-ready legal drafting for Indian advocates',
  description:
    'Draft court-ready legal documents in under 5 minutes. Built around the current Indian criminal codes — BNS, BNSS, and BSA. Formatted for your specific court.',
};

// The sample PDFs are served by the gateway, the same host the app calls for everything else.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const reasons = [
  {
    title: 'FIR at 4 PM. Bail hearing tomorrow at 10.',
    body: 'The format you find online cites Section 437 CrPC. Lawie drafts under the current codes: BNS, BNSS and BSA.',
  },
  {
    title: 'The registry returned your application.',
    body: 'Wrong cause title. Missing verification. Lawie sets the document out for your state and court.',
  },
  {
    title: 'Half your evening goes to formatting.',
    body: 'Advocate blocks, annexure lists, enrolment numbers. Lawie handles the boilerplate so your time goes to the argument.',
  },
];

const steps = [
  {
    title: 'Say what you need',
    body: 'Name the document and choose your state and court.',
  },
  {
    title: 'Give the case details',
    body: 'FIR number, sections, parties. Only what this document needs.',
  },
  {
    title: 'Review and export',
    body: 'Edit the draft in your browser, then download PDF or DOCX.',
  },
];

interface DraftItem {
  icon: LucideIcon;
  label: string;
  sample?: { href: string; file: string };
}

const draftItems: DraftItem[] = [
  {
    icon: Scale,
    label: 'Bail applications (regular and anticipatory)',
    sample: {
      href: `${API_URL}/api/samples/bail-application`,
      file: 'Bail Application Sample.pdf',
    },
  },
  {
    icon: Megaphone,
    label: 'Legal notices (S.80 CPC, S.138 NI Act)',
    sample: {
      href: `${API_URL}/api/samples/legal-notice-s138`,
      file: 'Legal Notice S138 Sample.pdf',
    },
  },
  {
    icon: Home,
    label: 'Rent agreements',
    sample: { href: `${API_URL}/api/samples/rent-agreement`, file: 'Rent Agreement Sample.pdf' },
  },
  {
    icon: ShieldAlert,
    label: 'Consumer complaints',
    sample: {
      href: `${API_URL}/api/samples/consumer-complaint`,
      file: 'Consumer Complaint Sample.pdf',
    },
  },
  { icon: FileSignature, label: 'Vakalatnama' },
  { icon: FileText, label: 'Affidavits' },
  { icon: Users, label: 'Maintenance petitions' },
  { icon: Receipt, label: 'Cheque bounce complaints' },
];

const plans = [
  { name: 'Free', price: '₹0', period: '', ink: '5 Ink, lifetime', highlighted: false },
  { name: 'Solo', price: '₹799', period: '/month', ink: '50 Ink a month', highlighted: true },
  { name: 'Pro', price: '₹1,999', period: '/month', ink: '150 Ink a month', highlighted: false },
];

const homeFaqItems = [
  {
    question: 'Are the BNS section mappings accurate?',
    answer:
      "Lawie's section mappings are built directly from the official IPC→BNS, CrPC→BNSS, and IEA→BSA correspondence tables published alongside the new codes. Every section cited in a generated document is validated against these mappings before it appears in your draft. You should always review the final document before filing.",
  },
  {
    question: 'Can I edit the generated document before downloading?',
    answer:
      'Yes. Every document opens in an editor where you can change any text, add annexures, or adjust the formatting before you export. Lawie gives you a structured starting point — you stay in control of the final draft.',
  },
  {
    question: 'Does Lawie cover my specific court?',
    answer:
      'Lawie currently formats documents for District and High Courts across Bihar, Jharkhand, UP, and Delhi, with more states added regularly. You select your state, court type, and court name, and the template adjusts the cause title and formatting accordingly.',
  },
  {
    question: 'Is my case data secure?',
    answer:
      'Your documents are encrypted in storage and transmitted over secure connections. Lawie processes your case details only to generate the document you requested. See the Privacy Policy for full details on how data is handled under the DPDP Act, 2023.',
  },
];

export default function HomePage() {
  return (
    <>
      <style>{`
        .hero{position:relative;overflow:hidden;background:linear-gradient(150deg,#0D1F3C 0%,#051226 55%,#0D1F3C 100%);color:var(--on-dark)}
        .hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse 90% 80% at 70% 20%,#000 30%,transparent 80%)}
        .hero-inner{position:relative;display:grid;grid-template-columns:1.32fr 1fr;gap:56px;align-items:center;padding:88px 0 96px}
        .hero h1{color:#fff;margin:22px 0 20px}
        .hero h1 .accent{color:var(--gold-light)}
        .hero-sub{font-size:20px;line-height:1.55;color:var(--on-dark-2);max-width:540px}
        .hero-ctas{display:flex;flex-wrap:wrap;gap:14px;margin:32px 0 18px}
        .hero-note{font-size:14px;color:var(--on-dark-muted);display:inline-flex;align-items:center;gap:8px}
        .hero-note svg{width:16px;height:16px;color:var(--gold-light)}
        .doc-frame{position:relative;aspect-ratio:16/10;border-radius:var(--r-hero);background:linear-gradient(160deg,#14305a,#0b1f3e);border:1px solid rgba(255,255,255,0.10);box-shadow:var(--sh-xl);overflow:hidden}
        .paper{position:absolute;background:#fff;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,0.35)}
        .paper.back{inset:34px 46px 54px 44px;transform:rotate(2.4deg);opacity:.7}
        .paper.front{inset:40px 34px 40px 58px;transform:rotate(-0.6deg);padding:22px 22px 0;overflow:hidden}
        .doc-court{font-family:var(--serif);font-size:11px;font-weight:700;color:var(--navy);text-align:center;letter-spacing:.02em}
        .doc-court small{display:block;font-family:var(--sans);font-size:8px;font-weight:600;letter-spacing:.12em;color:var(--text-muted);text-transform:uppercase;margin-top:3px}
        .doc-rule{height:1px;background:var(--border);margin:11px 0}
        .doc-line{height:5px;border-radius:3px;background:#E8ECF2;margin-bottom:7px}
        .doc-line.short{width:52%}
        .doc-line.mid{width:76%}
        .doc-chip{display:inline-block;font-size:8px;font-weight:700;color:var(--teal);background:rgba(13,148,136,0.12);padding:2px 7px;border-radius:4px;margin-bottom:9px;font-family:var(--sans)}
        .reason h3{font-size:21px;line-height:1.3;margin-bottom:12px}
        .reason p{font-size:15.5px;line-height:1.6;color:var(--text-2)}
        .step-num{width:40px;height:40px;border-radius:50%;background:var(--navy);color:var(--gold-light);font-family:var(--serif);font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:16px}
        .step h3{font-size:20px;margin-bottom:8px}
        .step p{font-size:15.5px;line-height:1.6;color:var(--text-2)}
        .draft-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 48px;margin-top:40px;list-style:none;padding:0}
        .draft-item{display:flex;align-items:center;gap:14px;padding:16px 0;border-bottom:1px solid var(--border)}
        .draft-item>svg{width:20px;height:20px;stroke-width:1.5;color:var(--gold);flex-shrink:0}
        .draft-item span{font-size:16px;font-weight:500;color:var(--navy);flex:1}
        .draft-sample{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--gold);text-decoration:none;white-space:nowrap;padding:8px 0}
        .draft-sample:hover{text-decoration:underline}
        .draft-sample svg{width:15px;height:15px}
        .plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:860px;margin:40px auto 0}
        .plan{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:26px 28px}
        .plan.highlighted{border:1.5px solid var(--gold)}
        .plan-name{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
        .plan.highlighted .plan-name{color:var(--gold)}
        .plan-price{font-family:var(--serif);font-size:36px;font-weight:700;color:var(--navy);margin:10px 0 4px}
        .plan-price small{font-family:var(--sans);font-size:15px;font-weight:500;color:var(--text-muted)}
        .plan-ink{font-size:15px;color:var(--text-2)}
        .final-cta{text-align:center}
        .final-cta h2{margin-bottom:14px}
        .final-cta p{font-size:19px;color:var(--text-2);margin-bottom:30px}
        @media(max-width:900px){
          .hero-inner{grid-template-columns:1fr;padding:64px 0 72px}
          .hero-visual{display:none}
          .plan-grid,.draft-grid{grid-template-columns:1fr}
        }
      `}</style>

      <SiteNav />

      {/* HERO */}
      <header className="hero">
        <div className="hero-inner container">
          <div className="hero-copy">
            <span className="eyebrow eyebrow--pill eyebrow--on-dark">
              AI legal drafting · built for India
            </span>
            <h1>
              Draft court-ready legal documents in <span className="accent">under 5 minutes.</span>
            </h1>
            <p className="hero-sub">
              Built around the current criminal codes — BNS, BNSS and BSA — and set out for your
              court.
            </p>
            <div className="hero-ctas">
              <Link className="btn btn-primary btn-lg" href="/login">
                Start Drafting Free <ArrowRight strokeWidth={1.5} />
              </Link>
              <Link className="btn btn-outline-light btn-lg" href="#samples">
                See Sample Documents <ArrowDown strokeWidth={1.5} />
              </Link>
            </div>
            <p className="hero-note">
              <Check strokeWidth={1.5} /> Free tier: 5 Ink (lifetime) · No credit card required
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="doc-frame">
              <div className="paper back" />
              <div className="paper front">
                <div className="doc-court">
                  IN THE COURT OF THE CHIEF JUDICIAL MAGISTRATE
                  <small>District &amp; Sessions Court, Patna</small>
                </div>
                <div className="doc-rule" />
                <span className="doc-chip">Bail Application · S.480 BNSS</span>
                <div className="doc-line mid" />
                <div className="doc-line" />
                <div className="doc-line short" />
                <div className="doc-line" />
                <div className="doc-line mid" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* WHY */}
      <section className="section section--tight bg-white">
        <div className="container">
          <div className="section-head">
            <h2>Drafting in District Court isn&apos;t easy.</h2>
            <p className="sub">Especially when the law just changed.</p>
          </div>
          <div className="cols-3 mt-48 grid gap-24">
            {reasons.map((r) => (
              <article key={r.title} className="card reason">
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section section--tight bg-cream">
        <div className="container">
          <div className="section-head">
            <h2>Three steps to a draft.</h2>
          </div>
          <ol className="cols-3 mt-48 grid gap-32" style={{ listStyle: 'none', padding: 0 }}>
            {steps.map((s, i) => (
              <li key={s.title} className="step">
                <div className="step-num" aria-hidden="true">
                  {i + 1}
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* WHAT YOU CAN DRAFT + SAMPLES */}
      <section className="section section--tight bg-white" id="samples">
        <div className="container">
          <div className="section-head">
            <h2>What you can draft today.</h2>
            <p className="sub">
              Four come with a sample PDF. The case details in the samples are made up.
            </p>
          </div>
          <ul className="draft-grid">
            {draftItems.map(({ icon: Icon, label, sample }) => (
              <li key={label} className="draft-item">
                <Icon strokeWidth={1.5} aria-hidden="true" />
                <span>{label}</span>
                {sample && (
                  <a className="draft-sample" href={sample.href} download={sample.file}>
                    <Download strokeWidth={1.5} aria-hidden="true" /> Sample PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PRICING */}
      <section className="section section--tight bg-cream">
        <div className="container">
          <div className="section-head section-head--center">
            <h2>Start free. Pay when you need more.</h2>
            <p className="sub">Drafts are paid for with Ink credits.</p>
          </div>
          <div className="plan-grid">
            {plans.map((p) => (
              <div key={p.name} className={p.highlighted ? 'plan highlighted' : 'plan'}>
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">
                  {p.price}
                  {p.period && <small>{p.period}</small>}
                </div>
                <div className="plan-ink">{p.ink}</div>
              </div>
            ))}
          </div>
          <p className="center mt-32">
            <Link className="link-arrow" href="/pricing">
              See full pricing <ArrowRight strokeWidth={1.5} />
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="section section--tight bg-white">
        <div className="narrow container">
          <div className="section-head section-head--center" style={{ marginBottom: '32px' }}>
            <h2>Questions advocates ask.</h2>
          </div>
          <Accordion items={homeFaqItems} singleOpen />
          <p className="center mt-32">
            <Link className="link-arrow" href="/faq">
              Full FAQ <ArrowRight strokeWidth={1.5} />
            </Link>
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="section section--tight bg-cream final-cta">
        <div className="narrow container">
          <h2>Start drafting in the next five minutes.</h2>
          <p>Free for your first 5 Ink. No card required.</p>
          <Link className="btn btn-primary btn-lg" href="/login">
            Start Drafting Free <ArrowRight strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
