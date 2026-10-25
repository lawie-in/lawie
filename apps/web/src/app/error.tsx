'use client';

/**
 * T-510 — app-level error screen (Night Library spec §08, 500). Shown when a route segment
 * throws; the root layout stays. global-error.tsx still covers a failure in the layout itself.
 * Reports to Sentry like global-error.tsx. No error text or user data is shown or sent as extras.
 * Copy: handoff/copy/T-511-copy-v1.md §5 (no extra line, AJ-511-M9).
 * Focus goes to the h1 so a screen reader reads it.
 */
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui';

const ERROR_PAGE_STRINGS = {
  title: 'Something went wrong on our side',
  body: 'Please try again.',
  retry: 'Retry',
  back: 'Back to dashboard',
} as const;

/** Ghost button look (ui Button ghost) on a link. */
const GHOST_LINK =
  'nl nl-focus rounded-nl-md border-nl-line px-nl-5 font-nl-body text-nl-brass-dark inline-flex h-11 items-center border bg-transparent text-[15px] font-medium leading-5 no-underline hover:shadow-nl-halo';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <main className="nl nl-root nl-lamp-pool px-nl-4 py-nl-10 flex min-h-screen items-center justify-center">
      {/* T-520: the folio (spec 3 Card folio): 1px line, card ground, no radius. */}
      <div className="nl border-nl-line bg-nl-card p-nl-6 text-nl-text shadow-nl-card gap-nl-4 min-[900px]:p-nl-10 flex w-full max-w-[480px] flex-col border">
        <h1 ref={titleRef} tabIndex={-1} className="nl-h1 m-0 focus:outline-none">
          {ERROR_PAGE_STRINGS.title}
        </h1>
        <p className="nl-body text-nl-soft m-0">{ERROR_PAGE_STRINGS.body}</p>
        <div className="gap-nl-3 flex flex-wrap">
          <Button onClick={() => reset()}>{ERROR_PAGE_STRINGS.retry}</Button>
          <Link href="/dashboard" className={GHOST_LINK}>
            {ERROR_PAGE_STRINGS.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
