'use client';

/**
 * useCredits — fetches and caches the current user's credit balance.
 *
 * Auto-refreshes on window focus + after any `creditsChanged` window event so
 * components further down the tree can trigger a refresh after a draft / top-up
 * succeeds without prop-drilling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
  /**
   * T-372: true once a balance has actually been received (a successful fetch or
   * a `creditsChanged` event carrying one). False means `balance` is still the
   * empty default, so a 0 in it is not a real balance.
   */
  loaded: boolean;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState<CreditBalance>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  /** T-372: bumped when an event's balance is applied, so an older fetch cannot undo it. */
  const appliedSeq = useRef(0);

  const refresh = useCallback(async () => {
    const startedAt = appliedSeq.current;
    try {
      const res = await apiFetch('/api/credits/balance');
      if (res.ok) {
        const data = (await res.json()) as CreditBalance;
        // Started before a newer balance was applied from an event: drop it.
        if (appliedSeq.current !== startedAt) return;
        setBalance(data);
        setLoaded(true);
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
    // T-372: a balance in the event detail (e.g. from the SSE `done` event) is
    // applied straight away; anything else falls back to a refetch.
    const onCreditsChanged = (event: Event) => {
      const totalInk = (event as CustomEvent<CreditsChangedDetail | undefined>).detail?.totalInk;
      if (typeof totalInk === 'number' && Number.isFinite(totalInk)) {
        appliedSeq.current += 1;
        setBalance((prev) => ({ ...prev, totalInk }));
        setLoaded(true);
      } else {
        void refresh();
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('creditsChanged', onCreditsChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('creditsChanged', onCreditsChanged);
    };
  }, [refresh]);

  return { balance, loading, loaded, refresh };
}

/** The optional `creditsChanged` event detail: the new Ink balance (T-372). */
export interface CreditsChangedDetail {
  totalInk: number;
}

/**
 * Dispatch this after a draft / top-up so every mounted widget updates. Pass
 * the new balance when it is known (e.g. from the SSE `done` event) to apply it
 * without a refetch; with no balance every widget refetches.
 */
export function notifyCreditsChanged(balance?: CreditsChangedDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('creditsChanged', { detail: balance }));
  }
}
