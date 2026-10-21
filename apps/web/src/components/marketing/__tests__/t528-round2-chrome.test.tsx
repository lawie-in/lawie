/**
 * T-528 round 2: the footer sits on the Wall (no Wood), CONTROL_LINE keeps its fallback, the sticky
 * bar's scroll padding is built from NL_STICKY_BAR_HEIGHT, and the nav links show from 1120px only (Rajesh's ruling).
 * break-ui: Hindi (the tallest wrapped bar) keeps the style and the marker. jsdom has no layout, so
 * the breakpoint behaviour is asserted through the classes and the CSS text.
 */
import { NightFooter } from '../NightFooter';
import { NightTopBar, NL_STICKY_BAR_CSS, NL_STICKY_BAR_HEIGHT } from '../NightTopBar';
import { CONTROL_LINE, NL_GHOST_HOVER, nlLinkButton } from '../nl-link';

import { cleanupMounted, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => cleanupMounted());

// One source for the nav breakpoint: the last media rule of the bar's CSS. The pinned value is
// Rajesh's ruling (1120px, relayed by Priya); the class and the rule must both follow it.
const NAV_BP = Number(/min-width:(\d+)px[^@]*$/.exec(NL_STICKY_BAR_CSS)![1]);
// A fixed string, never a template literal: an interpolated arbitrary min- breakpoint in any scanned
// file is a bad Tailwind candidate that drops every arbitrary breakpoint. The test below pins it to NAV_BP.
const NAV_ON = 'min-[1120px]:inline-flex';
const navLinks = () =>
  qa('a').filter((a) => cls(a).some((c) => /^min-\[\d+px\]:inline-flex$/.test(c)));

describe('NightFooter ground', () => {
  it('has no bg-nl-wood and keeps border-t border-nl-line', () => {
    mount(<NightFooter />);
    const c = cls(q('footer'));
    expect(c).not.toContain('bg-nl-wood');
    expect(c).toEqual(expect.arrayContaining(['border-t', 'border-nl-line']));
    expect(qa('footer .bg-nl-wood')).toHaveLength(0);
  });

  it('Hindi: the same ground', () => {
    mount(<NightFooter lang="hi" />);
    expect(cls(q('footer'))).not.toContain('bg-nl-wood');
  });
});

describe('CONTROL_LINE', () => {
  it('reads --line-control and falls back to --line until T-525 lands the token', () => {
    expect(CONTROL_LINE).toBe('border-[color:var(--line-control,var(--line))]');
    expect(CONTROL_LINE).toContain('var(--line-control,var(--line))');
  });

  it('the ghost link rests on it and not on border-nl-line', () => {
    const c = nlLinkButton('ghost').split(/\s+/);
    expect(c).toContain(CONTROL_LINE);
    expect(c).not.toContain('border-nl-line');
    expect(c).toContain('border');
  });

  it('the ghost hover keeps its colour fade under reduced motion', () => {
    expect(NL_GHOST_HOVER).not.toContain('motion-reduce:transition-none');
    expect(NL_GHOST_HOVER).toContain('duration-150');
    expect(NL_GHOST_HOVER).toContain('ease-[ease]');
  });
});

