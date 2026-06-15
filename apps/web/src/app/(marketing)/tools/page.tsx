import { ArrowLeftRight, Scale, CalendarClock, ArrowRight, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Free Legal Tools for Indian Advocates',
  description:
    'Free legal tools: IPC to BNS converter, bail eligibility checker, and BNSS investigation timeline. Built around the new Indian criminal codes.',
};

export default function ToolsPage() {
  return (
    <>
      <style>{`
        .tools-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:8px}
        .tool-card{display:flex;flex-direction:column}
        .tool-card .icon-tile{width:54px;height:54px;margin-bottom:22px}
        .tool-card .icon-tile svg{width:26px;height:26px}
        .tool-card h3{font-size:22px;margin-bottom:10px}
        .tool-card p{font-size:15px;line-height:1.6;color:var(--text-2);margin-bottom:22px}
        .tool-viz{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:24px}
        .viz-chip{font-size:12px;font-weight:700;font-family:var(--sans);padding:6px 11px;border-radius:6px;background:#fff;border:1px solid var(--border);color:var(--navy);white-space:nowrap}
        .viz-chip.old{color:var(--text-muted);text-decoration:line-through;text-decoration-color:var(--error)}
        .viz-chip.new{background:var(--navy);color:#fff;border-color:var(--navy)}
        .viz-chip.teal{background:rgba(13,148,136,0.12);color:var(--teal);border-color:rgba(13,148,136,0.25)}
        .viz-arrow{color:var(--gold);display:flex}.viz-arrow svg{width:18px;height:18px;stroke-width:2}
        .viz-dot{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1}
        .viz-dot .d{width:11px;height:11px;border-radius:50%;background:var(--gold)}
        .viz-dot.muted .d{background:var(--border-strong)}
        .viz-dot small{font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:.02em}
        .viz-line{display:flex;align-items:center;gap:0;width:100%}
        .viz-track{flex:1;height:2px;background:var(--border)}
        .tool-card .btn{margin-top:auto;align-self:flex-start}
        .tools-cta{margin-top:64px;background:linear-gradient(150deg,#0D1F3C,#051226);border-radius:var(--r-hero);padding:48px;display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap;color:#fff;overflow:hidden;position:relative}
        .tools-cta>div{min-width:0;flex:1 1 320px}
        .tools-cta h3{color:#fff;font-size:26px;margin-bottom:6px}
        .tools-cta p{color:var(--on-dark-2);font-size:16px}
        @media(max-width:768px){.tools-grid{grid-template-columns:1fr}}
      `}</style>

      <SiteNav activePage="tools" />

      <header className="page-hero">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Free Tools
          </span>
          <h1>Free legal tools for Indian advocates.</h1>
          <p className="sub">
            Quick utilities built around the new criminal codes — free to use, no sign-up required.
          </p>
        </div>
      </header>

      <section className="section bg-cream">
        <div className="container">
          <div className="tools-grid">
            <article className="card card--hover tool-card">
              <div className="icon-tile icon-tile--gold">
                <ArrowLeftRight strokeWidth={1.5} />
              </div>
              <h3>IPC → BNS Converter</h3>
              <p>
                Lookup any IPC, CrPC, or IEA section and get the equivalent BNS, BNSS, or BSA
                section instantly.
              </p>
              <div className="tool-viz" aria-hidden="true">
                <span className="viz-chip old">IPC §420</span>
                <span className="viz-arrow">
                  <ArrowRight strokeWidth={2} />
                </span>
                <span className="viz-chip new">BNS §318</span>
              </div>
              <Link className="btn btn-secondary" href="/tools/section-converter">
                Open Converter <ArrowRight strokeWidth={1.5} />
              </Link>
            </article>
            <article className="card card--hover tool-card">
              <div className="icon-tile icon-tile--teal">
                <Scale strokeWidth={1.5} />
              </div>
              <h3>Bail Eligibility Checker</h3>
              <p>
                Enter the BNS sections charged in an FIR and find out if bail is possible, which
                court has jurisdiction, and which BNSS section to cite.
              </p>
              <div className="tool-viz" aria-hidden="true">
                <span className="viz-chip">S.115(2) BNS</span>
                <span className="viz-arrow">
                  <ArrowRight strokeWidth={2} />
                </span>
                <span className="viz-chip teal">
                  <Check
                    style={{ width: 12, height: 12, display: 'inline', verticalAlign: '-2px' }}
                  />{' '}
                  Bailable · S.480 BNSS
                </span>
              </div>
              <Link className="btn btn-secondary" href="/tools/bail-checker">
                Open Checker <ArrowRight strokeWidth={1.5} />
              </Link>
            </article>
            <article className="card card--hover tool-card">
              <div className="icon-tile">
                <CalendarClock strokeWidth={1.5} />
              </div>
              <h3>BNSS Investigation Timeline</h3>
              <p>
                Enter the FIR date and sections to see custody limits, chargesheet deadlines, and
                default bail eligibility dates under BNSS.
              </p>
              <div className="tool-viz" aria-hidden="true">
                <div className="viz-line">
                  <div className="viz-dot">
                    <span className="d" />
                    <small>FIR</small>
                  </div>
                  <div className="viz-track" />
                  <div className="viz-dot muted">
                    <span className="d" />
                    <small>60 days</small>
                  </div>
                  <div className="viz-track" />
                  <div className="viz-dot muted">
                    <span className="d" />
                    <small>90 days</small>
                  </div>
                </div>
              </div>
              <Link className="btn btn-secondary" href="/tools/timeline-tracker">
                Open Tracker <ArrowRight strokeWidth={1.5} />
              </Link>
            </article>
          </div>
          <div className="tools-cta">
            <div>
              <h3>Need more than tools? Try Lawie&apos;s full drafter.</h3>
              <p>Generate complete, court-ready documents — not just section lookups.</p>
            </div>
            <Link className="btn btn-primary btn-lg" href="/pricing">
              See Pricing <ArrowRight strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
