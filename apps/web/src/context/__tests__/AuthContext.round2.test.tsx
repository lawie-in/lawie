// T-616 round 2: AuthContext: the shared-computer sequences (review must-fix 1), a refresh that
// lands as another user (must-fix 2, timer variant), the tab-wide cooldown (should-fix 1) and
// the `reconnecting` flag. Real sessionRefresh + auth.ts over jsdom storage and a fake fetch.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AuthProvider, useAuth } from '../AuthContext';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from '@/lib/__tests__/helpers/fakeJwt';
import { refreshAccessToken } from '@/lib/apiFetch';
import { endSessionForced } from '@/lib/auth';
import { refreshInFlight, resetRefreshState } from '@/lib/sessionRefresh';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PREFILL = 'lawie:draft-prefill';
const MARKER = 'lawie:forced-end-subject';
const NOW = new Date('2026-10-26T10:00:00.000Z');

let activeRoot: Root | null = null;
let activeContainer: HTMLElement | null = null;
function mountProvider() {
  activeContainer = document.createElement('div');
  document.body.appendChild(activeContainer);
  activeRoot = createRoot(activeContainer);
  act(() =>
    activeRoot!.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    ),
  );
}
function cleanupTree() {
  if (activeRoot) act(() => activeRoot!.unmount());
  activeRoot = null;
  activeContainer?.remove();
  activeContainer = null;
}

type Auth = ReturnType<typeof useAuth>;
let latest: Auth;
/** The matter text as seen at each render in which the user was shown, per user id. */
let textWhenShown: Record<string, Array<string | null>>;
function Probe() {
  latest = useAuth();
  if (latest.user) {
    (textWhenShown[latest.user.id] ??= []).push(sessionStorage.getItem(PREFILL));
  }
  return null;
}

let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
const realFetch = global.fetch;
let answer: (n: number) => Response | Promise<Response>;
let stamps: number[];
let visibility: 'visible' | 'hidden';

const seed = (a: string, r: string) => {
  localStorage.setItem(ACCESS, a);
  localStorage.setItem(REFRESH, r);
};
const tok = (expiresInSec: number, extra: Parameters<typeof fakeJwt>[0] = {}) =>
  fakeJwt({ expiresInSec, ...extra });
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
function fireStorage(key: string | null = null) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  resetRefreshState();
  localStorage.clear();
  sessionStorage.clear();
  textWhenShown = {};
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  stamps = [];
  answer = () => refreshOk(tok(900), 'R-next');
  fetchMock = jest.fn(async (_u: string, _i: RequestInit) => {
    stamps.push(Date.now());
    return answer(stamps.length);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(async () => {
  cleanupTree();
  await refreshInFlight();
  global.fetch = realFetch;
  delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Sequence A: A's session ended by itself here, B signs in on another tab", () => {
  function showAThenForcedEnd() {
    seed(tok(900, { sub: 'user-A' }), 'RA');
    sessionStorage.setItem(PREFILL, "A's private matter text");
    mountProvider();
    expect(latest.user?.id).toBe('user-A');
    act(() => endSessionForced()); // tokens gone, marker names A, text kept
    fireStorage();
    expect(latest.user).toBeNull();
    expect(sessionStorage.getItem(PREFILL)).toBe("A's private matter text");
    expect(sessionStorage.getItem(MARKER)).toBe('user-A');
  }

  it("tab 1 gets the storage event and wipes A's text BEFORE B is shown; B never sees it", () => {
    showAThenForcedEnd();
    seed(tok(900, { sub: 'user-B' }), 'RB'); // B signs in on tab 2
    fireStorage(ACCESS);
    expect(latest.user?.id).toBe('user-B');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
    // at every render that showed B, the text was already gone
    expect(textWhenShown['user-B']?.length).toBeGreaterThan(0);
    expect(textWhenShown['user-B']!.every((t) => t === null)).toBe(true);
  });

  it("A signing in again on another tab keeps A's text", () => {
    showAThenForcedEnd();
    seed(tok(900, { sub: 'user-A', nonce: 'again' }), 'RA2');
    fireStorage(ACCESS);
    expect(latest.user?.id).toBe('user-A');
    expect(sessionStorage.getItem(PREFILL)).toBe("A's private matter text");
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it("after an explicit sign-out (no marker) another user's sign-in elsewhere also finds no text", () => {
    seed(tok(900, { sub: 'user-A' }), 'RA');
    mountProvider();
    sessionStorage.setItem(PREFILL, 'text');
    act(() => latest.logout());
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    sessionStorage.setItem(PREFILL, 'stray'); // e.g. typed in a tab that never saw the sign-out
    seed(tok(900, { sub: 'user-A', nonce: 'x' }), 'RA3');
    fireStorage(ACCESS);
    expect(sessionStorage.getItem(PREFILL)).toBeNull(); // signed out, no marker: wiped
  });
});

describe('page load', () => {
  it("the marker names A but the stored session is B's: A's text is wiped, the marker removed", () => {
    sessionStorage.setItem(PREFILL, "A's text");
    sessionStorage.setItem(MARKER, 'user-A');
    seed(tok(900, { sub: 'user-B' }), 'RB');
    mountProvider();
    expect(latest.user?.id).toBe('user-B');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
    expect(textWhenShown['user-B']!.every((t) => t === null)).toBe(true);
  });

  it('a marker naming the same user keeps the text; no marker leaves it unchanged', () => {
    sessionStorage.setItem(PREFILL, 'text');
    sessionStorage.setItem(MARKER, 'user-A');
    seed(tok(900, { sub: 'user-A' }), 'RA');
    mountProvider();
    expect(sessionStorage.getItem(PREFILL)).toBe('text');
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });
});

describe('a refresh that lands as another user (must-fix 2, timer variant)', () => {
  it("A's proactive refresh is in flight, B signs in elsewhere: A's 200 is not saved, B is shown, A's text wiped", async () => {
    seed(tok(120, { sub: 'user-A' }), 'RA');
    sessionStorage.setItem(PREFILL, "A's text");
    const bAccess = tok(900, { sub: 'user-B', nonce: 'b' });
    answer = () => {
      seed(bAccess, 'RB'); // B signs in on another tab while A's refresh is on the wire
      return refreshOk(tok(900, { sub: 'user-A', nonce: 'a2' }), 'RA2');
    };
    mountProvider();
    expect(latest.user?.id).toBe('user-A');
    await advance(61_000); // timer: exp - 60 s
    expect(stamps).toHaveLength(1);
    expect(localStorage.getItem(ACCESS)).toBe(bAccess);
    expect(localStorage.getItem(REFRESH)).toBe('RB');
    expect(latest.user?.id).toBe('user-B');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(textWhenShown['user-B']!.every((t) => t === null)).toBe(true);
  });

  it("control: the same user's refresh keeps the text", async () => {
    seed(tok(120, { sub: 'user-A' }), 'RA');
    sessionStorage.setItem(PREFILL, 'text');
    answer = () => refreshOk(tok(900, { sub: 'user-A', nonce: 'a2' }), 'RA2');
    mountProvider();
    await advance(61_000);
    expect(stamps).toHaveLength(1);
    expect(latest.user?.id).toBe('user-A');
    expect(sessionStorage.getItem(PREFILL)).toBe('text');
  });
});

describe('reconnecting', () => {
  it('false at 0 and 1 failures, true at the 2nd, false after the next success', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = (n) => (n < 3 ? jsonRes(503) : refreshOk(tok(900, { sub: 'u1' }), 'R2'));
    mountProvider();
    expect(latest.reconnecting).toBe(false);
    await advance(0);
    expect(stamps).toHaveLength(1); // 1 failure
    expect(latest.reconnecting).toBe(false);
    await advance(1000);
    expect(stamps).toHaveLength(2); // 2 failures
    expect(latest.reconnecting).toBe(true);
    expect(latest.user).not.toBeNull(); // never signed out
    await advance(2000);
    expect(stamps).toHaveLength(3);
    expect(latest.reconnecting).toBe(false);
  });

  it('false after a definitive end (401) and after logout', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = (n) => (n < 3 ? jsonRes(503) : jsonRes(401));
    mountProvider();
    await advance(1000);
    expect(latest.reconnecting).toBe(true);
    await advance(2000);
    expect(latest.user).toBeNull();
    expect(latest.reconnecting).toBe(false);
  });

  it('false after a sign-in (login) and after logout', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = () => jsonRes(503);
    mountProvider();
    await advance(1000);
    expect(latest.reconnecting).toBe(true);
    act(() => latest.login(tok(900, { sub: 'u1', nonce: 'in' }), 'R9'));
    expect(latest.reconnecting).toBe(false);
    answer = () => jsonRes(503);
    act(() => latest.logout());
    expect(latest.reconnecting).toBe(false);
  });

  it('false after a sign-out seen on another tab', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = () => jsonRes(503);
    mountProvider();
    await advance(1000);
    expect(latest.reconnecting).toBe(true);
    localStorage.clear();
    fireStorage();
    expect(latest.reconnecting).toBe(false);
  });
});

