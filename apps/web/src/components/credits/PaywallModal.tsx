'use client';

import { ShieldAlert, ArrowRight, Calendar, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { TopUpModal } from './TopUpModal';

interface PaywallModalProps {
  /** Template display name, e.g. "Bail application u/s 437 CrPC" */
  documentLabel: string;
  /** Cost in Ink */
  cost: number;
  /** Current total Ink balance */
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
        {/* Header band — rust gradient */}
        <header
          className="relative overflow-hidden px-6 py-5"
          style={{ background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">
                <ShieldAlert size={15} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-200">
                  Ink insufficient
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-white">
                  You need {cost} Ink to draft this document.
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-white/60 hover:bg-white/20 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Receipt breakdown */}
        <section className="border-b border-slate-100 px-6 py-4 text-sm">
          <Row label="Document" value={documentLabel} />
          <Row label="Cost" value={`${cost} Ink`} valueClass="font-mono" />
          <Row label="Your balance" value={`${balance} Ink`} valueClass="font-mono" />
          <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
            <Row
              label="Short by"
              value={`${shortBy} Ink`}
              valueClass="font-mono font-semibold text-red-600"
            />
          </div>
        </section>

        {/* Paths */}
        <section className="px-6 py-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Pick a path
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* One-time top-up */}
            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:shadow-sm"
            >
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                One-time
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-900">Top up Ink</p>
              <p className="text-xs text-slate-500">Mini · Mid · Max — never expires</p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                Buy top-up
              </span>
            </button>

            {/* Upgrade to Solo */}
            <Link
              href="/pricing?plan=solo_monthly"
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
              <p className="mt-2 text-sm font-semibold text-slate-900">Upgrade to Solo</p>
              <p className="text-xs text-slate-500">50 Ink / mo · ₹799</p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-500">
                Upgrade <ArrowRight size={11} />
              </span>
            </Link>
          </div>
        </section>

        {/* Earn nudge strip */}
        <section className="border-t border-slate-100 bg-blue-50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <Calendar size={12} className="text-blue-500" />
            <p>
              <strong>Or wait:</strong> log in tomorrow for free Ink — daily login bonus resets at
              midnight.
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

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className={valueClass ?? 'text-slate-700'}>{value}</span>
    </div>
  );
}
