// T-616: apiFetch: refresh-then-retry on a 401, the late-401 race, waiting for a running refresh,
// transient backoff, and the one case that ends the session (the auth service refused the refresh).
import { apiFetch, refreshAccessToken, TRANSIENT_REFRESH_BACKOFF_MS } from '../apiFetch';
import { getAccessToken, getRefreshToken } from '../auth';
import { refreshInFlight, refreshSession, resetRefreshState } from '../sessionRefresh';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from './helpers/fakeJwt';

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;
let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
const realFetch = global.fetch;
const realLocation = window.location;
let replace: jest.Mock;

const isRefresh = (u: string) => /\/api\/auth\/refresh$/.test(u);
const apiCalls = () => fetchMock.mock.calls.filter((c) => !isRefresh(c[0]));
const refreshCalls = () => fetchMock.mock.calls.filter((c) => isRefresh(c[0]));
const bearer = (c: [string, RequestInit]) =>
  (c[1].headers as Record<string, string> | undefined)?.Authorization;

function route(handler: Handler) {
  fetchMock.mockImplementation(async (u, i) => handler(u, i));
}
function seed(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
async function flush(n = 30) {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
}

beforeEach(() => {
  resetRefreshState(); // the cooldown is module state (per tab)
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  replace = jest.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/dashboard/new', search: '?draft=secret', hash: '#x', replace },
  });
});
afterEach(async () => {
  await refreshInFlight();
  global.fetch = realFetch;
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('basics', () => {
  it('attaches the stored token as Bearer and merges headers; a non-401 is returned as is', async () => {
    const t = fakeJwt();
    seed(t, 'R1');
    route(() => jsonRes(200, { ok: 1 }));
    const res = await apiFetch('/api/x', { headers: { 'X-A': 'b' } });
    expect(res.status).toBe(200);
    expect(apiCalls()).toHaveLength(1);
    expect(apiCalls()[0][1].headers).toEqual({ 'X-A': 'b', Authorization: `Bearer ${t}` });
    expect(refreshCalls()).toHaveLength(0);
  });

  it('no stored token: no Authorization header', async () => {
    route(() => jsonRes(200));
    await apiFetch('/api/x');
    expect(bearer(apiCalls()[0])).toBeUndefined();
  });

  it('a 500 or 403 is returned as is, no refresh', async () => {
    seed(fakeJwt(), 'R1');
    route(() => jsonRes(403));
    expect((await apiFetch('/api/x')).status).toBe(403);
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('401 -> refresh -> retry once with the NEW token', () => {
  it('returns the second response, sent with the new token; one refresh call', async () => {
    const t1 = fakeJwt({ nonce: 't1' });
    const t2 = fakeJwt({ nonce: 't2' });
    seed(t1, 'R1');
    route((u, i) => {
      if (isRefresh(u)) return refreshOk(t2, 'R2');
      return (i.headers as Record<string, string>).Authorization === `Bearer ${t2}`
        ? jsonRes(200, { second: true })
        : jsonRes(401);
    });
    const res = await apiFetch('/api/x', { method: 'POST', body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ second: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bearer(apiCalls()[0])).toBe(`Bearer ${t1}`);
    expect(bearer(apiCalls()[1])).toBe(`Bearer ${t2}`);
    expect(apiCalls()[1][1].method).toBe('POST');
    expect(apiCalls()[1][1].body).toBe('{"a":1}');
    expect(JSON.parse(String(refreshCalls()[0][1].body))).toEqual({ refreshToken: 'R1' });
    expect(getAccessToken()).toBe(t2);
    expect(getRefreshToken()).toBe('R2');
    expect(replace).not.toHaveBeenCalled();
  });

  it('retries only once: a 401 on the retry is returned, no loop, no sign-out', async () => {
    seed(fakeJwt({ nonce: 'a' }), 'R1');
    route((u) => (isRefresh(u) ? refreshOk(fakeJwt({ nonce: 'b' }), 'R2') : jsonRes(401)));
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(401);
    expect(apiCalls()).toHaveLength(2);
    expect(refreshCalls()).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe('R2');
  });
});

describe('THE LATE-401 RACE', () => {
  it('a 401 for a request sent with the old token, after a refresh already succeeded, retries with the new token, makes no refresh call and does not end the session', async () => {
    const t1 = fakeJwt({ nonce: 'old' });
    const t2 = fakeJwt({ nonce: 'new' });
    seed(t1, 'R1');
    sessionStorage.setItem('lawie:draft-prefill', 'unsaved description');
    const lateAnswer = deferred<Response>();
    route((u, i) => {
      if (isRefresh(u)) throw new Error('no refresh call expected');
      const auth = (i.headers as Record<string, string>).Authorization;
      return auth === `Bearer ${t1}` ? lateAnswer.promise : jsonRes(200, { retried: true });
    });
    // request A goes out with T1 (the gateway has not answered yet)
    const a = apiFetch('/api/me');
    await flush();
    expect(bearer(apiCalls()[0])).toBe(`Bearer ${t1}`);
    // meanwhile a refresh succeeded (this tab's timer or another tab): T2/R2 stored, T1 revoked
    seed(t2, 'R2');
    // A's late 401 ("session expired") arrives
    lateAnswer.resolve(jsonRes(401, { error: 'session expired' }));
    const res = await a;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retried: true });
    expect(refreshCalls()).toHaveLength(0); // no refresh call
    expect(apiCalls()).toHaveLength(2);
    expect(bearer(apiCalls()[1])).toBe(`Bearer ${t2}`); // retried with the NEW token
    expect(replace).not.toHaveBeenCalled(); // not sent to /login
    expect(getAccessToken()).toBe(t2); // session intact
    expect(getRefreshToken()).toBe('R2');
    expect(sessionStorage.getItem('lawie:forced-end-subject')).toBeNull();
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('unsaved description');
  });

  it('if that retry with the new token ALSO gets a 401, it then refreshes with the new token as stale', async () => {
    const t1 = fakeJwt({ nonce: 'old' });
    const t2 = fakeJwt({ nonce: 'new' });
    const t3 = fakeJwt({ nonce: 'newer' });
    seed(t1, 'R1');
    const late = deferred<Response>();
    route((u, i) => {
      const auth = (i.headers as Record<string, string>)?.Authorization;
      if (isRefresh(u)) return refreshOk(t3, 'R3');
      if (auth === `Bearer ${t1}`) return late.promise;
      if (auth === `Bearer ${t2}`) return jsonRes(401);
      return jsonRes(200, { third: true });
    });
    const a = apiFetch('/api/me');
    await flush();
    seed(t2, 'R2');
    late.resolve(jsonRes(401));
    const res = await a;
    expect(await res.json()).toEqual({ third: true });
    expect(refreshCalls()).toHaveLength(1);
    expect(JSON.parse(String(refreshCalls()[0][1].body))).toEqual({ refreshToken: 'R2' });
    expect(bearer(apiCalls()[2])).toBe(`Bearer ${t3}`);
    expect(replace).not.toHaveBeenCalled();
  });

  it('that second 401 plus a refresh the auth service refuses ends the session', async () => {
    const t1 = fakeJwt({ nonce: 'old' });
    const t2 = fakeJwt({ nonce: 'new' });
    seed(t1, 'R1');
    const late = deferred<Response>();
    route((u, i) => {
      if (isRefresh(u)) return jsonRes(401);
      const auth = (i.headers as Record<string, string>).Authorization;
      return auth === `Bearer ${t1}` ? late.promise : jsonRes(401);
    });
    const a = apiFetch('/api/me');
    void a.catch(() => undefined);
    await flush();
    seed(t2, 'R2');
    late.resolve(jsonRes(401));
    await flush(60);
    expect(replace).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Fnew');
    expect(getAccessToken()).toBeNull();
  });

  it("JOIN variant: a 401 that arrives while this tab's refresh is still running joins it (one refresh call total)", async () => {
    const t1 = fakeJwt({ nonce: 'old' });
    const t2 = fakeJwt({ nonce: 'new' });
    seed(t1, 'R1');
    const lateApi = deferred<Response>();
    const refreshAnswer = deferred<Response>();
    route((u, i) => {
      if (isRefresh(u)) return refreshAnswer.promise;
      const auth = (i.headers as Record<string, string>).Authorization;
      return auth === `Bearer ${t1}` ? lateApi.promise : jsonRes(200, { joined: true });
    });
    const a = apiFetch('/api/me'); // sent with T1
    await flush();
    const proactive = refreshSession(); // this tab's timer refresh starts and is still running
    await flush();
    expect(refreshCalls()).toHaveLength(1);
    lateApi.resolve(jsonRes(401)); // stored token is still T1: A joins the running refresh
    await flush();
    refreshAnswer.resolve(refreshOk(t2, 'R2'));
    const res = await a;
    expect((await proactive).kind).toBe('ok');
    expect(await res.json()).toEqual({ joined: true });
    expect(refreshCalls()).toHaveLength(1); // no second refresh call
    expect(bearer(apiCalls()[1])).toBe(`Bearer ${t2}`);
    expect(replace).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(t2);
  });
});

describe('waits for a refresh already in flight before sending', () => {
  it('sends only after it finished, with the NEW token', async () => {
    const t1 = fakeJwt({ nonce: 'old' });
    const t2 = fakeJwt({ nonce: 'new' });
    seed(t1, 'R1');
    const refreshAnswer = deferred<Response>();
    route((u) => (isRefresh(u) ? refreshAnswer.promise : jsonRes(200)));
    const p = refreshSession();
    await flush();
    const a = apiFetch('/api/x');
    await flush();
    expect(apiCalls()).toHaveLength(0); // held back
    refreshAnswer.resolve(refreshOk(t2, 'R2'));
    await p;
    expect((await a).status).toBe(200);
    expect(apiCalls()).toHaveLength(1);
    expect(bearer(apiCalls()[0])).toBe(`Bearer ${t2}`);
  });

  it('if that refresh was only delayed (503), the request is still sent with the current token', async () => {
    const t1 = fakeJwt({ nonce: 'old' });
    seed(t1, 'R1');
    const refreshAnswer = deferred<Response>();
    route((u) => (isRefresh(u) ? refreshAnswer.promise : jsonRes(200)));
    void refreshSession();
    await flush();
    const a = apiFetch('/api/x');
    await flush();
    refreshAnswer.resolve(jsonRes(503));
    expect((await a).status).toBe(200);
    expect(bearer(apiCalls()[0])).toBe(`Bearer ${t1}`);
    expect(getAccessToken()).toBe(t1);
  });
});

describe('transient refresh outcomes never sign out', () => {
  it('waits 0.5 / 1.5 / 4 s between looks, but calls only as the tab-wide cooldown allows (t=0, 2 s, 6 s), then rejects with TypeError("Failed to fetch"); tokens kept, no redirect', async () => {
    jest.useFakeTimers();
    const t1 = fakeJwt({ nonce: 'old' });
    seed(t1, 'R1');
    sessionStorage.setItem('lawie:draft-prefill', 'unsaved');
    route((u) => (isRefresh(u) ? jsonRes(503) : jsonRes(401)));
    expect([...TRANSIENT_REFRESH_BACKOFF_MS]).toEqual([500, 1500, 4000]);

    let error: unknown = null;
    const p = apiFetch('/api/x').catch((e) => {
      error = e;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(refreshCalls()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(500); // 2nd look at 0.5 s: inside the 1 s cooldown, no call
    expect(refreshCalls()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1499);
    expect(refreshCalls()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1); // 3rd look at 2 s: cooldown over
    expect(refreshCalls()).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(3999);
    expect(refreshCalls()).toHaveLength(2);
    expect(error).toBeNull();
    await jest.advanceTimersByTimeAsync(1); // 4th look at 6 s: the 2 s cooldown is over
    await p;
    expect(refreshCalls()).toHaveLength(3);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe('Failed to fetch');
    expect(getAccessToken()).toBe(t1);
    expect(getRefreshToken()).toBe('R1');
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('unsaved');
    expect(replace).not.toHaveBeenCalled();
  });

  it('a cooldown that outlasts every wait left (429 Retry-After 120 s) fails at once with TypeError, one call, no sign-out', async () => {
    jest.useFakeTimers();
    const t1 = fakeJwt({ nonce: 'old' });
    seed(t1, 'R1');
    route((u) =>
      isRefresh(u)
        ? ({
            ok: false,
            status: 429,
            headers: { get: () => '120' },
            json: async () => ({}),
          } as unknown as Response)
        : jsonRes(401),
    );
    let error: unknown = null;
    const p = apiFetch('/api/x').catch((e) => {
      error = e;
    });
    await jest.advanceTimersByTimeAsync(0);
    await p;
    expect(error).toBeInstanceOf(TypeError);
    expect(refreshCalls()).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(getRefreshToken()).toBe('R1');
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([429, 503, 'network'])(
    '%s then success on the 2nd attempt: the request is retried and succeeds',
    async (kind) => {
      jest.useFakeTimers();
      seed(fakeJwt({ nonce: 'old' }), 'R1');
      const t2 = fakeJwt({ nonce: 'new' });
      let n = 0;
      route((u, i) => {
        if (isRefresh(u)) {
          n += 1;
          if (n === 1) {
            if (kind === 'network') throw new TypeError('Failed to fetch');
            return jsonRes(kind as number);
          }
          return refreshOk(t2, 'R2');
        }
        return (i.headers as Record<string, string>).Authorization === `Bearer ${t2}`
          ? jsonRes(200)
          : jsonRes(401);
      });
      const p = apiFetch('/api/x');
      // the 2nd look (0.5 s) is inside the 1 s cooldown; the 3rd (2 s) makes the 2nd call
      await jest.advanceTimersByTimeAsync(2000);
      expect((await p).status).toBe(200);
      expect(refreshCalls()).toHaveLength(2);
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it('still transient, but another tab saved a different valid token meanwhile: one retry with it', async () => {
    jest.useFakeTimers();
    const t1 = fakeJwt({ nonce: 'old' });
    const other = fakeJwt({ nonce: 'other-tab' });
    seed(t1, 'R1');
    route((u, i) => {
      if (isRefresh(u)) {
        seed(other, 'R9'); // another tab got a token in, though our attempts are throttled
        return jsonRes(429);
      }
      return (i.headers as Record<string, string>).Authorization === `Bearer ${other}`
        ? jsonRes(200, { viaOther: true })
        : jsonRes(401);
    });
    const p = apiFetch('/api/x');
    await jest.advanceTimersByTimeAsync(6000);
    const res = await p;
    expect(await res.json()).toEqual({ viaOther: true });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('expired (the auth service refused the refresh token)', () => {
  it('ends the session with endSessionForced and replaces to /login?next=<pathname>; never resolves', async () => {
    const t1 = fakeJwt({ sub: 'u1' });
    seed(t1, 'R1');
    sessionStorage.setItem('lawie:draft-prefill', 'unsaved description');
    sessionStorage.setItem('lawie_privacy_prompt_shown:u1', '1');
    route((u) => (isRefresh(u) ? jsonRes(401) : jsonRes(401)));
    let settled = false;
    void apiFetch('/api/x').then(
      () => (settled = true),
      () => (settled = true),
    );
    await flush(60);
    expect(replace).toHaveBeenCalledTimes(1);
    // pathname only: the "?draft=secret#x" in the fake location is not carried
    expect(replace).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Fnew');
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(sessionStorage.getItem('lawie_privacy_prompt_shown:u1')).toBeNull();
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('unsaved description'); // kept
    expect(sessionStorage.getItem('lawie:forced-end-subject')).toBe('u1');
    expect(settled).toBe(false);
  });

  it('no refresh token at all -> expired -> forced end and redirect, with no refresh request', async () => {
    localStorage.setItem(ACCESS, fakeJwt());
    route(() => jsonRes(401));
    void apiFetch('/api/x');
    await flush(60);
    expect(refreshCalls()).toHaveLength(0);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('from "/" the redirect is plain /login', async () => {
    (window.location as unknown as { pathname: string }).pathname = '/';
    seed(fakeJwt(), 'R1');
    route(() => jsonRes(401));
    void apiFetch('/api/x');
    await flush(60);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('a refresh that is "expired" but where another tab rotated (stored refresh differs) does NOT sign out', async () => {
    const t2 = fakeJwt({ nonce: 'new' });
    seed(fakeJwt({ nonce: 'old' }), 'R1');
    route((u, i) => {
      if (isRefresh(u)) {
        seed(t2, 'R2');
        return jsonRes(401);
      }
      return (i.headers as Record<string, string>).Authorization === `Bearer ${t2}`
        ? jsonRes(200)
        : jsonRes(401);
    });
    expect((await apiFetch('/api/x')).status).toBe(200);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('refreshAccessToken', () => {
  it('returns the new access token on ok', async () => {
    seed(fakeJwt({ nonce: 'old' }), 'R1');
    const t2 = fakeJwt({ nonce: 'new' });
    route(() => refreshOk(t2, 'R2'));
    expect(await refreshAccessToken()).toBe(t2);
  });

  it('returns null on expired and clears nothing', async () => {
    const t1 = fakeJwt();
    seed(t1, 'R1');
    sessionStorage.setItem('lawie:draft-prefill', 'x');
    route(() => jsonRes(401));
    expect(await refreshAccessToken()).toBeNull();
    expect(getAccessToken()).toBe(t1);
    expect(getRefreshToken()).toBe('R1');
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('x');
    expect(replace).not.toHaveBeenCalled();
  });

  it('returns null on transient and clears nothing', async () => {
    const t1 = fakeJwt();
    seed(t1, 'R1');
    route(() => jsonRes(503));
    expect(await refreshAccessToken()).toBeNull();
    expect(getAccessToken()).toBe(t1);
    expect(getRefreshToken()).toBe('R1');
    expect(replace).not.toHaveBeenCalled();
  });
});
