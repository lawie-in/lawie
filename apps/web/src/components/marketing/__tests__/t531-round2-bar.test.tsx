/**
 * T-531 round 2 (Rajesh M2): the marketing bar keeps its menu up to 1119px. From 720 to 1119 the
 * row is the mark, Sign in, the full call to action and the menu (nav and the two toggles inside,
 * not Sign in or the CTA); from 1120 the nav and the toggles are in the row and the menu is gone.
 * jsdom has no layout: the breakpoints are asserted through the exact class strings and the media
 * query the menu subscribes to. Real widths are in the browser smoke.
 */
import { act } from 'react';

import { NightTopBar } from '../NightTopBar';
import { SIGNIN_HREF, SIGNUP_HREF, landingCopy, TOP_BAR_COPY } from '../nl-copy';

import { ThemeProvider } from '@/components/shell/ThemeProvider';
import { TOP_BAR_MENU_HIDE } from '@/components/shell/TopBarMenu';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const TRIGGER = '[data-topbar-menu-trigger]';
const MENU = '[data-topbar-menu]';

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia();
});
afterEach(cleanupMounted);

const bar = (props: React.ComponentProps<typeof NightTopBar> = {}) => (
  <ThemeProvider>
    <NightTopBar showNav onLangChange={() => undefined} {...props} />
  </ThemeProvider>
);

describe.each(['en', 'hi'] as const)('NightTopBar round 2 (%s)', (lang) => {
  const copy = landingCopy(lang);

  it('the menu trigger is hidden from 1120px (min-[1120px]:hidden), never from 720px', () => {
    mount(bar({ lang }));
    const c = cls(q(TRIGGER));
    expect(c).toContain('min-[1120px]:hidden');
    expect(c).not.toContain('min-[720px]:hidden');
    expect(c).not.toContain('hidden');
  });

  it('the menu force-closes on (min-width: 1120px), the marketing bar query', () => {
    expect(TOP_BAR_MENU_HIDE[1120].query).toBe('(min-width: 1120px)');
    expect(TOP_BAR_MENU_HIDE[1120].className).toBe('min-[1120px]:hidden');
    const mm = stubMatchMedia();
    mount(bar({ lang }));
    // It subscribes to 1120, not to 720.
    expect(mm.listenerCount('(min-width: 1120px)')).toBeGreaterThan(0);
    expect(mm.listenerCount('(min-width: 720px)')).toBe(0);
  });

  it('the row: toggles sit in `hidden min-[1120px]:flex`; Sign in and the full CTA are in the row from 720', () => {
    mount(bar({ lang }));
    const header = q('header')!;
    const signIn = q(`header a[href="${SIGNIN_HREF}"]`)!;
    const cta = q(`header a[href="${SIGNUP_HREF}"]`) as HTMLElement;
    expect(signIn.textContent).toBe(copy.nav.signIn);
    // The CTA in the row is the full signed one; the phone "Start free" is a separate link.
    const full = qa(`header a[href="${SIGNUP_HREF}"]`).filter((a) => a.textContent === copy.cta);
    expect(full).toHaveLength(1);
    expect(cta).not.toBeNull();

    // Sign in and the full CTA share the TopBar actions wrapper: hidden below 720, flex from 720.
    const actions = full[0].parentElement!;
    expect(signIn.parentElement).toBe(actions);
    expect(cls(actions)).toEqual(expect.arrayContaining(['hidden', 'min-[720px]:flex']));

    // The toggles' wrapper is the other child of that wrapper: hidden until 1120.
    const toggles = Array.from(actions.children).find((e) => e.querySelector('fieldset'))!;
    expect(cls(toggles)).toEqual(expect.arrayContaining(['hidden', 'min-[1120px]:flex']));
    expect(toggles.querySelector('[aria-pressed]')).not.toBeNull(); // the language toggle
    // Toggle wrapper comes before Sign in and the CTA.
    const order = Array.from(actions.children);
    expect(order.indexOf(toggles)).toBeLessThan(order.indexOf(signIn));
    expect(header.contains(toggles)).toBe(true);
  });

  it('the phone call to action ("Start free" / "मुफ़्त शुरू कीजिए") shows below 720px only', () => {
    mount(bar({ lang }));
    const phone = qa(`header a[href="${SIGNUP_HREF}"]`).find(
      (a) => a.textContent === TOP_BAR_COPY[lang].cta,
    )!;
    expect(cls(phone.parentElement)).toContain('min-[720px]:hidden');
  });

  it('in the menu: Sign in is wrapped in min-[720px]:hidden; there is no CTA and no signup link', () => {
    mount(bar({ lang }));
    click(q(TRIGGER));
    const menu = q(MENU)!;
    const signIn = q(`a[href="${SIGNIN_HREF}"]`, menu)!;
    expect(signIn.textContent).toBe(copy.nav.signIn);
    expect(cls(signIn.parentElement)).toContain('min-[720px]:hidden');
    expect(q(`a[href="${SIGNUP_HREF}"]`, menu)).toBeNull();
    expect(menu.textContent).not.toContain(copy.cta);
  });

  it('in the menu: the named nav (4 links), the language toggle and one theme fieldset', () => {
    mount(bar({ lang }));
    click(q(TRIGGER));
    const menu = q(MENU)!;
    const nav = q('nav', menu)!;
    expect(nav.getAttribute('aria-label')).toBe(TOP_BAR_COPY[lang].navLabel);
    expect(qa('a', nav)).toHaveLength(4);
    expect(qa('[aria-pressed]', menu)).toHaveLength(2);
    expect(qa('fieldset', menu)).toHaveLength(1);
  });

  it('the bar <nav> shows from 1120 only (hidden min-[1120px]:flex)', () => {
    mount(bar({ lang }));
    const nav = q('header > div nav')!;
    expect(cls(nav)).toEqual(expect.arrayContaining(['hidden', 'min-[1120px]:flex']));
    expect(cls(nav).some((c) => c.startsWith('min-[720px]:'))).toBe(false);
  });
});

describe('NightTopBar round 2: no actions (login)', () => {
  it('has no Sign in, no CTA and no phone action; the menu keeps the theme fieldset', () => {
    mount(bar({ showNav: false, onLangChange: undefined, showActions: false }));
    expect(qa(`header a[href="${SIGNUP_HREF}"]`)).toHaveLength(0);
    expect(qa(`header a[href="${SIGNIN_HREF}"]`)).toHaveLength(0);
    click(q(TRIGGER));
    expect(qa('a', q(MENU)!)).toHaveLength(0);
    expect(qa('fieldset', q(MENU)!)).toHaveLength(1);
  });
});

describe('NightTopBar round 2: the viewport crossing 1120 closes the menu', () => {
  it('opened below 1120, it closes at 1120 and stays closed when narrowing again', () => {
    const mm = stubMatchMedia({ '(min-width: 1120px)': false });
    mount(bar());
    click(q(TRIGGER));
    expect(q(MENU)).not.toBeNull();
    mm.set('(min-width: 1120px)', true);
    expect(q(MENU)).toBeNull();
    mm.set('(min-width: 1120px)', false);
    expect(q(MENU)).toBeNull();
    act(() => undefined);
  });
});
