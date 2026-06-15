'use client';

/**
 * useCredits — fetches and caches the current user's credit balance.
 *
 * Auto-refreshes on window focus + after any `creditsChanged` window event so
 * components further down the tree can trigger a refresh after a draft / top-up
 * succeeds without prop-drilling.
 */

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/apiFetch';

export interface CreditBalance {
  // Legacy credit buckets
  topupCredits: number;
  earnedCredits: number;
  subscriptionCredits: number;
  total: number;
  // Ink system (SCRUM-101) — human-readable Ink values (backend divides stored units by 2)
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
  totalInk: number;
  inkSubMonthlyAllotment: number;
  planTier: 'free' | 'solo' | 'pro';
  billingCycle: 'none' | 'monthly' | 'yearly';
}

const EMPTY: CreditBalance = {
  topupCredits: 0,
  earnedCredits: 0,
  subscriptionCredits: 0,
  total: 0,
  inkSub: 0,
  inkAnnualCarry: 0,
  inkTopup: 0,
  totalInk: 0,
  inkSubMonthlyAllotment: 0,
  planTier: 'free',
  billingCycle: 'none',
};

export function useCredits(): {
  balance: CreditBalance;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState<CreditBalance>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/credits/balance');
      if (res.ok) {
        const data = (await res.json()) as CreditBalance;
        setBalance(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh on focus + on global `creditsChanged` events
  useEffect(() => {
    const onFocus = () => void refresh();
    const onCreditsChanged = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('creditsChanged', onCreditsChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('creditsChanged', onCreditsChanged);
    };
  }, [refresh]);

  return { balance, loading, refresh };
}

/** Dispatch this after a draft / top-up so every mounted widget refreshes. */
export function notifyCreditsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('creditsChanged'));
  }
}
