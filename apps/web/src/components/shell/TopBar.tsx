'use client';

// T-511 part A: top bar (spec 3 "Top bar", 5). Signed out and signed in, all content by slot; no
// auth coupling. Lawie mark with the lamp dot, nav, Ink chip, theme toggle, avatar menu. Below
// 720px it collapses to mark + Ink chip + menu (nav and the theme toggle hide; put them in the
// menu slot's content on small screens). Not mounted anywhere in part A.

import Link from 'next/link';

import { ThemeToggle } from './ThemeToggle';

import { cn } from '@/lib/cn';

export type TopBarVariant = 'signed-out' | 'signed-in';

export interface TopBarProps {
  variant: TopBarVariant;
  /** Where the mark links. */
  homeHref?: string;
  /** Mark text and its accessible name. */
  brand?: string;
  /** Nav links (hidden below 720px). */
  nav?: React.ReactNode;
  /** Accessible name of the nav landmark; required with `nav` so the landmark is named. */
  navLabel?: string;
  /** Ink chip (signed in); stays visible when collapsed. */
  inkChip?: React.ReactNode;
  /** Signed-out actions (e.g. sign in and the primary call to action); hidden below 720px. */
  actions?: React.ReactNode;
  /** Avatar menu (signed in) or the small-screen menu; always visible. */
  menu?: React.ReactNode;
  /** Theme toggle; pass `false` to hide it. */
  showThemeToggle?: boolean;
  className?: string;
}

export function LawieMark({ brand = 'Lawie', href = '/' }: { brand?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="nl nl-focus gap-nl-2 rounded-nl-sm text-nl-text inline-flex min-h-[44px] items-center no-underline"
    >
      <span aria-hidden="true" className="relative inline-flex h-2.5 w-2.5">
        {/* the lamp dot */}
        <span className="bg-nl-brass absolute inset-0 rounded-full" />
        <span
          className="absolute -inset-2 rounded-full"
          style={{ backgroundImage: 'radial-gradient(circle, var(--lamp), transparent 70%)' }}
        />
      </span>
      <span className="nl-h2 leading-none">{brand}</span>
    </Link>
  );
}

export function TopBar({
  variant,
  homeHref = '/',
  brand = 'Lawie',
  nav,
  navLabel,
  inkChip,
  actions,
  menu,
  showThemeToggle = true,
  className,
}: TopBarProps) {
  return (
    <header
      data-variant={variant}
      className={cn(
        'nl gap-nl-4 border-nl-line bg-nl-wall px-nl-4 text-nl-text flex min-h-[64px] w-full items-center border-b',
        'min-[900px]:px-nl-8',
        className,
      )}
    >
      <LawieMark brand={brand} href={homeHref} />
      {nav ? (
        <nav
          aria-label={navLabel}
          className="min-[720px]:gap-nl-1 hidden min-[720px]:flex min-[720px]:items-center"
        >
          {nav}
        </nav>
      ) : null}
      <div className="gap-nl-3 ml-auto flex items-center">
        {variant === 'signed-in' && inkChip ? (
          <div className="flex items-center">{inkChip}</div>
        ) : null}
        {showThemeToggle ? (
          <div className="hidden min-[720px]:block">
            <ThemeToggle hideLegend />
          </div>
        ) : null}
        {variant === 'signed-out' && actions ? (
          <div className="min-[720px]:gap-nl-3 hidden min-[720px]:flex min-[720px]:items-center">
            {actions}
          </div>
        ) : null}
        {menu ? <div className="flex items-center">{menu}</div> : null}
      </div>
    </header>
  );
}
