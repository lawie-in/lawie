import { Check, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — About',
  description:
    'Why we built Lawie: a drafting assistant for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.',
};

export default function AboutPage() {
  return (
    <>
      <style>{`
        .about-block{max-width:760px}
        .about-block+.about-block{margin-top:48px}
        .about-block h2{margin-bottom:18px}
        .prose p{font-size:17px;line-height:1.78;color:var(--text-2);margin-bottom:18px}
        .prose p:last-child{margin-bottom:0}
        .cap-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:14px}
        .cap-list li{display:flex;gap:13px;font-size:16.5px;color:var(--text);line-height:1.5}
        .cap-list svg{color:var(--teal);width:21px;height:21px;flex-shrink:0;margin-top:3px;stroke-width:2}
        .about-cta{text-align:center;max-width:620px}
      `}</style>

      <SiteNav activePage="about" />

      <header className="page-hero">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            About
          </span>
          <h1>Why we built Lawie.</h1>
          <p className="sub">
            A drafting tool for the advocates who do the day-to-day work of the district courts.
          </p>
        </div>
      </header>

      <section className="section bg-white">
        <div className="container">
          <div className="about-block prose">
            <h2>The problem we saw</h2>
            <p>
              India&apos;s new criminal codes, the BNS, BNSS and BSA, came into force on 1 July
              2024. Older matters still run under the IPC, CrPC and Evidence Act.
            </p>
            <p>
              We kept seeing the same pattern: capable advocates losing hours to formatting and
              section-mapping, on documents that follow a predictable structure. That is the gap
              Lawie was built to close.
            </p>
          </div>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container">
          <div className="about-block">
            <h2>What Lawie does today</h2>
            <ul className="cap-list">
              <li>
                <Check strokeWidth={2} /> Writes a first draft from what you describe.
              </li>
              <li>
                <Check strokeWidth={2} /> Criminal drafts use BNS, BNSS and BSA section numbers, or
                IPC, CrPC and the Evidence Act where the old law applies.
              </li>
              <li>
                <Check strokeWidth={2} /> Lays out the cause title, prayer, verification and
                advocate block in the draft.
              </li>
              <li>
                <Check strokeWidth={2} /> Exports the draft as PDF or DOCX.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container">
          <div className="about-block prose">
            <h2>Section numbers</h2>
            <p>
              Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence
              Act where the old law applies. Check every section before you file.
            </p>
          </div>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container">
          <div className="about-block prose">
            <h2>Where we&apos;re headed</h2>
            <p>
              More document types, and Hindi drafting: coming soon. The goal stays the same: get an
              advocate from a blank page to a first draft to review, edit and download.
            </p>
          </div>
        </div>
      </section>

      <section className="section final-cta bg-white" style={{ textAlign: 'center' }}>
        <div className="narrow about-cta container" style={{ margin: '0 auto' }}>
          <h2>Start drafting.</h2>
          <p className="lede" style={{ margin: '14px 0 30px' }}>
            Free for your first 5 Ink, once your email is verified. No card required.
          </p>
          <Link className="btn btn-primary btn-lg" href="/login">
            Start free <ArrowRight strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
