'use client';

// T-601: coverage as a card catalogue (spec §3). Rendered from the catalogue JSON (T-600 shape),
// never typed: a category shows only with at least one template (Ajay, M-LP-14), in catalogue
// order. Copy: landing-copy.ts (M-LP-05e, 05, 15-06 headline, 06, 15-07/07b, 15-08, 07, 15-12..14).
// - Each drawer is a <button aria-expanded aria-controls>; one tab sequence, Enter/Space open.
// - One panel UNDER the grid (the grid never reflows), after the buttons in DOM order, so a
//   keyboard reader lands on the list next. The first drawer is open on load; only one is open;
//   pressing the open drawer keeps it open (there is always a list to read).
// - Switching: 200ms ease-out height and opacity; instant under reduced motion.
// - Hindi: category names from the signed M-LP-14 rows; template titles stay English (lang="en";
//   M-LP-14-T is not written yet).

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { LANDING_STYLE } from './landing-config';
import { LP, categoryName, drawerAriaLabel, drawerCountLabel, fill, tr } from './landing-copy';

import type { Lang } from '@/components/marketing/nl-copy';
import { usePrefersReducedMotion } from '@/components/ui';
import { CONTROL_LINE } from '@/components/ui/hover';
import { cn } from '@/lib/cn';
import type { LandingCatalogue } from '@/lib/landingCatalogue';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const SWITCH_MS = 200;

export interface CoverageDrawersProps {
  catalogue: LandingCatalogue;
  /** The filled M-LP-15-06 headline (the rounded count is computed by the caller). */
  headline: string;
  lang: Lang;
  /** Section id (the top bar's "Documents" anchor). */
  id?: string;
}

