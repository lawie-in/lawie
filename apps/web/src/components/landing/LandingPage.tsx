'use client';

// T-517: the Night Library landing page (spec 01 Landing; copy §1.2 to §1.10, strings in
// components/marketing/nl-copy.ts). Sections in spec order: top bar, hero + demo, three steps,
// document spines, Ink and prices, trust, FAQ, final call to action, footer.
// - One primary per screen area: hero, after the steps, after the prices, final call. The top
//   bar's copy of the button is ghost here because it shares the first view with the hero's.
// - Hindi toggle (landing only, Priya): client state, lang="hi" on the page wrapper, every string
//   swaps to its signed HI. The FAQ and lines with no signed HI stay English (lang="en").
// - Hindi headings use nl-h2 or larger (20px and up, AC5).
// - Motion: Lamp and DustMotes from components/ui (fine pointer, >= 900px, not reduced, paused
//   on a hidden tab); the demo has its own gates (DemoFolio).

import Link from 'next/link';
import { useState } from 'react';

import { DemoFolio } from './DemoFolio';
import { NightFaq } from './NightFaq';

import { NightFooter } from '@/components/marketing/NightFooter';
import { NightPlanCard } from '@/components/marketing/NightPlanCard';
import { NightTopBar } from '@/components/marketing/NightTopBar';
import { landingCopy, SECTION_IDS, SIGNUP_HREF, type Lang } from '@/components/marketing/nl-copy';
import { NL_TEXT_LINK, nlLinkButton } from '@/components/marketing/nl-link';
import { DustMotes, Lamp } from '@/components/ui';
import { cn } from '@/lib/cn';

const SECTION = 'px-nl-4 py-nl-12 min-[900px]:px-nl-8 min-[900px]:py-nl-16';
const INNER = 'mx-auto w-full max-w-[1180px]';

function PrimaryCta({ label, className }: { label: string; className?: string }) {
  return (
    <Link
      className={nlLinkButton('primary', cn('whitespace-normal', className))}
      href={SIGNUP_HREF}
    >
      {label}
    </Link>
  );
}

