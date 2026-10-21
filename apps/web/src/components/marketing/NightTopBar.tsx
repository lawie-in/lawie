'use client';

// T-517: the Night Library top bar for the landing, pricing and auth pages (spec 3 "Top bar",
// signed out; copy §1.2). Built on TopBar from components/shell. The old SiteNav stays on the
// other marketing pages. The theme toggle is passed in (not TopBar's own) so it can carry the
// Hindi labels (§6.4).
// T-528 (Rajesh, DESIGN.md Navigation): sticky from 720px, on its own Wall ground, clear of the
// top safe-area inset. Below 720px shell TopBar adds its mobile row (language, theme, Sign in),
// which makes the bar 177-181px tall at 390/360; pinned, that is a fifth of a phone screen, so
// the bar scrolls away there. The landing passes ctaVariant="ghost", so the hero's primary stays
// the only one in view.
// T-528 review (WCAG 2.2 2.4.11, focus not obscured): while the bar is mounted, a scoped <style>
// sets scroll-padding-top on <html> to the bar height from 720px, so keyboard focus and anchor
// jumps both land below it.

import Link from 'next/link';

import { landingCopy, SIGNIN_HREF, SIGNUP_HREF, themeCopy, type Lang } from './nl-copy';
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

/** Sticky wrapper classes, passed to shell TopBar (which already paints Wall and the Line rule). */
const STICKY =
  'min-[720px]:sticky min-[720px]:top-0 min-[720px]:z-30 pt-[env(safe-area-inset-top,0px)]';

/**
 * The sticky bar's height in px (row plus its 1px rule), measured 21 Oct 2026 in Chromium on the
 * landing (EN and HI), pricing and login. With the nav links from 1120px only (Rajesh), the bar is
 * 65px at every width from 720 up. On the English landing at 720-739, Sign in (already 8px side
 * padding) and the call to action break onto two lines inside the 64px row without growing it.
 * `wrapped` (720-1119) keeps a 7px margin for a row that grows (shell's row is min-h-[64px]).
 * The one source for the scroll padding below.
 */
export const NL_STICKY_BAR_HEIGHT = { wrapped: 72, row: 65 } as const;

/** Scoped to the pages that mount the bar: the <style> leaves the DOM with it. */
export const NL_STICKY_BAR_CSS =
  `@media (min-width:720px){html{scroll-padding-top:calc(${NL_STICKY_BAR_HEIGHT.wrapped}px + env(safe-area-inset-top,0px))}}` +
  `@media (min-width:1120px){html{scroll-padding-top:calc(${NL_STICKY_BAR_HEIGHT.row}px + env(safe-area-inset-top,0px))}}`;

// T-528 (Priya, Rajesh): the nav links show from 1120px only. Below that shell TopBar's single row
// could not hold the links, the toggles, Sign in and the call to action, and clipped the last
// two (720-1023), or broke the nav labels onto two lines (1024-1119). `hidden` is display:none,
// so below 1120 the links are out of the tab order and the
// accessibility tree (CSS only, no width check, so no hydration mismatch). Below 720 shell
// TopBar hides the whole nav anyway.
const NAV_LINK =
  'nl-focus nl-body-sm rounded-nl-sm px-nl-3 text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text hidden min-[1120px]:inline-flex min-h-[44px] items-center font-medium no-underline touch-manipulation';

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
  const theme = themeCopy(lang);
  const toggle = <ThemeToggle hideLegend legend={theme.legend} labels={theme.labels} />;
  const lang_ = onLangChange ? <LanguageToggle lang={lang} onChange={onLangChange} /> : null;

  const navLinks = showNav ? (
    <>
      <Link className={NAV_LINK} href={`${anchorBase}#how-it-works`}>
        {copy.nav.how}
      </Link>
      <Link className={NAV_LINK} href={`${anchorBase}#documents`}>
        {copy.nav.documents}
      </Link>
      <Link className={NAV_LINK} href={anchorBase ? '/pricing' : '#prices'}>
        {copy.nav.prices}
      </Link>
      <Link className={NAV_LINK} href={`${anchorBase}#faq`}>
        {copy.nav.faq}
      </Link>
    </>
  ) : null;

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
        className={STICKY}
        variant="signed-out"
        brand="Lawie"
        nav={navLinks}
        showThemeToggle={false}
        actions={
          <>
            {lang_}
            {toggle}
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
        mobileMenuLabel={copy.nav.mobileMenu}
        mobileMenuExtras={
          <>
            {lang_}
            {toggle}
            {showActions ? signIn : null}
          </>
        }
      />
    </div>
  );
}
