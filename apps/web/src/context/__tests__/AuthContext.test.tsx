// T-616: AuthContext: mount branches, the proactive refresh timer, catch-up, cross-tab storage
// events, transient backoff. Real sessionRefresh + auth.ts over jsdom storage and a fake fetch.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AuthProvider, useAuth } from '../AuthContext';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from '@/lib/__tests__/helpers/fakeJwt';
import { refreshInFlight, resetRefreshState } from '@/lib/sessionRefresh';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeContainer: HTMLElement | null = null;
function renderTree(el: React.ReactElement) {
  activeContainer = document.createElement('div');
  document.body.appendChild(activeContainer);
  const root = createRoot(activeContainer);
  activeRoot = root;
  act(() => root.render(el));
  return {
    unmount: () => {
      if (activeRoot === root) activeRoot = null;
      act(() => root.unmount());
    },
  };
}
function cleanupTree() {
  if (activeRoot) act(() => activeRoot!.unmount());
  activeRoot = null;
  activeContainer?.remove();
  activeContainer = null;
}

type Auth = ReturnType<typeof useAuth>;
let latest: Auth;
function Probe() {
  latest = useAuth();
  return null;
}

const NOW = new Date('2026-10-26T10:00:00.000Z'); // whole second: clock skew stays exactly 0
let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
const realFetch = global.fetch;
let refreshAnswer: (n: number) => Response | Promise<Response>;
let refreshStamps: number[];
let visibility: 'visible' | 'hidden';

const seed = (a: string, r: string) => {
  localStorage.setItem(ACCESS, a);
  localStorage.setItem(REFRESH, r);
};
const tok = (expiresInSec: number, extra: Parameters<typeof fakeJwt>[0] = {}) =>
  fakeJwt({ expiresInSec, ...extra });
const refreshCalls = () => fetchMock.mock.calls.length;
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
async function settle() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}
function mountProvider() {
  return renderTree(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}
function fireStorage(key: string | null, area: Storage = localStorage) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: area }));
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  resetRefreshState(); // failure count and cooldown are module state
  localStorage.clear();
  sessionStorage.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  refreshStamps = [];
  refreshAnswer = () => refreshOk(tok(900), 'R-next');
  fetchMock = jest.fn(async (_url: string, _init: RequestInit) => {
    refreshStamps.push(Date.now());
    return refreshAnswer(refreshStamps.length);
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

describe('useAuth shape', () => {
  it('exposes user, isLoading, login, logout and nothing else', async () => {
    mountProvider();
    await settle();
    expect(Object.keys(latest).sort()).toEqual([
      'isLoading',
      'login',
      'logout',
      'reconnecting',
      'user',
    ]);
    expect(typeof latest.login).toBe('function');
    expect(typeof latest.logout).toBe('function');
  });

  it('throws outside a provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderTree(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>');
    spy.mockRestore();
  });
});

