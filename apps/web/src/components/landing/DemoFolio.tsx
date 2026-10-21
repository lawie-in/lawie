'use client';

// T-517: the landing's live demo folio (spec 01 "Live demo", 2.4 pen writing; copy §1.3).
// AJ-517-M7: the signed prompt, the caption and an EMPTY folio. No draft text is written: the
// "draft" is placeholder lines only, until Ajay signs the demo text (AJ-511-M17).
// - Runs once on load; Replay plays it again.
// - Typing 13ms per character (spec 12-14ms), 9ms under the mobile cap; 220ms between lines.
// - prefers-reduced-motion: the end state, always (Replay shows the end state too).
// - Slow connection (saveData, or effectiveType slow-2g / 2g / 3g): starts in the end state and
//   plays only on Replay.
// - Tab hidden: the loop pauses where it is and resumes on return.

import { useEffect, useRef, useState } from 'react';

import type { Lang } from '@/components/marketing/nl-copy';
import { landingCopy } from '@/components/marketing/nl-copy';
import {
  REDUCED_MOTION_QUERY,
  useMobileCap,
  usePageVisible,
  usePrefersReducedMotion,
} from '@/components/ui';
import { cn } from '@/lib/cn';

/** Placeholder line widths for the empty folio (no text). */
export const DEMO_LINE_WIDTHS = ['92%', '100%', '86%', '97%', '64%'];
const CHAR_MS = 13;
const CHAR_MS_MOBILE = 9;
const LINE_MS = 220;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the browser reports Data Saver or a 2G/3G connection. */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

type Phase = 'idle' | 'typing' | 'lines' | 'done';

/**
 * No flash before autoplay: the server render carries data-demo-initial. While it is set and
 * motion is allowed (the only case that autoplays), the prompt and the placeholder lines are
 * hidden, so first paint does not show the end state and then wipe it. The mount effect drops
 * the attribute when play() starts or when it decides not to play (reduced motion, Data Saver,
 * 2G/3G), which shows the end state. Under reduced motion the rule never applies. Without
 * JavaScript the <noscript> override shows the end state.
 */
const INITIAL_CSS =
  '@media (prefers-reduced-motion: no-preference){[data-demo-initial] .demo-hide{visibility:hidden}}';
const NOSCRIPT_CSS = '[data-demo-initial] .demo-hide{visibility:visible}';

export function DemoFolio({ lang }: { lang: Lang }) {
  const copy = landingCopy(lang).demo;
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const mobile = useMobileCap();
  const total = Array.from(copy.prompt).length;

  // Server render and first paint: the end state (no flash of an empty folio without JS).
  const [phase, setPhase] = useState<Phase>('done');
  const [chars, setChars] = useState(total);
  const [lines, setLines] = useState(DEMO_LINE_WIDTHS.length);
  // True only until the mount effect has decided whether to play (see INITIAL_CSS).
  const [initial, setInitial] = useState(true);

  const play = () => {
    setChars(0);
    setLines(0);
    setPhase('typing');
  };
  const end = () => {
    setChars(Number.MAX_SAFE_INTEGER);
    setLines(DEMO_LINE_WIDTHS.length);
    setPhase('done');
  };

  // On load: play, unless reduced motion or a slow connection (then stay at the end state).
  useEffect(() => {
    // Read the media query directly: during hydration the hook still returns its server value
    // (false), so play() must not trust it here.
    const reducedNow =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches;
    setInitial(false);
    if (reducedNow || reduced || isSlowConnection()) return;
    play();
    // Only on mount; reduced-motion changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reduced motion switched on mid-play: jump to the end state.
  useEffect(() => {
    if (reduced && phase !== 'done') end();
  }, [reduced, phase]);

  // A language switch shows the end state of the new prompt (not on mount).
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    end();
  }, [lang]);

  // The loop: one timer per step, none while the tab is hidden (pause) or when done.
  useEffect(() => {
    if (!visible || reduced) return undefined;
    if (phase === 'typing') {
      if (chars >= total) {
        const t = window.setTimeout(() => setPhase('lines'), LINE_MS);
        return () => window.clearTimeout(t);
      }
      const t = window.setTimeout(() => setChars((c) => c + 1), mobile ? CHAR_MS_MOBILE : CHAR_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'lines') {
      if (lines >= DEMO_LINE_WIDTHS.length) {
        setPhase('done');
        return undefined;
      }
      const t = window.setTimeout(() => setLines((n) => n + 1), LINE_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase, chars, lines, total, visible, reduced, mobile]);

  const promptChars = Array.from(copy.prompt);
  const shown = promptChars.slice(0, chars).join('');
  // The untyped remainder stays in the paragraph, invisible, so the folio keeps its final height
  // while typing (no layout shift under the hero on mobile).
  const rest = promptChars.slice(chars).join('');

  return (
    <figure
      className="nl border-nl-line border-t-nl-brass bg-nl-card p-nl-6 min-[900px]:p-nl-10 shadow-nl-card relative m-0 overflow-hidden border border-t"
      data-demo-phase={phase}
      data-demo-initial={initial ? '' : undefined}
    >
      <style>{INITIAL_CSS}</style>
      <noscript>
        <style>{NOSCRIPT_CSS}</style>
      </noscript>
      <div aria-hidden="true" className="nl-lamp-pool pointer-events-none absolute inset-0" />
      <div className="relative">
        {/* The full prompt once for assistive tech; the typed copy is decorative. */}
        <p className="sr-only">{copy.prompt}</p>
        <p aria-hidden="true" className="demo-hide nl-body text-nl-text break-words">
          <span data-demo-typed="">{shown}</span>
          {phase === 'typing' ? (
            // Zero-width anchor, so the caret never moves the text after it. A 1px caret at the
            // writing point: brass on a fine-pointer desktop, text colour under the mobile cap
            // (Rajesh, 21 Oct). There is no nib / pen cursor in this build.
            <span className="relative">
              <span
                className={cn(
                  'absolute bottom-[0.15em] left-0 h-[1.1em] w-px',
                  mobile ? 'bg-nl-text' : 'bg-nl-brass',
                )}
              />
            </span>
          ) : null}
          {rest ? (
            <span className="invisible" data-demo-rest="">
              {rest}
            </span>
          ) : null}
        </p>
        <div
          aria-hidden="true"
          className="demo-hide border-nl-line mt-nl-4 gap-nl-3 pt-nl-4 flex flex-col border-t"
        >
          {DEMO_LINE_WIDTHS.map((w, i) => (
            <span
              key={i}
              data-demo-line=""
              className={cn('bg-nl-wood block h-2.5 rounded-full', i >= lines && 'invisible')}
              style={{ width: w }}
            />
          ))}
        </div>
        <figcaption className="mt-nl-4 gap-nl-3 flex flex-wrap items-center justify-between">
          <span className="nl-body-sm text-nl-soft">{copy.caption}</span>
          <button
            type="button"
            onClick={() => (reduced ? end() : play())}
            className="nl-focus nl-body-sm rounded-nl-md border-nl-line px-nl-4 text-nl-brass-dark inline-flex min-h-[44px] touch-manipulation items-center border font-medium"
          >
            {copy.replay}
          </button>
        </figcaption>
      </div>
    </figure>
  );
}
