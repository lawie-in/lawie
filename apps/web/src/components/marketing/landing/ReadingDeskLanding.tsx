'use client';

// T-601: the landing page, direction B "The Reading Desk" (handoff/design/T-584-landing-reading-
// desk-spec.md; copy v2 + Ajay's rulings in landing-copy.ts; signed T-511 strings from nl-copy).
// Section order: top bar, hero with the folio, how it works, coverage drawers, sample drafts, demo
// video, Ink and prices, trust, FAQ, final call to action, footer. Anchors: how-it-works,
// documents, prices, faq.
// - Rajesh ruling 6: the top bar's call to action stays ghost for the whole scroll; the hero (and
//   the prices and final sections, each in its own view) carries the one primary.
// - Rajesh (spec b54420b8): the hero's two Muted lines are the free-plan line and the disclaimer.
// - Rajesh ruling 4: the samples and the video render only when their files exist (the server
//   checks, page.tsx); both props default to "absent".
// - Rajesh ruling 5: Free and Solo cards only; Pro is on /pricing.
// - Hindi toggle: client state, lang="hi" on the wrapper. Lines with no signed Hindi (FAQ, plan
//   includes, grievance line, template titles) stay English and carry lang="en".
// - Hindi headings are 20px or more (nl-h2 for card titles in Hindi).

import Link from 'next/link';
import { useState } from 'react';

import {
  TEMPORARY_CATALOGUE_FIXTURE,
  headlineCount,
  type LandingCatalogue,
} from './catalogue-source';
import { CoverageDrawers } from './CoverageDrawers';
import { DemoVideo } from './DemoVideo';
import { HeroFolio } from './HeroFolio';
import { LANDING_STYLE, SAMPLE_ENTRIES, type SampleEntry } from './landing-config';
import { LP, fill, tr } from './landing-copy';
import { SampleDesk } from './SampleDesk';

import { NightFaq } from '@/components/landing/NightFaq';
import { NightFooter } from '@/components/marketing/NightFooter';
import { NightPlanCard } from '@/components/marketing/NightPlanCard';
import { NightTopBar } from '@/components/marketing/NightTopBar';
import {
  SECTION_IDS,
  SIGNUP_HREF,
  footerCopy,
  landingCopy,
  type Lang,
} from '@/components/marketing/nl-copy';
import { NL_TEXT_LINK, nlLinkButton } from '@/components/marketing/nl-link';
import { cn } from '@/lib/cn';

const SECTION = LANDING_STYLE.section;
const RULED = 'border-t border-nl-line';
const INNER = 'mx-auto w-full max-w-[1180px]';
/** Typographic step numerals (T-528), not copy. */
const STEP_NUMERALS = ['i', 'ii', 'iii'] as const;

function PrimaryCta({ label, className }: { label: string; className?: string }) {
  return (
    <Link
      className={nlLinkButton('primary', cn('min-h-[52px] whitespace-normal', className))}
      href={SIGNUP_HREF}
    >
      {label}
    </Link>
  );
}

export interface ReadingDeskLandingProps {
  initialLang?: Lang;
  /** The T-600 catalogue. TEMPORARY default: the fixture in catalogue-source.ts. */
  catalogue?: LandingCatalogue;
  /** public/demo/demo.mp4, a valid demo.json, its poster and the English captions exist (server check). */
  videoAvailable?: boolean;
  /** public/demo/demo.hi.vtt exists. */
  hindiCaptionsAvailable?: boolean;
  /** The demo MP4 has an audio track (shows the sound button). Default false. */
  videoHasAudio?: boolean;
  /** Poster URL from the sidecar (public/demo/). */
  videoPosterHref?: string;
  /** Duration in seconds from the sidecar; null hides the chip. */
  videoDurationS?: number | null;
  /** Template ids whose sample PDF exists under public/samples/ (server check). */
  availableSampleIds?: readonly string[];
  /** The sample list to choose from (default SAMPLE_ENTRIES; tests may pass the bail entry). */
  sampleEntries?: readonly SampleEntry[];
}

