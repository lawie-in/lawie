'use client';

import { Zap, Plus } from 'lucide-react';
import { useState } from 'react';

import { TopUpModal } from './TopUpModal';

import { useCredits } from '@/hooks/useCredits';

export function HeaderCreditPill() {
  const { balance, loading } = useCredits();
  const [showTopUp, setShowTopUp] = useState(false);

  if (loading && balance.totalInk === 0) return null;

  const tierLabel =
    balance.planTier === 'pro' ? 'PRO' : balance.planTier === 'solo' ? 'SOLO' : 'FREE';
  const tierPill =
    balance.planTier === 'free'
      ? 'bg-slate-100 text-slate-600'
      : balance.planTier === 'solo'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-blue-100 text-blue-700';

  return (
    <>
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 pl-3 shadow-sm">
        <Zap size={13} className="text-amber-500" />
        <span className="font-mono text-sm font-semibold text-slate-800">{balance.totalInk}</span>
        <span className="text-xs text-slate-500">Ink</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tierPill}`}>
          {tierLabel}
        </span>
        <button
          type="button"
          onClick={() => setShowTopUp(true)}
          className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
        >
          <Plus size={11} /> Top up
        </button>
      </div>
      {showTopUp && <TopUpModal onClose={() => setShowTopUp(false)} />}
    </>
  );
}
