'use client';

// T-601: the hero's lit folio (spec §2, "the product performs"). It replaces components/landing/
// DemoFolio (same gates; isSlowConnection and splitGraphemes are carried over here so DemoFolio
// can be deleted in part 2).
// - Script: the three signed grounds lines (M-LP-15-01..03) are pen-written once, 2.6s, when the
//   folio is half in view (IntersectionObserver, threshold .5); the progress (T-539 pct, shown
//   beside the stage name) goes 0 -> 54 and the Inkwell level 100 -> about 50 (100 - pct x 0.92),
//   then holds (Rajesh, 26 Oct). One state update per 40ms tick, not per frame, none while the tab is hidden.
// - Finished state (three lines, pct 54, ink about 50, nothing moves): server render, reduced motion, Save-Data
//   or 2G/3G, no IntersectionObserver. data-folio-initial guards the first paint (no flash of the
//   finished text before the writing starts); a CSS-only reveal shows it after 2.5s if hydration
//   stalls, and <noscript> shows it at once.
// - Lamp: a --lamp pool above the folio; from 1280 with a fine pointer (and motion allowed) it
//   follows the pointer within +-24px through CSS custom properties, 120ms linear. Static otherwise.
// - SAMPLE watermark (M-LP-15-05), CSS text, aria-hidden, on top in every state.
// - The full text is in the DOM once for assistive tech (sr-only); the written copy is aria-hidden.

import { useEffect, useMemo, useRef, useState } from 'react';

import { LAMP_FOLLOW_QUERY, LANDING_STYLE, HERO_SCRIPT } from './landing-config';
import { LP, folioHeadingSigned, tr } from './landing-copy';
import { hasIntersectionObserver, useInView } from './useInView';

import type { Lang } from '@/components/marketing/nl-copy';
import {
  Inkwell,
  REDUCED_MOTION_QUERY,
  useMediaQuery,
  useMotionAllowed,
  usePageVisible,
  usePrefersReducedMotion,
} from '@/components/ui';
import { cn } from '@/lib/cn';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the browser reports Data Saver or a 2G/3G connection (as DemoFolio, T-517). */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

