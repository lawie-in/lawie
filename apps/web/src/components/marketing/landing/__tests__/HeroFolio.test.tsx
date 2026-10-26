// T-601 (c): the hero folio. Finished state (server, reduced motion, Save-Data, no observer), the
// one-time 2.6s script, the Inkwell figures, the pause with the tab, the accessible text once.
import { act } from 'react';

import { HeroFolio, inkForPct, isSlowConnection, pctAt, splitGraphemes } from '../HeroFolio';
import { HERO_SCRIPT } from '../landing-config';
import { LP } from '../landing-copy';
import {
  clearMatchMedia,
  norm,
  setConnection,
  setVisibility,
  stubIntersectionObserver,
} from './_helpers';

import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';

const LINES = {
  en: [LP.folioLine1.en, LP.folioLine2.en, LP.folioLine3.en],
  hi: [LP.folioLine1.hi, LP.folioLine2.hi, LP.folioLine3.hi],
};
const phase = () => q('[data-folio-phase]')!.getAttribute('data-folio-phase');
const written = () => qa('[data-folio-written]').map((e) => e.textContent ?? '');
const rest = () => qa('[data-folio-rest]').map((e) => e.textContent ?? '');
const pct = () => q('[data-folio-pct]')!.textContent;
const level = () => Number(q('svg[data-level]')!.getAttribute('data-level'));
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

let io: ReturnType<typeof stubIntersectionObserver> | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  clearMatchMedia();
  setConnection(undefined);
  setVisibility('visible');
});
afterEach(() => {
  cleanupMounted();
  io?.restore();
  io = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
  setConnection(undefined);
});

