// T-616: refreshSession is the one place the web app calls POST /api/auth/refresh.
import { getAccessToken, getRefreshToken } from '../auth';
import {
  REFRESH_LOCK_NAME,
  REFRESH_TIMEOUT_MS,
  refreshInFlight,
  refreshSession,
  resetRefreshState,
} from '../sessionRefresh';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from './helpers/fakeJwt';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;
let fetchMock: FetchMock;
const realFetch = global.fetch;
let consoleSpies: jest.SpyInstance[];

function seed(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}
function setLocks(locks: unknown) {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
}
function bodyOf(call: [string, RequestInit]): unknown {
  return JSON.parse(String(call[1].body));
}

beforeEach(() => {
  // The failure count and cooldown are module state (per tab): start every test clean.
  resetRefreshState();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => undefined),
  );
});
afterEach(async () => {
  // let any in-flight refresh settle so the next test starts with none
  await refreshInFlight();
  global.fetch = realFetch;
  delete (navigator as unknown as { locks?: unknown }).locks;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('outcomes', () => {
  it('200 -> ok with the new access token; both tokens saved', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const next = fakeJwt({ nonce: 'new' });
    fetchMock.mockResolvedValueOnce(refreshOk(next, 'R2'));
    const out = await refreshSession();
    expect(out).toEqual({ kind: 'ok', accessToken: next });
    expect(getAccessToken()).toBe(next);
    expect(getRefreshToken()).toBe('R2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POSTs /api/auth/refresh with a body that has only refreshToken, no Authorization', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    await refreshSession();
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toMatch(/\/api\/auth\/refresh$/);
    expect(call[1].method).toBe('POST');
    expect(bodyOf(call)).toEqual({ refreshToken: 'R1' });
    expect(Object.keys(bodyOf(call) as object)).toEqual(['refreshToken']);
    expect(JSON.stringify(call[1].headers ?? {})).not.toMatch(/authorization/i);
  });

  it('a 200 with no new refresh token keeps the current refresh token', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const next = fakeJwt({ nonce: 'n' });
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { accessToken: next } }));
    expect((await refreshSession()).kind).toBe('ok');
    expect(getRefreshToken()).toBe('R1');
    expect(getAccessToken()).toBe(next);
  });

  it.each([401, 400])(
    '%s for the stored refresh token -> expired; tokens left untouched',
    async (status) => {
      const a = fakeJwt({ expiresInSec: -10 });
      seed(a, 'R1');
      fetchMock.mockResolvedValueOnce(jsonRes(status));
      expect(await refreshSession()).toEqual({ kind: 'expired' });
      expect(getAccessToken()).toBe(a);
      expect(getRefreshToken()).toBe('R1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('no refresh token -> expired, no request', async () => {
    localStorage.setItem(ACCESS, fakeJwt({ expiresInSec: -10 }));
    expect(await refreshSession()).toEqual({ kind: 'expired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([429, 500, 502, 503, 504, 404, 403])(
    '%s -> transient; tokens untouched',
    async (status) => {
      const a = fakeJwt({ expiresInSec: -10 });
      seed(a, 'R1');
      fetchMock.mockResolvedValueOnce(jsonRes(status));
      expect(await refreshSession()).toEqual({ kind: 'transient' });
      expect(getAccessToken()).toBe(a);
      expect(getRefreshToken()).toBe('R1');
    },
  );

  it('a network error -> transient', async () => {
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    expect(getAccessToken()).toBe(a);
    expect(getRefreshToken()).toBe('R1');
  });

  it('fetch throwing synchronously -> transient, never throws', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(refreshSession()).resolves.toEqual({ kind: 'transient' });
  });

  it('an unreadable 200 (bad JSON, or no access token) -> transient; tokens untouched', async () => {
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad');
      },
    } as unknown as Response);
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: {} }));
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    fetchMock.mockResolvedValueOnce(jsonRes(200, null));
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    expect(getAccessToken()).toBe(a);
    expect(getRefreshToken()).toBe('R1');
  });
});

