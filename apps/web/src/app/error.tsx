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

import { card, primaryButton, secondaryButton } from '@/components/intake/ui';

const ERROR_PAGE_STRINGS = {
  title: 'Something went wrong on our side',
  body: 'Please try again.',
  retry: 'Retry',
  back: 'Back to dashboard',
} as const;

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
    <main className="bg-brand-page flex min-h-screen items-center justify-center px-4 py-10">
      <div className={`${card} text-brand-navy flex w-full max-w-[480px] flex-col gap-4`}>
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="font-heading text-xl font-semibold leading-7 focus:outline-none"
        >
          {ERROR_PAGE_STRINGS.title}
        </h1>
        <p className="text-base">{ERROR_PAGE_STRINGS.body}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => reset()} className={primaryButton}>
            {ERROR_PAGE_STRINGS.retry}
          </button>
          <Link href="/dashboard" className={secondaryButton}>
            {ERROR_PAGE_STRINGS.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
