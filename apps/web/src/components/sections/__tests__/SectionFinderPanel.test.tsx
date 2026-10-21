// T-525 stage A: the section finder shell: inert when closed, focus in/out, rail visibility
// classes, shortcut copy by route, ARIA tabs, Ctrl/Cmd+K, and the modal dialog below md.
import { usePathname } from 'next/navigation';
import { act } from 'react';

import { SECTION_FINDER_OPEN_EVENT, SectionFinderPanel } from '../SectionFinderPanel';

import {
  cleanupMounted,
  mount,
  press,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const NARROW = '(max-width: 767.98px)';
const aside = () => document.querySelector('aside') as HTMLElement;
const rail = () =>
  document.querySelector('button[aria-label^="Open section finder"]') as HTMLButtonElement | null;
const tabs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
const openEvent = (detail?: unknown) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(SECTION_FINDER_OPEN_EVENT, { detail }));
  });
const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const isOpen = () => !aside().hasAttribute('inert');

async function page(path = '/dashboard/documents', inline = false) {
  (usePathname as jest.Mock).mockReturnValue(path);
  mount(<SectionFinderPanel inline={inline} />);
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  stubMatchMedia();
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ bookmarks: [], recent: [] }),
  });
  Object.defineProperty(window.navigator, 'platform', {
    value: 'Linux x86_64',
    configurable: true,
  });
});
afterEach(cleanupMounted);

describe('closed state', () => {
  it('the aside is inert and aria-hidden', async () => {
    await page();
    expect(aside().hasAttribute('inert')).toBe(true);
    expect(aside().getAttribute('aria-hidden')).toBe('true');
    expect(aside().getAttribute('role')).toBeNull();
  });

  it('nothing inside the closed panel is a tab stop that is not also inert', async () => {
    await page();
    // inert removes every descendant from the tab order; assert the contract on the container
    const stops = Array.from(aside().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.tabIndex >= 0,
    );
    expect(stops.length).toBeGreaterThan(0); // they exist...
    expect(stops.every((el) => el.closest('[inert]') === aside())).toBe(true); // ...but are inert
  });

  it('does not steal focus on page load', async () => {
    await page();
    expect(document.activeElement).toBe(document.body);
  });

  it('the rail is hidden below 1280px and a 44px flex column from xl', async () => {
    await page();
    const r = rail() as HTMLButtonElement;
    expect(r.className).toContain('hidden');
    expect(r.className).toContain('xl:flex');
    expect(r.className).toContain('w-11');
    expect(r.className).not.toMatch(/(^|\s)flex(\s|$)/);
  });
});

describe('shortcut copy by route', () => {
  it('advertises Ctrl+K off /dashboard (rail label, rail text, search hint)', async () => {
    await page('/dashboard/documents');
    expect(rail()?.getAttribute('aria-label')).toBe('Open section finder (Ctrl+K)');
    expect(rail()?.textContent).toContain('Ctrl+K');
    expect(
      aside().querySelector('input[type="search"]')?.parentElement?.querySelector('kbd')
        ?.textContent,
    ).toBe('Ctrl+K');
  });

  it('advertises the Mac key on a Mac', async () => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    await page('/dashboard/documents');
    expect(rail()?.getAttribute('aria-label')).toBe('Open section finder (⌘K)');
  });

  it('drops the shortcut on /dashboard: no rail suffix, no kbd hint', async () => {
    await page('/dashboard');
    expect(rail()?.getAttribute('aria-label')).toBe('Open section finder');
    expect(rail()?.textContent).toBe('Section finder');
    // the search box has no hint (the Tip sentence's own kbd is a separate element)
    expect(
      aside().querySelector('input[type="search"]')?.parentElement?.querySelector('kbd'),
    ).toBeNull();
    expect(aside().querySelector('input[type="search"]')?.className).not.toContain('pr-16');
  });

  it('keeps the shortcut in the Tip sentence on /dashboard', async () => {
    await page('/dashboard');
    expect(aside().textContent).toMatch(/Ctrl\+K|⌘K/);
  });

  it('a null pathname counts as not /dashboard', async () => {
    await page(null as unknown as string);
    expect(rail()?.getAttribute('aria-label')).toBe('Open section finder (Ctrl+K)');
  });
});

