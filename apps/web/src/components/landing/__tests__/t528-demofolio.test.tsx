/**
 * T-528 items 7c and 7d: grapheme-safe demo typing (Hindi never shows a split cluster) and the
 * CSS-only reveal fallback for a stalled hydration.
 */
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';

import { DemoFolio, splitGraphemes } from '../DemoFolio';

import { landingCopy } from '@/components/marketing/nl-copy';
import { cleanupMounted, mount, q } from '@/components/ui/__tests__/nl-test-utils';

const PROMPT_HI = landingCopy('hi').demo.prompt;
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const typed = () => q('[data-demo-typed]')!.textContent ?? '';
const rest = () => q('[data-demo-rest]')?.textContent ?? '';

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('splitGraphemes (T-528 7c)', () => {
  it('keeps a Devanagari matra or virama conjunct attached to its consonant', () => {
    expect(splitGraphemes('कि', 'hi')).toEqual(['कि']);
    expect(splitGraphemes('क्ष', 'hi')).toEqual(['क्ष']);
    expect(splitGraphemes('नमस्ते', 'hi')).toEqual(['न', 'म', 'स्ते']);
    expect(splitGraphemes('abc', 'en')).toEqual(['a', 'b', 'c']);
    expect(splitGraphemes('', 'hi')).toEqual([]);
  });

  it('always rejoins to the original text, for English and Hindi prompts', () => {
    for (const lang of ['en', 'hi'] as const) {
      const p = landingCopy(lang).demo.prompt;
      expect(splitGraphemes(p, lang).join('')).toBe(p);
    }
    // Every Hindi chunk starts with a base character, never a bare combining mark.
    for (const g of splitGraphemes(PROMPT_HI, 'hi')) expect(g).not.toMatch(/^\p{M}/u);
  });

  it('falls back to code points when Intl.Segmenter is missing', () => {
    const desc = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!;
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      expect(splitGraphemes('कि', 'hi')).toEqual(['क', 'ि']);
      expect(splitGraphemes('a😀b', 'en')).toEqual(['a', '😀', 'b']);
      expect(splitGraphemes('', 'en')).toEqual([]);
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
});

describe('Hindi demo typing never shows a split cluster (T-528 7c)', () => {
  it('every frame: shown + rest is the full prompt and shown is a whole-grapheme prefix', () => {
    mount(<DemoFolio lang="hi" />);
    const chunks = splitGraphemes(PROMPT_HI, 'hi');
    const prefixes = new Set<string>();
    let acc = '';
    prefixes.add(acc);
    for (const g of chunks) prefixes.add((acc += g));
    expect(typed()).toBe('');
    expect(rest()).toBe(PROMPT_HI);
    let sawMidWord = false;
    for (let i = 0; i < chunks.length + 2; i += 1) {
      expect(typed() + rest()).toBe(PROMPT_HI);
      expect(prefixes.has(typed())).toBe(true);
      // Never ends on a dangling virama (a cluster still open) and rest never starts on a mark.
      expect(typed()).not.toMatch(/्$/u);
      expect(rest()).not.toMatch(/^\p{M}/u);
      if (typed().length > 0 && typed().length < PROMPT_HI.length) sawMidWord = true;
      tick(13);
    }
    expect(sawMidWord).toBe(true);
    expect(typed()).toBe(PROMPT_HI);
  });

  it('steps one grapheme per 13 ms, so fewer steps than code points', () => {
    mount(<DemoFolio lang="hi" />);
    const chunks = splitGraphemes(PROMPT_HI, 'hi');
    expect(chunks.length).toBeLessThan(Array.from(PROMPT_HI).length);
    tick(13);
    expect(typed()).toBe(chunks[0]);
    tick(13);
    expect(typed()).toBe(chunks.slice(0, 2).join(''));
  });
});

describe('INITIAL_CSS reveal fallback (T-528 7d)', () => {
  const EXPECTED =
    '@media (prefers-reduced-motion: no-preference){[data-demo-initial] .demo-hide{visibility:hidden;animation:demo-reveal 0s 2.5s forwards}}@keyframes demo-reveal{to{visibility:visible}}';

  it('the scoped style is exactly the hidden-then-reveal rule, only under no-preference motion', () => {
    mount(<DemoFolio lang="en" />);
    expect(q('figure > style')!.textContent).toBe(EXPECTED);
    const src = fs.readFileSync(path.join(__dirname, '../DemoFolio.tsx'), 'utf8');
    expect(src).toContain(EXPECTED);
    // The keyframes sit outside the media query, the hiding rule inside it.
    const css = q('figure > style')!.textContent!;
    expect(css.indexOf('@keyframes')).toBeGreaterThan(css.indexOf('visibility:hidden'));
    expect(css).toMatch(/animation:demo-reveal 0s 2\.5s forwards/);
  });

  it('once the effect has run the guard attribute is gone, so the reveal never fires', () => {
    mount(<DemoFolio lang="en" />);
    expect(q('figure')!.hasAttribute('data-demo-initial')).toBe(false);
  });
});
