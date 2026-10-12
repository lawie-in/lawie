import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import AnalyticsConsent, {
  CONSENT_ENDPOINT,
  CONSENT_STORAGE_KEY,
  CONSENT_STRINGS,
  CONSENT_TEXT_VERSION,
  deleteGaCookies,
  isConsentCurrent,
  openConsentSettings,
  readStoredConsent,
} from '../AnalyticsConsent';

// T-310 — consent before Google Analytics. Mounted with react-dom/client (no @testing-library/dom).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GA_ID = 'G-ZSMN1GPPB5';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

// Ajay's signed strings, typed out here independently of the source constant.
const S = {
  S1: 'Analytics cookies',
  S2: 'With your permission, Google Analytics counts visits to our public pages. It sets cookies and sends your IP address, browser details and the page address to Google. It loads only if you accept.',
  S3: 'Privacy Policy',
  S4_GRANTED: 'Your current choice: Accepted.',
  S4_DENIED: 'Your current choice: Declined.',
  S5: 'Decline',
  S6: 'Accept',
  S7: 'Choice saved. Analytics is on.',
  S8: 'Choice saved. Analytics is off.',
};

const mockPathname = usePathname as jest.Mock;
let fetchMock: jest.Mock;
let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(path = '/pricing') {
  mockPathname.mockReturnValue(path);
  await act(async () => {
    root.render(<AnalyticsConsent />);
  });
  await flush();
}

async function remount(path = '/pricing') {
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount(path);
}

const card = () => container.querySelector('section') as HTMLElement | null;
const buttons = () => Array.from(container.querySelectorAll('button'));
const btn = (label: string) => buttons().find((b) => b.textContent === label) as HTMLButtonElement;
const gaScripts = () => Array.from(document.querySelectorAll('script#lawie-gtag-js'));
const anyGtagScript = () =>
  Array.from(document.querySelectorAll('script')).filter((s) => s.src.includes('googletagmanager'));
const stored = () => JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) as string);
const status = () => container.querySelector('[role="status"]') as HTMLElement;
const winRec = () => window as unknown as Record<string, unknown>;

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

function pageViews(): Array<Record<string, string>> {
  const dl = (window.dataLayer ?? []) as ArrayLike<unknown>[];
  return dl
    .map((a) => Array.from(a))
    .filter((a) => a[0] === 'event' && a[1] === 'page_view')
    .map((a) => a[2] as Record<string, string>);
}

