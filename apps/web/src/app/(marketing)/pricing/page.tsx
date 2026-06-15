'use client';

import { Check, ArrowRight, Lightbulb, Minus } from 'lucide-react';
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
      'Payments are processed securely through Razorpay, which supports UPI, debit and credit cards, net banking, and popular wallets used across India.',
  },
  {
    question: 'Do you have a team plan?',
    answer:
      "Not yet. Lawie is currently offered as a single-advocate plan. If you need access for a chamber or firm, write to us at contact@lawie.in and we'll let you know when team plans are available.",
  },
  {
    question: 'Is GST included?',
    answer:
      'The displayed prices are inclusive of applicable taxes. Your payment receipt from Razorpay will show the tax breakup where relevant.',
  },
  {
    question: 'What is Ink?',
    answer:
      "Ink is Lawie's credit unit. Each document you generate uses 1 Ink. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.",
  },
];

export default function PricingPage() {
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const soloPrice = period === 'monthly' ? '₹799' : '₹7,990';
  const proPrice = period === 'monthly' ? '₹1,999' : '₹19,990';
  const soloAlt =
    period === 'monthly' ? 'or ₹7,990/year — save 2 months' : '₹1,598 saved vs paying monthly';
  const proAlt =
    period === 'monthly' ? 'or ₹19,990/year — save 2 months' : '₹3,998 saved vs paying monthly';
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
          <p className="sub">Ink credits — start free, buy more when you need it.</p>
        </div>
      </header>

      <section className="section bg-white">
        <div className="container">
          <div className="pricing-toggle-row">
            <PriceToggle period={period} onChange={setPeriod} />
          </div>
          <div className="plan-grid">
            {/* FREE */}
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
                <li>
                  <Check strokeWidth={2} /> PDF / DOCX export
                </li>
                <li className="limit">
                  <Minus strokeWidth={2} /> Lawie watermark on exports
                </li>
              </ul>
              <Link className="btn btn-ghost btn-block" href="/login">
                Start Free
              </Link>
            </div>
            {/* SOLO */}
            <div className="plan solo">
              <span
                className="badge badge--gold"
                style={{ position: 'absolute', top: '-12px', left: '36px' }}
              >
                Most Popular
              </span>
              <div className="plan-name">Solo</div>
              <div className="plan-price">
                {soloPrice}
                <small>{soloPeriodLabel}</small>
              </div>
              <div className="plan-alt">{soloAlt}</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> 50 Ink/month
                </li>
                <li className="head">Everything in Free, plus</li>
                <li>
                  <Check strokeWidth={2} /> No watermark on exports
                </li>
                <li>
                  <Check strokeWidth={2} /> Priority email support
                </li>
                <li>
                  <Check strokeWidth={2} /> Early access to new templates
                </li>
              </ul>
              <Link className="btn btn-primary btn-block" href="/login">
                Start Drafting Free <ArrowRight strokeWidth={1.5} />
              </Link>
            </div>
            {/* PRO */}
            <div className="plan">
              <div className="plan-name">Pro</div>
              <div className="plan-price">
                {proPrice}
                <small>{proPeriodLabel}</small>
              </div>
              <div className="plan-alt">{proAlt}</div>
              <ul>
                <li>
                  <Check strokeWidth={2} /> 150 Ink/month
                </li>
                <li className="head">Everything in Solo, plus</li>
                <li>
                  <Check strokeWidth={2} /> No watermark on exports
                </li>
                <li>
                  <Check strokeWidth={2} /> Priority email support
                </li>
                <li>
                  <Check strokeWidth={2} /> Early access to new templates
                </li>
              </ul>
              <Link className="btn btn-ghost btn-block" href="/login">
                Get Pro <ArrowRight strokeWidth={1.5} />
              </Link>
            </div>
          </div>
          <div className="why-panel">
            <Lightbulb strokeWidth={1.5} />
            <div>
              <strong>Why Ink?</strong>
              <span>Less than ₹16 per document on Solo. Buy extra packs anytime.</span>
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
              <span className="topup-badge">POPULAR</span>
              <div className="topup-price">₹199</div>
              <div className="topup-ink">10 Ink</div>
            </div>
            <div className="topup-card">
              <span className="topup-badge">BEST VALUE</span>
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
