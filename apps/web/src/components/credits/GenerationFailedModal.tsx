'use client';

import { AlertTriangle, CheckCircle, RotateCcw, X } from 'lucide-react';

interface GenerationFailedModalProps {
  referenceCode?: string;
  reason?: string;
  onRetry: () => void;
  onClose: () => void;
}

export function GenerationFailedModal({
  referenceCode,
  reason = 'An unexpected error occurred during generation.',
  onRetry,
  onClose,
}: GenerationFailedModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band — rust/red */}
        <header
          className="relative overflow-hidden px-6 py-5"
          style={{ background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">
                <AlertTriangle size={15} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-200">
                  Generation failed
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-white">Something went wrong</h2>
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

        {/* No charge strip */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-green-50 px-6 py-3">
          <CheckCircle size={13} className="text-green-600" />
          <p className="text-xs font-medium text-green-800">
            No Ink was charged — this attempt is free.
          </p>
        </div>

        {/* Receipt */}
        <div className="px-6 py-5">
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {referenceCode && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-slate-500">Reference</span>
                <span className="font-mono text-[11px] text-slate-700">{referenceCode}</span>
              </div>
            )}
            <div className="px-4 py-2.5">
              <span className="text-slate-500">Reason</span>
              <p className="mt-1 text-slate-700">{reason}</p>
            </div>
          </div>

          {/* Actions */}
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <RotateCcw size={14} /> Try again — no Ink charged
          </button>

          <p className="mt-3 text-center text-xs text-slate-400">
            Still failing?{' '}
            <a
              href="mailto:support@lawie.in"
              className="text-blue-600 underline hover:text-blue-700"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