function setStored(over: Partial<Record<string, unknown>> = {}) {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({
      v: CONSENT_TEXT_VERSION,
      id: ID,
      choice: 'granted',
      at: new Date().toISOString(),
      synced: true,
      ...over,
    }),
  );
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearCookies();
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  document.documentElement.removeAttribute('data-lawie-splash');
  document.body.removeAttribute('data-consent-open');
  delete window.gtag;
  delete window.dataLayer;
  delete winRec()['__lawieAnalyticsGranted'];
  delete winRec()[`ga-disable-${GA_ID}`];
  fetchMock = jest.fn(() => Promise.resolve({ ok: true, status: 204 }));
  (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('no answer yet', () => {
  it('shows the card with S1-S3, Decline before Accept, same class, and loads nothing', async () => {
    await mount('/pricing');
    expect(gaScripts()).toHaveLength(0);
    expect(anyGtagScript()).toHaveLength(0);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);

    expect(card()).not.toBeNull();
    expect(container.querySelector('h2')!.textContent).toBe(S.S1);
    const desc = container.querySelector('#consent-desc')!;
    expect(desc.textContent).toBe(`${S.S2} ${S.S3}`);
    const link = desc.querySelector('a')!;
    expect(link.textContent).toBe(S.S3);
    expect(link.getAttribute('href')).toBe('/privacy#browser-storage');

    const bs = buttons();
    expect(bs.map((b) => b.textContent)).toEqual([S.S5, S.S6]);
    expect(bs[0].className).toBe(bs[1].className);
    expect(bs[0].className).toContain('h-11');
    expect(bs[0].className).toContain('sm:h-10');
    // No S4 on the first ask, no extra buttons or text.
    expect(container.textContent).not.toContain('Your current choice');
    expect(card()!.getAttribute('role')).toBeNull(); // a landmark, not a dialog
    expect(card()!.getAttribute('aria-labelledby')).toBe('consent-title');
    expect(card()!.getAttribute('aria-describedby')).toBe('consent-desc');
    expect(document.body.hasAttribute('data-consent-open')).toBe(true);
  });

  it("exports strings byte-exact with Ajay's signed text", () => {
    expect(CONSENT_STRINGS).toMatchObject({
      S1: S.S1,
      S2: S.S2,
      S3: S.S3,
      S4_GRANTED: S.S4_GRANTED,
      S4_DENIED: S.S4_DENIED,
      S5: S.S5,
      S6: S.S6,
      S7: S.S7,
      S8: S.S8,
      S9: 'Cookie settings',
      S10: 'Change cookie settings',
    });
  });

  it('removes a leftover _ga cookie on load without a granted choice', async () => {
    document.cookie = '_ga=GA1.1.1.1; path=/';
    document.cookie = '_ga_ZSMN1GPPB5=GS1.1.1; path=/';
    expect(document.cookie).toMatch(/_ga/);
    await mount('/');
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('keeps the status region present and empty', async () => {
    await mount('/');
    expect(status()).not.toBeNull();
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(status().textContent).toBe('');
  });
});

describe('card structure (design 2a: buttons stay visible when text grows)', () => {
  function scroller(): HTMLElement | null {
    return (
      Array.from(card()!.querySelectorAll<HTMLElement>('div')).find((d) =>
        d.className.split(/\s+/).includes('overflow-y-auto'),
      ) ?? null
    );
  }

  async function check(reopen: boolean) {
    if (reopen) {
      setStored({ choice: 'granted' });
      await mount('/pricing');
      await act(async () => openConsentSettings(null));
    } else {
      await mount('/pricing');
    }
    const sc = scroller()!;
    expect(sc).not.toBeNull();
    // The scrolling element is inside the card, holds the title, the description and the link.
    expect(card()!.contains(sc)).toBe(true);
    expect(sc.contains(container.querySelector('h2'))).toBe(true);
    expect(sc.contains(container.querySelector('#consent-desc'))).toBe(true);
    expect(sc.contains(container.querySelector('#consent-desc a'))).toBe(true);
    if (reopen) expect(sc.textContent).toContain(S.S4_GRANTED);
    // Neither button is inside the scrolling element, nor is it inside a scrolling ancestor.
    for (const b of buttons()) {
      expect(sc.contains(b)).toBe(false);
      for (let el: HTMLElement | null = b; el && el !== container; el = el.parentElement) {
        expect(el.className.split(/\s+/)).not.toContain('overflow-y-auto');
        expect(el.className.split(/\s+/)).not.toContain('overflow-auto');
      }
    }
    // The button row is a sibling after the scroller, directly in the card, and does not shrink.
    const row = buttons()[0].parentElement!;
    expect(row.parentElement).toBe(card());
    expect(row.contains(buttons()[1])).toBe(true);
    expect(sc.nextElementSibling).toBe(row);
    expect(row.className.split(/\s+/)).toContain('shrink-0');
    // The card itself does not scroll; it is a height-capped flex column.
    const cls = card()!.className.split(/\s+/);
    expect(cls).not.toContain('overflow-y-auto');
    expect(cls).toEqual(expect.arrayContaining(['flex', 'flex-col', 'max-h-[max(40vh,8rem)]']));
    // Design 2b: the cap holds at every width, so no breakpoint may lift it.
    expect(cls).not.toContain('sm:max-h-none');
    expect(cls.filter((c) => /max-h-none/.test(c))).toEqual([]);
    expect(sc.className.split(/\s+/)).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']));
  }

  it('first ask: buttons are outside the scroller; h2 and description are inside', () =>
    check(false));
  it('reopened: same structure, S4 inside the scroller', () => check(true));
});

describe('Decline', () => {
  it('closes the card, loads no script, clears _ga, sets ga-disable, posts the record', async () => {
    document.cookie = '_ga=GA1.1.1.1; path=/';
    document.cookie = '_ga_ZSMN1GPPB5=GS1.1.1; path=/';
    await mount('/pricing');
    await click(btn('Decline'));

    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(anyGtagScript()).toHaveLength(0);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
    expect(pageViews()).toHaveLength(0);
    expect(document.body.hasAttribute('data-consent-open')).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CONSENT_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('omit');
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['choice', 'id', 'version']);
    expect(body).toEqual({ id: expect.stringMatching(UUID_V4), choice: 'denied', version: 1 });

    expect(status().textContent).toBe(S.S8);
    expect(stored()).toMatchObject({ v: 1, choice: 'denied', id: body.id, synced: true });
  });

  it('a Decline persists across a remount: no card, no GA', async () => {
    await mount('/pricing');
    await click(btn('Decline'));
    await remount('/pricing');
    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
  });
});

describe('Accept', () => {
  it('appends one script and sends one sanitized page_view', async () => {
    window.history.pushState({}, '', '/pricing?utm=x&email=a@b.co#section');
    await mount('/pricing');
    await click(btn('Accept'));

    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(1);
    const script = gaScripts()[0] as HTMLScriptElement;
    expect(script.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    expect(document.head.contains(script)).toBe(true);

    const views = pageViews();
    expect(views).toHaveLength(1);
    expect(views[0].page_location).toBe(`${window.location.origin}/pricing`);
    expect(views[0].page_location).not.toMatch(/[?#]/);
    expect(views[0].page_path).toBe('/pricing');

    const cfg = (window.dataLayer as ArrayLike<unknown>[])
      .map((a) => Array.from(a))
      .find((a) => a[0] === 'config') as unknown[];
    expect(cfg[1]).toBe(GA_ID);
    expect(cfg[2]).toEqual({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(false);
    expect(status().textContent).toBe(S.S7);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).choice).toBe('granted');
    window.history.pushState({}, '', '/');
  });

  it('a remount with a granted choice loads GA once and shows no card', async () => {
    setStored();
    await mount('/pricing');
    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(1);
    await remount('/pricing');
    expect(gaScripts()).toHaveLength(1);
  });

  it('does not load GA on a non-allowlisted route even when granted', async () => {
    setStored();
    await mount('/login');
    expect(gaScripts()).toHaveLength(0);
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
  });

  it('navigating from a public page to /dashboard disables GA and stops page views', async () => {
    setStored();
    await mount('/pricing');
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(false);
    const before = pageViews().length;
    await mount('/dashboard');
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
    expect(pageViews()).toHaveLength(before);
  });

  it('sends a page_view on client navigation between public pages', async () => {
    setStored();
    await mount('/pricing');
    await mount('/terms');
    expect(pageViews().length).toBe(2);
    expect(gaScripts()).toHaveLength(1);
  });
});

describe('Accept then Decline via openConsentSettings', () => {
  it('removes the script, clears cookies, sets disable, no reload', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Cookie settings';
    document.body.appendChild(opener);
    const reloadGuard = jest.fn();
    window.addEventListener('beforeunload', reloadGuard);

    await mount('/pricing');
    await click(btn('Accept'));
    expect(gaScripts()).toHaveLength(1);
    document.cookie = '_ga=GA1.1.1.1; path=/';
    document.cookie = '_ga_ZSMN1GPPB5=GS1.1.1; path=/';

    await act(async () => openConsentSettings(opener));
    expect(card()).not.toBeNull();
    await click(btn('Decline'));

    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(anyGtagScript()).toHaveLength(0);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
    expect(stored().choice).toBe('denied');
    expect(stored().id).toMatch(UUID_V4);
    // The same id is reused for the changed choice.
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).id);
    expect(new Set(ids).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(status().textContent).toBe(S.S8);
    expect(reloadGuard).not.toHaveBeenCalled();
    window.removeEventListener('beforeunload', reloadGuard);
    opener.remove();
  });

  it('Decline then Accept again loads one script', async () => {
    setStored({ choice: 'denied' });
    await mount('/pricing');
    await act(async () => openConsentSettings(null));
    await click(btn('Accept'));
    expect(gaScripts()).toHaveLength(1);
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(false);
  });
});

describe('blocked localStorage', () => {
  it('is treated as denied and never throws', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await expect(mount('/pricing')).resolves.not.toThrow();
    expect(card()).not.toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(readStoredConsent()).toBeNull();

    // A click still applies for the page lifetime.
    await click(btn('Accept'));
    expect(gaScripts()).toHaveLength(1);
    expect(card()).toBeNull();
    // ...and the next visit asks again (nothing stored).
    await remount('/pricing');
    expect(card()).not.toBeNull();
    expect(gaScripts()).toHaveLength(1); // script from this page lifetime only; not re-added
  });

  it('a throwing Decline still disables GA', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    await mount('/pricing');
    await click(btn('Decline'));
    expect(gaScripts()).toHaveLength(0);
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
  });
});