describe('finished state', () => {
  it('no IntersectionObserver (jsdom): the finished state at once, no timer', () => {
    mount(<HeroFolio lang="en" />);
    expect(phase()).toBe('done');
    expect(written()).toEqual(LINES.en);
    expect(rest()).toEqual([]);
    expect(pct()).toBe('54%');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reduced motion: finished, no observer created, no timer, guard lifted', () => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<HeroFolio lang="en" />);
    expect(phase()).toBe('done');
    expect(written()).toEqual(LINES.en);
    expect(pct()).toBe('54%');
    expect(io.instances).toHaveLength(0);
    tick(10_000);
    expect(phase()).toBe('done');
    expect(q('[data-folio-phase]')!.hasAttribute('data-folio-initial')).toBe(false);
  });

  it.each([
    ['Save-Data', { saveData: true }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['2g', { effectiveType: '2g' }],
    ['3g', { effectiveType: '3g' }],
  ])('%s: finished state, observer never created', (_n, conn) => {
    io = stubIntersectionObserver();
    setConnection(conn);
    expect(isSlowConnection()).toBe(true);
    mount(<HeroFolio lang="en" />);
    expect(phase()).toBe('done');
    expect(written()).toEqual(LINES.en);
    expect(io.instances).toHaveLength(0);
  });

  it('a 4g connection is not slow', () => {
    setConnection({ effectiveType: '4g', saveData: false });
    expect(isSlowConnection()).toBe(false);
    setConnection(undefined);
    expect(isSlowConnection()).toBe(false);
  });

  it('reduced motion switched on mid-script jumps to the finished state', () => {
    io = stubIntersectionObserver();
    const mm = stubMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    mount(<HeroFolio lang="en" />);
    io.show(1);
    tick(400);
    expect(phase()).toBe('writing');
    mm.set(REDUCED_MOTION_QUERY, true);
    expect(phase()).toBe('done');
    expect(written()).toEqual(LINES.en);
    expect(pct()).toBe('54%');
  });
});

describe('the script', () => {
  it('waits, empty, until half in view; a quarter in view does not start it', () => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    expect(phase()).toBe('waiting');
    expect(written().join('')).toBe('');
    expect(pct()).toBe('0%');
    expect(level()).toBe(100);
    expect(io.instances[0].options?.threshold).toBe(0.5);
    io.show(0.25);
    tick(1000);
    expect(phase()).toBe('waiting');
    expect(written().join('')).toBe('');
  });

  it('the unwritten text keeps its space: written + rest is the full line on every frame', () => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    io.show(1);
    for (let i = 0; i < 20; i += 1) {
      tick(40);
      const w = written();
      const r = rest();
      qa('[data-folio-line]').forEach((li, k) => {
        expect(
          (w[k] ?? '') +
            (qa('[data-folio-line]')[k].querySelector('[data-folio-rest]')?.textContent ?? ''),
        ).toBe(LINES.en[k]);
        void li;
      });
      void r;
    }
  });

  it('writes the three lines in 2.6s, once, then holds; 100 -> 54 in step', () => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    io.show(1);
    expect(phase()).toBe('writing');
    expect(HERO_SCRIPT.writeMs).toBe(2600);
    let prevChars = -1;
    let prevPct = -1;
    for (let t = 40; t < 2600; t += 40) {
      tick(40);
      const chars = written().join('').length;
      expect(chars).toBeGreaterThanOrEqual(prevChars);
      expect(Number.parseInt(pct()!, 10)).toBeGreaterThanOrEqual(prevPct);
      prevChars = chars;
      prevPct = Number.parseInt(pct()!, 10);
    }
    expect(phase()).toBe('writing');
    expect(prevChars).toBeLessThan(LINES.en.join('').length);
    tick(200);
    tick(100);
    expect(phase()).toBe('done');
    expect(written()).toEqual(LINES.en);
    expect(pct()).toBe('54%');
    expect(level()).toBe(50);
    // Holds: nothing moves afterwards, no timer left, the observer does not restart it.
    tick(20_000);
    expect(written()).toEqual(LINES.en);
    expect(pct()).toBe('54%');
    expect(jest.getTimerCount()).toBe(0);
    io.show(1);
    io.hide();
    io.show(1);
    expect(phase()).toBe('done');
  });

  it('the draft-progress figure and the Inkwell level (DESIGN.md: level = 100 - pct x 0.92)', () => {
    expect(pctAt(0)).toBe(0);
    expect(pctAt(1)).toBe(54);
    expect(pctAt(2)).toBe(54);
    expect(pctAt(-1)).toBe(0);
    expect(inkForPct(0)).toBe(100);
    expect(inkForPct(54)).toBe(50);
    expect(inkForPct(100)).toBe(8);
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    expect(level()).toBe(100);
    io.show(1);
    tick(1300);
    const mid = level();
    expect(mid).toBeLessThan(100);
    expect(mid).toBeGreaterThan(50);
  });

  it('the stage name sits beside the percentage', () => {
    mount(<HeroFolio lang="en" />);
    const row = q('[data-folio-progress]')!;
    expect(norm(row.textContent)).toBe('Writing54%');
    cleanupMounted();
    mount(<HeroFolio lang="hi" />);
    expect(norm(q('[data-folio-progress]')!.textContent)).toBe('ड्राफ़्ट लिखना54%');
  });

  it('pauses while the tab is hidden (no timer, no progress) and resumes on return', () => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    io.show(1);
    tick(400);
    const before = written().join('').length;
    expect(before).toBeGreaterThan(0);
    setVisibility('hidden');
    tick(5000);
    expect(written().join('').length).toBe(before);
    expect(phase()).toBe('writing');
    expect(jest.getTimerCount()).toBe(0);
    setVisibility('visible');
    tick(400);
    expect(written().join('').length).toBeGreaterThan(before);
  });

  it('no per-frame loop: one update per 40ms tick, no requestAnimationFrame for the script', () => {
    io = stubIntersectionObserver();
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    mount(<HeroFolio lang="en" />);
    io.show(1);
    tick(2800);
    expect(raf).not.toHaveBeenCalled();
  });

  it('a language switch mid-script shows the finished text of the new language', () => {
    io = stubIntersectionObserver();
    const m = mount(<HeroFolio lang="en" />);
    io.show(1);
    tick(400);
    m.rerender(<HeroFolio lang="hi" />);
    expect(written()).toEqual(LINES.hi);
    expect(phase()).toBe('done');
  });

  it('unmounting mid-script leaves no timer and disconnects the observer', () => {
    io = stubIntersectionObserver();
    const m = mount(<HeroFolio lang="en" />);
    io.show(1);
    tick(200);
    m.unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(io.instances.every((i) => i.disconnected)).toBe(true);
  });
});

