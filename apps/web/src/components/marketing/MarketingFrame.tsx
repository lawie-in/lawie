'use client';

// T-517: the marketing layout's wrapper. The Night Library pages (landing and pricing) get no
// legacy wrapper: no `.mk` class (so app/(marketing)/marketing.css does not apply), none of the
// old Inter/Lora/Fraunces font variables, and no LogoSplash (spec 01: two font files, CSS effects
// only; the splash has no reduced-motion or tab-hidden handling). Every other marketing page
// (about, faq, terms, privacy, refunds, tools, contact) keeps `.mk`, the fonts and the splash
// exactly as before.

import { usePathname } from 'next/navigation';

/** Routes in the (marketing) group that are built in Night Library (T-517). */
export const NIGHT_LIBRARY_MARKETING_PATHS: readonly string[] = ['/', '/pricing'];

export function isNightLibraryMarketingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return NIGHT_LIBRARY_MARKETING_PATHS.includes(p);
}

export function MarketingFrame({
  legacyClassName,
  splash,
  children,
}: {
  /** Font variable classes for the old pages. */
  legacyClassName: string;
  /** The LogoSplash element, rendered only on the old pages. */
  splash: React.ReactNode;
  children: React.ReactNode;
}) {
  const nightLibrary = isNightLibraryMarketingPath(usePathname());
  // Same element either way, so a client navigation between old and new pages keeps the tree.
  return (
    <div className={nightLibrary ? undefined : `mk ${legacyClassName}`}>
      {nightLibrary ? null : splash}
      {children}
    </div>
  );
}
