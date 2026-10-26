// T-616 round 3: AuthContext. (2) another tab's refresh or sign-in, seen through the storage event,
// ends this tab's failures and cooldown (so `reconnecting` clears); (4) `run` hands the token it was
// set for to refreshSession as `staleAccessToken`. Real sessionRefresh + auth.ts over jsdom storage
// and a fake fetch.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AuthProvider, useAuth } from '../AuthContext';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from '@/lib/__tests__/helpers/fakeJwt';
import * as sessionRefresh from '@/lib/sessionRefresh';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date('2026-10-26T10:00:00.000Z');

let root: Root | null = null;
let host: HTMLElement | null = null;
type Auth = ReturnType<typeof useAuth>;
let latest: Auth;
function Probe() {
  latest = useAuth();
  return null;
}
function mountProvider() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    ),
  );
}

let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
const realFetch = global.fetch;
let answer: (n: number) => Response | Promise<Response>;
let calls: number;

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
  sessionRefresh.resetRefreshState();
  localStorage.clear();
  sessionStorage.clear();
  calls = 0;
  answer = () => refreshOk(tok(900), 'R-next');
  fetchMock = jest.fn(async (_url: string, _init: RequestInit) => {
    calls += 1;
    return answer(calls);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(async () => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
  await sessionRefresh.refreshInFlight();
  global.fetch = realFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('onStorage with a valid session resets the refresh state (round 3 must-fix 2)', () => {
  async function reconnectingTab() {
    seed(tok(-100, { sub: 'u1' }), 'R1');
    answer = () => jsonRes(503);
    mountProvider();
    await advance(1000); // calls at 0 s and 1 s: two transient failures
    expect(calls).toBe(2);
    expect(latest.reconnecting).toBe(true);
    expect(sessionRefresh.refreshFailureCount()).toBe(2);
    expect(sessionRefresh.refreshCooldownMs()).toBeGreaterThan(0);
  }

  it("another tab's refresh (new access token, same user) clears `reconnecting`, the count and the cooldown", async () => {
    await reconnectingTab();
    seed(tok(900, { sub: 'u1', nonce: 'other-tab' }), 'R2'); // another tab refreshed
    fireStorage(ACCESS);
    expect(latest.reconnecting).toBe(false);
    expect(sessionRefresh.refreshFailureCount()).toBe(0);
    expect(sessionRefresh.refreshCooldownMs()).toBe(0);
    expect(latest.user?.id).toBe('u1');
  });

  it('a storage event with key null (clear/unknown) and a valid session does the same', async () => {
    await reconnectingTab();
    seed(tok(900, { sub: 'u1', nonce: 'x' }), 'R2');
    fireStorage(null);
    expect(latest.reconnecting).toBe(false);
    expect(sessionRefresh.refreshCooldownMs()).toBe(0);
  });

  it('only an EXPIRED access token in storage (other tab mid-write) leaves the failures alone', async () => {
    await reconnectingTab();
    seed(tok(-50, { sub: 'u1', nonce: 'still-expired' }), 'R2');
    fireStorage(ACCESS);
    expect(latest.reconnecting).toBe(true);
    expect(sessionRefresh.refreshFailureCount()).toBe(2);
  });

  it('an unrelated storage key does nothing', async () => {
    await reconnectingTab();
    seed(tok(900, { sub: 'u1', nonce: 'x' }), 'R2');
    fireStorage('some-other-key');
    expect(latest.reconnecting).toBe(true);
  });

  it('after the reset the proactive timer is rescheduled for the new token (no stale retry call)', async () => {
    await reconnectingTab();
    seed(tok(900, { sub: 'u1', nonce: 'fresh' }), 'R2');
    fireStorage(ACCESS);
    await advance(30_000); // the old 2 s retry timer is gone; the new token is due at ~840 s
    expect(calls).toBe(2);
  });
});

describe('run passes staleAccessToken to refreshSession (round 3 should-fix 3)', () => {
  it('mount with an expired token: called with { staleAccessToken: <that token> }', async () => {
    const expired = tok(-100, { sub: 'u1', nonce: 'old' });
    seed(expired, 'R1');
    const spy = jest.spyOn(sessionRefresh, 'refreshSession');
    mountProvider();
    await advance(0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ staleAccessToken: expired });
  });

  it('the proactive timer: called with the token the timer was set for', async () => {
    const t1 = tok(120, { sub: 'u1', nonce: 't1' });
    seed(t1, 'R1');
    const spy = jest.spyOn(sessionRefresh, 'refreshSession');
    mountProvider();
    await advance(61_000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ staleAccessToken: t1 });
  });

  it('a token another tab saved after the timer was set counts as already refreshed: ok, no /refresh call', async () => {
    const t1 = tok(120, { sub: 'u1', nonce: 't1' });
    seed(t1, 'R1');
    mountProvider();
    const t2 = tok(900, { sub: 'u1', nonce: 't2' });
    seed(t2, 'R2'); // another tab refreshed; no storage event reached this tab
    await advance(61_000); // this tab's timer for t1 fires
    expect(calls).toBe(0);
    expect(localStorage.getItem(ACCESS)).toBe(t2);
    expect(localStorage.getItem(REFRESH)).toBe('R2');
    expect(latest.user?.id).toBe('u1');
    expect(latest.reconnecting).toBe(false);
  });

  it('the retry after a transient failure passes the token stored when it was scheduled', async () => {
    const expired = tok(-100, { sub: 'u1', nonce: 'old' });
    seed(expired, 'R1');
    answer = () => jsonRes(503);
    const spy = jest.spyOn(sessionRefresh, 'refreshSession');
    mountProvider();
    await advance(1000); // first call at 0, retry at 1 s
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, { staleAccessToken: expired });
    expect(spy).toHaveBeenNthCalledWith(2, { staleAccessToken: expired });
  });
});
