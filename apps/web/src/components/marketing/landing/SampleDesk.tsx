'use client';

// T-601: sample drafts on the lamp-lit desk (spec §4). Static PDFs under public/samples/, fictional
// parties, SAMPLE watermark; no live call. Rajesh ruling 4: a folio shows only when its PDF exists
// (page.tsx checks on the server and passes `samples`), and the section is absent when none do.
// Ajay checks each PDF before it is served (M-LP-08b condition). Rajesh ruling 7: the folios are
// flat on the wood (1px Line, no shadow), 4px radius.
// - From 720: a grid, with the desk tilt (-1.2deg, 0 with a 10px lift, +1deg). Below 720: a
//   horizontal snap row of 240px folios, scrollbar hidden, no tilt; each folio is a link, so the
//   row scrolls by keyboard as the links take focus.
// - Hover (fine pointer, motion allowed): 2px lift, 150ms.

import type { LandingCatalogue } from './catalogue-source';
import { LANDING_STYLE, type SampleEntry } from './landing-config';
import { LP, SAMPLE_SUMMARIES, categoryName, fill, tr } from './landing-copy';

import { landingCopy, type Lang } from '@/components/marketing/nl-copy';
import { cn } from '@/lib/cn';

const TILT = [
  'min-[720px]:-rotate-[1.2deg]',
  'min-[720px]:-translate-y-[10px] motion-safe:[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-[12px]',
  'min-[720px]:rotate-[1deg]',
];

export interface SampleDeskProps {
  /** The samples whose PDF exists, in desk order. Empty: nothing renders. */
  samples: readonly SampleEntry[];
  catalogue: LandingCatalogue;
  lang: Lang;
}

function templateTitle(catalogue: LandingCatalogue, entry: SampleEntry): string {
  for (const c of catalogue.categories) {
    const t = c.templates.find((x) => x.id === entry.templateId);
    if (t) return t.name;
  }
  return entry.fallbackTitle;
}

function categoryLabel(catalogue: LandingCatalogue, entry: SampleEntry, lang: Lang) {
  const c = catalogue.categories.find((x) => x.id === entry.categoryId);
  return categoryName(entry.categoryId, c?.name ?? '', lang);
}

export function SampleDesk({ samples, catalogue, lang }: SampleDeskProps) {
  // Copy v2 fixes (a): the section needs at least two folios (08a and 08b are plural); 0 or 1
  // renders nothing.
  if (samples.length < 2) return null;
  const hi = lang === 'hi';
  const languages = landingCopy(lang).language;

  return (
    <section
      aria-labelledby="samples-heading"
      data-section="samples"
      className={cn('border-nl-line border-t', LANDING_STYLE.section)}
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <p className="nl-label text-nl-muted">{tr(LP.samplesEyebrow, lang)}</p>
        <h2 id="samples-heading" className={cn(LANDING_STYLE.h2, 'text-nl-text mt-nl-2')}>
          {tr(LP.samplesTitle, lang)}
        </h2>
        <p className="nl-body text-nl-soft mt-nl-3 max-w-[65ch]">{tr(LP.samplesLead, lang)}</p>

        <div
          className={cn(
            'border-nl-line bg-nl-wood mt-nl-8 px-nl-4 py-nl-5 min-[720px]:p-nl-12 relative overflow-hidden border',
            LANDING_STYLE.radius,
          )}
        >
          <div
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-0', LANDING_STYLE.deskLamp)}
          />
          <ul
            className={cn(
              'py-nl-3 relative m-0 flex list-none gap-[14px] overflow-x-auto overscroll-x-contain p-0',
              'snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              'min-[720px]:grid min-[720px]:gap-[28px] min-[720px]:overflow-visible min-[720px]:py-0',
              // Rajesh (26 Oct): two folios centred in a 2-column grid; the third column later.
              samples.length >= 3
                ? 'min-[720px]:grid-cols-3'
                : 'min-[720px]:mx-auto min-[720px]:max-w-[760px] min-[720px]:grid-cols-2',
            )}
          >
            {samples.map((s, i) => {
              const cat = categoryLabel(catalogue, s, lang);
              const summary = SAMPLE_SUMMARIES[s.summary];
              return (
                <li key={s.templateId} className="w-[240px] shrink-0 snap-start min-[720px]:w-auto">
                  <a
                    href={s.href}
                    data-sample={s.templateId}
                    className={cn(
                      'nl-focus border-nl-line text-nl-text relative flex h-full min-h-[340px] flex-col overflow-hidden border p-[26px] no-underline',
                      LANDING_STYLE.paper,
                      LANDING_STYLE.radius,
                      'transition-transform duration-150 ease-out motion-reduce:transition-none',
                      TILT[i % TILT.length],
                      i % TILT.length !== 1 &&
                        'motion-safe:[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-[2px]',
                    )}
                  >
                    <span
                      lang={cat.isHindi || !hi ? undefined : 'en'}
                      className="nl-label text-nl-muted"
                    >
                      {cat.text}
                    </span>
                    <span lang={hi ? 'en' : undefined} className="nl-h3 text-nl-text mt-nl-2 block">
                      {templateTitle(catalogue, s)}
                    </span>
                    <span className="nl-body-sm text-nl-soft mt-nl-3 block">
                      {tr(summary, lang)}
                    </span>
                    {s.pages !== null ? (
                      <span className="nl-body-sm text-nl-muted pt-nl-4 mt-auto block tabular-nums">
                        {fill(tr(LP.sampleMeta, lang), {
                          pages: s.pages,
                          language: languages[s.language],
                          format: 'PDF',
                        })}
                      </span>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'font-nl-display px-nl-2 pointer-events-none absolute left-1/2 top-1/2 select-none whitespace-nowrap border-2',
                        'text-[32px] leading-[1.1] tracking-[.3em]',
                        '-translate-x-1/2 -translate-y-1/2 -rotate-[24deg]',
                        LANDING_STYLE.watermark,
                      )}
                    >
                      {tr(LP.watermark, lang)}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
