'use client';

/**
 * T-510 — app-level 404 (Night Library spec §08): "This page is not on the shelf" with a way
 * back to the dashboard. Copy: handoff/copy/T-511-copy-v1.md §5. Focus goes to the h1 so a screen reader reads it.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { card, primaryButton } from '@/components/intake/ui';

const NOT_FOUND_STRINGS = {
  title: 'This page is not on the shelf',
  body: 'Check the address, or go back to your dashboard.',
  back: 'Back to dashboard',
} as const;

export default function NotFound() {
  const titleRef = useRef<HTMLHeadingElement>(null);

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
          {NOT_FOUND_STRINGS.title}
        </h1>
        <p className="text-base">{NOT_FOUND_STRINGS.body}</p>
        <Link href="/dashboard" className={`${primaryButton} self-start`}>
          {NOT_FOUND_STRINGS.back}
        </Link>
      </div>
    </main>
  );
}