describe('Hindi graphemes', () => {
  it('splitGraphemes keeps a matra or conjunct with its consonant and rejoins to the text', () => {
    expect(splitGraphemes('कि', 'hi')).toEqual(['कि']);
    expect(splitGraphemes('क्ष', 'hi')).toEqual(['क्ष']);
    expect(splitGraphemes('नमस्ते', 'hi')).toEqual(['न', 'म', 'स्ते']);
    expect(splitGraphemes('abc', 'en')).toEqual(['a', 'b', 'c']);
    expect(splitGraphemes('', 'hi')).toEqual([]);
    for (const l of LINES.hi) {
      expect(splitGraphemes(l, 'hi').join('')).toBe(l);
      for (const g of splitGraphemes(l, 'hi')) expect(g).not.toMatch(/^\p{M}/u);
    }
  });

  it('falls back to code points without Intl.Segmenter', () => {
    const desc = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!;
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      expect(splitGraphemes('कि', 'hi')).toEqual(['क', 'ि']);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', desc);
    }
  });

  it('passes the page language and grapheme granularity to Intl.Segmenter', () => {
    const real = Intl.Segmenter;
    const spy = jest.fn((...a: ConstructorParameters<typeof Intl.Segmenter>) => new real(...a));
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, writable: true, value: spy });
    try {
      splitGraphemes('कि', 'hi');
      expect(spy).toHaveBeenCalledWith('hi', { granularity: 'grapheme' });
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { configurable: true, writable: true, value: real });
    }
  });

  it('every frame of the Hindi script shows whole graphemes only and never a dangling virama', () => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="hi" />);
    io.show(1);
    const prefixes = LINES.hi.map((l) => {
      const set = new Set<string>(['']);
      let acc = '';
      for (const g of splitGraphemes(l, 'hi')) set.add((acc += g));
      return set;
    });
    for (let i = 0; i < 70; i += 1) {
      qa('[data-folio-line]').forEach((li, k) => {
        const w = li.querySelector('[data-folio-written]')!.textContent ?? '';
        const r = li.querySelector('[data-folio-rest]')?.textContent ?? '';
        expect(prefixes[k].has(w)).toBe(true);
        expect(w + r).toBe(LINES.hi[k]);
        expect(w).not.toMatch(/्$/u);
        expect(r).not.toMatch(/^\p{M}/u);
      });
      tick(40);
    }
    expect(written()).toEqual(LINES.hi);
  });
});

