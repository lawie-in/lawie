// T-517 AC3: the landing demo types progressively, shows the end state under reduced motion and
// on slow connections (Replay plays it), and pauses while the tab is hidden.
import { act } from 'react';

import { DemoFolio, DEMO_LINE_WIDTHS } from '../DemoFolio';

import { landingCopy } from '@/components/marketing/nl-copy';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { MOBILE_CAP_QUERY, REDUCED_MOTION_QUERY } from '@/components/ui/motion';

const PROMPT = landingCopy('en').demo.prompt;
const PROMPT_HI = landingCopy('hi').demo.prompt;

const typed = () => q('p[aria-hidden="true"]')!.textContent ?? '';
const phase = () => q('figure')!.getAttribute('data-demo-phase');
const visibleLines = () => qa('[data-demo-line]').filter((e) => !e.className.includes('invisible'));
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const replay = () => click(qa('button').find((b) => b.textContent === 'Replay')!);

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
}

function setConnection(value: unknown) {
  Object.defineProperty(navigator, 'connection', { configurable: true, value });
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  setVisibility('visible');
  setConnection(undefined);
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  setConnection(undefined);
});

describe('DemoFolio (T-517 AC3)', () => {
  it('starts empty and types one character per 13 ms', () => {
    mount(<DemoFolio lang="en" />);
    expect(phase()).toBe('typing');
    expect(typed()).toBe('');
    for (let i = 1; i <= 5; i += 1) {
      tick(13);
      expect(typed()).toBe(Array.from(PROMPT).slice(0, i).join(''));
    }
    expect(visibleLines()).toHaveLength(0);
  });

  it('finishes the prompt, then reveals the placeholder lines and ends', () => {
    mount(<DemoFolio lang="en" />);
    const n = Array.from(PROMPT).length;
    for (let i = 0; i < n; i += 1) tick(13);
    expect(typed()).toBe(PROMPT);
    for (let i = 0; i < 40 && phase() !== 'done'; i += 1) tick(220);
    expect(phase()).toBe('done');
    expect(visibleLines()).toHaveLength(DEMO_LINE_WIDTHS.length);
  });

  it('keeps the full prompt and the caption for assistive tech and shows no draft text', () => {
    mount(<DemoFolio lang="en" />);
    expect(q('p.sr-only')!.textContent).toBe(PROMPT);
    expect(q('figcaption')!.textContent).toContain('Example only. Not a real matter.');
    expect(q('figure')!.textContent).not.toMatch(/IN THE (HIGH )?COURT/i);
  });

  it('types faster (9 ms) under the mobile cap', () => {
    stubMatchMedia({ [MOBILE_CAP_QUERY]: true });
    mount(<DemoFolio lang="en" />);
    tick(9);
    expect(typed()).toBe(Array.from(PROMPT)[0]);
  });

  it('reduced motion: the end state at once; Replay keeps the end state', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    mount(<DemoFolio lang="en" />);
    expect(phase()).toBe('done');
    expect(typed()).toBe(PROMPT);
    expect(visibleLines()).toHaveLength(DEMO_LINE_WIDTHS.length);
    replay();
    tick(5000);
    expect(phase()).toBe('done');
    expect(typed()).toBe(PROMPT);
  });

  it('reduced motion switched on mid-play jumps to the end state', () => {
    const mm = stubMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    mount(<DemoFolio lang="en" />);
    tick(13 * 3);
    expect(phase()).toBe('typing');
    mm.set(REDUCED_MOTION_QUERY, true);
    expect(phase()).toBe('done');
    expect(typed()).toBe(PROMPT);
  });

  it.each([
    ['saveData', { saveData: true }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['2g', { effectiveType: '2g' }],
    ['3g', { effectiveType: '3g' }],
  ])('%s: starts in the end state and plays only on Replay', (_n, connection) => {
    setConnection(connection);
    mount(<DemoFolio lang="en" />);
    expect(phase()).toBe('done');
    expect(typed()).toBe(PROMPT);
    tick(2000);
    expect(phase()).toBe('done');
    replay();
    expect(phase()).toBe('typing');
    expect(typed()).toBe('');
    tick(13);
    expect(typed()).toBe(Array.from(PROMPT)[0]);
  });

  it('a fast connection (4g) plays on load', () => {
    setConnection({ effectiveType: '4g', saveData: false });
    mount(<DemoFolio lang="en" />);
    expect(phase()).toBe('typing');
  });

  it('pauses while the tab is hidden and resumes on return', () => {
    mount(<DemoFolio lang="en" />);
    tick(13);
    tick(13);
    expect(typed()).toHaveLength(2);
    setVisibility('hidden');
    tick(5000);
    expect(typed()).toHaveLength(2);
    expect(jest.getTimerCount()).toBe(0);
    setVisibility('visible');
    tick(13);
    expect(typed().length).toBeGreaterThan(2);
  });

  it('Replay restarts from empty while playing', () => {
    mount(<DemoFolio lang="en" />);
    for (let i = 0; i < 10; i += 1) tick(13);
    replay();
    expect(typed()).toBe('');
    expect(phase()).toBe('typing');
  });

  it('shows the Hindi prompt and Hindi Replay label in hi', () => {
    mount(<DemoFolio lang="hi" />);
    expect(q('p.sr-only')!.textContent).toBe(PROMPT_HI);
    expect(qa('button').some((b) => b.textContent === landingCopy('hi').demo.replay)).toBe(true);
  });
});
