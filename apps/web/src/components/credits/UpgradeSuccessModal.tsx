'use client';

import { CheckCircle, X, Zap } from 'lucide-react';

interface UpgradeSuccessModalProps {
  planLabel: string;
  inkPerCycle: number;
  renewsOn: string;
  onClose: () => void;
}

const FEATURES: Record<string, string[]> = {
  solo: [
    '50 Ink / month — reset each billing cycle',
    'Unused Ink rolls over (up to 2× cap on yearly)',
    'All document templates unlocked',
    'PDF + DOCX export',
  ],
  pro: [
    '150 Ink / month — reset each billing cycle',
    'Unused Ink rolls over (up to 2× cap on yearly)',
    'All document templates unlocked',
    'Priority support',
    'PDF + DOCX export',
  ],
};

export function UpgradeSuccessModal({
  planLabel,
  inkPerCycle,
  renewsOn,
  onClose,
}: UpgradeSuccessModalProps) {
  const tier = planLabel.toLowerCase().includes('pro') ? 'pro' : 'solo';
  const features = FEATURES[tier] ?? FEATURES.solo;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band — amber gradient */}
        <header
          className="relative overflow-hidden px-6 py-5"
          style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 60%, #f59e0b 100%)' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-white">
                <CheckCircle size={15} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-100">
                  Welcome aboard
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-white">{planLabel} activated!</h2>
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

        {/* Feature checklist */}
        <div className="px-6 py-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            What&apos;s included
          </p>
          <ul className="space-y-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                <CheckCircle size={14} className="mt-0.5 shrink-0 text-green-500" />
                {f}
              </li>
            ))}
          </ul>

          {/* Receipt */}
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500">Plan</span>
              <span className="font-medium text-slate-900">{planLabel}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500">Ink this cycle</span>
              <div className="flex items-center gap-1">
                <Zap size={12} className="text-amber-500" />
                <span className="font-mono font-semibold text-slate-900">{inkPerCycle}</span>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500">Renews</span>
              <span className="text-slate-700">{renewsOn}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Start drafting
          </button>
        </div>
      </div>
    </div>
  );
}
