'use client';

import { useEffect, useState } from 'react';

import { getAccessToken } from '@/lib/auth';

export interface UsageData {
  used: number;
  limit: number | null;
  remaining: number | null;
  plan: 'free' | 'pro';
}

export function useUsage(): { data: UsageData | null; loading: boolean } {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: UsageData) => setData(d))
      .catch(() => {
        // Fallback — treat as fresh free user if API unavailable
        setData({ used: 0, limit: 3, remaining: 3, plan: 'free' });
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