describe('server record sync', () => {
  it('a failed POST (network error) leaves synced:false; the next mount retries once', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    await mount('/pricing');
    await click(btn('Decline'));
    expect(stored().synced).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, status: 204 }));
    await remount('/pricing');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      id: stored().id,
      choice: 'denied',
      version: 1,
    });
    expect(stored().synced).toBe(true);

    // Synced now: a further mount sends nothing more.
    await remount('/pricing');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a non-ok response also leaves synced:false', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 500 }));
    await mount('/pricing');
    await click(btn('Accept'));
    expect(stored().synced).toBe(false);
  });

  it('the retry happens once per load, not on each navigation', async () => {
    setStored({ synced: false, choice: 'denied' });
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 500 }));
    await mount('/pricing');
    await mount('/terms');
    await mount('/about');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry from a non-public page', async () => {
    setStored({ synced: false, choice: 'denied' });
    await mount('/dashboard');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a synchronously throwing fetch does not break the choice', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('fetch blocked');
    });
    await mount('/pricing');
    await click(btn('Accept'));
    expect(gaScripts()).toHaveLength(1);
    expect(stored().synced).toBe(false);
  });

  it('does not wait for the POST: the card closes while fetch is pending', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    await mount('/pricing');
    await click(btn('Decline'));
    expect(card()).toBeNull();
    expect(status().textContent).toBe(S.S8);
  });
});

