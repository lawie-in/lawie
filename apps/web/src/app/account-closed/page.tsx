'use client';

/**
 * T-115c — where a closed account lands (Rajesh's spec §4). Public: no session, no sidebar.
 * Reached only after DELETE /api/auth/me answered 200, i.e. every part of the erase finished
 * (Ajay's condition 1), and after the browser's stored state was cleared.
 *
 * Text: Madhuri (dpdp-ui-strings-t115.md C). It says nothing about what was erased; any line
 * that does needs Ajay first. Focus goes to the h1 so a screen reader reads it.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { card, primaryButton } from '@/components/intake/ui';

export default function AccountClosedPage() {
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
          Your account is closed
        </h1>
        <p className="text-base">You have been signed out.</p>
        <p className="text-base">Thank you for using Lawie.</p>
        <Link href="/" className={`${primaryButton} self-start`}>
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
