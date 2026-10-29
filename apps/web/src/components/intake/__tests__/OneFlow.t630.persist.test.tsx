// T-630 part B: the describe textarea keeps its text in this tab (sessionStorage, DRAFT_PREFILL_KEY)
// so a reload or a forced session end does not lose it, and the chip path (?kind=) shows both the
// stored text and the kind preset. Debounce is 500 ms; fake timers drive it. Plain-word sentinels.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import { DRAFT_PREFILL_KEY } from '../initialQuery';
import type { KindSummary } from '../briefTypes';

import { ACCESS_TOKEN_KEY, clearTokens, endSessionForced } from '@/lib/auth';
import { DESCRIPTION_MAX } from '@/lib/draftPrefill';
import { fakeJwt } from '@/lib/__tests__/helpers/fakeJwt';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => false,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));
const mockCapMsg = jest.fn();
const mockCapExc = jest.fn();
const mockBreadcrumb = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapMsg(...a),
  captureException: (...a: unknown[]) => mockCapExc(...a),
  addBreadcrumb: (...a: unknown[]) => mockBreadcrumb(...a),
}));

const MARKER = 'lawie:forced-end-subject';
const SENT = 'Sentinel matter words about a tenant dispute';
const brief = {
  kind: { id: 'bail', name: 'Bail application', court_document: false },
  court: { state: null, court_type: null, court: null },
  items: [],
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
};
const kinds = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 4,
  },
] as KindSummary[];
const list = [
  {
    template_id: 'bail_regular',
    display_name: 'Regular Bail',
    category: 'raw',
    description: '',
    plan_access: 'free',
  },
] as KindSummary[];

let container: HTMLDivElement;
let root: Root;
const consoleSpies: jest.SpyInstance[] = [];
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const ta = () => container.querySelector('textarea') as HTMLTextAreaElement;
const h1 = () => container.querySelector('h1')?.textContent;
const btn = (t: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === t,
  ) as HTMLButtonElement | undefined;
const render = async (props: Partial<Parameters<typeof OneFlow>[0]> = {}, strict = false) => {
  const el = <OneFlow kinds={kinds} loadingKinds={false} {...props} />;
  await act(async () => {
    root.render(strict ? <StrictMode>{el}</StrictMode> : el);
  });
  await flush();
};
const type = async (v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta(), v);
    ta().dispatchEvent(new Event('input', { bubbles: true }));
  });
const key = () => window.sessionStorage.getItem(DRAFT_PREFILL_KEY);
const stored = (v: string) => window.sessionStorage.setItem(DRAFT_PREFILL_KEY, v);
const remount = () => {
  act(() => root.unmount());
  root = createRoot(container);
};
const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/dashboard/new');
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    consoleSpies.push(jest.spyOn(console, m).mockImplementation(() => undefined));
  }
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ outcome: 'brief', brief, questions: [] }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (document as unknown as Record<string, unknown>).visibilityState;
  jest.restoreAllMocks();
  while (consoleSpies.length) consoleSpies.pop();
  jest.useRealTimers();
});

describe('T-630 B: the description is saved after typing pauses', () => {
  it('writes the key only after 500 ms, not before', async () => {
    await render();
    await type(SENT);
    expect(key()).toBeNull();
    await advance(499);
    expect(key()).toBeNull();
    await advance(1);
    expect(key()).toBe(SENT);
  });

  it('coalesces rapid typing into one write of the last value', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await render();
    await type('one');
    await advance(300);
    await type('one two');
    await advance(300);
    expect(key()).toBeNull(); // the second keystroke restarted the wait
    await type('one two three');
    await advance(500);
    expect(key()).toBe('one two three');
    const writes = setItem.mock.calls.filter((c) => c[0] === DRAFT_PREFILL_KEY);
    expect(writes).toEqual([[DRAFT_PREFILL_KEY, 'one two three']]);
  });

  it('caps what is stored at DESCRIPTION_MAX (4000)', async () => {
    await render();
    await type('x'.repeat(DESCRIPTION_MAX + 900));
    await advance(500);
    expect(key()).toBe('x'.repeat(DESCRIPTION_MAX));
  });

  it('a blank or whitespace-only description removes the key', async () => {
    await render();
    await type(SENT);
    await advance(500);
    expect(key()).toBe(SENT);
    await type('   \n ');
    await advance(500);
    expect(key()).toBeNull();
    await type(SENT);
    await advance(500);
    await type('');
    await advance(500);
    expect(key()).toBeNull();
  });
});