describe('re-asking', () => {
  it('a 13-month-old choice shows the card again and loads no GA', async () => {
    setStored({ at: monthsAgo(13) });
    await mount('/pricing');
    expect(card()).not.toBeNull();
    expect(gaScripts()).toHaveLength(0);
  });

  it('an 11-month-old choice is still honoured', async () => {
    setStored({ at: monthsAgo(11) });
    await mount('/pricing');
    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(1);
  });

  it('a version mismatch (older or newer) shows the card again', async () => {
    setStored({ v: CONSENT_TEXT_VERSION + 1 });
    await mount('/pricing');
    expect(card()).not.toBeNull();
    expect(gaScripts()).toHaveLength(0);
    await act(async () => root.unmount());
    root = createRoot(container);
    setStored({ v: 0 });
    await mount('/pricing');
    expect(card()).not.toBeNull();
  });

  it('a re-ask after expiry reuses the stored id', async () => {
    setStored({ at: monthsAgo(13), choice: 'granted' });
    await mount('/pricing');
    await click(btn('Decline'));
    expect(stored().id).toBe(ID);
    expect(stored().choice).toBe('denied');
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['wrong shape', JSON.stringify({ choice: 'granted' })],
    [
      'bad choice',
      JSON.stringify({ v: 1, id: ID, choice: 'maybe', at: new Date().toISOString(), synced: true }),
    ],
    ['null', 'null'],
  ])('%s counts as no answer', async (_n, raw) => {
    localStorage.setItem(CONSENT_STORAGE_KEY, raw);
    await mount('/pricing');
    expect(card()).not.toBeNull();
    expect(gaScripts()).toHaveLength(0);
  });

  it('isConsentCurrent handles null and unreadable times', () => {
    expect(isConsentCurrent(null)).toBe(false);
    expect(
      isConsentCurrent({ v: 1, id: ID, choice: 'granted', at: 'not-a-date', synced: true }),
    ).toBe(false);
    expect(
      isConsentCurrent({
        v: 1,
        id: ID,
        choice: 'granted',
        at: new Date().toISOString(),
        synced: true,
      }),
    ).toBe(true);
  });
});

describe('route gate', () => {
  it.each([
    '/dashboard',
    '/login',
    '/auth/callback',
    '/admin',
    '/review/abc',
    '//pricing',
    '/pricing//',
  ])('%s renders nothing and loads nothing', async (path) => {
    await mount(path);
    expect(container.innerHTML).toBe('');
    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(document.body.hasAttribute('data-consent-open')).toBe(false);
  });

  it.each([
    '/',
    '/about',
    '/contact',
    '/faq',
    '/pricing',
    '/privacy',
    '/refunds',
    '/terms',
    '/tools',
    '/tools/bail-checker',
    '/tools/section-converter',
    '/tools/timeline-tracker',
    '/pricing/',
  ])('%s shows the card', async (path) => {
    await mount(path);
    expect(card()).not.toBeNull();
  });

  it('a reopen request on a non-public page shows nothing', async () => {
    await mount('/dashboard');
    await act(async () => openConsentSettings(null));
    expect(card()).toBeNull();
  });
});

