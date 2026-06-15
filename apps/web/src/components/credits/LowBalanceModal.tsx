'use client';

import { AlertTriangle, Calendar, X, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface LowBalanceModalProps {
  totalInk: number;
  inkSubMonthlyAllotment: number;
  onClose: () => void;
  onTopUp: () => void;
}

export function LowBalanceModal({
  totalInk,
  inkSubMonthlyAllotment,
  onClose,
  onTopUp,
}: LowBalanceModalProps) {
  const pct =
    inkSubMonthlyAllotment > 0 ? Math.round((totalInk / inkSubMonthlyAllotment) * 100) : 0;
  const criticallyLow = totalInk <= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band — amber */}
        <header className="relative overflow-hidden bg-amber-50 px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
                <AlertTriangle size={15} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  Low Ink
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">Running low on Ink</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Balance status */}
        <div className="px-6 py-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-slate-500">Ink remaining</span>
            <div className="flex items-center gap-1.5">
              <Zap size={13} className="text-amber-500" />
              <span className="font-mono font-bold text-slate-900">{totalInk} Ink</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${criticallyLow ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.max(pct, 3)}%` }}
            />
          </div>
          <p
            className={`mt-1 text-right text-xs ${criticallyLow ? 'font-semibold text-red-600' : 'text-slate-400'}`}
          >
            {criticallyLow ? 'Critically low' : `${pct}% of monthly allotment`}
          </p>

          <p className="mt-4 text-sm text-slate-600">
            Top up now to keep drafting without interruption, or your subscription resets at the
            start of your next billing cycle.
          </p>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={onTopUp}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
            >
              <Zap size={14} /> Top up Ink
            </button>
            <Link
              href="/pricing"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View plans <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Earn nudge strip */}
        <div className="border-t border-amber-100 bg-amber-50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <Calendar size={12} />
            <p>
              <strong>Free fix:</strong> log in tomorrow to earn bonus Ink — daily login resets at
              midnight IST.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
