'use client';

import { PLANS } from '@lawie/shared';
import { Check, ArrowRight, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import Accordion from '@/components/marketing/Accordion';
import FloatCta from '@/components/marketing/FloatCta';
import PriceToggle from '@/components/marketing/PriceToggle';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

const pricingFaq = [
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. You can cancel your subscription at any time from your account settings. Cancellation stops all future charges and takes effect at the end of your current billing period.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'No. Subscriptions are billed in advance and we do not offer refunds for any portion of the subscription period. You can cancel anytime to stop future charges — see our Refund Policy for full details.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'Payments are processed through Razorpay, which supports UPI, debit and credit cards, net banking, and popular wallets used across India.',
  },
  {
    question: 'Do you have a team plan?',
    answer:
      "Not yet. Lawie is currently offered as a single-advocate plan. If you need access for a chamber or firm, write to us at contact@lawie.in and we'll let you know when team plans are available.",
  },
  {
    question: 'Is GST included?',
    answer:
      // Ajay, handoff/legal/gst-tax-invoice-signed.md 5a, byte for byte. "and you can download
      // it from your account" ships because the Invoices card (/dashboard/settings) has the PDF.
      'Yes. Prices shown include GST. After each payment we email you a GST tax invoice from Lawie, and you can download it from your account.',
  },
  {
    question: 'What is Ink?',
    answer:
      "Ink is Lawie's credit unit. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. You see the Ink cost before you generate a draft. The Free plan gives you 5 Ink on sign-up, once your email is verified (lifetime). Solo and Pro plans give you fresh Ink every month; plan Ink left unused at the end of the month does not carry over. You can also buy top-up packs anytime, and top-up Ink never expires.",
  },
];

/** "₹7,990" from 7990 (T-364: prices come from PLANS in @lawie/shared). */
const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

/** Saving from paying yearly instead of 12 monthly charges. */
const soloYearlySaving = 12 * PLANS.solo_monthly.priceInr - PLANS.solo_yearly.priceInr;
const proYearlySaving = 12 * PLANS.pro_monthly.priceInr - PLANS.pro_yearly.priceInr;

/**
 * T-398: every yearly line is held by Ajay (handoff/legal/T-398-pro-card-signed.md) until the
 * yearly Ink grant is settled. While true, the Monthly/Yearly toggle and every yearly line
 * ("or ₹…/year — save 2 months", "₹… saved vs paying monthly") are not rendered.
 */
const YEARLY_HELD = true;