describe('reopen', () => {
  async function reopenWith(choice: 'granted' | 'denied') {
    setStored({ choice });
    const opener = document.createElement('button');
    opener.textContent = 'Cookie settings';
    document.body.appendChild(opener);
    await mount('/pricing');
    expect(card()).toBeNull();
    opener.focus();
    await act(async () => openConsentSettings(opener));
    return opener;
  }

  it('shows S4 for the current choice and focuses the h2', async () => {
    const opener = await reopenWith('granted');
    expect(container.textContent).toContain(S.S4_GRANTED);
    expect(document.activeElement).toBe(container.querySelector('h2'));
    opener.remove();
    await act(async () => root.unmount());
    root = createRoot(container);
    const o2 = await reopenWith('denied');
    expect(container.textContent).toContain(S.S4_DENIED);
    expect(container.textContent).not.toContain(S.S4_GRANTED);
    o2.remove();
  });

  it('Esc closes without changing the choice and returns focus to the opener', async () => {
    const opener = await reopenWith('granted');
    await act(async () => {
      container
        .querySelector('h2')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(stored().choice).toBe('granted');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gaScripts()).toHaveLength(1);
    opener.remove();
  });

  it('a choice from the reopened card returns focus to the opener and announces S8', async () => {
    const opener = await reopenWith('granted');
    await click(btn('Decline'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.activeElement).toBe(opener);
    expect(status().textContent).toBe(S.S8);
    opener.remove();
  });

  it('a choice from the reopened card to Accept announces S7', async () => {
    const opener = await reopenWith('denied');
    await click(btn('Accept'));
    expect(status().textContent).toBe(S.S7);
    opener.remove();
  });

  it('Esc does nothing on the first-ask card', async () => {
    await mount('/pricing');
    await act(async () => {
      container
        .querySelector('h2')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(card()).not.toBeNull();
  });

  it('a first-time choice moves focus to #main, which is focusable only for that move (T-332)', async () => {
    // As in the root layout: a plain element with no tabindex.
    const main = document.createElement('div');
    main.id = 'main';
    document.body.appendChild(main);
    await mount('/pricing');
    expect(main.hasAttribute('tabindex')).toBe(false);
    await click(btn('Accept'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');

    // Focus moving away removes the tabindex again.
    const other = document.createElement('button');
    document.body.appendChild(other);
    await act(async () => other.focus());
    expect(document.activeElement).toBe(other);
    expect(main.hasAttribute('tabindex')).toBe(false);
    other.remove();
    main.remove();
  });

  it('the root layout no longer sets tabIndex on #main (T-332)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../app/layout.tsx'), 'utf8');
    const tag = src.match(/<div[^>]*id="main"[^>]*>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).not.toMatch(/tabIndex/i);
  });

  it('the opener is optional: uses the focused element', async () => {
    setStored({ choice: 'denied' });
    await mount('/pricing');
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    await act(async () => openConsentSettings());
    expect(card()).not.toBeNull();
    other.remove();
  });
});

describe('splash', () => {
  it('waits for the splash to end before showing the card', async () => {
    document.documentElement.setAttribute('data-lawie-splash', 'open');
    await mount('/');
    expect(card()).toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(document.body.hasAttribute('data-consent-open')).toBe(false);

    document.documentElement.removeAttribute('data-lawie-splash');
    await act(async () => {
      window.dispatchEvent(new Event('lawie:splash-end'));
    });
    expect(card()).not.toBeNull();
  });

  it('shows the card straight away when no splash is showing', async () => {
    await mount('/');
    expect(card()).not.toBeNull();
  });

  it('a stored choice never shows a card after the splash', async () => {
    setStored({ choice: 'denied' });
    document.documentElement.setAttribute('data-lawie-splash', 'open');
    await mount('/');
    await act(async () => {
      window.dispatchEvent(new Event('lawie:splash-end'));
    });
    expect(card()).toBeNull();
  });
});

describe('popstate guard', () => {
  it('disables GA on a popstate to a non-public path and enables it on a public one', async () => {
    setStored();
    await mount('/pricing');
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
    window.history.pushState({}, '', '/terms');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(false);
    window.history.pushState({}, '', '/');
  });

  it('never enables GA on popstate without consent', async () => {
    await mount('/pricing');
    window.history.pushState({}, '', '/terms');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(winRec()[`ga-disable-${GA_ID}`]).toBe(true);
    window.history.pushState({}, '', '/');
  });
});

describe('animation', () => {
  it('uses the animation API when motion is allowed and skips it under reduced motion', async () => {
    const animate = jest.fn();
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    window.matchMedia = jest.fn().mockImplementation((q: string) => ({
      matches: q.includes('no-preference'),
    })) as never;
    await mount('/pricing');
    expect(animate).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false })) as never;
    animate.mockClear();
    await mount('/pricing');
    expect(animate).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });
});

describe('deleteGaCookies', () => {
  it('expires _ga and the property cookie', () => {
    document.cookie = '_ga=1; path=/';
    document.cookie = '_ga_ZSMN1GPPB5=1; path=/';
    document.cookie = 'other=1; path=/';
    deleteGaCookies();
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toContain('other=1');
  });
});
