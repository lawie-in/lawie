'use client';

// T-511 part A: top bar (spec 3 "Top bar", 5). Signed out and signed in, all content by slot; no
// auth coupling. Lawie mark with the lamp dot, nav, Ink chip, theme toggle, avatar menu.
// T-531 (Rajesh, DESIGN.md Navigation): one 64px row at every width. Below 720px the row is the
// mark, the Ink chip (signed in) or `phoneAction` (signed out, "Start free"), then the menu: the
// theme toggle and `mobileMenuExtras` (language toggle, nav links, Sign in) fold into TopBarMenu.
// The header clears the top and side safe-area insets (`viewport-fit=cover`, app/layout.tsx).
// `sticky` pins it and keeps `--nl-bar-h` on <html> at its live height (ResizeObserver), which
// app/globals.css turns into scroll-padding-top so focus and anchor jumps land below the bar.
// The nav landmark renders only where its links show (`navFrom`), so there is never an empty
// <nav>; `hidden` is display:none, out of the accessibility tree.

import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';

import { ThemeToggle } from './ThemeToggle';
import { TopBarMenu } from './TopBarMenu';

import { TOP_BAR_COPY } from '@/components/marketing/nl-copy';
import { cn } from '@/lib/cn';

export type TopBarVariant = 'signed-out' | 'signed-in';

/** The CSS custom property on <html> that carries the sticky bar's live height. */
export const NL_BAR_HEIGHT_VAR = '--nl-bar-h';

/** Where the nav landmark (and its links) starts to show. Full class strings for Tailwind. */
const NAV_FROM = {
  720: 'hidden min-[720px]:flex min-[720px]:items-center min-[720px]:gap-nl-1',
  1120: 'hidden min-[1120px]:flex min-[1120px]:items-center min-[1120px]:gap-nl-1',
} as const;

export type TopBarNavFrom = keyof typeof NAV_FROM;

export interface TopBarProps {
  variant: TopBarVariant;
  /** Where the mark links. */
  homeHref?: string;
  /** Mark text and its accessible name. */
  brand?: string;
  /** Nav links. Each link should be visible from `navFrom`; below it the landmark is not rendered. */
  nav?: React.ReactNode;
  /** Accessible name of the nav landmark; pass it with `nav` so the landmark is named. */
  navLabel?: string;
  /** Width (px) from which the nav landmark shows. Default 720. */
  navFrom?: TopBarNavFrom;
  /** Ink chip (signed in); stays visible at every width. */
  inkChip?: React.ReactNode;
  /** Signed-out actions (e.g. sign in and the primary call to action); from 720px. */
  actions?: React.ReactNode;
  /** Signed-out call to action in the phone row (below 720px), e.g. "Start free". */
  phoneAction?: React.ReactNode;
  /** Avatar menu (signed in); always visible. */
  menu?: React.ReactNode;
  /** Theme toggle (desktop row, and inside the phone menu below 720px); `false` hides it. */
  showThemeToggle?: boolean;
  /** Extra content of the phone menu (below 720px), e.g. nav links or signed-out actions. */
  mobileMenuExtras?: React.ReactNode;
  /** Accessible name of the phone menu button. Defaults to the signed "Menu". */
  mobileMenuLabel?: string;
  /** Pin the bar (`position: sticky`) and publish its live height as `--nl-bar-h`. */
  sticky?: boolean;
  className?: string;
}

export function LawieMark({ brand = 'Lawie', href = '/' }: { brand?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="nl nl-focus gap-nl-2 rounded-nl-sm text-nl-text inline-flex min-h-[44px] shrink-0 items-center no-underline"
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

/**
 * Publishes the element's border-box height on <html> as `--nl-bar-h` while `enabled`, and
 * removes it on unmount. Before hydration (and with no ResizeObserver) the CSS fallback applies.
 */
function useLiveBarHeight(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(
        NL_BAR_HEIGHT_VAR,
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(NL_BAR_HEIGHT_VAR);
    };
  }, [ref, enabled]);
}

export function TopBar({
  variant,
  homeHref = '/',
  brand = 'Lawie',
  nav,
  navLabel,
  navFrom = 720,
  inkChip,
  actions,
  phoneAction,
  menu,
  showThemeToggle = true,
  mobileMenuExtras,
  mobileMenuLabel = TOP_BAR_COPY.en.menu,
  sticky = false,
  className,
}: TopBarProps) {
  const headerRef = useRef<HTMLElement>(null);
  useLiveBarHeight(headerRef, sticky);
  const hasPhoneMenu = showThemeToggle || Boolean(mobileMenuExtras);
  return (
    <header
      ref={headerRef}
      data-variant={variant}
      data-sticky={sticky || undefined}
      className={cn(
        'nl border-nl-line bg-nl-wall text-nl-text flex w-full flex-col border-b',
        // Safe areas (viewport-fit=cover): the Wall paints under the notch, the content clears it.
        'pt-[env(safe-area-inset-top,0px)]',
        'pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]',
        'min-[900px]:pl-[max(32px,env(safe-area-inset-left,0px))] min-[900px]:pr-[max(32px,env(safe-area-inset-right,0px))]',
        sticky && 'sticky top-0 z-30',
        className,
      )}
    >
      <div className="gap-nl-3 min-[720px]:gap-nl-4 flex min-h-[64px] w-full items-center">
        <LawieMark brand={brand} href={homeHref} />
        {nav ? (
          <nav aria-label={navLabel} className={NAV_FROM[navFrom]}>
            {nav}
          </nav>
        ) : null}
        <div className="gap-nl-3 ml-auto flex min-w-0 items-center">
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
          {variant === 'signed-out' && phoneAction ? (
            <div className="flex items-center min-[720px]:hidden">{phoneAction}</div>
          ) : null}
          {hasPhoneMenu ? (
            <TopBarMenu label={mobileMenuLabel}>
              {showThemeToggle ? <ThemeToggle /> : null}
              {mobileMenuExtras}
            </TopBarMenu>
          ) : null}
          {menu ? <div className="flex items-center">{menu}</div> : null}
        </div>
      </div>
    </header>
  );
}