export default function PricingPage() {
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const soloPrice =
    period === 'monthly' ? inr(PLANS.solo_monthly.priceInr) : inr(PLANS.solo_yearly.priceInr);
  const proPrice =
    period === 'monthly' ? inr(PLANS.pro_monthly.priceInr) : inr(PLANS.pro_yearly.priceInr);
  const soloAlt =
    period === 'monthly'
      ? `or ${inr(PLANS.solo_yearly.priceInr)}/year — save 2 months`
      : `${inr(soloYearlySaving)} saved vs paying monthly`;
  const proAlt =
    period === 'monthly'
      ? `or ${inr(PLANS.pro_yearly.priceInr)}/year — save 2 months`
      : `${inr(proYearlySaving)} saved vs paying monthly`;
  const soloPeriodLabel = period === 'monthly' ? '/month' : '/year';
  const proPeriodLabel = period === 'monthly' ? '/month' : '/year';

  return (
    <>
      <style>{`
        .pricing-toggle-row{display:flex;justify-content:center;margin:8px 0 48px}
        .price-toggle button{white-space:nowrap}
        .price-toggle .save-badge{white-space:nowrap}
        .plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto}
        .plan{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:36px;display:flex;flex-direction:column;position:relative}
        .plan.solo{border:1.5px solid var(--gold);box-shadow:var(--sh-lg)}
        .plan-name{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
        .plan.solo .plan-name{color:var(--gold)}
        .plan-price{font-family:var(--serif);font-size:48px;font-weight:700;color:var(--navy);margin:16px 0 4px;line-height:1}
        .plan-price small{font-family:var(--sans);font-size:17px;font-weight:500;color:var(--text-muted)}
        .plan-alt{font-size:15px;color:var(--text-muted);min-height:22px}
        .plan ul{list-style:none;margin:26px 0 30px;padding:0;display:grid;gap:13px}
        .plan li{display:flex;gap:11px;font-size:15.5px;color:var(--text-2);line-height:1.45}
        .plan li svg{width:19px;height:19px;color:var(--teal);flex-shrink:0;margin-top:1px;stroke-width:2}
        .plan li.limit svg{color:var(--text-muted)}
        .plan li.head{font-weight:600;color:var(--navy);font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin-top:4px}
        .plan li.head svg{display:none}
        .plan .btn{margin-top:auto}
        .why-panel{max-width:1000px;margin:32px auto 0;background:rgba(200,133,14,0.07);border:1px solid rgba(200,133,14,0.25);border-radius:var(--r-card);padding:24px 28px;display:flex;align-items:center;gap:16px}
        .why-panel svg{width:26px;height:26px;color:var(--gold);flex-shrink:0;stroke-width:1.5}
        .why-panel strong{color:var(--navy);font-family:var(--serif);font-size:19px;font-weight:600}
        .why-panel span{display:block;color:var(--text-2);font-size:15px;margin-top:2px}
        .topup-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:700px;margin:32px auto 0}
        .topup-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);padding:24px;text-align:center;position:relative}
        .topup-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:var(--gold);color:#fff;padding:3px 10px;border-radius:var(--r-pill)}
        .topup-price{font-family:var(--serif);font-size:32px;font-weight:700;color:var(--navy)}
        .topup-ink{font-size:15px;color:var(--text-2);margin-top:4px}
        @media(max-width:768px){.plan-grid{grid-template-columns:1fr}.topup-grid{grid-template-columns:1fr}}
      `}</style>

      <SiteNav activePage="pricing" />

      <header className="page-hero">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Pricing
          </span>
          <h1>Simple, transparent pricing.</h1>
          <p className="sub">
            Start with 5 free Ink once your email is verified. Buy more when you need it.
          </p>
        </div>
      </header>

      <section className="section bg-white">
        <div className="container">
          {!YEARLY_HELD && (
            <div className="pricing-toggle-row">
              <PriceToggle period={period} onChange={setPeriod} />
            </div>
          )}
          <div className="plan-grid">
            {/* FREE */}
            <div className="plan">
              <div className="plan-name">Free</div>
              <div className="plan-price">₹0</div>
              <div className="plan-alt">
                5 Ink on sign-up, once your email is verified (lifetime)
              </div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> Every document type on Lawie
                </li>
                <li>
                  <Check strokeWidth={2} /> Every line of the draft is yours to change
                </li>
                <li>
                  <Check strokeWidth={2} /> Criminal drafts use BNS, BNSS and BSA section numbers
                </li>
                <li>
                  <Check strokeWidth={2} /> PDF / DOCX export
                </li>
              </ul>
              <Link className="btn btn-ghost btn-block" href="/login">
                Start with 5 free Ink
              </Link>
            </div>
            {/* SOLO */}
            <div className="plan solo">
              <div className="plan-name">Solo</div>
              <div className="plan-price">
                {soloPrice}
                <small>{soloPeriodLabel}</small>
              </div>
              <div className="plan-alt">{YEARLY_HELD ? null : soloAlt}</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> {PLANS.solo_monthly.inkPerCycle} Ink/month
                </li>
                <li>
                  <Check strokeWidth={2} /> Everything in Free
                </li>
              </ul>
              <Link className="btn btn-primary btn-block" href="/login">
                Sign up to choose Solo <ArrowRight strokeWidth={1.5} />
              </Link>
            </div>
            {/* PRO */}
            <div className="plan">
              <div className="plan-name">Pro</div>
              <div className="plan-price">
                {proPrice}
                <small>{proPeriodLabel}</small>
              </div>
              <div className="plan-alt">{YEARLY_HELD ? null : proAlt}</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> {PLANS.pro_monthly.inkPerCycle} Ink/month
                </li>
                <li>
                  <Check strokeWidth={2} /> Everything in Solo
                </li>
                <li>
                  <Check strokeWidth={2} /> Ink refills every month
                </li>
                <li>
                  <Check strokeWidth={2} /> Top-up packs available anytime
                </li>
              </ul>
              <Link className="btn btn-ghost btn-block" href="/login">
                Sign up to choose Pro <ArrowRight strokeWidth={1.5} />
              </Link>
            </div>
          </div>
          <div className="why-panel">
            <Lightbulb strokeWidth={1.5} />
            <div>
              <strong>Why Ink?</strong>
              <span>Most documents use 2 Ink, short documents 1. Buy extra packs anytime.</span>
            </div>
          </div>
        </div>
      </section>

      {/* TOP-UP SECTION */}
      <section className="section bg-cream">
        <div className="container">
          <div className="section-head section-head--center" style={{ marginBottom: '16px' }}>
            <span className="eyebrow">Top-up packs</span>
            <h2 className="mt-16">Need a few extra Ink?</h2>
            <p className="sub">
              Buy one-time packs — no subscription required. Available on all plans.
            </p>
          </div>
          <div className="topup-grid">
            <div className="topup-card">
              <div className="topup-price">₹65</div>
              <div className="topup-ink">3 Ink</div>
            </div>
            <div className="topup-card">
              <div className="topup-price">₹199</div>
              <div className="topup-ink">10 Ink</div>
            </div>
            <div className="topup-card">
              <div className="topup-price">₹499</div>
              <div className="topup-ink">28 Ink</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING FAQ */}
      <section className="section bg-white">
        <div className="narrow container">
          <div className="section-head section-head--center" style={{ marginBottom: '40px' }}>
            <span className="eyebrow">Pricing FAQ</span>
            <h2 className="mt-16">Billing questions, answered.</h2>
          </div>
          <Accordion items={pricingFaq} singleOpen />
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