describe('mount', () => {
  it('a valid token: signed in at once, not loading, no refresh call', () => {
    seed(tok(900, { sub: 'u1', email: 'a@b.example' }), 'R1');
    mountProvider();
    expect(latest.isLoading).toBe(false);
    expect(latest.user).toMatchObject({ id: 'u1', email: 'a@b.example' });
    expect(refreshCalls()).toBe(0);
  });

  it('no tokens: signed out, not loading, no refresh call', async () => {
    mountProvider();
    await settle();
    expect(latest.user).toBeNull();
    expect(latest.isLoading).toBe(false);
    expect(refreshCalls()).toBe(0);
  });

  it('an expired access token and no refresh token: signed out, no call', async () => {
    localStorage.setItem(ACCESS, tok(-100));
    mountProvider();
    await settle();
    expect(latest.user).toBeNull();
    expect(latest.isLoading).toBe(false);
    expect(refreshCalls()).toBe(0);
  });

  it('expired access + refresh token, refresh ok: stays loading meanwhile, then the user is set', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    let release: (r: Response) => void = () => undefined;
    refreshAnswer = () => new Promise<Response>((res) => (release = res));
    mountProvider();
    await settle();
    expect(latest.isLoading).toBe(true);
    expect(latest.user).toBeNull(); // not "signed out" before the attempt finishes: still loading
    expect(refreshCalls()).toBe(1);
    const next = tok(900, { sub: 'u1', email: 'new@b.example' });
    await act(async () => {
      release(refreshOk(next, 'R2'));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(latest.isLoading).toBe(false);
    expect(latest.user).toMatchObject({ id: 'u1', email: 'new@b.example' });
    expect(localStorage.getItem(ACCESS)).toBe(next);
  });

  it('expired access + refresh token, refresh refused: forced end (tokens gone, matter text kept), user null', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    sessionStorage.setItem('lawie:draft-prefill', 'unsaved description');
    refreshAnswer = () => jsonRes(401);
    mountProvider();
    await settle();
    expect(latest.isLoading).toBe(false);
    expect(latest.user).toBeNull();
    expect(localStorage.getItem(ACCESS)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBeNull();
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('unsaved description');
    expect(sessionStorage.getItem('lawie:forced-end-subject')).toBe('u1');
  });

  it('expired access + refresh token, refresh transient: user from the stored token, tokens kept, retry scheduled', async () => {
    const old = tok(-100, { sub: 'u1', email: 'a@b.example' });
    seed(old, 'R1');
    refreshAnswer = () => jsonRes(503);
    mountProvider();
    await settle();
    expect(latest.isLoading).toBe(false);
    expect(latest.user).toMatchObject({ id: 'u1', email: 'a@b.example' });
    expect(localStorage.getItem(ACCESS)).toBe(old);
    expect(localStorage.getItem(REFRESH)).toBe('R1');
    expect(refreshCalls()).toBe(1);
    await advance(1000);
    expect(refreshCalls()).toBe(2);
  });
});

describe('proactive refresh timer', () => {
  it('fires 60 s before exp (not earlier), using the refresh token', async () => {
    seed(tok(900), 'R1');
    mountProvider();
    await advance(839_999);
    expect(refreshCalls()).toBe(0);
    await advance(1);
    expect(refreshCalls()).toBe(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ refreshToken: 'R1' });
  });

  it('refreshes at once when the token is already inside the 60 s margin', async () => {
    seed(tok(30), 'R1');
    mountProvider();
    await settle();
    expect(refreshCalls()).toBe(1);
  });

  it('never fires sooner than 5 s after it is set (floor)', async () => {
    seed(tok(62), 'R1'); // due in 2 s
    mountProvider();
    await advance(4999);
    expect(refreshCalls()).toBe(0);
    await advance(1);
    expect(refreshCalls()).toBe(1);
  });

  it('after a success, no proactive refresh within 60 s (a bad clock cannot loop it)', async () => {
    seed(tok(30), 'R1');
    refreshAnswer = () => refreshOk(tok(70), 'R2'); // due 10 s after success, but gap is 60 s
    mountProvider();
    await settle();
    expect(refreshCalls()).toBe(1);
    await advance(59_999);
    expect(refreshCalls()).toBe(1);
    await advance(1);
    expect(refreshCalls()).toBe(2);
  });

  it('a server that keeps returning already-expired tokens is refreshed at most once per 60 s', async () => {
    seed(tok(30), 'R1');
    refreshAnswer = () => refreshOk(tok(-500), 'Rn');
    mountProvider();
    await advance(10 * 60_000);
    // mount + about one per minute, never a tight loop
    expect(refreshCalls()).toBeLessThanOrEqual(12);
    const gaps = refreshStamps.slice(1).map((t, i) => t - refreshStamps[i]);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(60_000);
  });

  it('clamps a very distant expiry below 2^31 ms (a larger delay would fire at once)', async () => {
    seed(tok(30 * 24 * 3600), 'R1'); // 30 days
    const spy = jest.spyOn(global, 'setTimeout');
    mountProvider();
    await advance(1000);
    expect(refreshCalls()).toBe(0);
    const delays = spy.mock.calls.map((c) => Number(c[1] ?? 0));
    expect(Math.max(...delays)).toBeLessThanOrEqual(2 ** 31 - 1);
    expect(delays.some((d) => d > 2 ** 30)).toBe(true);
  });

  it('rescheduled after a refresh: the next one is 60 s before the NEW token expires', async () => {
    seed(tok(900), 'R1');
    mountProvider();
    await advance(840_000);
    expect(refreshCalls()).toBe(1);
    await advance(839_999);
    expect(refreshCalls()).toBe(1);
    await advance(1);
    expect(refreshCalls()).toBe(2);
  });

  it('rescheduled after login: a signed-out provider starts the timer when login() runs', async () => {
    mountProvider();
    await settle();
    act(() => latest.login(tok(900, { sub: 'u2' }), 'R1'));
    expect(latest.user?.id).toBe('u2');
    await advance(839_999);
    expect(refreshCalls()).toBe(0);
    await advance(1);
    expect(refreshCalls()).toBe(1);
  });

  it("login() replaces an earlier timer (the old token's timing no longer applies)", async () => {
    seed(tok(120), 'R1'); // due at 60 s
    mountProvider();
    act(() => latest.login(tok(900), 'R2'));
    await advance(61_000);
    expect(refreshCalls()).toBe(0);
    await advance(839_000 - 61_000 + 1_000);
    expect(refreshCalls()).toBe(1);
  });

  it('cleared on logout: no refresh afterwards, tokens and matter text gone', async () => {
    seed(tok(900), 'R1');
    sessionStorage.setItem('lawie:draft-prefill', 'text');
    mountProvider();
    act(() => latest.logout());
    expect(latest.user).toBeNull();
    await advance(2 * 900_000);
    expect(refreshCalls()).toBe(0);
    expect(localStorage.getItem(ACCESS)).toBeNull();
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBeNull();
  });

  it('cleared on unmount', async () => {
    seed(tok(900), 'R1');
    const view = mountProvider();
    view.unmount();
    await advance(2 * 900_000);
    expect(refreshCalls()).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a successful proactive refresh keeps the same user object (no needless re-render)', async () => {
    seed(tok(900, { sub: 'u1' }), 'R1');
    refreshAnswer = () => refreshOk(tok(900, { sub: 'u1' }), 'R2');
    mountProvider();
    const before = latest.user;
    await advance(840_000);
    expect(refreshCalls()).toBe(1);
    expect(latest.user).toBe(before);
  });
});