describe('NL_STICKY_BAR_CSS', () => {
  const calc = (px: number) => `calc(${px}px + env(safe-area-inset-top,0px))`;

  it('has a media rule from 720px and one from 1120px, built from NL_STICKY_BAR_HEIGHT', () => {
    expect(NL_STICKY_BAR_CSS).toContain(
      `@media (min-width:720px){html{scroll-padding-top:${calc(NL_STICKY_BAR_HEIGHT.wrapped)}}}`,
    );
    expect(NL_STICKY_BAR_CSS).toContain(
      `@media (min-width:${NAV_BP}px){html{scroll-padding-top:${calc(NL_STICKY_BAR_HEIGHT.row)}}}`,
    );
    expect(NL_STICKY_BAR_CSS.match(/@media/g)).toHaveLength(2);
    expect(NAV_BP).toBe(1120);
    expect(Number(/^min-\[(\d+)px\]:inline-flex$/.exec(NAV_ON)![1])).toBe(NAV_BP);
    // The nav-breakpoint rule comes last so it wins the cascade.
    expect(NL_STICKY_BAR_CSS.indexOf(`min-width:${NAV_BP}px`)).toBeGreaterThan(
      NL_STICKY_BAR_CSS.indexOf('min-width:720px'),
    );
  });

  it('the wrapped (720-1023) padding is never smaller than the one-row padding', () => {
    expect(NL_STICKY_BAR_HEIGHT.wrapped).toBeGreaterThanOrEqual(NL_STICKY_BAR_HEIGHT.row);
  });

  it('is rendered inside the data-nl-sticky-bar marker, once, with no padding below 720px', () => {
    mount(<NightTopBar lang="en" onLangChange={() => undefined} />);
    const marker = q('[data-nl-sticky-bar]')!;
    expect(cls(marker)).toContain('contents');
    const styles = qa('style', marker);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(NL_STICKY_BAR_CSS);
    expect(marker.querySelector('header')).not.toBeNull();
    // Every scroll-padding-top declaration sits inside a min-width media rule.
    expect(NL_STICKY_BAR_CSS.replace(/@media \(min-width:\d+px\)\{[^{}]*\{[^{}]*\}\}/g, '')).toBe(
      '',
    );
  });

  it('Hindi: the marker and style are still there; the style leaves the DOM with the bar', () => {
    const m = mount(<NightTopBar lang="hi" onLangChange={() => undefined} showNav />);
    expect(q('[data-nl-sticky-bar] style')!.textContent).toBe(NL_STICKY_BAR_CSS);
    m.unmount();
    expect(q('[data-nl-sticky-bar]')).toBeNull();
    expect(document.querySelectorAll('style')).toHaveLength(0);
  });
});

describe('NightTopBar nav links from 1120px', () => {
  const NAV_TEXT = /how|document|price|faq|कैसे|दस्तावेज़|कीमत|प्रश्न/i;

  it('en: every nav link is display:none below 1120 (hidden) and inline-flex from 1120', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    const links = qa('nav a, header a[href^="#"], header a[href="/pricing"]').filter((a) =>
      cls(a).includes('nl-body-sm'),
    );
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const a of links) {
      expect(cls(a)).toEqual(expect.arrayContaining(['hidden', NAV_ON]));
      expect(cls(a)).not.toContain('inline-flex');
      expect(a.textContent).toMatch(NAV_TEXT);
    }
  });

  it('the links are in the DOM (so they exist from 1120) and point at the four anchors', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    const hrefs = navLinks().map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#how-it-works', '#documents', '#prices', '#faq']);
  });

  it('Hindi: the same classes on the Hindi labels', () => {
    mount(<NightTopBar lang="hi" showNav onLangChange={() => undefined} />);
    const links = navLinks();
    expect(links).toHaveLength(4);
    for (const a of links) expect(cls(a)).toContain('hidden');
  });

  it('at 1024 and 1023 the class does not enable the nav (only the 1120 variant, never 1024)', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    const links = navLinks();
    expect(links).toHaveLength(4);
    for (const a of links) {
      expect(cls(a)).not.toContain('min-[1024px]:inline-flex');
      expect(cls(a).filter((c) => /^min-\[\d+px\]:/.test(c))).toEqual([NAV_ON]);
      expect(cls(a)).not.toContain('inline-flex');
    }
    expect(NAV_BP).toBeGreaterThan(1024);
  });

  it('break-ui, Hindi labels between 1120 and 1280: links stay single-row targets (min-h 44, no fixed width or clipping)', () => {
    mount(<NightTopBar lang="hi" showNav onLangChange={() => undefined} />);
    for (const a of navLinks()) {
      expect(a.textContent!.trim().length).toBeGreaterThan(0);
      expect(cls(a)).toContain('min-h-[44px]');
      expect(a.className).not.toMatch(/(?<![-\w])(w|h)-\[|truncate|overflow-|line-clamp/);
    }
  });

  it('showNav off renders no nav links at all', () => {
    mount(<NightTopBar lang="en" onLangChange={() => undefined} />);
    expect(navLinks()).toHaveLength(0);
  });

  it('the bar stays sticky from 720px, independent of the nav change', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    expect(cls(q('header'))).toContain('min-[720px]:sticky');
  });
});
