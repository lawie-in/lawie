'use client';

/**
 * T-510 — app-level 404 (Night Library spec §08): "This page is not on the shelf" with a way
 * back to the dashboard. Copy: handoff/copy/T-511-copy-v1.md §5. Focus goes to the h1 so a screen reader reads it.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';

const NOT_FOUND_STRINGS = {
  title: 'This page is not on the shelf',
  body: 'Check the address, or go back to your dashboard.',
  back: 'Back to dashboard',
} as const;

/** Primary button look (ui Button primary) on a link. */
const PRIMARY_LINK =
  'nl nl-focus rounded-nl-md bg-nl-brass px-nl-5 font-nl-body text-nl-on-brass inline-flex h-11 items-center self-start border border-transparent text-[15px] font-medium leading-5 no-underline hover:shadow-nl-halo';

export default function NotFound() {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <main className="nl nl-root nl-lamp-pool px-nl-4 py-nl-10 flex min-h-screen items-center justify-center">
      {/* T-520: the folio (spec 3 Card folio): 1px line, card ground, no radius. */}
      <div className="nl border-nl-line bg-nl-card p-nl-6 text-nl-text shadow-nl-card gap-nl-4 min-[900px]:p-nl-10 flex w-full max-w-[480px] flex-col border">
        <h1 ref={titleRef} tabIndex={-1} className="nl-h1 m-0 focus:outline-none">
          {NOT_FOUND_STRINGS.title}
        </h1>
        <p className="nl-body text-nl-soft m-0">{NOT_FOUND_STRINGS.body}</p>
        <Link href="/dashboard" className={PRIMARY_LINK}>
          {NOT_FOUND_STRINGS.back}
        </Link>
      </div>
    </main>
  );
}