describe('the tab-wide cooldown', () => {
  it('focus / visibility / online events never reset the failure count or make a call inside the cooldown', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = () => jsonRes(503);
    mountProvider();
    await advance(1000); // calls at 0 and 1 s; cooldown 2 s until 3 s
    expect(stamps).toHaveLength(2);
    for (let i = 0; i < 20; i += 1) {
      act(() => window.dispatchEvent(new Event('focus')));
      act(() => window.dispatchEvent(new Event('online')));
      act(() => document.dispatchEvent(new Event('visibilitychange')));
    }
    await advance(500);
    expect(stamps).toHaveLength(2);
    expect(latest.reconnecting).toBe(true); // catch-up did not reset the count
  });

  it('a 65 s storm of 503s with a focus event every second makes 7 /refresh calls (0, 1, 3, 7, 15, 31, 63 s)', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = () => jsonRes(503);
    mountProvider();
    for (let s = 0; s < 65; s += 1) {
      act(() => window.dispatchEvent(new Event('focus')));
      await advance(1000);
    }
    expect(stamps.map((t) => (t - NOW.getTime()) / 1000)).toEqual([0, 1, 3, 7, 15, 31, 63]);
    expect(latest.user).not.toBeNull();
  });

  it("apiFetch's refresh (refreshAccessToken) inside the cooldown that AuthContext started makes no call", async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = () => jsonRes(503);
    mountProvider();
    await advance(0);
    expect(stamps).toHaveLength(1);
    let out: string | null = 'unset';
    await act(async () => {
      out = await refreshAccessToken();
    });
    expect(out).toBeNull();
    expect(stamps).toHaveLength(1);
  });

  it('retries after the cooldown (at least 1 s), not on its own backoff', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = (n) =>
      n === 1
        ? ({
            ok: false,
            status: 429,
            headers: { get: () => '30' },
            json: async () => ({}),
          } as unknown as Response)
        : refreshOk(tok(900, { sub: 'u1' }), 'R2');
    mountProvider();
    await advance(29_000);
    expect(stamps).toHaveLength(1);
    await advance(1_000);
    expect(stamps).toHaveLength(2);
    expect(latest.reconnecting).toBe(false);
  });
});
