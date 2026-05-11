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
  topupCredits: number;
  earnedCredits: number;
  subscriptionCredits: number;
  total: number;
  planTier: 'free' | 'practice' | 'firm';
  billingCycle: 'none' | 'monthly' | 'yearly';
}

const EMPTY: CreditBalance = {
  topupCredits: 0,
  earnedCredits: 0,
  subscriptionCredits: 0,
  total: 0,
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
      const res = await apiFetch('/api/drafting/credits/balance');
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