describe('T-630 B: page hide flushes at once', () => {
  it('pagehide writes the pending text immediately, and the timer does not write twice', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await render();
    await type(SENT);
    expect(key()).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(key()).toBe(SENT);
    await advance(1000);
    expect(setItem.mock.calls.filter((c) => c[0] === DRAFT_PREFILL_KEY)).toHaveLength(1);
  });

  it('visibilitychange to hidden flushes; to visible does not', async () => {
    await render();
    await type(SENT);
    act(() => setVisibility('visible'));
    expect(key()).toBeNull();
    act(() => setVisibility('hidden'));
    expect(key()).toBe(SENT);
  });
});

describe('T-630 B: leaving the flow', () => {
  it('unmount WITHOUT the forced-end marker removes the key', async () => {
    await render();
    await type(SENT);
    await advance(500);
    expect(key()).toBe(SENT);
    remount();
    expect(key()).toBeNull();
  });

  it('unmount WITHOUT the marker cancels a pending save (nothing is written later)', async () => {
    await render();
    await type(SENT);
    remount();
    await advance(2000);
    expect(key()).toBeNull();
  });

  it('unmount WITH the forced-end marker flushes the latest keystrokes and KEEPS the key', async () => {
    await render();
    await type('first words');
    await advance(500);
    await type('first words and the latest keystrokes');
    window.sessionStorage.setItem(MARKER, 'user-1');
    remount();
    expect(key()).toBe('first words and the latest keystrokes');
    expect(window.sessionStorage.getItem(MARKER)).toBe('user-1'); // OneFlow only reads it
  });

  // Ties OneFlow's own copy of the forced-end marker string to lib/auth.ts: these use the REAL
  // endSessionForced / clearTokens, not the local MARKER literal above.
  it('the REAL endSessionForced then unmount KEEPS the key with the text', async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, fakeJwt({ sub: 'user-7' }));
    await render();
    await type('words typed just before the session ended');
    expect(key()).toBeNull(); // debounce has not fired: unmount must flush it
    act(() => endSessionForced());
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    remount();
    expect(key()).toBe('words typed just before the session ended');
  });

  it('the REAL endSessionForced keeps a key that was already saved', async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, fakeJwt({ sub: 'user-7' }));
    await render();
    await type(SENT);
    await advance(500);
    expect(key()).toBe(SENT);
    act(() => endSessionForced());
    remount();
    expect(key()).toBe(SENT);
  });

  it('contrast: the REAL explicit sign-out (clearTokens) then unmount leaves no key', async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, fakeJwt({ sub: 'user-7' }));
    await render();
    await type(SENT);
    await advance(500);
    expect(key()).toBe(SENT);
    act(() => clearTokens());
    remount();
    expect(key()).toBeNull();
    expect(window.sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('a reload (no React cleanup) keeps the key: pagehide wrote the latest text', async () => {
    await render();
    await type(SENT);
    await advance(500);
    await type(`${SENT} and more`);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(key()).toBe(`${SENT} and more`);
  });

  it('moving past describe (a successful brief read) removes the key and stops saving', async () => {
    await render();
    await type(SENT);
    await advance(500);
    expect(key()).toBe(SENT);
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(key()).toBeNull();
    await advance(2000);
    expect(key()).toBeNull();
  });

  it('moving past describe before the debounce fired leaves no key behind either', async () => {
    await render();
    await type(SENT);
    await act(async () => btn('Continue')?.click());
    await flush();
    await advance(2000);
    expect(key()).toBeNull();
  });

  it.each([
    ['429', { ok: false, status: 429, json: async () => ({ message: 'Quota used up today.' }) }],
    ['400', { ok: false, status: 400, json: async () => ({}) }],
    ['500 (retry screen)', { ok: false, status: 500, json: async () => ({}) }],
  ])('a failed brief read (%s) stays on describe and keeps the key', async (_n, res) => {
    mockApiFetch.mockResolvedValue(res);
    await render();
    await type(SENT);
    await advance(500);
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    await advance(2000);
    expect(key()).toBe(SENT);
  });
});