/** Grapheme clusters in the page language, so a Hindi matra or virama is never split (T-528). */
export function splitGraphemes(text: string, lang: string): string[] {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale: string,
        options: { granularity: 'grapheme' },
      ) => { segment(input: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (typeof Segmenter !== 'function') return Array.from(text);
  return Array.from(
    new Segmenter(lang, { granularity: 'grapheme' }).segment(text),
    (s) => s.segment,
  );
}

/** Draft progress (T-539 pct) for a script progress 0..1: 0 -> 54. */
export function pctAt(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(HERO_SCRIPT.pctTo * p);
}

/** Ink level for a pct (DESIGN.md Inkwell): 100 - pct x 0.92; pct 54 gives about 50. */
export function inkForPct(pct: number): number {
  return Math.round(100 - pct * HERO_SCRIPT.inkPerPct);
}

type Phase = 'done' | 'waiting' | 'writing';

const INITIAL_CSS =
  '@media (prefers-reduced-motion: no-preference){[data-folio-initial] .folio-hide{visibility:hidden;animation:folio-reveal 0s 2.5s forwards}}@keyframes folio-reveal{to{visibility:visible}}';
const NOSCRIPT_CSS = '[data-folio-initial] .folio-hide{visibility:visible}';

export function HeroFolio({ lang }: { lang: Lang }) {
  const lines = useMemo(
    () => [tr(LP.folioLine1, lang), tr(LP.folioLine2, lang), tr(LP.folioLine3, lang)],
    [lang],
  );
  const graphemes = useMemo(() => lines.map((l) => splitGraphemes(l, lang)), [lines, lang]);
  const totalChars = graphemes.reduce((n, g) => n + g.length, 0);

  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();

  // Server render and first paint: the finished state.
  const [phase, setPhase] = useState<Phase>('done');
  const [progress, setProgress] = useState(1);
  const [initial, setInitial] = useState(true);

  const folioRef = useRef<HTMLDivElement>(null);
  const inView = useInView(folioRef, {
    threshold: HERO_SCRIPT.threshold,
    once: true,
    fallback: false,
    enabled: phase === 'waiting',
  });

  const finish = () => {
    setProgress(1);
    setPhase('done');
  };

  // Mount: decide whether the script runs at all. The hook values are still the server values
  // during hydration, so the media query is read directly.
  useEffect(() => {
    const reducedNow =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches;
    setInitial(false);
    if (reducedNow || isSlowConnection() || !hasIntersectionObserver()) return;
    setProgress(0);
    setPhase('waiting');
  }, []);

  // Half in view: write.
  useEffect(() => {
    if (phase === 'waiting' && inView) setPhase('writing');
  }, [phase, inView]);

  // Reduced motion switched on mid-script: finished state.
  useEffect(() => {
    if (reduced && phase !== 'done') finish();
  }, [reduced, phase]);

  // A language switch shows the finished state of the new text (not on mount).
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    finish();
  }, [lang]);

  // The script: one timer per tick, none while the tab is hidden (pause) or when done.
  useEffect(() => {
    if (phase !== 'writing' || !visible || reduced) return undefined;
    if (progress >= 1) {
      setPhase('done');
      return undefined;
    }
    const t = window.setTimeout(
      () => setProgress((p) => Math.min(1, p + HERO_SCRIPT.tickMs / HERO_SCRIPT.writeMs)),
      HERO_SCRIPT.tickMs,
    );
    return () => window.clearTimeout(t);
  }, [phase, progress, visible, reduced]);

  // Lamp follow (1280+, fine pointer, motion allowed, tab visible).
  const motion = useMotionAllowed();
  const wide = useMediaQuery(LAMP_FOLLOW_QUERY, false);
  const follow = motion && wide && visible;
  const lampRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const lamp = lampRef.current;
    const folio = folioRef.current;
    if (!lamp || !folio) return undefined;
    if (!follow) {
      lamp.style.setProperty('--lamp-x', '0px');
      lamp.style.setProperty('--lamp-y', '0px');
      return undefined;
    }
    let frame = 0;
    let lastX = 0;
    let lastY = 0;
    const range = HERO_SCRIPT.lampRange;
    const clamp = (v: number) => Math.max(-range, Math.min(range, v));
    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const r = folio.getBoundingClientRect();
        const dx = ((lastX - (r.left + r.width / 2)) / Math.max(1, r.width)) * range * 2;
        const dy = ((lastY - (r.top + r.height / 2)) / Math.max(1, r.height)) * range * 2;
        lamp.style.setProperty('--lamp-x', `${clamp(dx)}px`);
        lamp.style.setProperty('--lamp-y', `${clamp(dy)}px`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [follow]);

  const written = Math.floor(progress * totalChars);
  const writing = phase === 'writing';
  const pct = pctAt(progress);
  const ink = inkForPct(pct);
  const stage = tr(LP.folioStage, lang);

  // Where the pen is: line index and characters shown on each line.
  let budget = written;
  const perLine = graphemes.map((g) => {
    const n = Math.max(0, Math.min(g.length, budget));
    budget -= n;
    return n;
  });
  const activeLine = perLine.findIndex((n, i) => n < graphemes[i].length);

  return (
    <div
      className="relative isolate min-w-0"
      data-folio-phase={phase}
      data-folio-initial={initial ? '' : undefined}
    >
      <style>{INITIAL_CSS}</style>
      <noscript>
        <style>{NOSCRIPT_CSS}</style>
      </noscript>

      {/* Lamp pool above the folio (decorative). Static unless `follow`. */}
      <div
        ref={lampRef}
        aria-hidden="true"
        data-lamp-follow={follow || undefined}
        className={cn(
          'pointer-events-none absolute inset-x-0 -top-16 bottom-1/3 -z-10',
          LANDING_STYLE.lamp,
          'translate-x-[var(--lamp-x,0px)] translate-y-[var(--lamp-y,0px)]',
          follow && 'transition-transform duration-[120ms] ease-linear',
        )}
      />

      {/* Inkwell row: above the folio on phones, at the folio's top right from 900. */}
      <div
        className="mb-nl-3 gap-nl-3 min-[900px]:right-nl-6 min-[900px]:top-nl-6 flex items-center min-[900px]:absolute min-[900px]:z-10 min-[900px]:mb-0"
        data-folio-progress=""
      >
        <Inkwell
          balance={ink}
          className="h-[42px] w-[34px] shrink-0 min-[900px]:h-16 min-[900px]:w-[52px]"
        />
        <span className="font-nl-body text-nl-text text-[14px] font-medium leading-5">{stage}</span>
        <span
          className="font-nl-display text-nl-text text-[24px] tabular-nums leading-[30px]"
          data-folio-pct=""
        >
          {pct}%
        </span>
      </div>

      <figure
        ref={folioRef}
        aria-label={tr(LP.folioLabel, lang)}
        className={cn(
          'nl border-nl-line border-t-nl-brass text-nl-text relative m-0 overflow-hidden border',
          LANDING_STYLE.paper,
          LANDING_STYLE.radius,
          LANDING_STYLE.heroShadow,
          // Reserved height = the measured finished state (EN, 26 Oct: 414 at 390, 314 at 768,
          // 478 at 1280), so neither the pen nor a late font swap moves the page below.
          'min-[900px]:p-nl-10 min-h-[420px] p-[22px] min-[720px]:min-h-[320px] min-[900px]:min-h-[480px] min-[900px]:pt-[112px]',
          'min-[1280px]:ml-auto min-[1280px]:max-w-[560px]',
        )}
      >
        {/* Court heading and cause title (AJ-601-S4..S6): rendered only while all five rows are
            signed (FOLIO_HEADING_ROWS). Static text, not written by the pen,
            so assistive tech reads it directly. */}
        {folioHeadingSigned() ? (
          <div className="mb-nl-6 text-center" data-folio-heading="">
            <p className="nl-label text-nl-text">{tr(LP.folioCourt, lang)}</p>
            <p className="nl-h3 text-nl-text mt-nl-2">{tr(LP.folioDocTitle, lang)}</p>
            <p className="nl-body-sm text-nl-soft mt-nl-3">{tr(LP.folioParty1, lang)}</p>
            <p className="nl-body-sm text-nl-soft">{tr(LP.folioVersus, lang)}</p>
            <p className="nl-body-sm text-nl-soft">{tr(LP.folioParty2, lang)}</p>
          </div>
        ) : null}
        {/* The full text once for assistive tech; the written copy is decorative. */}
        <ol className="sr-only">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
        <ol
          aria-hidden="true"
          className="folio-hide nl-draft gap-nl-4 pl-nl-6 m-0 flex list-decimal flex-col break-words"
        >
          {graphemes.map((g, i) => {
            const shown = g.slice(0, perLine[i]).join('');
            const rest = g.slice(perLine[i]).join('');
            return (
              <li key={i} data-folio-line="" className="pl-nl-1">
                <span data-folio-written="">{shown}</span>
                {writing && i === activeLine ? (
                  // Zero-width anchor, so the caret never moves the text after it.
                  <span className="relative">
                    <span className="bg-nl-brass absolute bottom-[0.15em] left-0 h-[1.1em] w-px" />
                  </span>
                ) : null}
                {/* The unwritten rest keeps its space: no layout shift while writing. */}
                {rest ? (
                  <span className="invisible" data-folio-rest="">
                    {rest}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {/* SAMPLE watermark: on top, in every state. */}
        <span
          aria-hidden="true"
          data-watermark=""
          className={cn(
            'font-nl-display px-nl-3 pointer-events-none absolute left-1/2 top-1/2 z-10 select-none whitespace-nowrap border-2',
            'text-[40px] leading-[1.1] tracking-[.3em] min-[900px]:text-[64px]',
            '-translate-x-1/2 -translate-y-1/2 -rotate-[24deg]',
            LANDING_STYLE.watermark,
          )}
        >
          {tr(LP.watermark, lang)}
        </span>
      </figure>
    </div>
  );
}