describe('catch-up on visibilitychange / focus / online', () => {
  const trigger: [string, () => void][] = [
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['online', () => window.dispatchEvent(new Event('online'))],
  ];

  it.each(trigger)(
    '%s: a token that slept into the margin is refreshed at once',
    async (_n, fire) => {
      seed(tok(900), 'R1');
      mountProvider();
      // the machine slept: the clock moved on but the throttled timer has not fired
      jest.setSystemTime(new Date(NOW.getTime() + 850_000));
      act(fire);
      await settle();
      expect(refreshCalls()).toBe(1);
    },
  );

  it.each(trigger)('%s: a token with plenty of time left is not refreshed', async (_n, fire) => {
    seed(tok(900), 'R1');
    mountProvider();
    act(fire);
    await settle();
    expect(refreshCalls()).toBe(0);
  });

  it.each(trigger)('%s: nothing while the tab is hidden', async (_n, fire) => {
    seed(tok(900), 'R1');
    mountProvider();
    jest.setSystemTime(new Date(NOW.getTime() + 850_000));
    visibility = 'hidden';
    act(fire);
    await settle();
    expect(refreshCalls()).toBe(0);
  });

  it('nothing when there is no refresh token', async () => {
    localStorage.setItem(ACCESS, tok(900));
    mountProvider();
    jest.setSystemTime(new Date(NOW.getTime() + 850_000));
    act(() => window.dispatchEvent(new Event('focus')));
    await settle();
    expect(refreshCalls()).toBe(0);
  });

  it('not within 60 s of the last success', async () => {
    seed(tok(30), 'R1');
    refreshAnswer = () => refreshOk(tok(40), 'R2');
    mountProvider();
    await settle();
    expect(refreshCalls()).toBe(1);
    act(() => window.dispatchEvent(new Event('focus')));
    await settle();
    expect(refreshCalls()).toBe(1);
  });
});

