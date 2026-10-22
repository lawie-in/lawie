'use client';

// T-517: the Night Library top bar for the landing, pricing and auth pages (spec 3 "Top bar",
// signed out; copy §1.2). Built on TopBar from components/shell. The old SiteNav stays on the
// other marketing pages. The theme toggle is passed in (not TopBar's own) so it can carry the
// Hindi labels (§6.4).
// T-528 review (WCAG 2.2 2.4.11, focus not obscured): while the bar is mounted, a scoped <style>
// sets scroll-padding-top on <html>, so keyboard focus and anchor jumps both land below it.
// T-531 (Rajesh, DESIGN.md Navigation): one 64px row at every width, so it is sticky at every
// width (shell TopBar `sticky`, which also clears the safe-area insets). Below 720px the row is
// the mark, "Start free" and the menu; the nav links, the language and theme toggles and Sign in
// fold into the menu. Round 2 (Rajesh): from 720 to 1119 the row is the mark, Sign in, the full
// call to action and the menu, which holds the nav and the two toggles (not Sign in or the call
// to action). From 1120 the nav and the toggles are in the row and there is no menu. The landing passes ctaVariant="ghost", so the hero's primary stays the only
// one in view. shell TopBar measures the bar live into `--nl-bar-h`; the <style> carries the
// pre-hydration fallback.

import Link from 'next/link';

import {
  landingCopy,
  SIGNIN_HREF,
  SIGNUP_HREF,
  themeCopy,
  TOP_BAR_COPY,
  type Lang,
} from './nl-copy';
import { NL_TEXT_LINK, nlLinkButton } from './nl-link';

import { ThemeToggle, TopBar } from '@/components/shell';
import { cn } from '@/lib/cn';

export interface NightTopBarProps {
  lang?: Lang;
  /** Shows the English / हिन्दी toggle (landing only, Priya). */
  onLangChange?: (lang: Lang) => void;
  /** Nav links (How it works, Documents, Prices, FAQ). Anchors on the landing, `/#…` elsewhere. */
  showNav?: boolean;
  /** Base for the nav anchors: '' on the landing, '/' elsewhere. */
  anchorBase?: string;
  /** Sign in + the call to action. Off on the auth pages (the form is the action). */
  showActions?: boolean;
  /** The top bar's call to action variant. Ghost when a primary sits in the same view (hero). */
  ctaVariant?: 'primary' | 'ghost';
}

/**
 * The sticky bar's height in px (the 64px row plus its 1px rule) at every width since T-531, the
 * fallback for `--nl-bar-h` until shell TopBar has measured the live height (first paint, before
 * hydration). T-531 renamed `wrapped` (the old 720-1119 margin) to `fallback`; the bar no longer
 * has a second row or a wrapped height.
 */
export const NL_STICKY_BAR_HEIGHT = { fallback: 65 } as const;

/**
 * Scoped to the pages that mount the bar: the <style> leaves the DOM with it. No media gate: the
 * bar is sticky at every width. The live `--nl-bar-h` already includes the top safe-area inset
 * (the header pads it); the fallback adds it.
 */
export const NL_STICKY_BAR_CSS = `html{scroll-padding-top:var(--nl-bar-h,calc(${NL_STICKY_BAR_HEIGHT.fallback}px + env(safe-area-inset-top,0px)))}`;

// T-528 (Priya, Rajesh): the nav links show from 1120px only. Below that shell TopBar's single row
// could not hold the links, the toggles, Sign in and the call to action, and clipped the last
// two (720-1023), or broke the nav labels onto two lines (1024-1119). T-531: shell TopBar renders
// the whole <nav> from 1120 (`navFrom`), so from 720 to 1119 there is no empty landmark; below
// 720 the same links are in the menu.
const NAV_LINK =
  'nl-focus nl-body-sm rounded-nl-sm px-nl-3 text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text inline-flex min-h-[44px] items-center font-medium no-underline touch-manipulation';