describe('T-630 B: restore after a remount', () => {
  it('shows the stored text once, never appended twice, under StrictMode too', async () => {
    stored(SENT);
    await render({}, true);
    expect(ta().value).toBe(SENT);
    await advance(500);
    expect(ta().value).toBe(SENT);
    expect(key()).toBe(SENT);
  });

  it('replaces rather than appends: stored text over an empty box is exactly the stored text', async () => {
    stored(SENT);
    await render();
    expect(ta().value).toBe(SENT);
    expect(ta().value.split('tenant dispute')).toHaveLength(2);
  });

  it('does not overwrite text already typed (the saved copy is the typed text)', async () => {
    await render();
    await type('Typed words first');
    stored(SENT);
    await render({ guidedInkCost: 1 }); // a re-render does not re-read the key
    expect(ta().value).toBe('Typed words first');
    await advance(500);
    expect(key()).toBe('Typed words first');
  });

  it('saves the restored text again, so a SECOND forced end keeps it', async () => {
    stored(SENT);
    await render(); // restore after the first forced end
    expect(key()).toBeNull(); // read and removed at once
    await advance(500);
    expect(key()).toBe(SENT); // saved again under the same key
    window.sessionStorage.setItem(MARKER, 'user-1'); // second forced end
    remount();
    expect(key()).toBe(SENT);
    await render(); // and it restores once more
    expect(ta().value).toBe(SENT);
  });

  it('a restored text is saved again even when the advocate never touches the box (forced end right away)', async () => {
    stored(SENT);
    await render();
    window.sessionStorage.setItem(MARKER, 'user-1');
    remount();
    expect(key()).toBe(SENT);
  });
});

describe('T-630 B: ?kind= with a stored prefill (the chip path)', () => {
  it('templates loading LATE: the textarea shows the text AND the preset applies', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: true });
    expect(ta().value).toBe(SENT);
    await render({ initialKind: 'bail_regular', kinds: list, loadingKinds: false });
    expect(h1()).toBe('Regular Bail');
    expect(ta().value).toBe(SENT);
  });

  it('templates loading EARLY (list present at mount): same result', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: list, loadingKinds: false });
    expect(h1()).toBe('Regular Bail');
    expect(ta().value).toBe(SENT);
  });

  it('same result under StrictMode', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: list }, true);
    expect(h1()).toBe('Regular Bail');
    expect(ta().value).toBe(SENT);
  });

  it('?kind= is dropped from the URL after the preset, and no text is put in it', async () => {
    window.history.replaceState(null, '', '/dashboard/new?kind=bail_regular');
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: list });
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('Sentinel');
  });

  it('an unknown kind: the text is shown, no preset, no crash', async () => {
    stored(SENT);
    await render({ initialKind: 'no_such_kind', kinds: list });
    expect(ta().value).toBe(SENT);
    expect(h1()).not.toBe('Regular Bail');
    expect(container.textContent).not.toContain('Regular Bail');
  });

  it('a kind that is not in the list yet never arrives: text shown, no preset', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: false });
    expect(ta().value).toBe(SENT);
    expect(h1()).not.toBe('Regular Bail');
  });

  it('the advocate typed something different before the list arrived: the preset is skipped', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: true });
    await type('Something quite different that I typed myself');
    await render({ initialKind: 'bail_regular', kinds: list, loadingKinds: false });
    expect(h1()).not.toBe('Regular Bail');
    expect(ta().value).toBe('Something quite different that I typed myself');
  });

  it('typed text with no stored prefill also still skips the preset (unchanged T-365 rule)', async () => {
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: true });
    await type('Typed before the list');
    await render({ initialKind: 'bail_regular', kinds: list, loadingKinds: false });
    expect(h1()).not.toBe('Regular Bail');
  });

  it('with no stored text the preset applies to an empty box', async () => {
    await render({ initialKind: 'bail_regular', kinds: list });
    expect(h1()).toBe('Regular Bail');
    expect(ta().value).toBe('');
  });
});

