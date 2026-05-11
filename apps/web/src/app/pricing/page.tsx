'use client';

/**
 * /pricing — public marketing page.
 *
 * Design: docs/Pricing Design/Pricing _ monthly toggle.png + Pricing _ yearly toggle _17_.png
 *
 * Pulls plan SKUs from GET /api/billing/plans (which mirrors the static
 * credit-skus.ts catalog). Subscribe / top-up buttons:
 *   • Unauth user → /login (then return to /pricing).
 *   • Auth user  → POST /billing/subscribe to open Razorpay Checkout.
 */

import { Check, Coins, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch';

interface SubscriptionPlan {
  id: 'practice_monthly' | 'practice_yearly' | 'firm_monthly' | 'firm_yearly';
  tier: 'practice' | 'firm';
  cycle: 'monthly' | 'yearly';
  priceInr: number;
  creditsPerCycle: number;
}

interface TopupSku {
  id: string;
  credits: number;
  priceInr: number;
  badge?: 'POPULAR' | 'BEST_VALUE';
  pricePerCreditInr: number;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<SubscriptionPlan[]>([]);
  const [topups, setTopups] = useState<TopupSku[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch('/api/billing/plans');
      if (res.ok) {
        const body = await res.json();
        setSubs(body.subscriptions ?? []);
        setTopups(body.topups ?? []);
      }
    })();
  }, []);

  const practice = useMemo(
    () => subs.find((p) => p.tier === 'practice' && p.cycle === cycle),
    [subs, cycle],
  );
  const firm = useMemo(
    () => subs.find((p) => p.tier === 'firm' && p.cycle === cycle),
    [subs, cycle],
  );

  // For yearly toggle, compute savings vs 12 × monthly
  const practiceMonthly = subs.find((p) => p.tier === 'practice' && p.cycle === 'monthly');
  const firmMonthly = subs.find((p) => p.tier === 'firm' && p.cycle === 'monthly');
  const practiceYearlySavings = practiceMonthly
    ? practiceMonthly.priceInr * 12 - (subs.find((p) => p.tier === 'practice' && p.cycle === 'yearly')?.priceInr ?? 0)
    : 0;
  const firmYearlySavings = firmMonthly
    ? firmMonthly.priceInr * 12 - (subs.find((p) => p.tier === 'firm' && p.cycle === 'yearly')?.priceInr ?? 0)
    : 0;

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!user) {
      window.location.href = `/login?next=${encodeURIComponent('/pricing')}`;
      return;
    }
    setLoadingPlan(plan.id);
    const res = await apiFetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan.id }),
    });
    if (res.ok) {
      const body = await res.json();
      const url = body.data?.shortUrl as string | undefined;
      if (url) {
        window.location.href = url;
      } else {
        setLoadingPlan(null);
      }
    } else {
      setLoadingPlan(null);
    }
  };

  const handleTopup = async (sku: TopupSku) => {
    if (!user) {
      window.location.href = `/login?next=${encodeURIComponent('/pricing')}`;
      return;
    }
    setLoadingPlan(sku.id);
    const orderRes = await apiFetch('/api/billing/topup/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skuId: sku.id }),
    });
    if (!orderRes.ok) {
      setLoadingPlan(null);
      return;
    }
    const order = (await orderRes.json()).data as {
      orderId: string;
      amountInr: number;
      credits: number;
      razorpayKeyId: string;
    };
    const ok = await loadRazorpay();
    if (!ok || !window.Razorpay) {
      setLoadingPlan(null);
      return;
    }
    const rzp = new window.Razorpay({
      key: order.razorpayKeyId,
      amount: order.amountInr * 100,
      currency: 'INR',
      name: 'Lawie',
      description: `${order.credits} credits`,
      order_id: order.orderId,
      theme: { color: '#0f172a' },
      modal: { ondismiss: () => setLoadingPlan(null) },
    });
    rzp.open();
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      {/* Topbar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-amber-300">
              L
            </span>
            <span className="text-sm font-semibold text-slate-900">Lawie</span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs font-medium text-slate-600 md:flex">
            <Link href="/dashboard/templates" className="hover:text-slate-900">
              Templates
            </Link>
            <Link href="#how" className="hover:text-slate-900">
              How it works
            </Link>
            <Link href="/pricing" className="font-semibold text-amber-700">
              Pricing
            </Link>
            <Link
              href={user ? '/dashboard' : '/login'}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              {user ? 'Dashboard' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
            CREDITS · PAY ONLY FOR WHAT YOU DRAFT
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold leading-tight text-slate-900">
            One credit. One court-ready draft.{' '}
            <span className="italic text-red-600">No subscriptions you can&apos;t use.</span>
          </h1>
          <p className="mt-5 text-sm text-slate-600">
            Simple notices cost 1 credit. Bail and complaint drafts cost 2. Buy by the month, top up any
            time, or earn credits by rating drafts — your earned credits never expire.
          </p>

          {/* Cycle toggle */}
          <div className="mt-7 inline-flex items-center gap-1 rounded-full bg-slate-900 p-1">
            <button
              onClick={() => setCycle('monthly')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                cycle === 'monthly' ? 'bg-white text-slate-900' : 'text-slate-300'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle('yearly')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                cycle === 'yearly' ? 'bg-white text-slate-900' : 'text-slate-300'
              }`}
            >
              Yearly
              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-slate-900">
                –17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="px-6 pb-10">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
          {/* Free */}
          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header>
              <p className="text-sm font-bold text-slate-900">Free</p>
              <p className="mt-1 text-xs text-slate-500">Try Lawie</p>
              <p className="mt-3 text-xs italic text-slate-500">
                For advocates testing the workflow.
              </p>
              <p className="mt-4 text-4xl font-bold text-slate-900">
                ₹0
                <span className="ml-1 text-xs font-normal text-slate-500">/ month</span>
              </p>
            </header>
            <div className="my-5 rounded-xl bg-amber-50 px-3 py-2 text-sm">
              <p className="font-semibold text-amber-900">35–45 credits</p>
              <p className="text-[11px] text-amber-700">on signup + earned</p>
            </div>
            <ul className="flex-1 space-y-2.5 text-xs text-slate-600">
              <FeatureCheck>Up to 45 credits via signup, daily login &amp; ratings</FeatureCheck>
              <FeatureCheck>All 6 templates · all 13 courts</FeatureCheck>
              <FeatureCheck>Section finder · AI preflight</FeatureCheck>
              <FeatureCheck>Single advocate</FeatureCheck>
            </ul>
            <Link
              href={user ? '/dashboard' : '/login'}
              className="mt-5 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {user ? 'Open dashboard' : 'Start free'}
            </Link>
          </article>

          {/* Practice — featured dark card */}
          <article className="relative flex flex-col rounded-2xl bg-slate-900 p-6 text-slate-100 shadow-xl">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-900">
              Most popular
            </span>
            <header>
              <p className="text-sm font-bold">Practice</p>
              <p className="mt-1 text-xs text-slate-400">For active solos</p>
              <p className="mt-3 text-xs italic text-slate-400">
                Junior + active solo · 8–12 cases/month.
              </p>
              <p className="mt-4 text-4xl font-bold">
                ₹{practice?.priceInr.toLocaleString('en-IN') ?? '—'}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  / {cycle === 'monthly' ? 'month' : 'year'}
                </span>
              </p>
              {cycle === 'yearly' && practiceYearlySavings > 0 && (
                <p className="mt-1 text-[11px] text-green-400">
                  Save ₹{practiceYearlySavings.toLocaleString('en-IN')} vs monthly
                </p>
              )}
            </header>
            <div className="my-5 rounded-xl bg-slate-800 px-3 py-2">
              <p className="text-sm font-semibold text-amber-300">
                {practice?.creditsPerCycle ?? '—'} credits
              </p>
              <p className="text-[11px] text-slate-400">
                {cycle === 'yearly' ? 'monthly drip' : '/ month'}
              </p>
            </div>
            <ul className="flex-1 space-y-2.5 text-xs text-slate-300">
              <FeatureCheck dark>
                {practice?.creditsPerCycle ?? 80} credits every month · ≈ 40 simple drafts
              </FeatureCheck>
              <FeatureCheck dark>₹9.99 per credit · ≈ ₹19.98 per bail</FeatureCheck>
              <FeatureCheck dark>Priority drafting queue</FeatureCheck>
              <FeatureCheck dark>PDF + DOCX export · e-stamping ready</FeatureCheck>
              <FeatureCheck dark>Email support (24h)</FeatureCheck>
            </ul>
            <button
              onClick={() => practice && handleSubscribe(practice)}
              disabled={!practice || loadingPlan === practice?.id}
              className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
            >
              {loadingPlan === practice?.id && (
                <Loader2 size={13} className="animate-spin" />
              )}
              Upgrade to Practice
            </button>
          </article>

          {/* Firm */}
          <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header>
              <p className="text-sm font-bold text-slate-900">Firm</p>
              <p className="mt-1 text-xs text-slate-500">For 3–5 advocate firms</p>
              <p className="mt-3 text-xs italic text-slate-500">
                Shared bench · 30–50 matters / mo.
              </p>
              <p className="mt-4 text-4xl font-bold text-slate-900">
                ₹{firm?.priceInr.toLocaleString('en-IN') ?? '—'}
                <span className="ml-1 text-xs font-normal text-slate-500">
                  / {cycle === 'monthly' ? 'month' : 'year'}
                </span>
              </p>
              {cycle === 'yearly' && firmYearlySavings > 0 && (
                <p className="mt-1 text-[11px] text-green-600">
                  Save ₹{firmYearlySavings.toLocaleString('en-IN')} vs monthly
                </p>
              )}
            </header>
            <div className="my-5 rounded-xl bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold text-amber-900">
                {firm?.creditsPerCycle ?? '—'} credits
              </p>
              <p className="text-[11px] text-amber-700">
                {cycle === 'yearly' ? 'monthly drip' : '/ month'}
              </p>
            </div>
            <ul className="flex-1 space-y-2.5 text-xs text-slate-600">
              <FeatureCheck>{firm?.creditsPerCycle ?? 200} credits every month · best value</FeatureCheck>
              <FeatureCheck>₹7.50 per credit · best rate</FeatureCheck>
              <FeatureCheck>Up to 5 seats</FeatureCheck>
              <FeatureCheck>Shared template library</FeatureCheck>
              <FeatureCheck>Priority WhatsApp support</FeatureCheck>
            </ul>
            <button
              onClick={() => firm && handleSubscribe(firm)}
              disabled={!firm || loadingPlan === firm?.id}
              className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loadingPlan === firm?.id && <Loader2 size={13} className="animate-spin" />}
              Upgrade to Firm
            </button>
          </article>
        </div>

        {/* Credit-cost legend */}
        <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <div className="flex flex-wrap items-center justify-center gap-4 text-slate-600">
            <span className="flex items-center gap-1.5">
              <Coins size={13} className="text-amber-500" />
              <strong>How credits work</strong>
            </span>
            <span>
              <span className="font-mono text-blue-600">1 credit</span> · legal notice (§80, §138), rent
              agreement
            </span>
            <span>
              <span className="font-mono text-blue-600">2 credits</span> · bail (regular / anticipatory),
              consumer complaint
            </span>
          </div>
        </div>
      </section>

      {/* Top-ups */}
      <section className="bg-white px-6 py-12">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
            TOP-UPS · ANY TIER
          </p>
          <h2 className="mt-3 font-serif text-3xl font-bold text-slate-900">
            Need more credits this month?
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            One-time packs. They never expire and stack with any plan.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3">
            {topups.map((sku) => {
              const isDark = sku.badge === 'BEST_VALUE';
              return (
                <article
                  key={sku.id}
                  className={`relative rounded-2xl border p-5 shadow-sm ${
                    isDark
                      ? 'border-slate-900 bg-slate-900 text-slate-100'
                      : sku.badge === 'POPULAR'
                        ? 'border-amber-300 bg-white'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  {sku.badge && (
                    <span
                      className={`absolute -top-3 right-4 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        sku.badge === 'BEST_VALUE'
                          ? 'bg-amber-400 text-slate-900'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      {sku.badge === 'BEST_VALUE' ? 'Best value' : 'Popular'}
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <Coins
                      size={18}
                      className={isDark ? 'text-amber-300' : 'text-amber-500'}
                    />
                    <div>
                      <p className={`text-base font-bold ${isDark ? '' : 'text-slate-900'}`}>
                        {sku.credits} credits
                      </p>
                      <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ₹{sku.pricePerCreditInr.toFixed(2)} per credit · never expires
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={`font-mono text-2xl font-bold ${isDark ? '' : 'text-slate-900'}`}>
                      ₹{sku.priceInr}
                    </span>
                    <button
                      onClick={() => handleTopup(sku)}
                      disabled={loadingPlan === sku.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                        isDark
                          ? 'bg-amber-400 text-slate-900 hover:bg-amber-300'
                          : 'bg-slate-900 text-white hover:bg-slate-700'
                      } disabled:opacity-50`}
                    >
                      {loadingPlan === sku.id && (
                        <Loader2 size={12} className="animate-spin" />
                      )}
                      Top up
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#F8FAFC] px-6 py-14" id="how">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-serif text-3xl font-bold text-slate-900">
            Common questions
          </h2>
          <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FaqCard
              q="Do unused credits roll over?"
              a="Subscription credits lapse on each renewal. Earned credits (login, ratings) and top-up credits are permanent."
            />
            <FaqCard
              q="What happens if I cancel?"
              a="Your earned + top-up credits stay with you forever. You just stop getting the monthly subscription drip."
            />
            <FaqCard
              q="Are GST invoices provided?"
              a="Yes. Every payment generates an automatic Razorpay GST invoice, downloadable from your dashboard."
            />
            <FaqCard
              q="Which payment methods?"
              a="UPI, all major Indian cards, and net-banking through Razorpay. International cards on request."
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-6 py-6 text-center text-xs text-slate-500">
        AI-assisted drafting · Lawie does not provide legal advice
      </footer>
    </main>
  );
}

function FeatureCheck({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <Check
        size={13}
        className={`mt-0.5 flex-shrink-0 ${dark ? 'text-amber-300' : 'text-green-500'}`}
      />
      <span>{children}</span>
    </li>
  );
}

function FaqCard({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{q}</p>
      <p className="mt-1.5 text-xs text-slate-600">{a}</p>
    </div>
  );
}
