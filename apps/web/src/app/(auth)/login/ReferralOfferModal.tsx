'use client';

import { CheckCircle2, Gift, Tag, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

// T-234 — referral offer modal. Copy: handoff/marketing/copy/login-page-t234.md (R8–R15),
// signed by Ajay (handoff/legal/T-234-login-copy-signed.md). R11 (daily login bonus) is deleted.
// {n} (bonusInk) is the value GET /api/auth/validate-code returns: the same ReferralCode.bonusInk
// that applyReferralCode passes to grantReferralInk. Never type a number here.
export default function ReferralOfferModal({
  code,
  label,
  bonusInk,
  onClose,
}: {
  code: string;
  label: string;
  bonusInk: number;
  onClose: () => void;
}) {
  const ctaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ctaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-offer-title"
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band */}
        <div
          className="relative overflow-hidden px-6 py-5"
          style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 60%, #f59e0b 100%)' }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/20 hover:text-white"
          >
            <X size={16} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25">
              <Gift size={18} className="text-white" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-100">
                Referral offer
              </p>
              <h2 id="referral-offer-title" className="mt-0.5 text-lg font-bold text-white">
                You&apos;ve been invited
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Code chip */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Tag size={14} className="shrink-0 text-amber-700" aria-hidden="true" />
            <span className="font-mono text-sm font-bold tracking-widest text-amber-800">
              {code}
            </span>
            {label && <span className="ml-auto text-xs text-amber-800">{label}</span>}
          </div>

          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            What you get
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2.5 text-sm text-slate-700">
              <CheckCircle2
                size={15}
                className="mt-0.5 shrink-0 text-green-700"
                aria-hidden="true"
              />
              <span>
                <strong>{bonusInk} Ink</strong> added to your account when you sign up
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-slate-700">
              <CheckCircle2
                size={15}
                className="mt-0.5 shrink-0 text-green-700"
                aria-hidden="true"
              />
              <span>No card needed to sign up.</span>
            </li>
          </ul>

          {/* CTA — closes the modal and returns to the form (Priya decision 2). The code then goes
              with Google or in the register request's referralCode. */}
          <button
            ref={ctaRef}
            type="button"
            onClick={onClose}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white hover:bg-slate-700 active:scale-[0.98]"
          >
            Claim offer
          </button>
          <p className="mt-2 text-center text-xs text-slate-600">
            Your bonus is added when you create your account.
          </p>
        </div>
      </div>
    </div>
  );
}
