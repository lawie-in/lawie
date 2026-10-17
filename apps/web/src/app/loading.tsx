'use client';

/**
 * T-510 — app-level loading screen (Night Library spec §08): a skeleton, and after 8s
 * "Still working…" under it, so a slow load never looks like a blank or frozen page.
 */
import { useEffect, useState } from 'react';

import { card } from '@/components/intake/ui';

const STILL_WORKING_AFTER_MS = 8000;

const LOADING_STRINGS = {
  stillWorking: 'Still working…',
} as const;

export default function Loading() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), STILL_WORKING_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="bg-brand-page flex min-h-screen items-center justify-center px-4 py-10">
      <div role="status" aria-busy="true" className="flex w-full max-w-[480px] flex-col gap-3">
        <div className={`${card} flex flex-col gap-3`} aria-hidden="true">
          <div className="bg-brand-line h-5 w-2/3 animate-pulse rounded" />
          <div className="bg-brand-line h-4 w-full animate-pulse rounded" />
          <div className="bg-brand-line h-4 w-5/6 animate-pulse rounded" />
          <div className="bg-brand-line h-10 w-1/3 animate-pulse rounded-lg" />
        </div>
        {slow && <p className="text-brand-muted text-sm">{LOADING_STRINGS.stillWorking}</p>}
      </div>
    </main>
  );
}
