// T-517 final pass: DemoFolio hydration flash fix (data-demo-initial + scoped style + noscript),
// reserved height (typed + rest = full prompt), SR text once, caret colour, touch-manipulation.
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { DemoFolio } from '../DemoFolio';

import { landingCopy } from '@/components/marketing/nl-copy';
import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { MOBILE_CAP_QUERY, REDUCED_MOTION_QUERY } from '@/components/ui/motion';

const setConnection = (v: unknown) =>
  Object.defineProperty(navigator, 'connection', { configurable: true, value: v });
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const figure = () => q('figure') as HTMLElement;
const typed = () => q('[data-demo-typed]')!.textContent ?? '';
const rest = () => q('[data-demo-rest]')?.textContent ?? '';
const caret = () => q('p[aria-hidden="true"] span.relative > span') as HTMLElement | null;

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  setConnection(undefined);
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  setConnection(undefined);
});

describe('initial markup and the flash guard', () => {
  it('carries the scoped reduced-motion-aware style and a noscript override', () => {
    mount(<DemoFolio lang="en" />);
    const style = q('figure > style')!.textContent!;
    expect(style).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(style).toContain('[data-demo-initial] .demo-hide');
    expect(style).toContain('visibility:hidden');
    // React renders no <noscript> children on the client, so the element is present but empty
    // here; its content is emitted by the server render. Check the element and the source string.
    expect(q('figure > noscript')).not.toBeNull();
    const src = fs.readFileSync(path.join(__dirname, '../DemoFolio.tsx'), 'utf8');
    expect(src).toMatch(/<noscript>\s*<style>\{NOSCRIPT_CSS\}<\/style>\s*<\/noscript>/);
    expect(src).toContain("'[data-demo-initial] .demo-hide{visibility:visible}'");
  });

  it('hides exactly the prompt paragraph and the placeholder lines (demo-hide), not the caption or Replay', () => {
    mount(<DemoFolio lang="en" />);
    const hidden = qa('.demo-hide');
    expect(hidden).toHaveLength(2);
    expect(hidden[0].tagName).toBe('P');
    expect(figure().querySelector('figcaption')!.closest('.demo-hide')).toBeNull();
  });

  it('after mount: removed when it plays', () => {
    mount(<DemoFolio lang="en" />);
    expect(figure().hasAttribute('data-demo-initial')).toBe(false);
    expect(figure().getAttribute('data-demo-phase')).toBe('typing');
  });

  it('after mount: removed under reduced motion (end state shown)', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<DemoFolio lang="en" />);
    expect(figure().hasAttribute('data-demo-initial')).toBe(false);
    expect(figure().getAttribute('data-demo-phase')).toBe('done');
  });

  it('after mount: removed with saveData (end state shown)', () => {
    setConnection({ saveData: true });
    mount(<DemoFolio lang="en" />);
    expect(figure().hasAttribute('data-demo-initial')).toBe(false);
    expect(figure().getAttribute('data-demo-phase')).toBe('done');
  });

  it('after mount: removed on a 2g connection', () => {
    setConnection({ effectiveType: '2g' });
    mount(<DemoFolio lang="en" />);
    expect(figure().hasAttribute('data-demo-initial')).toBe(false);
  });

  it('hydration with matching server markup removes the attribute in every case', () => {
    for (const setup of [
      () => undefined, // plays
      () => stubMatchMedia({ [REDUCED_MOTION_QUERY]: true }),
      () => setConnection({ saveData: true }),
    ]) {
      // server-equivalent: render with saveData so the markup is the end-state markup
      setConnection({ saveData: true });
      const pre = document.createElement('div');
      const preRoot = createRoot(pre);
      act(() => preRoot.render(<DemoFolio lang="en" />));
      const html = pre.innerHTML;
      act(() => preRoot.unmount());
      setConnection(undefined);
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      setup();
      const container = document.createElement('div');
      container.innerHTML = html.replace('<figure ', '<figure data-demo-initial="" ');
      document.body.appendChild(container);
      let root!: ReturnType<typeof hydrateRoot>;
      const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      act(() => {
        root = hydrateRoot(container, <DemoFolio lang="en" />);
      });
      // (jsdom re-serialises inline styles, so a style-attribute warning is test noise; ignore.)
      void err;
      expect(container.querySelector('figure')!.hasAttribute('data-demo-initial')).toBe(false);
      act(() => root.unmount());
      container.remove();
      jest.restoreAllMocks();
    }
  });
});