describe('accessible text and the watermark', () => {
  it.each(['en', 'hi'] as const)(
    '%s: the full text once in sr-only, the written copy aria-hidden',
    (lang) => {
      io = stubIntersectionObserver();
      mount(<HeroFolio lang={lang} />);
      const sr = q('figure ol.sr-only')!;
      expect(sr.getAttribute('aria-hidden')).toBeNull();
      expect(Array.from(sr.querySelectorAll('li')).map((l) => l.textContent)).toEqual(LINES[lang]);
      const visible = q('figure ol[aria-hidden="true"]')!;
      expect(visible.classList.contains('sr-only')).toBe(false);
      // While waiting (empty) and after writing, the sr-only text is complete and unchanged.
      io.show(1);
      tick(1000);
      expect(Array.from(sr.querySelectorAll('li')).map((l) => l.textContent)).toEqual(LINES[lang]);
      tick(3000);
      for (const l of LINES[lang]) {
        const dupes = qa('figure *').filter(
          (e) =>
            e.textContent === l && e.children.length === 0 && !e.closest('[aria-hidden="true"]'),
        );
        expect(dupes).toHaveLength(1);
      }
    },
  );

  it('the figure is named "Sample draft, fictional parties" / the signed Hindi', () => {
    mount(<HeroFolio lang="en" />);
    expect(q('figure')!.getAttribute('aria-label')).toBe('Sample draft, fictional parties');
    cleanupMounted();
    mount(<HeroFolio lang="hi" />);
    expect(q('figure')!.getAttribute('aria-label')).toBe('नमूना ड्राफ़्ट, काल्पनिक पक्षकार');
  });

  it('the Inkwell is decorative (no label, aria-hidden)', () => {
    mount(<HeroFolio lang="en" />);
    const svg = q('svg[data-level]')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('role')).toBeNull();
  });

  it.each([
    ['waiting', true, 0],
    ['writing', true, 600],
    ['done', true, 4000],
  ])('SAMPLE watermark is aria-hidden and on top in the %s state', (_n, _x, ms) => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    if (ms > 0) io.show(1);
    tick(ms);
    const w = q('[data-watermark]')!;
    expect(w.getAttribute('aria-hidden')).toBe('true');
    expect(w.textContent).toBe('SAMPLE');
    expect(w.className).toContain('pointer-events-none');
    expect(w.className).toContain('z-10');
    expect(w.className).toContain('-rotate-[24deg]');
  });

  it('watermark in the finished states too, and the Hindi word in Hindi', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<HeroFolio lang="hi" />);
    expect(q('[data-watermark]')!.textContent).toBe('नमूना');
    expect(q('[data-watermark]')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('the signed court heading and cause title are shown once, in the figure, in the folio order', () => {
    mount(<HeroFolio lang="en" />);
    const h = q('[data-folio-heading]');
    expect(h).not.toBeNull();
    expect(Array.from(h!.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      'In the Court of the Sessions Judge, Sample District',
      'Application for regular bail',
      'Sample Person 1 … Applicant',
      'Versus',
      'The State … Opposite Party',
    ]);
    expect(norm(q('figure')!.textContent)).not.toMatch(/\bNo\.|FIR|SAMPLE\/\d|Section|\bs\.\d/);
  });
});

describe('flash guard (data-folio-initial)', () => {
  it('the style hides only under no-preference motion and reveals after 2.5s; a noscript override exists', () => {
    mount(<HeroFolio lang="en" />);
    const css = q('[data-folio-phase] > style')!.textContent!;
    expect(css).toBe(
      '@media (prefers-reduced-motion: no-preference){[data-folio-initial] .folio-hide{visibility:hidden;animation:folio-reveal 0s 2.5s forwards}}@keyframes folio-reveal{to{visibility:visible}}',
    );
    expect(q('[data-folio-phase] > noscript')).not.toBeNull();
  });

  it('hides exactly the written copy (folio-hide), not the sr-only text or the heading', () => {
    mount(<HeroFolio lang="en" />);
    const hidden = qa('.folio-hide');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('after mount the attribute is gone in every case (plays, reduced motion, Save-Data)', () => {
    io = stubIntersectionObserver();
    mount(<HeroFolio lang="en" />);
    expect(q('[data-folio-phase]')!.hasAttribute('data-folio-initial')).toBe(false);
    cleanupMounted();
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<HeroFolio lang="en" />);
    expect(q('[data-folio-phase]')!.hasAttribute('data-folio-initial')).toBe(false);
    cleanupMounted();
    clearMatchMedia();
    setConnection({ saveData: true });
    mount(<HeroFolio lang="en" />);
    expect(q('[data-folio-phase]')!.hasAttribute('data-folio-initial')).toBe(false);
  });
});

describe('classes (no layout in jsdom)', () => {
  it('reserves height, has the 1px brass top hairline and the shadow only from 900px', () => {
    mount(<HeroFolio lang="en" />);
    const c = (q('figure')!.getAttribute('class') ?? '').split(/\s+/);
    expect(c).toEqual(
      expect.arrayContaining([
        'min-h-[420px]',
        'min-[720px]:min-h-[320px]',
        'min-[900px]:min-h-[480px]',
        'border-t-nl-brass',
      ]),
    );
    expect(c).toContain('min-[900px]:shadow-nl-card');
    expect(c).not.toContain('shadow-nl-card');
    expect(c).toContain('min-[1280px]:max-w-[560px]');
  });

  it('the lamp does not follow without a fine pointer at 1280', () => {
    mount(<HeroFolio lang="en" />);
    expect(q('[data-lamp-follow]')).toBeNull();
  });
});
