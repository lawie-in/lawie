import { Check, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — About',
  description:
    'Why we built Lawie: a court-ready drafting tool for young Indian advocates, built around the current BNS, BNSS, and BSA criminal codes.',
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
              India changed its criminal law. The IPC, CrPC, and Evidence Act gave way to the BNS,
              BNSS, and BSA — and overnight, every format an advocate had relied on was citing the
              wrong sections.
            </p>
            <p>
              For a young advocate in a district court, that is not an academic problem. A bail
              format pulled from an old blog still cites Section 437 CrPC. The registry sends it
              back. The hearing is tomorrow. The work that should go into the argument goes into
              re-checking section numbers and re-typing the cause title instead.
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
                <Check strokeWidth={2} /> Generates bail applications, legal notices, rent
                agreements, consumer complaints, and more from a structured form.
              </li>
              <li>
                <Check strokeWidth={2} /> Maps IPC, CrPC, and IEA references to their current BNS,
                BNSS, and BSA equivalents.
              </li>
              <li>
                <Check strokeWidth={2} /> Formats the cause title, prayer, verification, and
                advocate block for your selected court.
              </li>
              <li>
                <Check strokeWidth={2} /> Exports a finished document as PDF or DOCX, with a filing
                checklist.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container">
          <div className="about-block prose">
            <h2>Built on the current law</h2>
            <p>
              Lawie&apos;s templates are designed against current Indian court formats. Every
              section cited in a generated document is validated against the official IPC→BNS,
              CrPC→BNSS, and IEA→BSA correspondence tables before it reaches your draft.
            </p>
            <p>
              The court-formatting rules — how a cause title reads for a District Court versus a
              High Court, which clauses are mandatory, where the verification sits — are encoded per
              state and court level, and reviewed against published court requirements. It is
              detailed, unglamorous work, and it is the part that makes a draft court-ready rather
              than merely well-written.
            </p>
          </div>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container">
          <div className="about-block prose">
            <h2>Where we&apos;re headed</h2>
            <p>
              More states and court levels, more document types, and support for drafting in Hindi
              alongside English. The goal stays the same: get an advocate from a blank page to a
              court-ready document in minutes, on the current law, for the specific court in front
              of them.
            </p>
          </div>
        </div>
      </section>

      <section className="section final-cta bg-white" style={{ textAlign: 'center' }}>
        <div className="narrow about-cta container" style={{ margin: '0 auto' }}>
          <h2>Start drafting.</h2>
          <p className="lede" style={{ margin: '14px 0 30px' }}>
            Free for your first 5 Ink. No card required.
          </p>
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