describe('storage events (other tabs)', () => {
  it("another tab's new tokens: user updated and the timer follows the new token", async () => {
    seed(tok(900, { email: 'old@b.example', plan: 'free' }), 'R1');
    mountProvider();
    expect(latest.user?.plan).toBe('free');
    seed(tok(1800, { email: 'old@b.example', plan: 'pro' }), 'R2');
    fireStorage(ACCESS);
    expect(latest.user?.plan).toBe('pro');
    await advance(840_000); // the OLD timer would have fired here
    expect(refreshCalls()).toBe(0);
    await advance(900_000 - 1);
    expect(refreshCalls()).toBe(0);
    await advance(1);
    expect(refreshCalls()).toBe(1);
  });

  it('both keys removed in another tab: user null, no refresh later', async () => {
    seed(tok(900), 'R1');
    mountProvider();
    expect(latest.user).not.toBeNull();
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    fireStorage(ACCESS);
    expect(latest.user).toBeNull();
    expect(latest.isLoading).toBe(false);
    await advance(900_000);
    expect(refreshCalls()).toBe(0);
  });

  it('storage.clear() (key null) with the tokens gone signs out', () => {
    seed(tok(900), 'R1');
    mountProvider();
    localStorage.clear();
    fireStorage(null);
    expect(latest.user).toBeNull();
  });

  it('an unrelated key, or sessionStorage, is ignored', () => {
    seed(tok(900, { plan: 'free' }), 'R1');
    mountProvider();
    seed(tok(900, { plan: 'pro' }), 'R2');
    fireStorage('lawie.something-else');
    expect(latest.user?.plan).toBe('free');
    fireStorage(ACCESS, sessionStorage);
    expect(latest.user?.plan).toBe('free');
  });

  it('only the access token gone but a refresh token left: not signed out', () => {
    seed(tok(900), 'R1');
    mountProvider();
    localStorage.removeItem(ACCESS);
    fireStorage(ACCESS);
    expect(latest.user).not.toBeNull();
  });

  it('the listener is removed on unmount', () => {
    seed(tok(900), 'R1');
    const view = mountProvider();
    const user = latest.user;
    view.unmount();
    localStorage.clear();
    fireStorage(null);
    expect(latest.user).toBe(user); // no state change after unmount
  });
});

describe('transient backoff', () => {
  it('retries after 1, 2, 4, 8, 16, 32 s then every 60 s (cap); never signs out; tokens kept', async () => {
    const old = tok(-100, { sub: 'u1' });
    seed(old, 'R1');
    refreshAnswer = () => jsonRes(503);
    mountProvider();
    await advance(10 * 60_000);
    const offsets = refreshStamps.map((t) => (t - NOW.getTime()) / 1000);
    expect(offsets.slice(0, 9)).toEqual([0, 1, 3, 7, 15, 31, 63, 123, 183]);
    expect(latest.user).not.toBeNull();
    expect(localStorage.getItem(ACCESS)).toBe(old);
    expect(localStorage.getItem(REFRESH)).toBe('R1');
  });

  it('a success resets it: the user is refreshed and the proactive timer takes over', async () => {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    refreshAnswer = (n) => (n < 3 ? jsonRes(429) : refreshOk(tok(900, { sub: 'u1' }), 'R2'));
    mountProvider();
    await advance(3000);
    expect(refreshCalls()).toBe(3);
    expect(latest.user?.id).toBe('u1');
    await advance(60_000);
    expect(refreshCalls()).toBe(3);
  });

  it('no retry while the tab is hidden; it resumes on focus when visible', async () => {
    seed(tok(-100), 'R1');
    refreshAnswer = () => jsonRes(503);
    visibility = 'hidden';
    mountProvider();
    await advance(5 * 60_000);
    expect(refreshCalls()).toBe(1);
    expect(latest.user).not.toBeNull();
    visibility = 'visible';
    act(() => window.dispatchEvent(new Event('focus')));
    await settle();
    expect(refreshCalls()).toBe(2);
  });

  it('a refresh that is refused (401) after earlier transient failures ends the session', async () => {
    seed(tok(-100), 'R1');
    refreshAnswer = (n) => (n < 2 ? jsonRes(503) : jsonRes(401));
    mountProvider();
    await advance(1000);
    expect(latest.user).toBeNull();
    expect(localStorage.getItem(ACCESS)).toBeNull();
  });
});
