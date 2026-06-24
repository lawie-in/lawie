import {
  ArrowRight,
  ArrowDown,
  Check,
  RefreshCw,
  LayoutTemplate,
  Clock,
  ChevronDown,
  BadgeCheck,
  Scale,
  FileSignature,
  FileText,
  Home,
  ShieldAlert,
  Megaphone,
  Users,
  Receipt,
  Plus,
  Download,
  ShoppingBag,
} from 'lucide-react';
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
        .hero::after{content:"";position:absolute;top:-180px;right:-120px;width:520px;height:520px;background:radial-gradient(circle,rgba(200,133,14,0.18),transparent 65%);pointer-events:none}
        .hero-inner{position:relative;display:grid;grid-template-columns:1.32fr 1fr;gap:56px;align-items:center;padding:104px 0 112px}
        .hero h1{color:#fff;margin:22px 0 24px}
        .hero h1 .accent{color:var(--gold-light)}
        .hero-sub{font-size:20px;line-height:1.55;color:var(--on-dark-2);max-width:560px}
        .hero-ctas{display:flex;flex-wrap:wrap;gap:14px;margin:36px 0 18px}
        .hero-note{font-size:14px;color:var(--on-dark-muted);display:inline-flex;align-items:center;gap:8px}
        .hero-note svg{width:16px;height:16px;color:var(--gold-light)}
        .hero-visual{position:relative}
        .doc-frame{position:relative;aspect-ratio:16/10;border-radius:var(--r-hero);background:linear-gradient(160deg,#14305a,#0b1f3e);border:1px solid rgba(255,255,255,0.10);box-shadow:var(--sh-xl);overflow:hidden}
        .doc-frame::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px);background-size:100% 22px;opacity:.5}
        .paper{position:absolute;background:#fff;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,0.35)}
        .paper.back{inset:30px 64px 64px 30px;transform:rotate(-4deg);opacity:.55}
        .paper.mid{inset:34px 46px 54px 44px;transform:rotate(2.4deg);opacity:.8}
        .paper.front{inset:40px 34px 40px 58px;transform:rotate(-0.6deg);padding:22px 22px 0;overflow:hidden}
        .doc-court{font-family:var(--serif);font-size:11px;font-weight:700;color:var(--navy);text-align:center;letter-spacing:.02em}
        .doc-court small{display:block;font-family:var(--sans);font-size:8px;font-weight:600;letter-spacing:.12em;color:var(--text-muted);text-transform:uppercase;margin-top:3px}
        .doc-rule{height:1px;background:var(--border);margin:11px 0}
        .doc-line{height:5px;border-radius:3px;background:#E8ECF2;margin-bottom:7px}
        .doc-line.short{width:52%}
        .doc-line.mid{width:76%}
        .doc-chip{display:inline-block;font-size:8px;font-weight:700;color:var(--teal);background:rgba(13,148,136,0.12);padding:2px 7px;border-radius:4px;margin-bottom:9px;font-family:var(--sans)}
        .doc-seal{position:absolute;right:-8px;bottom:18px;width:78px;height:78px;border-radius:50%;background:radial-gradient(circle at 35% 30%,var(--gold-light),var(--gold));box-shadow:0 10px 24px rgba(200,133,14,0.45);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.5)}
        .doc-seal svg{width:34px;height:34px;color:var(--navy);stroke-width:1.5}
        .gen-badge{position:absolute;left:-16px;top:-18px;white-space:nowrap;display:inline-flex;align-items:center;gap:9px;background:#fff;color:var(--navy);font-size:13px;font-weight:600;padding:11px 15px;border-radius:var(--r-pill);box-shadow:var(--sh-lg)}
        .gen-badge .dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 3px rgba(16,185,129,0.18)}
        .gen-badge .t{font-variant-numeric:tabular-nums}
        .scenario h4{font-size:22px;line-height:1.25;margin-bottom:14px}
        .scenario p{font-size:15.5px;line-height:1.6;color:var(--text-2)}
        .steps{position:relative}
        .steps-line{position:absolute;top:34px;left:16%;right:16%;height:2px;background:repeating-linear-gradient(90deg,var(--border-strong) 0 8px,transparent 8px 16px);z-index:0}
        .step{position:relative;z-index:1;text-align:center}
        .step-badge{width:64px;height:64px;border-radius:50%;background:var(--navy);color:var(--gold-light);font-family:var(--serif);font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 0 0 8px var(--bg),var(--sh-md)}
        .step-art{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:20px;margin-bottom:22px;min-height:150px;display:flex;flex-direction:column;justify-content:center;gap:9px;box-shadow:var(--sh-sm)}
        .step h4{font-size:20px;margin-bottom:8px}
        .step p{font-size:15px;color:var(--text-2);max-width:300px;margin:0 auto}
        .mini-select{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;color:var(--navy);background:#fff;border:1px solid var(--border);border-radius:8px;padding:9px 11px}
        .mini-select svg{width:14px;height:14px;color:var(--text-muted)}
        .mini-select.ghost{color:var(--text-muted);font-weight:500}
        .mini-field{font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.04em;text-transform:uppercase}
        .mini-input{font-size:12px;color:var(--navy);font-weight:600;background:#fff;border:1px solid var(--border);border-radius:8px;padding:9px 11px}
        .mini-doc{background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px}
        .mini-doc .h{height:5px;width:60%;margin:0 auto 9px;background:var(--navy);border-radius:3px}
        .mini-doc .l{height:4px;background:#E8ECF2;border-radius:2px;margin-bottom:6px}
        .mini-check{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:var(--teal);margin-top:10px}
        .mini-check svg{width:13px;height:13px}
        .dl-row{display:flex;gap:8px;margin-top:10px}
        .dl-pill{flex:1;font-size:11px;font-weight:700;text-align:center;padding:8px;border-radius:6px}
        .dl-pill.pdf{background:var(--navy);color:#fff}
        .dl-pill.docx{background:rgba(13,31,60,0.06);color:var(--navy)}
        .compare{max-width:1000px;margin:56px auto 0;border-radius:var(--r-card);overflow:hidden;border:1px solid var(--border);box-shadow:var(--sh-md);background:#fff}
        .compare-head{display:grid;grid-template-columns:1.2fr 1fr 1fr}
        .compare-head>div{padding:22px 26px}
        .ch-label{font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);display:flex;align-items:flex-end}
        .ch-generic{background:#F3F4F6;font-family:var(--serif);font-size:19px;font-weight:600;color:var(--text-2)}
        .ch-lawie{background:var(--navy);color:#fff;font-family:var(--serif);font-size:19px;font-weight:600;border-top:3px solid var(--gold);display:flex;align-items:center;gap:10px}
        .compare-row{display:grid;grid-template-columns:1.2fr 1fr 1fr;border-top:1px solid var(--border)}
        .compare-row>div{padding:18px 26px;font-size:14.5px;line-height:1.5;display:flex;align-items:flex-start;gap:10px}
        .compare-row .feat{font-weight:600;color:var(--navy);font-size:13px;letter-spacing:.04em;text-transform:uppercase;align-items:center}
        .compare-row .cell-generic{color:var(--text-2);background:#FAFAFA}
        .compare-row .cell-lawie{color:var(--text);background:rgba(13,148,136,0.035)}
        .compare-row .cell-lawie:last-child{border-left:1px solid rgba(13,148,136,0.12)}
        .compare-row .x{color:var(--error);flex-shrink:0;margin-top:1px}
        .compare-row .v{color:var(--success);flex-shrink:0;margin-top:1px}
        .compare-row .x svg,.compare-row .v svg{width:18px;height:18px;stroke-width:2}
        .sample-icon{width:54px;height:54px;border-radius:var(--r-sm);background:rgba(13,31,60,0.05);color:var(--navy);display:flex;align-items:center;justify-content:center;margin-bottom:20px}
        .sample-icon svg{width:26px;height:26px;stroke-width:1.5}
        .sample h4{margin-bottom:10px}
        .sample p{font-size:15px;line-height:1.6;color:var(--text-2);margin-bottom:22px}
        .sample .cap{display:block;font-size:12px;color:var(--text-muted);margin-top:14px}
        .draft-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 32px;margin-top:48px}
        .draft-item{display:flex;align-items:center;gap:16px;padding:18px 20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);transition:border-color .18s,box-shadow .18s}
        .draft-item:hover{border-color:var(--border-strong);box-shadow:var(--sh-sm)}
        .draft-item svg{width:22px;height:22px;stroke-width:1.5;color:var(--gold);flex-shrink:0}
        .draft-item span{font-size:16px;font-weight:500;color:var(--navy)}
        .draft-item.more{background:transparent;border-style:dashed}
        .draft-item.more svg{color:var(--teal)}
        .draft-item.more span{color:var(--text-2)}
        .intel{background:linear-gradient(150deg,#0D1F3C,#051226);color:var(--on-dark)}
        .intel h2{color:#fff}
        .intel .sub{color:var(--on-dark-2)}
        .stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:52px}
        .stat-card{background:rgba(255,255,255,0.04);border:1px solid var(--on-dark-border);border-radius:var(--r-card);padding:36px 32px}
        .stat-num{font-family:var(--serif);font-size:64px;font-weight:700;line-height:1;color:var(--gold-light)}
        .stat-num.text{font-size:40px}
        .stat-cap{margin-top:14px;font-size:16px;color:var(--on-dark-2);line-height:1.5}
        .state-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:40px}
        .state-chip{font-size:14px;font-weight:600;color:#fff;background:rgba(255,255,255,0.06);border:1px solid var(--on-dark-border);padding:8px 16px;border-radius:var(--r-pill)}
        .state-more{font-size:14px;color:var(--on-dark-muted)}
        .plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:48px auto 0}
        .plan{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:34px;display:flex;flex-direction:column}
        .plan.highlighted{border:1.5px solid var(--gold);box-shadow:var(--sh-lg);position:relative}
        .plan-name{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
        .plan.highlighted .plan-name{color:var(--gold)}
        .plan-price{font-family:var(--serif);font-size:44px;font-weight:700;color:var(--navy);margin:14px 0 4px}
        .plan-price small{font-family:var(--sans);font-size:16px;font-weight:500;color:var(--text-muted)}
        .plan-alt{font-size:14px;color:var(--text-muted)}
        .plan ul{list-style:none;margin:22px 0 28px;padding:0;display:grid;gap:12px}
        .plan li{display:flex;gap:10px;font-size:15px;color:var(--text-2);line-height:1.45}
        .plan li svg{width:18px;height:18px;color:var(--teal);flex-shrink:0;margin-top:1px;stroke-width:2}
        .plan li.limit svg{color:var(--text-muted)}
        .plan .btn{margin-top:auto}
        .final-cta{text-align:center}
        .final-cta h2{font-size:clamp(32px,4.2vw,46px);margin-bottom:16px}
        .final-cta p{font-size:19px;color:var(--text-2);margin-bottom:34px}
        .solve-tag{display:inline-flex;align-items:center;gap:8px;margin-top:16px;font-size:14px;font-weight:600;color:var(--teal);background:rgba(13,148,136,0.08);padding:8px 14px;border-radius:var(--r-pill)}
        .solve-tag svg{width:16px;height:16px;flex-shrink:0}
        @media(max-width:900px){
          .hero-inner{grid-template-columns:1fr;gap:48px;padding:72px 0 80px}
          .hero-visual{max-width:460px}
          .compare-head,.compare-row{grid-template-columns:1fr}
          .compare-row .feat{background:#FAFAFA;border-bottom:1px solid var(--border)}
          .ch-label{display:none}
          .stat-grid{grid-template-columns:1fr}
          .plan-grid,.draft-grid{grid-template-columns:1fr}
          .steps-line{display:none}
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
              Built around the current Indian criminal codes — BNS, BNSS, and BSA. Formatted for
              your specific court. Validated against Indian filing requirements.
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
          <div className="hero-visual">
            <div
              className="doc-frame"
              role="img"
              aria-label="Illustration of a stack of generated court documents with an official gold seal and a generation-time badge"
            >
              <div className="paper back" aria-hidden="true" />
              <div className="paper mid" aria-hidden="true" />
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
              <div className="doc-seal" aria-hidden="true">
                <BadgeCheck strokeWidth={1.5} />
              </div>
            </div>
            <div className="gen-badge" aria-hidden="true">
              <span className="dot" /> Generated in <span className="t">4 min 38s</span>
            </div>
          </div>
        </div>
      </header>

      {/* PROBLEM */}
      <section className="section bg-white">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">The everyday reality</span>
            <h2 className="mt-16">Drafting in District Court isn&apos;t easy.</h2>
            <p className="sub">Especially when the law just changed.</p>
          </div>
          <div className="cols-3 mt-48 grid gap-24">
            <article className="card card--hover scenario">
              <h4>FIR comes in at 4 PM. Bail hearing tomorrow at 10.</h4>
              <p>
                You Google a bail format from 2019. It cites Section 437 CrPC. The Magistrate
                returns it — the section is now 480 BNSS.
              </p>
              <span className="solve-tag">
                <RefreshCw strokeWidth={1.5} /> Lawie auto-maps to current codes.
              </span>
            </article>
            <article className="card card--hover scenario">
              <h4>The registry returned your application.</h4>
              <p>
                Wrong cause title format. Missing verification clause. Prayer doesn&apos;t cite the
                right BNSS provision.
              </p>
              <span className="solve-tag">
                <LayoutTemplate strokeWidth={1.5} /> Lawie formats for your specific court.
              </span>
            </article>
            <article className="card card--hover scenario">
              <h4>Half your evening goes to formatting.</h4>
              <p>
                Looking up enrolment numbers, advocate blocks, annexure lists. Time that should be
                spent on the actual argument.
              </p>
              <span className="solve-tag">
                <Clock strokeWidth={1.5} /> Lawie handles the boilerplate.
              </span>
            </article>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section bg-cream">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">How it works</span>
            <h2 className="mt-16">Three steps. One court-ready document.</h2>
          </div>
          <div className="cols-3 steps mt-64 grid gap-32">
            <div className="steps-line" aria-hidden="true" />
            <div className="step">
              <div className="step-badge">1</div>
              <div className="step-art" aria-hidden="true">
                <div className="mini-select">
                  Bihar <ChevronDown strokeWidth={1.5} />
                </div>
                <div className="mini-select">
                  District Court <ChevronDown strokeWidth={1.5} />
                </div>
                <div className="mini-select ghost">
                  Select court name <ChevronDown strokeWidth={1.5} />
                </div>
              </div>
              <h4>Select document type and court</h4>
              <p>Choose your state, court type, and court name. Lawie loads the right format.</p>
            </div>
            <div className="step">
              <div className="step-badge">2</div>
              <div className="step-art" aria-hidden="true">
                <div className="mini-field">FIR Number</div>
                <div className="mini-input">FIR No. 214/2026</div>
                <div className="mini-field">Sections charged</div>
                <div className="mini-input">115(2), 351(2) BNS</div>
              </div>
              <h4>Fill in case details</h4>
              <p>Enter the FIR number, sections, and parties through a structured form.</p>
            </div>
            <div className="step">
              <div className="step-badge">3</div>
              <div className="step-art" aria-hidden="true">
                <div className="mini-doc">
                  <div className="h" />
                  <div className="l" style={{ width: '90%' }} />
                  <div className="l" style={{ width: '70%' }} />
                  <div className="l" style={{ width: '85%' }} />
                  <div className="mini-check">
                    <Check strokeWidth={1.5} /> BNS/BNSS validated
                  </div>
                </div>
                <div className="dl-row">
                  <div className="dl-pill pdf">PDF</div>
                  <div className="dl-pill docx">DOCX</div>
                </div>
              </div>
              <h4>Review and export</h4>
              <p>Edit in the browser, then download court-ready PDF or DOCX.</p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="section bg-white">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">The difference</span>
            <h2 className="mt-16">Why not just use a generic AI?</h2>
          </div>
          <div className="compare">
            <div className="compare-head">
              <div className="ch-label">Feature</div>
              <div className="ch-generic">Generic AI</div>
              <div className="ch-lawie">
                <span className="wm-mini">
                  <svg
                    className="wm-l"
                    viewBox="0 0 15 27"
                    style={{ width: 10, height: 18 }}
                    aria-hidden="true"
                  >
                    <rect x="0" y="0" width="3.5" height="27" rx="1" />
                    <rect x="0" y="23.5" width="15" height="3.5" rx="1" />
                  </svg>
                </span>
                Lawie
              </div>
            </div>
            {[
              [
                'Current BNS/BNSS/BSA sections',
                'May cite old IPC/CrPC',
                'Always current — validated against official mapping tables',
              ],
              [
                'Court-specific formatting',
                'Generic legal format',
                'Formatted per state, court type, and court name',
              ],
              [
                'Cause title & verification',
                'Inconsistent',
                'Correct clause order, verification, and advocate block for your court',
              ],
              [
                'Section validation before output',
                'No validation',
                'Every section checked before it appears in your draft',
              ],
            ].map(([feat, generic, lawie]) => (
              <div key={feat} className="compare-row">
                <div className="feat">{feat}</div>
                <div className="cell-generic">
                  <span className="x">
                    <Check strokeWidth={2} style={{ color: 'var(--error)' }} />
                  </span>
                  {generic}
                </div>
                <div className="cell-lawie">
                  <span className="v">
                    <Check strokeWidth={2} style={{ color: 'var(--success)' }} />
                  </span>
                  {lawie}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SAMPLE DOCS */}
      <section className="section bg-cream" id="samples">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Sample output</span>
            <h2 className="mt-16">What Lawie generates.</h2>
            <p className="sub">Real document structure, fictional case details.</p>
          </div>
          <div className="cols-2 mt-48 grid gap-24">
            <article className="card sample">
              <div className="sample-icon">
                <Scale strokeWidth={1.5} />
              </div>
              <h4>Regular Bail Application</h4>
              <p>
                Bail application under S.480 BNSS for a case under S.115(2) BNS before the Chief
                Judicial Magistrate, Patna.
              </p>
              <a
                className="btn btn-ghost-gold btn-sm"
                href="/api/samples/bail-application"
                download="Bail Application Sample.pdf"
              >
                <Download strokeWidth={1.5} /> Download PDF
              </a>
              <span className="cap">Sample — fictional case, demo only</span>
            </article>
            <article className="card sample">
              <div className="sample-icon">
                <FileSignature strokeWidth={1.5} />
              </div>
              <h4>Legal Notice (S.138 NI Act)</h4>
              <p>
                Statutory notice for dishonour of cheque — cause title, return details, 15-day
                demand, and advocate block.
              </p>
              <a
                className="btn btn-ghost-gold btn-sm"
                href="/api/samples/legal-notice-s138"
                download="Legal Notice S138 Sample.pdf"
              >
                <Download strokeWidth={1.5} /> Download PDF
              </a>
              <span className="cap">Sample — fictional case, demo only</span>
            </article>
            <article className="card sample">
              <div className="sample-icon">
                <Home strokeWidth={1.5} />
              </div>
              <h4>Residential Rent Agreement</h4>
              <p>
                Eleven-month tenancy for a residential flat in Ranchi, with security deposit and
                maintenance clauses.
              </p>
              <a
                className="btn btn-ghost-gold btn-sm"
                href="/api/samples/rent-agreement"
                download="Rent Agreement Sample.pdf"
              >
                <Download strokeWidth={1.5} /> Download PDF
              </a>
              <span className="cap">Sample — fictional case, demo only</span>
            </article>
            <article className="card sample">
              <div className="sample-icon">
                <ShoppingBag strokeWidth={1.5} />
              </div>
              <h4>Consumer Complaint</h4>
              <p>
                Complaint before the District Consumer Disputes Redressal Commission, Patna —
                deficient service, relief prayer, and supporting annexures.
              </p>
              <a
                className="btn btn-ghost-gold btn-sm"
                href="/api/samples/consumer-complaint"
                download="Consumer Complaint Sample.pdf"
              >
                <Download strokeWidth={1.5} /> Download PDF
              </a>
              <span className="cap">Sample — fictional case, demo only</span>
            </article>
          </div>
        </div>
      </section>

      {/* WHAT YOU CAN DRAFT */}
      <section className="section bg-white">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Templates</span>
            <h2 className="mt-16">Documents Lawie generates today.</h2>
          </div>
          <div className="draft-grid">
            <div className="draft-item">
              <Scale strokeWidth={1.5} />
              <span>Bail Applications (Regular + Anticipatory)</span>
            </div>
            <div className="draft-item">
              <Megaphone strokeWidth={1.5} />
              <span>Legal Notices (S.80 CPC, S.138 NI Act)</span>
            </div>
            <div className="draft-item">
              <Home strokeWidth={1.5} />
              <span>Rent Agreements</span>
            </div>
            <div className="draft-item">
              <ShieldAlert strokeWidth={1.5} />
              <span>Consumer Complaints</span>
            </div>
            <div className="draft-item">
              <FileSignature strokeWidth={1.5} />
              <span>Vakalatnama</span>
            </div>
            <div className="draft-item">
              <FileText strokeWidth={1.5} />
              <span>Affidavits</span>
            </div>
            <div className="draft-item">
              <Users strokeWidth={1.5} />
              <span>Maintenance Petitions</span>
            </div>
            <div className="draft-item">
              <Receipt strokeWidth={1.5} />
              <span>Cheque Bounce Complaints</span>
            </div>
            <div className="draft-item more">
              <Plus strokeWidth={1.5} />
              <span>More templates added weekly</span>
            </div>
          </div>
        </div>
      </section>

      {/* INTELLIGENCE INSIDE */}
      <section className="section intel">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
              Under the hood
            </span>
            <h2 className="mt-16">Built on the current law.</h2>
            <p className="sub">Not generic AI guesswork.</p>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-num">358</div>
              <p className="stat-cap">BNS sections mapped to IPC</p>
            </div>
            <div className="stat-card">
              <div className="stat-num">531</div>
              <p className="stat-cap">BNSS sections mapped to CrPC</p>
            </div>
            <div className="stat-card">
              <div className="stat-num text">Multi-court</div>
              <p className="stat-cap">Formatting rules per state and court level</p>
            </div>
          </div>
          <div className="state-row">
            <span className="state-chip">Bihar</span>
            <span className="state-chip">Jharkhand</span>
            <span className="state-chip">UP</span>
            <span className="state-chip">Delhi</span>
            <span className="state-more">More states added regularly</span>
          </div>
        </div>
      </section>

      {/* PRICING TEASER — NEW INK MODEL */}
      <section className="section bg-white">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">Pricing</span>
            <h2 className="mt-16">Simple Ink credits. Start free.</h2>
            <p className="sub">Start free — upgrade only when you need to.</p>
          </div>
          <div className="plan-grid">
            <div className="plan">
              <div className="plan-name">Free</div>
              <div className="plan-price">
                ₹0<small>/lifetime</small>
              </div>
              <div className="plan-alt">5 Ink — forever</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> All templates
                </li>
                <li>
                  <Check strokeWidth={2} /> Court formatting
                </li>
                <li>
                  <Check strokeWidth={2} /> BNS validation
                </li>
                <li className="limit">
                  <Check strokeWidth={2} style={{ color: 'var(--text-muted)' }} /> Watermark on
                  exports
                </li>
              </ul>
              <Link className="btn btn-ghost btn-block" href="/login">
                Start Free
              </Link>
            </div>
            <div className="plan highlighted">
              <span
                className="badge badge--gold"
                style={{ position: 'absolute', top: '-12px', left: '34px' }}
              >
                Most Popular
              </span>
              <div className="plan-name">Solo</div>
              <div className="plan-price">
                ₹799<small>/month</small>
              </div>
              <div className="plan-alt">50 Ink/month</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> All templates
                </li>
                <li>
                  <Check strokeWidth={2} /> No watermark
                </li>
                <li>
                  <Check strokeWidth={2} /> Priority support
                </li>
              </ul>
              <Link className="btn btn-primary btn-block" href="/login">
                Start Drafting Free <ArrowRight strokeWidth={1.5} />
              </Link>
            </div>
            <div className="plan">
              <div className="plan-name">Pro</div>
              <div className="plan-price">
                ₹1,999<small>/month</small>
              </div>
              <div className="plan-alt">150 Ink/month</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> All templates
                </li>
                <li>
                  <Check strokeWidth={2} /> No watermark
                </li>
                <li>
                  <Check strokeWidth={2} /> Priority support
                </li>
                <li>
                  <Check strokeWidth={2} /> Early access to new templates
                </li>
              </ul>
              <Link className="btn btn-ghost btn-block" href="/login">
                Get Pro
              </Link>
            </div>
          </div>
          <p className="center mt-24">
            <Link className="link-arrow" href="/pricing">
              See full pricing details <ArrowRight strokeWidth={1.5} />
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ TEASER */}
      <section className="section bg-cream">
        <div className="narrow container">
          <div className="section-head section-head--center" style={{ marginBottom: '40px' }}>
            <span className="eyebrow">FAQ</span>
            <h2 className="mt-16">Questions advocates ask.</h2>
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
      <section className="section bg-cream final-cta">
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