export function ReadingDeskLanding({
  initialLang = 'en',
  catalogue = TEMPORARY_CATALOGUE_FIXTURE,
  videoAvailable = false,
  hindiCaptionsAvailable = false,
  videoHasAudio = false,
  videoPosterHref,
  videoDurationS = null,
  availableSampleIds = [],
  sampleEntries = SAMPLE_ENTRIES,
}: ReadingDeskLandingProps) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const copy = landingCopy(lang);
  const footer = footerCopy(lang);
  const hi = lang === 'hi';
  const h3 = hi ? 'nl-h2' : 'nl-h3';
  const enOnly = hi ? 'en' : undefined;
  const samples = sampleEntries.filter((s) => availableSampleIds.includes(s.templateId));
  const steps = [LP.step1, LP.step2, LP.step3];

  return (
    <div lang={lang} className="nl nl-root min-h-[100svh] overflow-x-clip" data-lang={lang}>
      <NightTopBar lang={lang} onLangChange={setLang} showNav ctaVariant="ghost" />

      <main>
        {/* HERO */}
        <section
          className={cn(SECTION, 'pt-nl-6 min-[900px]:pt-nl-16 relative isolate overflow-x-clip')}
          aria-labelledby="hero-heading"
        >
          <div
            className={cn(
              INNER,
              'gap-nl-8 grid grid-cols-1 min-[900px]:grid-cols-[5fr_7fr] min-[900px]:items-center min-[900px]:gap-[56px]',
            )}
          >
            <div className="min-w-0">
              <p className="nl-label text-nl-muted">{tr(LP.heroEyebrow, lang)}</p>
              <h1
                id="hero-heading"
                className={cn(LANDING_STYLE.h1, 'text-nl-text mt-nl-3 break-words')}
              >
                {tr(LP.heroTitle, lang)}
              </h1>
              <p className="nl-body text-nl-soft mt-nl-4 max-w-[60ch] min-[900px]:text-[18px] min-[900px]:leading-[28px]">
                {tr(LP.heroLead, lang)}
              </p>
              <div className="mt-nl-6">
                <PrimaryCta label={copy.cta} />
              </div>
              <div className="nl-body-sm text-nl-muted mt-nl-4 gap-nl-1 flex max-w-[60ch] flex-col">
                <p data-hero-free-line="">{copy.prices.cards.free.ink}</p>
                <p>{footer.disclaimer}</p>
              </div>
            </div>
            <HeroFolio lang={lang} />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section
          id={SECTION_IDS.how}
          className={cn(SECTION, RULED)}
          aria-labelledby="steps-heading"
        >
          <div className={INNER}>
            <h2 id="steps-heading" className={cn(LANDING_STYLE.h2, 'text-nl-text')}>
              {copy.steps.title}
            </h2>
            <ol className="mt-nl-8 gap-nl-8 grid list-none grid-cols-1 p-0 min-[720px]:grid-cols-3">
              {copy.steps.items.map((step, i) => (
                <li key={step.title} className="min-w-0">
                  <span aria-hidden="true" className="nl-h2 text-nl-brass-dark block">
                    {STEP_NUMERALS[i] ?? ''}
                  </span>
                  <h3 className={cn(h3, 'text-nl-text mt-nl-2')}>{step.title}</h3>
                  <p className="nl-body text-nl-soft mt-nl-2">{tr(steps[i], lang)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COVERAGE */}
        <CoverageDrawers
          id={SECTION_IDS.documents}
          catalogue={catalogue}
          headline={fill(tr(LP.coverageCount, lang), { count: headlineCount(catalogue.total) })}
          lang={lang}
        />

        {/* SAMPLE DRAFTS (absent until a PDF exists) */}
        <SampleDesk samples={samples} catalogue={catalogue} lang={lang} />

        {/* DEMO VIDEO (absent until the real video exists) */}
        <DemoVideo
          available={videoAvailable}
          hindiCaptions={hindiCaptionsAvailable}
          hasAudio={videoHasAudio}
          posterHref={videoPosterHref}
          durationS={videoDurationS}
          lang={lang}
        />

        {/* INK AND PRICES (Free and Solo only; Pro is on /pricing) */}
        <section
          id={SECTION_IDS.prices}
          className={cn(SECTION, RULED)}
          aria-labelledby="prices-heading"
        >
          <div className={INNER}>
            <h2 id="prices-heading" className={cn(LANDING_STYLE.h2, 'text-nl-text')}>
              {copy.prices.title}
            </h2>
            <p className="nl-body text-nl-soft mt-nl-3 max-w-[65ch]">{copy.prices.intro}</p>
            <div className="mt-nl-8 gap-nl-4 grid grid-cols-1 min-[640px]:grid-cols-2">
              {(['free', 'solo'] as const).map((k) => (
                <NightPlanCard
                  key={k}
                  testId={k}
                  name={copy.prices.cards[k].name}
                  price={copy.prices.cards[k].price}
                  ink={copy.prices.cards[k].ink}
                  includes={copy.prices.cards[k].includes}
                  button={copy.prices.cards[k].button}
                  href={SIGNUP_HREF}
                  largeHeading={hi}
                />
              ))}
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
        <section className={cn(SECTION, RULED)} aria-labelledby="trust-heading">
          <div className={INNER}>
            {/* The section's name for assistive tech; the first column shows the same signed
                title (M-LP-12a = T-511 §1.7), so the visible copy does not repeat it. */}
            <h2 id="trust-heading" className="sr-only">
              {copy.trust.title}
            </h2>
            <div className="gap-nl-8 grid grid-cols-1 min-[900px]:grid-cols-3">
              <div className="min-w-0">
                <h3 className={cn(h3, 'text-nl-text')}>{copy.trust.title}</h3>
                <p className="nl-body text-nl-soft mt-nl-2">{tr(LP.trust1Body, lang)}</p>
              </div>
              <div className="min-w-0">
                <h3 className={cn(h3, 'text-nl-text')}>{tr(LP.trust2Title, lang)}</h3>
                <p className="nl-body text-nl-soft mt-nl-2">{tr(LP.trust2Body, lang)}</p>
              </div>
              <div className="min-w-0">
                <h3 className={cn(h3, 'text-nl-text')}>{tr(LP.trust3Title, lang)}</h3>
                <p className="nl-body text-nl-soft mt-nl-2 break-words">
                  {tr(LP.trust3Body, lang)}{' '}
                  <Link
                    className="nl-focus text-nl-brass-dark underline underline-offset-4"
                    href="/privacy"
                  >
                    {copy.trust.privacy.link}
                  </Link>
                </p>
                <p lang={enOnly} className="nl-body text-nl-soft mt-nl-2 break-words">
                  {copy.trust.privacy.grievance.before}
                  <a
                    className="nl-focus text-nl-brass-dark underline underline-offset-4"
                    href={`mailto:${copy.trust.privacy.grievance.email}`}
                  >
                    {copy.trust.privacy.grievance.email}
                  </a>
                  {copy.trust.privacy.grievance.after}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ (English until the Hindi FAQ is signed, AJ-517-M10) */}
        <section id={SECTION_IDS.faq} className={cn(SECTION, RULED)} aria-labelledby="faq-heading">
          <div className={INNER}>
            <h2 id="faq-heading" lang={enOnly} className={cn(LANDING_STYLE.h2, 'text-nl-text')}>
              {copy.faq.title}
            </h2>
            <div className="mt-nl-6">
              <NightFaq items={copy.faq.items} lang={enOnly} />
            </div>
          </div>
        </section>

        {/* FINAL CALL TO ACTION */}
        <section className={cn(SECTION, RULED)} aria-labelledby="final-heading">
          <div className={cn(INNER, 'text-center')}>
            <h2 id="final-heading" className={cn(LANDING_STYLE.h2, 'text-nl-text')}>
              {tr(LP.finalTitle, lang)}
            </h2>
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