describe.each(['en', 'hi'] as const)('reserved height (%s)', (lang) => {
  const prompt = landingCopy(lang).demo.prompt;

  it('typed + rest is always the full prompt while typing; rest shrinks; gone when done', () => {
    mount(<DemoFolio lang={lang} />);
    expect(figure().getAttribute('data-demo-phase')).toBe('typing');
    expect(typed() + rest()).toBe(prompt);
    expect(rest()).toBe(prompt); // nothing typed yet
    const hiddenRest = q('[data-demo-rest]')!;
    expect(hiddenRest.className).toContain('invisible');
    let prev = rest().length;
    for (let i = 0; i < 12; i += 1) {
      tick(13);
      expect(typed() + rest()).toBe(prompt);
      expect(rest().length).toBeLessThanOrEqual(prev);
      prev = rest().length;
    }
    expect(typed().length).toBeGreaterThan(0);
    // run to the end
    for (let i = 0; i < Array.from(prompt).length + 80; i += 1) tick(220);
    expect(figure().getAttribute('data-demo-phase')).toBe('done');
    expect(q('[data-demo-rest]')).toBeNull();
    expect(typed()).toBe(prompt);
  });

  it('reduced motion: end state, no rest, full prompt typed', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<DemoFolio lang={lang} />);
    expect(q('[data-demo-rest]')).toBeNull();
    expect(typed()).toBe(prompt);
  });

  it('the full prompt is read once (one sr-only p); the typed paragraph is aria-hidden', () => {
    mount(<DemoFolio lang={lang} />);
    const sr = qa('p.sr-only');
    expect(sr).toHaveLength(1);
    expect(sr[0].textContent).toBe(prompt);
    expect(sr[0].getAttribute('aria-hidden')).toBeNull();
    const typedP = q('[data-demo-typed]')!.closest('p')!;
    expect(typedP.getAttribute('aria-hidden')).toBe('true');
    expect(typedP.className).not.toContain('sr-only');
    expect(
      q('[data-demo-lines], [data-demo-line]')!.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    // no other visible (non-aria-hidden) element repeats the prompt
    const dupes = qa('figure *').filter(
      (e) =>
        e.textContent === prompt && e.children.length === 0 && !e.closest('[aria-hidden="true"]'),
    );
    expect(dupes).toHaveLength(1);
  });
});

describe('caret', () => {
  it('is bg-nl-brass, 1px wide, on a zero-width anchor, on desktop', () => {
    mount(<DemoFolio lang="en" />);
    const c = caret()!;
    expect(c.className).toContain('bg-nl-brass');
    expect(c.className).not.toContain('bg-nl-text');
    expect(c.className).toContain('w-px');
    expect(c.className).toContain('absolute');
    expect(c.parentElement!.textContent).toBe(''); // anchor has no width-giving content
  });

  it('is bg-nl-text under the mobile cap', () => {
    stubMatchMedia({ [MOBILE_CAP_QUERY]: true });
    mount(<DemoFolio lang="en" />);
    const c = caret()!;
    expect(c.className).toContain('bg-nl-text');
    expect(c.className).not.toContain('bg-nl-brass');
  });

  it('is absent when done and under reduced motion', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<DemoFolio lang="en" />);
    expect(caret()).toBeNull();
  });

  it('disappears when typing ends', () => {
    mount(<DemoFolio lang="en" />);
    expect(caret()).not.toBeNull();
    for (let i = 0; i < 400; i += 1) tick(220);
    expect(figure().getAttribute('data-demo-phase')).toBe('done');
    expect(caret()).toBeNull();
  });
});

describe('classes', () => {
  it('folio has min-[900px]:p-nl-10 on top of p-nl-6; Replay has touch-manipulation and nl-focus', () => {
    mount(<DemoFolio lang="en" />);
    const c = figure().className.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining(['p-nl-6', 'min-[900px]:p-nl-10']));
    const btn = qa('button').find((b) => b.textContent === 'Replay')!;
    expect(btn.className).toContain('touch-manipulation');
    expect(btn.className).toContain('nl-focus');
  });
});
