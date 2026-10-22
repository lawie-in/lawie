'use client';

/**
 * T-510 — app-level loading screen (Night Library spec §08): a skeleton, and after 8s
 * "Still working…" under it, so a slow load never looks like a blank or frozen page.
 * T-520: the folio look with the Night Library tokens. The skeleton pulse pauses while the tab
 * is hidden and is static under reduced motion (.nl-skeleton in globals.css).
 */
import { useEffect, useState } from 'react';

import { loopPlayState, usePageVisible } from '@/components/ui/motion';

const STILL_WORKING_AFTER_MS = 8000;

const LOADING_STRINGS = {
  /** T-524: functional label for screen readers only (Priya); not shown on screen. */
  loading: 'Loading',
  stillWorking: 'Still working…',
} as const;

const BARS = ['h-5 w-2/3', 'h-4 w-full', 'h-4 w-5/6', 'h-11 w-1/3'] as const;

export default function Loading() {
  const [slow, setSlow] = useState(false);
  const visible = usePageVisible();

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), STILL_WORKING_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="nl nl-root px-nl-4 py-nl-10 flex min-h-screen items-center justify-center">
      <div role="status" className="gap-nl-3 flex w-full max-w-[480px] flex-col">
        {/* T-524: the status region was silent (its skeleton is aria-hidden); it now has a name.
            No aria-busy on this region: a busy live region holds back its announcements. */}
        <span className="sr-only">{LOADING_STRINGS.loading}</span>
        <div
          className="border-nl-line bg-nl-card p-nl-6 gap-nl-3 min-[900px]:p-nl-10 flex flex-col border"
          aria-hidden="true"
        >
          {BARS.map((size) => (
            <div
              key={size}
              className={`nl-skeleton rounded-nl-sm ${size}`}
              style={loopPlayState(visible)}
            />
          ))}
        </div>
        {slow && <p className="nl-body-sm text-nl-muted m-0">{LOADING_STRINGS.stillWorking}</p>}
      </div>
    </main>
  );
}