describe('opening and closing', () => {
  it('SECTION_FINDER_OPEN_EVENT opens it: inert gone, rail gone, focus on the search box', async () => {
    await page();
    openEvent();
    expect(isOpen()).toBe(true);
    expect(aside().getAttribute('aria-hidden')).toBe('false');
    expect(rail()).toBeNull();
    expect(document.activeElement).toBe(aside().querySelector('input[type="search"]'));
  });

  it('the rail click opens it and Escape closes it, returning focus to the opener', async () => {
    await page();
    const r = rail() as HTMLButtonElement;
    r.focus();
    act(() => r.click());
    expect(isOpen()).toBe(true);
    press(document.activeElement as Element, { key: 'Escape' });
    expect(isOpen()).toBe(false);
    // the rail is rendered again; focus is not lost to <body>
    expect(document.activeElement).not.toBe(document.body);
  });

  it('closing with the X button returns focus to the element that had it', async () => {
    await page();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    openEvent();
    expect(opener).not.toBe(document.activeElement);
    act(() =>
      (aside().querySelector('[aria-label="Close section finder"]') as HTMLElement).click(),
    );
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('opening twice is idempotent and keeps one aside', async () => {
    await page();
    openEvent();
    openEvent();
    expect(document.querySelectorAll('aside')).toHaveLength(1);
    expect(isOpen()).toBe(true);
  });

  it('an open event with a preload focuses the close button, not a missing search box', async () => {
    mockApiFetch.mockImplementation(async (url: string) =>
      url.includes('/bookmarks') || url.includes('/recent')
        ? { ok: true, status: 200, json: async () => ({ bookmarks: [], recent: [] }) }
        : { ok: false, status: 404, json: async () => ({}) },
    );
    await page();
    openEvent({ preload: { code: 'IPC', section: '302' } });
    await flush();
    expect(aside().contains(document.activeElement)).toBe(true);
  });

  it('stored open state is restored on a wide screen without moving focus', async () => {
    window.localStorage.setItem('lawie.sectionFinder.open', 'true');
    await page();
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it('stored open state is NOT restored below md', async () => {
    window.localStorage.setItem('lawie.sectionFinder.open', 'true');
    stubMatchMedia({ [NARROW]: true });
    await page();
    expect(isOpen()).toBe(false);
  });

  it('inline mode renders the body only (no aside, no rail)', async () => {
    await page('/dashboard/documents', true);
    expect(document.querySelector('aside')).toBeNull();
    expect(rail()).toBeNull();
  });
});

describe('Ctrl/Cmd+K and F11', () => {
  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
  ])('%s + k toggles the panel (window listener, bubbles from any target)', async (_n, mod) => {
    await page();
    const ev = press(document.body, { key: 'k', ...mod });
    expect(ev.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(true);
    press(document.activeElement as Element, { key: 'K', ...mod });
    expect(isOpen()).toBe(false);
  });

  it('plain k does nothing', async () => {
    await page();
    press(document.body, { key: 'k' });
    expect(isOpen()).toBe(false);
  });

  it('F11 toggles panel/drawer mode only while open and remembers it', async () => {
    await page();
    const before = aside().className;
    press(document.body, { key: 'F11' });
    expect(aside().className).toBe(before);
    openEvent();
    const ev = press(document.activeElement as Element, { key: 'F11' });
    expect(ev.defaultPrevented).toBe(true);
    expect(aside().className).not.toBe(before);
    expect(window.localStorage.getItem('lawie.sectionFinder.mode')).toBe('drawer');
  });
});

describe('tabs', () => {
  it('Lookup, Recent, Bookmarks with tablist/tab/tabpanel wiring and roving tabindex', async () => {
    await page();
    expect(aside().querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs().map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual([
      'Lookup',
      'Recent',
      'Bookmarks',
    ]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    const panel = aside().querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
  });

  it('arrows wrap, Home/End jump, focus follows and the panel is relabelled', async () => {
    await page();
    openEvent();
    tabs()[0].focus();
    press(tabs()[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[1]);
    press(tabs()[1], { key: 'ArrowRight' });
    press(tabs()[2], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[0]);
    press(tabs()[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs()[2]);
    press(tabs()[2], { key: 'Home' });
    expect(document.activeElement).toBe(tabs()[0]);
    press(tabs()[0], { key: 'End' });
    expect(document.activeElement).toBe(tabs()[2]);
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    expect(aside().querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      tabs()[2].id,
    );
  });

  it('arrowing back to Lookup does not steal focus into the search box', async () => {
    await page();
    openEvent();
    tabs()[0].focus();
    press(tabs()[0], { key: 'ArrowRight' });
    press(tabs()[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs()[0]);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });
});

describe('below md: a modal dialog', () => {
  it('open: role=dialog, aria-modal, labelled by the h2; closed: neither', async () => {
    stubMatchMedia({ [NARROW]: true });
    await page();
    expect(aside().getAttribute('role')).toBeNull();
    openEvent();
    const a = aside();
    expect(a.getAttribute('role')).toBe('dialog');
    expect(a.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(a.getAttribute('aria-labelledby') as string)?.textContent).toBe(
      'Section finder',
    );
  });

  it('wide: open has no dialog role (it is a side panel)', async () => {
    await page();
    openEvent();
    expect(aside().getAttribute('role')).toBeNull();
    expect(aside().hasAttribute('aria-modal')).toBe(false);
  });

  it('Tab on the last control wraps to the first; Shift+Tab on the first wraps to the last', async () => {
    stubMatchMedia({ [NARROW]: true });
    await page();
    openEvent();
    // jsdom has no layout: every offsetParent is null, so only the focused element is "visible"
    // to the trap; give the others a layout box for this test.
    const items = Array.from(aside().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled,
    );
    items.forEach((el) =>
      Object.defineProperty(el, 'offsetParent', { configurable: true, get: () => document.body }),
    );
    const first = items[0];
    const last = items[items.length - 1];
    last.focus();
    const fwd = press(last, { key: 'Tab' });
    expect(fwd.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const back = press(first, { key: 'Tab', shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('the backdrop closes it', async () => {
    stubMatchMedia({ [NARROW]: true });
    await page();
    openEvent();
    act(() =>
      (document.querySelector('div[aria-hidden="true"].fixed.inset-0') as HTMLElement).click(),
    );
    expect(isOpen()).toBe(false);
  });

  it('crossing to wide while open drops the dialog role', async () => {
    const mm = stubMatchMedia({ [NARROW]: true });
    await page();
    openEvent();
    expect(aside().getAttribute('role')).toBe('dialog');
    mm.set(NARROW, false);
    expect(aside().getAttribute('role')).toBeNull();
  });
});

describe('offline / hostile data', () => {
  it('a rejecting bookmarks/recent fetch does not break the shell', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('offline'));
    await page();
    openEvent();
    expect(isOpen()).toBe(true);
  });

  it('a bookmarks body without arrays falls back to empty', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await page();
    openEvent();
    expect(tabs()).toHaveLength(3);
  });
});

describe('reduced motion and compact-mode toggle (T-525)', () => {
  it('the aside slide drops its transition under prefers-reduced-motion', async () => {
    await page();
    expect(aside().className).toContain('transition-transform');
    expect(aside().className).toContain('motion-reduce:transition-none');
    expect(aside().className).toContain('motion-reduce:duration-0');
  });

  it('the Lookup, Recent and Bookmarks tab buttons drop their transition', async () => {
    await page();
    openEvent();
    const t = tabs();
    expect(t.map((x) => x.textContent)).toEqual([
      expect.stringContaining('Lookup'),
      expect.stringContaining('Recent'),
      expect.stringContaining('Bookmarks'),
    ]);
    for (const tab of t) {
      expect(tab.className).toContain('transition-colors');
      expect(tab.className).toContain('motion-reduce:transition-none');
      expect(tab.className).toContain('motion-reduce:duration-0');
    }
  });

  it('the mode toggle is hidden below md and named for the mode in both states', async () => {
    await page();
    openEvent();
    const toggle = () =>
      document.querySelector('button[aria-label^="Switch to"]') as HTMLButtonElement;
    expect(toggle().className.split(/\s+/)).toContain('max-md:hidden');
    const first = toggle().getAttribute('aria-label');
    expect(first).toMatch(/\(F11\)$/);
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-label')).not.toBe(first);
    expect(toggle().className.split(/\s+/)).toContain('max-md:hidden');
  });
});