describe('T-630 B: storage that throws never breaks typing or the flow', () => {
  it('setItem throwing: typing, debounce, pagehide, unmount and Continue all work', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await render();
    await type(SENT);
    expect(ta().value).toBe(SENT);
    await advance(500);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(ta().value).toBe(SENT);
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body).description).toBe(SENT);
  });

  it('removeItem throwing: a blank description, leaving describe and unmount do not throw', async () => {
    await render();
    await type(SENT);
    await advance(500);
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await type('');
    await advance(500);
    await type(SENT);
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(() => remount()).not.toThrow();
  });

  it('getItem throwing: the page renders, typing works, and unmount does not throw', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await render({ initialKind: 'bail_regular', kinds: list });
    expect(h1()).toBe('Regular Bail');
    await type(SENT);
    await advance(500);
    expect(ta().value).toBe(SENT);
    expect(() => remount()).not.toThrow();
  });

  it('sessionStorage access itself throwing does not break the page', async () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    try {
      await render({ initialKind: 'bail_regular', kinds: list });
      await type(SENT);
      await advance(500);
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(ta().value).toBe(SENT);
      expect(() => remount()).not.toThrow();
    } finally {
      if (desc) Object.defineProperty(window, 'sessionStorage', desc);
    }
  });
});

describe('T-630 B: privacy, the text lives only in sessionStorage', () => {
  const carries = (calls: unknown[][]) =>
    calls.some((args) =>
      args.some((a) => {
        try {
          return (typeof a === 'string' ? a : (JSON.stringify(a) ?? '')).includes(
            'Sentinel matter',
          );
        } catch {
          return false;
        }
      }),
    );

  it('typing, saving, pagehide, restoring and unmounting put it in no URL, console, analytics, Sentry or request', async () => {
    const gtag = jest.fn();
    const beacon = jest.fn();
    const fetchSpy = jest.fn();
    const w = window as unknown as Record<string, unknown>;
    w.gtag = gtag;
    w.dataLayer = [];
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const replace = jest.spyOn(window.history, 'replaceState');
    const pushState = jest.spyOn(window.history, 'pushState');
    try {
      stored(SENT);
      await render({ initialKind: 'bail_regular', kinds: list });
      await type(`${SENT} and a few more words`);
      await advance(500);
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
        setVisibility('hidden');
      });
      window.sessionStorage.setItem(MARKER, 'user-1');
      remount();
      await render();
      await advance(500);

      expect(window.location.href).not.toContain('Sentinel');
      expect(carries(replace.mock.calls)).toBe(false);
      expect(carries(pushState.mock.calls)).toBe(false);
      expect(carries(push.mock.calls)).toBe(false);
      expect(carries(consoleSpies.flatMap((s) => s.mock.calls))).toBe(false);
      expect(carries(mockCapMsg.mock.calls)).toBe(false);
      expect(carries(mockCapExc.mock.calls)).toBe(false);
      expect(carries(mockBreadcrumb.mock.calls)).toBe(false);
      expect(carries(gtag.mock.calls)).toBe(false);
      expect(carries([w.dataLayer as unknown[]])).toBe(false);
      expect(beacon).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(mockPrivacyFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = prevFetch;
      delete w.gtag;
      delete w.dataLayer;
      delete (navigator as unknown as Record<string, unknown>).sendBeacon;
    }
  });

  it('the only request that carries it is the brief read the advocate asked for', async () => {
    stored(SENT);
    await render();
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/documents/intake/brief');
    expect(String(mockApiFetch.mock.calls[0][0])).not.toContain('Sentinel');
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body).description).toBe(SENT);
  });
});