export function CoverageDrawers({ catalogue, headline, lang, id }: CoverageDrawersProps) {
  const shelves = catalogue.categories.filter((c) => c.templates.length > 0);
  const [openId, setOpenId] = useState<string | null>(shelves[0]?.id ?? null);
  const reduced = usePrefersReducedMotion();
  const base = useId();
  const panelId = `${base}-panel`;
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const fromHeight = useRef<number | null>(null);
  const hi = lang === 'hi';

  // The open id may have left the catalogue (a new fixture in a test): fall back to the first.
  const open = shelves.find((c) => c.id === openId) ?? shelves[0];

  const choose = (next: string) => {
    if (next === open?.id) return;
    fromHeight.current = outerRef.current?.getBoundingClientRect().height ?? null;
    setOpenId(next);
  };

  // Height and opacity from the old panel to the new one; instant under reduced motion.
  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const from = fromHeight.current;
    fromHeight.current = null;
    if (!outer || !inner || from === null || reduced) return undefined;
    const to = inner.getBoundingClientRect().height;
    outer.style.height = `${from}px`;
    outer.style.overflow = 'hidden';
    inner.style.opacity = '0';
    // Force the start values before the transition is set.
    void outer.offsetHeight;
    outer.style.transition = `height ${SWITCH_MS}ms ease-out`;
    inner.style.transition = `opacity ${SWITCH_MS}ms ease-out`;
    outer.style.height = `${to}px`;
    inner.style.opacity = '1';
    const t = window.setTimeout(() => {
      outer.style.height = '';
      outer.style.overflow = '';
      outer.style.transition = '';
      inner.style.transition = '';
    }, SWITCH_MS + 20);
    return () => window.clearTimeout(t);
  }, [open?.id, reduced]);

  // An empty catalogue renders no section (spec §8; the T-600 drift test fails first).
  if (!open) return null;

  const openName = categoryName(open.id, open.name, lang);
  return (
    <section
      id={id}
      aria-labelledby={`${base}-title`}
      className={cn(
        // Rajesh (26 Oct): on Wall like every section. Only the top hairline here: every section
        // after it (samples, video, prices) draws its own top line, so a bottom one would double.
        'border-nl-line border-t',
        LANDING_STYLE.section,
        LANDING_STYLE.deepGround,
      )}
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <p className="nl-label text-nl-muted">{tr(LP.coverageEyebrow, lang)}</p>
        <h2 id={`${base}-title`} className={cn(LANDING_STYLE.h2, 'text-nl-text mt-nl-2')}>
          {tr(LP.coverageTitle, lang)}
        </h2>
        {/* Rajesh (26 Oct): M-LP-15-06 is the lead line under the h2, not a second heading;
            M-LP-06 follows in Muted. */}
        <p
          className="font-nl-body text-nl-soft mt-nl-3 max-w-[65ch] text-[18px] tabular-nums leading-[28px]"
          data-coverage-headline=""
        >
          {headline}
        </p>
        <p className="nl-body text-nl-muted mt-nl-2 max-w-[65ch]">{tr(LP.coverageLead, lang)}</p>

        <ul
          aria-label={tr(LP.drawersAria, lang)}
          className="mt-nl-8 min-[720px]:gap-nl-4 m-0 grid list-none grid-cols-2 gap-[10px] p-0 min-[720px]:grid-cols-3 min-[1280px]:grid-cols-4"
        >
          {shelves.map((c) => {
            const n = c.templates.length;
            const isOpen = c.id === open.id;
            const name = categoryName(c.id, c.name, lang);
            return (
              <li key={c.id} className="min-w-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={drawerAriaLabel(name.text, n, lang)}
                  data-drawer={c.id}
                  onClick={() => choose(c.id)}
                  className={cn(
                    'nl-focus px-nl-3 pb-nl-5 pt-nl-3 relative flex h-full min-h-[84px] w-full touch-manipulation flex-col items-start justify-start border text-left min-[720px]:min-h-[92px]',
                    LANDING_STYLE.radius,
                    'transition-colors duration-150 ease-out',
                    isOpen
                      ? 'bg-nl-brass-light border-nl-brass'
                      : cn(
                          'bg-nl-card',
                          CONTROL_LINE,
                          '[@media(hover:hover)_and_(pointer:fine)]:hover:border-nl-brass',
                        ),
                  )}
                >
                  <span
                    lang={name.isHindi || !hi ? undefined : 'en'}
                    className="font-nl-body text-nl-text break-words text-[15px] font-medium leading-5"
                  >
                    {name.text}
                  </span>
                  <span className="font-nl-body text-nl-muted mt-nl-1 text-[13px] tabular-nums leading-5">
                    {drawerCountLabel(n, lang)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'bg-nl-brass bottom-nl-2 absolute left-1/2 h-1.5 w-10 -translate-x-1/2',
                      LANDING_STYLE.pullRadius,
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <div ref={outerRef} className="mt-nl-4">
          <div
            ref={innerRef}
            id={panelId}
            role="region"
            aria-label={fill(tr(LP.panelAria, lang), { name: openName.text })}
            data-drawer-panel={open.id}
            className={cn(
              'border-nl-brass bg-nl-card min-[720px]:px-nl-8 border p-[18px] min-[720px]:py-[28px]',
              LANDING_STYLE.radius,
            )}
          >
            <p className="font-nl-body text-nl-brass-dark text-[14px] font-medium tabular-nums leading-5">
              <span lang={openName.isHindi || !hi ? undefined : 'en'}>{openName.text}</span>
              {' · '}
              {drawerCountLabel(open.templates.length, lang)}
            </p>
            <ul
              lang={hi ? 'en' : undefined}
              className="mt-nl-3 gap-x-nl-6 m-0 grid list-none grid-cols-1 p-0 min-[720px]:grid-cols-2 min-[1280px]:grid-cols-3"
            >
              {open.templates.map((t) => (
                <li
                  key={t.id}
                  data-template={t.id}
                  className="nl-body text-nl-text border-nl-line py-nl-2 break-words border-b"
                >
                  {t.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="nl-body-sm mt-nl-4 max-w-[65ch]">
          <span className="text-nl-soft font-medium tabular-nums" data-coverage-total="">
            {fill(tr(LP.coverageTotal, lang), {
              total: catalogue.total,
              shelves: shelves.length,
            })}
          </span>{' '}
          <span className="text-nl-muted">{tr(LP.coverageFooter, lang)}</span>
        </p>
      </div>
    </section>
  );
}
