/**
 * T-528 round 2: the footer sits on the Wall (no Wood), CONTROL_LINE keeps its fallback, the sticky
 * bar's scroll padding is built from NL_STICKY_BAR_HEIGHT, and the nav shows from 1120px only (Rajesh's ruling).
 * T-531: one sticky 64px row at every width, so the scroll padding is a single unconditional rule
 * (`--nl-bar-h`, with the 65px fallback), and the 1120 gate sits on the <nav> landmark, not on each link.
 * break-ui: Hindi keeps the style and the marker. jsdom has no layout, so the breakpoint behaviour
 * is asserted through the classes and the CSS text.
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

// The pinned nav breakpoint is Rajesh's ruling (1120px, relayed by Priya). A fixed string, never a
// template literal: an interpolated arbitrary min- breakpoint in any scanned file is a bad Tailwind
// candidate that drops every arbitrary breakpoint (see __tests__/tailwind-content.test.ts).
const NAV_BP = 1120;
const NAV_ON = 'min-[1120px]:flex';
const navLinks = () => qa('header nav a');

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
  it('is one unconditional rule: scroll-padding-top from --nl-bar-h, falling back to NL_STICKY_BAR_HEIGHT.fallback plus the safe-area inset', () => {
    expect(NL_STICKY_BAR_HEIGHT).toEqual({ fallback: 65 });
    expect(NL_STICKY_BAR_CSS).toBe(
      `html{scroll-padding-top:var(--nl-bar-h,calc(${NL_STICKY_BAR_HEIGHT.fallback}px + env(safe-area-inset-top,0px)))}`,
    );
    expect(NL_STICKY_BAR_CSS).not.toContain('@media');
  });

  it('T-531: NL_STICKY_BAR_HEIGHT.wrapped and .row are gone (renamed to fallback)', () => {
    expect(Object.keys(NL_STICKY_BAR_HEIGHT)).toEqual(['fallback']);
  });

  it('is rendered inside the data-nl-sticky-bar marker, once', () => {
    mount(<NightTopBar lang="en" onLangChange={() => undefined} />);
    const marker = q('[data-nl-sticky-bar]')!;
    expect(cls(marker)).toContain('contents');
    const styles = qa('style', marker);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(NL_STICKY_BAR_CSS);
    expect(marker.querySelector('header')).not.toBeNull();
  });

  it('Hindi: the marker and style are still there; the style leaves the DOM with the bar', () => {
    const m = mount(<NightTopBar lang="hi" onLangChange={() => undefined} showNav />);
    expect(q('[data-nl-sticky-bar] style')!.textContent).toBe(NL_STICKY_BAR_CSS);
    m.unmount();
    expect(q('[data-nl-sticky-bar]')).toBeNull();
    expect(document.querySelectorAll('style')).toHaveLength(0);
  });
});

describe('NightTopBar nav from 1120px', () => {
  const NAV_TEXT = /how|document|price|faq|कैसे|दस्तावेज़|कीमत|प्रश्न/i;

  it('en: the <nav> is display:none below 1120 (hidden) and flex from 1120; the links are plain inline-flex', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    const navs = qa('header nav');
    expect(navs).toHaveLength(1);
    expect(cls(navs[0])).toEqual(expect.arrayContaining(['hidden', NAV_ON]));
    expect(cls(navs[0])).not.toContain('flex');
    const links = qa('a', navs[0]);
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const a of links) {
      expect(cls(a)).toContain('inline-flex');
      expect(cls(a).some((c) => /^min-\[\d+px\]:/.test(c))).toBe(false);
      expect(a.textContent).toMatch(NAV_TEXT);
    }
  });

  it('the links are in the DOM (so they exist from 1120) and point at the four anchors', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    const hrefs = navLinks().map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#how-it-works', '#documents', '#prices', '#faq']);
  });

  it('Hindi: the same gate on the Hindi labels', () => {
    mount(<NightTopBar lang="hi" showNav onLangChange={() => undefined} />);
    expect(cls(q('header nav'))).toEqual(expect.arrayContaining(['hidden', NAV_ON]));
    expect(navLinks()).toHaveLength(4);
  });

  it('only the 1120 variant gates the nav (never 720 or 1024), so 720-1119 shows no landmark', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    const c = cls(q('header nav'));
    expect(c.filter((x) => /^min-\[\d+px\]:/.test(x))).toEqual([
      NAV_ON,
      'min-[1120px]:items-center',
      'min-[1120px]:gap-nl-1',
    ]);
    expect(c).not.toContain('min-[1024px]:flex');
    expect(c).not.toContain('min-[720px]:flex');
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

  it('showNav off renders no nav landmark and no nav links in the bar', () => {
    mount(<NightTopBar lang="en" onLangChange={() => undefined} />);
    expect(qa('header nav')).toHaveLength(0);
    expect(navLinks()).toHaveLength(0);
  });

  it('the bar is sticky at every width (T-531), not from 720px', () => {
    mount(<NightTopBar lang="en" showNav onLangChange={() => undefined} />);
    expect(cls(q('header'))).toEqual(expect.arrayContaining(['sticky', 'top-0', 'z-30']));
    expect(cls(q('header')).some((c) => c.includes(':sticky'))).toBe(false);
  });
});