/** A link row inside the phone menu: full width, 44px. */
const MENU_LINK =
  'nl-focus nl-body rounded-nl-sm px-nl-3 text-nl-text [@media(hover:hover)_and_(pointer:fine)]:hover:bg-nl-brass-light flex min-h-[44px] w-full items-center no-underline touch-manipulation';

export function LanguageToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const copy = landingCopy(lang).language;
  return (
    <div className="rounded-nl-md border-nl-line bg-nl-card inline-flex border p-px">
      {(['en', 'hi'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={cn(
            'nl-focus nl-body-sm rounded-nl-sm px-nl-3 text-nl-soft inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center font-medium',
            lang === l && 'bg-nl-brass-light text-nl-brass-dark',
          )}
        >
          {copy[l]}
        </button>
      ))}
    </div>
  );
}

export function NightTopBar({
  lang = 'en',
  onLangChange,
  showNav = false,
  anchorBase = '',
  showActions = true,
  ctaVariant = 'primary',
}: NightTopBarProps) {
  const copy = landingCopy(lang);
  const top = TOP_BAR_COPY[lang];
  const theme = themeCopy(lang);
  const lang_ = onLangChange ? <LanguageToggle lang={lang} onChange={onLangChange} /> : null;

  const links = [
    { href: `${anchorBase}#how-it-works`, label: copy.nav.how },
    { href: `${anchorBase}#documents`, label: copy.nav.documents },
    { href: anchorBase ? '/pricing' : '#prices', label: copy.nav.prices },
    { href: `${anchorBase}#faq`, label: copy.nav.faq },
  ];
  const navLinks = showNav
    ? links.map((l) => (
        <Link key={l.href} className={NAV_LINK} href={l.href}>
          {l.label}
        </Link>
      ))
    : null;

  const signIn = (
    <Link className={cn(NL_TEXT_LINK, 'px-nl-2 font-medium')} href={SIGNIN_HREF}>
      {copy.nav.signIn}
    </Link>
  );

  return (
    // `contents`: the wrapper draws no box, so the header's sticky containing block is still the
    // page. It carries the marker (shell TopBar does not forward data attributes) and the style.
    <div data-nl-sticky-bar="" className="contents">
      <style>{NL_STICKY_BAR_CSS}</style>
      <TopBar
        sticky
        variant="signed-out"
        brand="Lawie"
        nav={navLinks}
        navLabel={top.navLabel}
        navFrom={1120}
        menuBelow={1120}
        showThemeToggle={false}
        actions={
          <>
            {/* From 1120 only; from 720 to 1119 the toggles are in the menu (Rajesh round 2). */}
            <div className="gap-nl-3 hidden items-center min-[1120px]:flex">
              {lang_}
              <ThemeToggle hideLegend legend={theme.legend} labels={theme.labels} />
            </div>
            {showActions ? (
              <>
                {signIn}
                <Link className={nlLinkButton(ctaVariant)} href={SIGNUP_HREF}>
                  {copy.cta}
                </Link>
              </>
            ) : null}
          </>
        }
        phoneAction={
          showActions ? (
            <Link className={nlLinkButton(ctaVariant)} href={SIGNUP_HREF}>
              {top.cta}
            </Link>
          ) : null
        }
        mobileMenuLabel={top.menu}
        mobileMenuExtras={
          <>
            {showNav ? (
              <nav
                aria-label={top.navLabel}
                className="border-nl-line pb-nl-2 flex flex-col border-b"
              >
                {links.map((l) => (
                  <Link key={l.href} className={MENU_LINK} href={l.href}>
                    {l.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            {/* A block wrapper, so the toggle keeps its own width in the menu's flex column. */}
            {lang_ ? <div>{lang_}</div> : null}
            <ThemeToggle legend={theme.legend} labels={theme.labels} />
            {/* Below 720 only: from 720 Sign in is in the row, so the menu does not repeat it. */}
            {showActions ? <div className="min-[720px]:hidden">{signIn}</div> : null}
          </>
        }
      />
    </div>
  );
}
