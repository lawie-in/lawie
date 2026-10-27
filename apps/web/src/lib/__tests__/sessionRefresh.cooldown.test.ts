// T-616 round 2: cooldown, Retry-After, `reconnecting`, Web Locks timeout, and the rule that a 200
// is only saved for the session that sent the refresh token (review must-fix 2).
import { getAccessToken, getRefreshToken, tokenSubject } from '../auth';
import {
  COOLDOWN_CAP_MS,
  isReconnecting,
  LOCK_ACQUIRE_TIMEOUT_MS,
  RECONNECTING_AFTER_FAILURES,
  refreshCooldownMs,
  refreshFailureCount,
  refreshInFlight,
  refreshSession,
  resetRefreshState,
  RETRY_AFTER_CAP_MS,
  subscribeRefreshState,
} from '../sessionRefresh';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from './helpers/fakeJwt';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;
let fetchMock: FetchMock;
const realFetch = global.fetch;

function seed(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}
function setLocks(locks: unknown) {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
}
function withRetryAfter(status: number, value: string): Response {
  return {
    ok: false,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? value : null) },
    json: async () => ({}),
  } as unknown as Response;
}

beforeEach(() => {
  jest.useFakeTimers();
  resetRefreshState();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(async () => {
  await refreshInFlight();
  global.fetch = realFetch;
  delete (navigator as unknown as { locks?: unknown }).locks;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('cooldown schedule', () => {
  it('after the n-th consecutive transient result the cooldown is 1, 2, 4 ... 60 s (capped)', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    const seen: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      expect((await refreshSession()).kind).toBe('transient');
      seen.push(refreshCooldownMs());
      jest.advanceTimersByTime(refreshCooldownMs());
    }
    expect(seen).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
    expect(COOLDOWN_CAP_MS).toBe(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('makes NO call during the cooldown: transient, tokens untouched', async () => {
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    fetchMock.mockClear();
    jest.advanceTimersByTime(999);
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(a);
    jest.advanceTimersByTime(1);
    await refreshSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('during the cooldown it returns ok (and ends the cooldown) if another tab saved a fresh valid token', async () => {
    const stale = fakeJwt({ expiresInSec: -10, nonce: 's' });
    seed(stale, 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession({ staleAccessToken: stale });
    expect(refreshFailureCount()).toBe(1);
    fetchMock.mockClear();
    const fresh = fakeJwt({ nonce: 'other-tab' });
    seed(fresh, 'R2');
    expect(await refreshSession({ staleAccessToken: stale })).toEqual({
      kind: 'ok',
      accessToken: fresh,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshFailureCount()).toBe(0);
    expect(refreshCooldownMs()).toBe(0);
  });

  it.each([
    ['ok', async () => fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'))],
    ['expired', async () => fetchMock.mockResolvedValueOnce(jsonRes(401))],
  ])('an %s result ends the cooldown and the failure count', async (_name, arrange) => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(jsonRes(503)).mockResolvedValueOnce(jsonRes(503));
    await refreshSession();
    jest.advanceTimersByTime(1000);
    await refreshSession();
    expect(refreshFailureCount()).toBe(2);
    jest.advanceTimersByTime(2000);
    await arrange();
    await refreshSession();
    expect(refreshFailureCount()).toBe(0);
    expect(refreshCooldownMs()).toBe(0);
  });

  it('resetRefreshState (login, logout, a sign-out seen on another tab) clears count and cooldown', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    expect(refreshCooldownMs()).toBeGreaterThan(0);
    resetRefreshState();
    expect(refreshFailureCount()).toBe(0);
    expect(refreshCooldownMs()).toBe(0);
  });

  it('a simulated 65 s storm of 503s with a focus event every second makes 7 calls (0, 1, 3, 7, 15, 31, 63 s)', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const at: number[] = [];
    const t0 = Date.now();
    fetchMock.mockImplementation(async () => {
      at.push(Math.round((Date.now() - t0) / 1000));
      return jsonRes(503);
    });
    for (let s = 0; s <= 65; s += 1) {
      await refreshSession();
      await refreshSession(); // a second caller in the same second
      jest.advanceTimersByTime(1000);
    }
    expect(at).toEqual([0, 1, 3, 7, 15, 31, 63]);
  });
});

describe('refreshCooldownMs clamp (round 3: wall clock moving backwards)', () => {
  it('a clock set back by 3 hours after a failure cannot produce a wait longer than 5 minutes', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    expect(refreshCooldownMs()).toBe(1000);
    jest.setSystemTime(Date.now() - 3 * 3_600_000);
    expect(refreshCooldownMs()).toBe(RETRY_AFTER_CAP_MS);
    expect(refreshCooldownMs()).toBeLessThanOrEqual(300_000);
  });

  it('self-heals: after a 3 h step back, 5 minutes of the clock (not 3 h) allow a /refresh call again', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    jest.setSystemTime(Date.now() - 3 * 3_600_000);
    expect(refreshCooldownMs()).toBe(RETRY_AFTER_CAP_MS); // first read pins the end to now + 5 min
    fetchMock.mockClear();
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    expect(fetchMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(RETRY_AFTER_CAP_MS - 1);
    expect(refreshCooldownMs()).toBe(1);
    jest.advanceTimersByTime(1);
    expect(refreshCooldownMs()).toBe(0);
    await refreshSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a small step back (10 s) only lengthens the wait by that much', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    jest.setSystemTime(Date.now() - 10_000);
    expect(refreshCooldownMs()).toBe(11_000);
  });

  it('a clock moving forward past the end gives 0, never negative', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    jest.setSystemTime(Date.now() + 3_600_000);
    expect(refreshCooldownMs()).toBe(0);
  });

  it('the clamp is only a ceiling: a 5-minute Retry-After is honoured whole, and normal growth is untouched', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(withRetryAfter(429, '3600'));
    await refreshSession();
    expect(refreshCooldownMs()).toBe(RETRY_AFTER_CAP_MS);
    jest.advanceTimersByTime(RETRY_AFTER_CAP_MS);
    expect(refreshCooldownMs()).toBe(0);
  });
});

describe('Retry-After on a 429', () => {
  async function cooldownAfter429(value: string, priorFailures = 0): Promise<number> {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    for (let i = 0; i < priorFailures; i += 1) {
      fetchMock.mockResolvedValueOnce(jsonRes(503));
      await refreshSession();
      jest.advanceTimersByTime(refreshCooldownMs());
    }
    fetchMock.mockResolvedValueOnce(withRetryAfter(429, value));
    expect((await refreshSession()).kind).toBe('transient');
    return refreshCooldownMs();
  }

  it('seconds, when longer than the backoff', async () => {
    expect(await cooldownAfter429('120')).toBe(120_000);
  });
  it('an HTTP date, when longer than the backoff', async () => {
    const date = new Date(Date.now() + 90_000).toUTCString();
    const ms = await cooldownAfter429(date);
    expect(ms).toBeGreaterThan(88_000);
    expect(ms).toBeLessThanOrEqual(90_000);
  });
  it('capped at 5 minutes', async () => {
    expect(await cooldownAfter429('3600')).toBe(RETRY_AFTER_CAP_MS);
    expect(RETRY_AFTER_CAP_MS).toBe(300_000);
  });
  it('ignored when shorter than the backoff (3rd failure: 4 s beats Retry-After 1)', async () => {
    expect(await cooldownAfter429('1', 2)).toBe(4000);
  });
  it('an unreadable Retry-After falls back to the backoff', async () => {
    expect(await cooldownAfter429('soon')).toBe(1000);
  });
  it('is only read for a 429 (a 503 with Retry-After uses the backoff)', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValueOnce(withRetryAfter(503, '120'));
    await refreshSession();
    expect(refreshCooldownMs()).toBe(1000);
  });
});

describe('reconnecting', () => {
  it('false at 0 and 1 failures, true at 2, false again after an ok', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    expect(RECONNECTING_AFTER_FAILURES).toBe(2);
    expect(isReconnecting()).toBe(false);
    fetchMock.mockResolvedValue(jsonRes(503));
    await refreshSession();
    expect(refreshFailureCount()).toBe(1);
    expect(isReconnecting()).toBe(false);
    jest.advanceTimersByTime(1000);
    await refreshSession();
    expect(isReconnecting()).toBe(true);
    jest.advanceTimersByTime(2000);
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    await refreshSession();
    expect(isReconnecting()).toBe(false);
  });

  it('a lock that was not obtained counts as a failure', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    setLocks({
      request: jest.fn(async () => {
        throw new Error('nope');
      }),
    });
    await refreshSession();
    jest.advanceTimersByTime(1000);
    await refreshSession();
    expect(refreshFailureCount()).toBe(2);
    expect(isReconnecting()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('subscribeRefreshState notifies on each failure and on a reset, and stops after unsubscribe', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    const fn = jest.fn();
    const off = subscribeRefreshState(fn);
    await refreshSession();
    expect(fn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await refreshSession();
    expect(fn).toHaveBeenCalledTimes(2);
    resetRefreshState();
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    jest.advanceTimersByTime(1000);
    await refreshSession();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('a listener that throws does not break the refresh', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    fetchMock.mockResolvedValue(jsonRes(503));
    const off = subscribeRefreshState(() => {
      throw new Error('listener');
    });
    await expect(refreshSession()).resolves.toEqual({ kind: 'transient' });
    off();
  });
});

describe('Web Locks: acquire timeout and failures', () => {
  it('passes an AbortSignal as the options argument', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const request = jest.fn(async (_n: string, _o: unknown, cb: () => Promise<unknown>) => cb());
    setLocks({ request });
    fetchMock.mockResolvedValueOnce(refreshOk(fakeJwt(), 'R2'));
    await refreshSession();
    const opts = request.mock.calls[0][1] as { signal?: AbortSignal };
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('a lock not obtained within 5 s -> transient, no fetch, timer cleaned up', async () => {
    const a = fakeJwt({ expiresInSec: -10 });
    seed(a, 'R1');
    setLocks({
      request: (_n: string, o: { signal: AbortSignal }) =>
        new Promise((_res, rej) => {
          o.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }),
    });
    let out: string | null = null;
    const p = refreshSession().then((r) => (out = r.kind));
    await jest.advanceTimersByTimeAsync(LOCK_ACQUIRE_TIMEOUT_MS - 1);
    expect(out).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(LOCK_ACQUIRE_TIMEOUT_MS).toBe(5_000);
    expect(out).toBe('transient');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(a);
    expect(getRefreshToken()).toBe('R1');
    expect(jest.getTimerCount()).toBe(0);
    expect(refreshFailureCount()).toBe(1);
  });

  it('the acquire timer is cleared as soon as the lock is obtained (a slow refresh is not aborted at 5 s)', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    setLocks({
      request: async (_n: string, _o: unknown, cb: () => Promise<unknown>) => cb(),
    });
    let release: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (release = res)));
    const p = refreshSession();
    await jest.advanceTimersByTimeAsync(LOCK_ACQUIRE_TIMEOUT_MS + 100);
    release(refreshOk(fakeJwt(), 'R2'));
    expect((await p).kind).toBe('ok');
  });

  it('a callback that throws after it started -> transient, nothing rerun, no second fetch', async () => {
    seed(fakeJwt({ expiresInSec: -10 }), 'R1');
    const request = jest.fn(async (_n: string, _o: unknown, cb: () => Promise<unknown>) => {
      await cb();
      throw new Error('lock manager failed after the callback ran');
    });
    setLocks({ request });
    fetchMock.mockResolvedValue(refreshOk(fakeJwt(), 'R2'));
    expect(await refreshSession()).toEqual({ kind: 'transient' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('a 200 is saved only for the session that sent the refresh token (review must-fix 2)', () => {
  it("A's 200 arriving after B signed in is NOT saved; B's tokens stay; ok with B's token", async () => {
    seed(fakeJwt({ expiresInSec: -10, sub: 'user-A', nonce: 'a0' }), 'RA');
    const bAccess = fakeJwt({ sub: 'user-B', nonce: 'b0' });
    const aNew = fakeJwt({ sub: 'user-A', nonce: 'a1' });
    fetchMock.mockImplementationOnce(async () => {
      seed(bAccess, 'RB'); // B signs in (another tab) while A's refresh is in flight
      return refreshOk(aNew, 'RA2');
    });
    const out = await refreshSession();
    expect(out).toEqual({ kind: 'ok', accessToken: bAccess });
    expect(tokenSubject(getAccessToken())).toBe('user-B');
    expect(getAccessToken()).toBe(bAccess);
    expect(getRefreshToken()).toBe('RB');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshFailureCount()).toBe(0);
  });

  it("A's 200 arriving after B signed in with a not-yet-fresh access token: B's refresh token is used next, A's answer never saved", async () => {
    seed(fakeJwt({ expiresInSec: -10, sub: 'user-A', nonce: 'a0' }), 'RA');
    const bNew = fakeJwt({ sub: 'user-B', nonce: 'b1' });
    fetchMock
      .mockImplementationOnce(async () => {
        localStorage.setItem(REFRESH, 'RB'); // B's refresh token, access token still expired
        return refreshOk(fakeJwt({ sub: 'user-A', nonce: 'a1' }), 'RA2');
      })
      .mockResolvedValueOnce(refreshOk(bNew, 'RB2'));
    const out = await refreshSession();
    expect(out).toEqual({ kind: 'ok', accessToken: bNew });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ refreshToken: 'RB' });
    expect(getRefreshToken()).toBe('RB2');
    expect(tokenSubject(getAccessToken())).toBe('user-B');
  });

  it('a 200 that arrives after sign-out is dropped: expired, nothing saved', async () => {
    seed(fakeJwt({ expiresInSec: -10, sub: 'user-A' }), 'RA');
    fetchMock.mockImplementationOnce(async () => {
      localStorage.clear();
      return refreshOk(fakeJwt({ sub: 'user-A', nonce: 'late' }), 'RA2');
    });
    expect(await refreshSession()).toEqual({ kind: 'expired' });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('the normal case still saves (stored refresh token unchanged)', async () => {
    seed(fakeJwt({ expiresInSec: -10, sub: 'user-A' }), 'RA');
    const next = fakeJwt({ sub: 'user-A', nonce: 'n' });
    fetchMock.mockResolvedValueOnce(refreshOk(next, 'RA2'));
    expect(await refreshSession()).toEqual({ kind: 'ok', accessToken: next });
    expect(getRefreshToken()).toBe('RA2');
  });
});
