'use client';

// T-517: the Night Library top bar for the landing, pricing and auth pages (spec 3 "Top bar",
// signed out; copy §1.2). Built on TopBar from components/shell. The old SiteNav stays on the
// other marketing pages. The theme toggle is passed in (not TopBar's own) so it can carry the
// Hindi labels (§6.4). Not sticky: the hero's primary button must be the only primary in view.

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

const NAV_LINK =
  'nl-focus nl-body-sm rounded-nl-sm px-nl-3 text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text inline-flex min-h-[44px] items-center font-medium no-underline touch-manipulation';

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
    <TopBar
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
  );
}