describe('15 s timeout', () => {
  it('a refresh that has not answered by then aborts and counts as transient', async () => {
    jest.useFakeTimers();
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1');
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(
      (_u, init) =>
        new Promise<Response>((_res, rej) => {
          signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }),
    );
    let settled: string | null = null;
    const p = refreshSession().then((o) => {
      settled = o.kind;
      return o;
    });
    await jest.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1);
    expect(settled).toBeNull();
    expect(signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ kind: 'transient' });
    expect(signal?.aborted).toBe(true);
    expect(REFRESH_TIMEOUT_MS).toBe(15_000);
    expect(getAccessToken()).toBe(a);
    expect(getRefreshToken()).toBe('R1');
  });

  it('the timer is cleared after a fast answer (nothing left pending)', async () => {
    jest.useFakeTimers();
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    await refreshSession();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('single flight', () => {
  it('two concurrent callers share one fetch and one outcome; refreshInFlight is exposed', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    let release: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (release = res)));
    expect(refreshInFlight()).toBeNull();
    const p1 = refreshSession();
    const p2 = refreshSession();
    expect(p1).toBe(p2);
    expect(refreshInFlight()).toBe(p1);
    await Promise.resolve();
    release(refreshOk(fakeJwt(), 'R2'));
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(o1).toEqual(o2);
    expect(o1.kind).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshInFlight()).toBeNull();
  });

  it('after it settles, the next call makes a new request', async () => {
    jest.useFakeTimers();
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(jsonRes(503)).mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    expect((await refreshSession()).kind).toBe('transient');
    jest.advanceTimersByTime(1_000); // the 1 s cooldown after the first transient result
    expect((await refreshSession()).kind).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cross-tab lock', () => {
  function lockStub(beforeRun?: () => void) {
    const request = jest.fn(
      async (_name: string, _opts: { signal?: AbortSignal }, cb: () => Promise<unknown>) => {
        beforeRun?.();
        return cb();
      },
    );
    setLocks({ request });
    return request;
  }

  it('runs the refresh inside navigator.locks.request("lawie-session-refresh")', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const request = lockStub();
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    expect((await refreshSession()).kind).toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(REFRESH_LOCK_NAME);
    expect(REFRESH_LOCK_NAME).toBe('lawie-session-refresh');
  });

  it('another tab refreshed while we waited for the lock: ok with its token, NO fetch', async () => {
    const stale = fakeJwt({ expiresInSec: -10, nonce: 'stale' });
    seed(stale, 'R1');
    const fresh = fakeJwt({ nonce: 'fresh' });
    lockStub(() => seed(fresh, 'R2')); // the other tab saves while we queue
    const out = await refreshSession({ staleAccessToken: stale });
    expect(out).toEqual({ kind: 'ok', accessToken: fresh });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe('R2');
  });

  it('the refresh token is read from storage inside the lock, not before', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    lockStub(() => localStorage.setItem(REFRESH, 'R-from-other-tab'));
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R3'));
    await refreshSession();
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ refreshToken: 'R-from-other-tab' });
  });

  it('a stored token that equals the stale one is not "fresh": the endpoint is called', async () => {
    const stale = fakeJwt({ nonce: 's' });
    seed(stale, 'R1');
    lockStub();
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    await refreshSession({ staleAccessToken: stale });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a different stored token that is itself expired is not used', async () => {
    const stale = fakeJwt({ expiresInSec: -10, nonce: 'a' });
    seed(stale, 'R1');
    lockStub(() => localStorage.setItem(ACCESS, fakeJwt({ expiresInSec: -50, nonce: 'b' })));
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    await refreshSession({ staleAccessToken: stale });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('if the lock itself fails: transient, NO lock-free second attempt, no fetch (T-616 review)', async () => {
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1');
    setLocks({
      request: jest.fn(async () => {
        throw new Error('SecurityError');
      }),
    });
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(a);
    expect(getRefreshToken()).toBe('R1');
  });

  it('without Web Locks (jsdom) it still refreshes', async () => {
    expect((navigator as unknown as { locks?: unknown }).locks).toBeUndefined();
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    expect((await refreshSession()).kind).toBe('ok');
  });
});

describe('another tab rotated the refresh token (a 401 is NOT then "expired")', () => {
  it('401 for R1 but a fresh valid access token is now stored -> ok with it, no second call', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const fresh = fakeJwt({ nonce: 'fresh' });
    fetchMock.mockImplementationOnce(async () => {
      seed(fresh, 'R2'); // the other tab won the race
      return jsonRes(401);
    });
    const out = await refreshSession();
    expect(out).toEqual({ kind: 'ok', accessToken: fresh });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getRefreshToken()).toBe('R2');
  });

  it('401 for R1, stored refresh is now R2 but the access token is not fresh -> one more call with R2', async () => {
    seed(fakeJwt({ expiresInSec: -10, nonce: 'x' }), 'R1');
    const next = fakeJwt({ nonce: 'next' });
    fetchMock
      .mockImplementationOnce(async () => {
        localStorage.setItem(REFRESH, 'R2'); // rotated, access token still the old one
        return jsonRes(401);
      })
      .mockResolvedValueOnce(refreshOk(next, 'R3'));
    const out = await refreshSession();
    expect(out).toEqual({ kind: 'ok', accessToken: next });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ refreshToken: 'R1' });
    expect(bodyOf(fetchMock.mock.calls[1])).toEqual({ refreshToken: 'R2' });
  });

  it('is expired only once the token it sent is still the stored one (second call refused)', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock
      .mockImplementationOnce(async () => {
        localStorage.setItem(REFRESH, 'R2');
        return jsonRes(401);
      })
      .mockResolvedValueOnce(jsonRes(401));
    expect(await refreshSession()).toEqual({ kind: 'expired' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never makes more than two calls', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    let n = 1;
    fetchMock.mockImplementation(async () => {
      n += 1;
      localStorage.setItem(REFRESH, `R${n}`); // somebody keeps rotating
      return jsonRes(401);
    });
    const out = await refreshSession();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(out.kind).not.toBe('ok');
  });

  it('401 while signed out in the meantime (tokens gone) -> expired, nothing saved', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockImplementationOnce(async () => {
      localStorage.clear();
      return jsonRes(401);
    });
    expect(await refreshSession()).toEqual({ kind: 'expired' });
    expect(getAccessToken()).toBeNull();
  });
});

describe('sign-out while the call is in flight', () => {
  it('a 200 that arrives after sign-out is not saved (the session is not brought back)', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockImplementationOnce(async () => {
      localStorage.removeItem(ACCESS);
      localStorage.removeItem(REFRESH); // user signed out (this tab or another)
      return refreshOk(fakeJwt(), 'R2');
    });
    const out = await refreshSession();
    expect(out.kind).not.toBe('ok');
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('never logs', () => {
  it('no console output for any outcome, and no token in any thrown/returned value', async () => {
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1-secret-marker');
    fetchMock
      .mockResolvedValueOnce(jsonRes(401))
      .mockResolvedValueOnce(jsonRes(503))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    const outs = [];
    for (let i = 0; i < 4; i += 1) {
      outs.push(await refreshSession());
      resetRefreshState(); // skip the cooldown; this test is about what is logged
    }
    expect(outs.map((o) => o.kind)).toEqual(['expired', 'transient', 'transient', 'ok']);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(outs.slice(0, 3))).not.toContain('R1-secret-marker');
  });
});