export function LandingPage({ initialLang = 'en' }: { initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const copy = landingCopy(lang);
  const hi = lang === 'hi';
  // Card and paragraph titles: h3 (18px Mukta) in English, nl-h2 (24px Tiro) in Hindi (AC5).
  const h3 = hi ? 'nl-h2' : 'nl-h3';
  // Strings with no signed Hindi stay English; mark them so screen readers read them as English.
  const enOnly = hi ? 'en' : undefined;

  return (
    <div lang={lang} className="nl nl-root min-h-[100svh] overflow-x-clip" data-lang={lang}>
      <NightTopBar lang={lang} onLangChange={setLang} showNav ctaVariant="ghost" />

      <main>
        {/* HERO + DEMO */}
        <section
          className={cn(SECTION, 'pt-nl-6 min-[900px]:pt-nl-16 relative isolate')}
          aria-labelledby="hero-heading"
        >
          <Lamp className="-z-10" />
          <DustMotes className="-z-10" />
          <div
            className={cn(
              INNER,
              'gap-nl-8 grid grid-cols-1 min-[900px]:grid-cols-[1.35fr_1fr] min-[900px]:items-start',
            )}
          >
            <h1
              id="hero-heading"
              className="nl-display text-nl-text break-words min-[900px]:col-start-1 min-[900px]:row-start-1"
            >
              {copy.hero.headline}
            </h1>
            <div className="min-w-0 min-[900px]:col-start-2 min-[900px]:row-span-2 min-[900px]:row-start-1">
              <DemoFolio lang={lang} />
            </div>
            <div className="gap-nl-4 flex min-w-0 flex-col min-[900px]:col-start-1 min-[900px]:row-start-2">
              <p className="nl-body text-nl-soft max-w-[60ch]">{copy.hero.sub}</p>
              <div className="gap-nl-4 flex flex-wrap items-center">
                <PrimaryCta label={copy.cta} />
                <Link className={NL_TEXT_LINK} href={`#${SECTION_IDS.how}`}>
                  {copy.hero.secondary}
                </Link>
              </div>
              <div className="nl-body-sm text-nl-soft">
                <p>{copy.hero.noCard}</p>
                <p>{copy.hero.verify}</p>
              </div>
            </div>
          </div>
        </section>

        {/* THREE STEPS */}
        <section
          id={SECTION_IDS.how}
          className={cn(SECTION, 'bg-nl-wood')}
          aria-labelledby="steps-heading"
        >
          <div className={INNER}>
            <h2 id="steps-heading" className="nl-h1 text-nl-text">
              {copy.steps.title}
            </h2>
            <ol className="mt-nl-8 gap-nl-4 grid list-none grid-cols-1 p-0 min-[640px]:grid-cols-3">
              {/* Order is carried by the <ol>; no decorative 01 / 02 / 03 (craft floor). */}
              {copy.steps.items.map((step) => (
                <li key={step.title} className="border-nl-line bg-nl-card p-nl-6 border">
                  <h3 className={cn(h3, 'text-nl-text')}>{step.title}</h3>
                  <p className="nl-body text-nl-soft mt-nl-2">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-nl-8">
              <PrimaryCta label={copy.cta} />
            </div>
          </div>
        </section>

        {/* DOCUMENT SPINES */}
        <section id={SECTION_IDS.documents} className={SECTION} aria-labelledby="docs-heading">
          <div className={INNER}>
            <h2 id="docs-heading" className="nl-h1 text-nl-text">
              {copy.documents.title}
            </h2>
            <p className="nl-body text-nl-soft mt-nl-3 max-w-[65ch]">{copy.documents.line}</p>
            {/* The shelf scrolls sideways inside itself at 360; the page does not. */}
            <ul
              tabIndex={0}
              aria-label={copy.documents.title}
              className="nl-focus mt-nl-8 border-nl-line bg-nl-wood px-nl-3 pt-nl-8 flex list-none items-end gap-[6px] overflow-x-auto border-b-[10px] pb-0"
            >
              {copy.documents.spines.map((label, i) => (
                <li
                  key={label}
                  title={label}
                  className={cn(
                    'bg-nl-ox relative flex w-[52px] shrink-0 items-center justify-center text-white',
                    'transition-transform duration-[250ms] ease-[ease] motion-reduce:transition-none',
                    'motion-safe:[@media(hover:hover)_and_(pointer:fine)_and_(min-width:641px)]:hover:-translate-y-[14px]',
                    'motion-safe:[@media(pointer:fine)_and_(min-width:641px)]:focus-within:-translate-y-[14px]',
                  )}
                  style={{ height: [196, 210, 184, 202, 190][i % 5] }}
                >
                  <span aria-hidden="true" className="bg-nl-brass absolute inset-x-0 top-3 h-1" />
                  <span aria-hidden="true" className="bg-nl-brass absolute inset-x-0 top-5 h-1" />
                  <span className="font-nl-display py-nl-8 whitespace-nowrap text-[15px] leading-5 [writing-mode:vertical-rl]">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* INK AND PRICES (Free and Solo only; Pro is on /pricing, Priya decision 2) */}
        <section
          id={SECTION_IDS.prices}
          className={cn(SECTION, 'bg-nl-wood')}
          aria-labelledby="prices-heading"
        >
          <div className={INNER}>
            <h2 id="prices-heading" className="nl-h1 text-nl-text">
              {copy.prices.title}
            </h2>
            <p className="nl-body text-nl-soft mt-nl-3 max-w-[65ch]">{copy.prices.intro}</p>
            <div className="mt-nl-8 gap-nl-4 grid grid-cols-1 min-[640px]:grid-cols-2">
              <NightPlanCard
                testId="free"
                name={copy.prices.cards.free.name}
                price={copy.prices.cards.free.price}
                ink={copy.prices.cards.free.ink}
                includes={copy.prices.cards.free.includes}
                button={copy.prices.cards.free.button}
                href={SIGNUP_HREF}
                largeHeading={hi}
              />
              <NightPlanCard
                testId="solo"
                name={copy.prices.cards.solo.name}
                price={copy.prices.cards.solo.price}
                ink={copy.prices.cards.solo.ink}
                includes={copy.prices.cards.solo.includes}
                button={copy.prices.cards.solo.button}
                href={SIGNUP_HREF}
                largeHeading={hi}
              />
            </div>
            <p className="mt-nl-4">
              <Link className={NL_TEXT_LINK} href="/pricing">
                {copy.prices.seeAll}
              </Link>
            </p>
            <div className="nl-body-sm text-nl-soft mt-nl-2 max-w-[65ch]">
              <p>{copy.prices.note}</p>
              <p className="mt-nl-1">{copy.prices.topUp}</p>
            </div>
            <div className="mt-nl-8">
              <PrimaryCta label={copy.cta} />
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className={SECTION} aria-labelledby="trust-heading">
          <div className={INNER}>
            <h2 id="trust-heading" className="nl-h1 text-nl-text">
              {copy.trust.title}
            </h2>
            <div className="mt-nl-8 gap-nl-6 grid grid-cols-1 min-[900px]:grid-cols-3">
              {copy.trust.items.map((item) => (
                <div key={item.heading}>
                  <h3 className={cn(h3, 'text-nl-text')}>{item.heading}</h3>
                  <p className="nl-body text-nl-soft mt-nl-2">{item.body}</p>
                </div>
              ))}
              <div>
                <h3 className={cn(h3, 'text-nl-text')}>{copy.trust.privacy.heading}</h3>
                <p className="nl-body text-nl-soft mt-nl-2 break-words">
                  {copy.trust.privacy.before}
                  <Link
                    className="nl-focus text-nl-brass-dark underline underline-offset-4"
                    href="/privacy"
                  >
                    {copy.trust.privacy.link}
                  </Link>
                  {copy.trust.privacy.after}{' '}
                  {/* AJ-517-M13 / M11: English only, no signed Hindi. */}
                  <span lang={enOnly}>
                    {copy.trust.privacy.grievance.before}
                    <a
                      className="nl-focus text-nl-brass-dark underline underline-offset-4"
                      href={`mailto:${copy.trust.privacy.grievance.email}`}
                    >
                      {copy.trust.privacy.grievance.email}
                    </a>
                    {copy.trust.privacy.grievance.after}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          id={SECTION_IDS.faq}
          className={cn(SECTION, 'bg-nl-wood')}
          aria-labelledby="faq-heading"
        >
          <div className={INNER}>
            <h2 id="faq-heading" lang={enOnly} className="nl-h1 text-nl-text">
              {copy.faq.title}
            </h2>
            <div className="mt-nl-6">
              {/* TODO(T-517, AJ-511-M18): Hindi FAQ pending Ajay sign-off. The English FAQ shows
                  in Hindi mode until then (AJ-517-M10). */}
              <NightFaq items={copy.faq.items} lang={enOnly} />
            </div>
          </div>
        </section>

        {/* FINAL CALL TO ACTION */}
        <section className={SECTION} aria-labelledby="final-heading">
          <div className={cn(INNER, 'text-center')}>
            <h2 id="final-heading" className="nl-h1 text-nl-text">
              {copy.final.heading}
            </h2>
            <p className="nl-body text-nl-soft mt-nl-3">{copy.final.body}</p>
            <div className="mt-nl-6">
              <PrimaryCta label={copy.cta} />
            </div>
          </div>
        </section>
      </main>

      <NightFooter lang={lang} />
    </div>
  );
}
