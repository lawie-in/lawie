'use client';

/**
 * PaywallModal — shown when enforceCredits returns 402.
 *
 * Design: docs/Pricing Design/In-product paywall when balance _ cost.png
 *
 * Two paths:
 *   • One-time — opens TopUpModal (₹199 / 20 credits = 10 bail drafts)
 *   • Monthly  — links to /pricing with the Practice plan pre-selected
 *
 * Also surfaces the earn-tomorrow nudge (login bonus +2/day) so free users see
 * the lowest-friction path forward.
 */

import { AlertOctagon, ArrowRight, Calendar, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { TopUpModal } from './TopUpModal';

interface PaywallModalProps {
  /** Template display name, e.g. "Bail application u/s 437 CrPC" */
  documentLabel: string;
  /** Cost in credits */
  cost: number;
  /** Current total balance */
  balance: number;
  onClose: () => void;
}

export function PaywallModal({ documentLabel, cost, balance, onClose }: PaywallModalProps) {
  const [showTopUp, setShowTopUp] = useState(false);
  const shortBy = Math.max(0, cost - balance);

  if (showTopUp) {
    return (
      <TopUpModal
        onClose={() => {
          setShowTopUp(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between bg-red-50 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white">
              <AlertOctagon size={14} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">
                Insufficient credits
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                You need {cost} credit{cost > 1 ? 's' : ''} to draft a {documentLabel.toLowerCase()}.
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </header>

        {/* Balance breakdown */}
        <section className="border-b border-slate-100 px-6 py-4 text-sm">
          <Row label="Document" value={documentLabel} />
          <Row label="Cost" value={`${cost} credit${cost > 1 ? 's' : ''}`} valueClass="font-mono" />
          <Row
            label="Your balance"
            value={`${balance} credit${balance !== 1 ? 's' : ''}`}
            valueClass="font-mono"
          />
          <div className="border-t border-dashed border-slate-200 mt-2 pt-2">
            <Row
              label="Short by"
              value={`${shortBy} credit${shortBy !== 1 ? 's' : ''}`}
              valueClass="font-mono text-red-600 font-semibold"
            />
          </div>
        </section>

        {/* Paths */}
        <section className="px-6 py-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Pick a path
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:shadow-sm"
            >
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                One-time
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-900">Top up ₹199</p>
              <p className="text-xs text-slate-500">20 credits · never expires</p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                Buy top-up
              </span>
            </button>

            <Link
              href="/pricing?plan=practice_monthly"
              onClick={onClose}
              className="rounded-xl border-2 border-amber-400 bg-amber-50/40 p-4 text-left transition hover:bg-amber-50"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                  Monthly
                </span>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Best value
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">Upgrade to Practice</p>
              <p className="text-xs text-slate-500">80 credits / mo · ₹799</p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-500">
                Upgrade <ArrowRight size={11} />
              </span>
            </Link>
          </div>
        </section>

        {/* Earn nudge */}
        <section className="border-t border-slate-100 bg-slate-50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Calendar size={12} className="text-blue-500" />
            <p>
              <strong>Or wait:</strong> log in tomorrow for +2 credits — daily login bonus is permanent.
            </p>
          </div>
        </section>

        <p className="border-t border-slate-100 px-6 py-3 text-center text-[11px] text-slate-400">
          Secure payments via Razorpay · GST invoice provided
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className={valueClass ?? 'text-slate-700'}>{value}</span>
    </div>
  );
}
