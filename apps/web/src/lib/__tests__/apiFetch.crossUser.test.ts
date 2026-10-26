// T-616 round 2 (review must-fix 2): apiFetch never re-sends a request as a different user.
// A request sent as user A that gets a 401 while user B is the stored session returns A's original
// 401 as is: no retry, no refresh, no sign-out, tokens untouched.
import { apiFetch } from '../apiFetch';
import { getAccessToken, getRefreshToken } from '../auth';
import { refreshInFlight, resetRefreshState } from '../sessionRefresh';

import { ACCESS, fakeJwt, jsonRes, REFRESH, refreshOk } from './helpers/fakeJwt';

let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
const realFetch = global.fetch;
const realLocation = window.location;
let replace: jest.Mock;

const isRefresh = (u: string) => /\/api\/auth\/refresh$/.test(u);
const apiCalls = () => fetchMock.mock.calls.filter((c) => !isRefresh(c[0]));
const refreshCalls = () => fetchMock.mock.calls.filter((c) => isRefresh(c[0]));
const bearer = (c: [string, RequestInit]) =>
  (c[1].headers as Record<string, string> | undefined)?.Authorization;

function seed(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}

beforeEach(() => {
  resetRefreshState();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  replace = jest.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/dashboard/new', search: '', hash: '', replace },
  });
});
afterEach(async () => {
  await refreshInFlight();
  global.fetch = realFetch;
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a request is never re-sent as a different user', () => {
  it("stored-token compare: B signed in while A's request was in flight -> the original 401, one call, no refresh, no sign-out", async () => {
    const tA = fakeJwt({ sub: 'user-A', nonce: 'a' });
    const tB = fakeJwt({ sub: 'user-B', nonce: 'b' });
    seed(tA, 'RA');
    sessionStorage.setItem('lawie:draft-prefill', 'unsaved');
    fetchMock.mockImplementation(async () => {
      seed(tB, 'RB'); // another tab signs B in while A's request is on the wire
      return jsonRes(401, { who: 'A' });
    });
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ who: 'A' });
    expect(apiCalls()).toHaveLength(1);
    expect(bearer(apiCalls()[0])).toBe(`Bearer ${tA}`);
    expect(refreshCalls()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(tB);
    expect(getRefreshToken()).toBe('RB');
  });

  it('control: the same user (a refresh in another tab) IS retried with the stored token', async () => {
    const t1 = fakeJwt({ sub: 'user-A', nonce: '1' });
    const t2 = fakeJwt({ sub: 'user-A', nonce: '2' });
    seed(t1, 'R1');
    fetchMock.mockImplementation(async (u, i) => {
      if (bearer([u, i]) === `Bearer ${t1}`) {
        seed(t2, 'R2');
        return jsonRes(401);
      }
      return jsonRes(200, { ok: true });
    });
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(200);
    expect(apiCalls().map(bearer)).toEqual([`Bearer ${t1}`, `Bearer ${t2}`]);
    expect(refreshCalls()).toHaveLength(0);
  });

  it("an ok refresh result carrying B's token (A's 200 dropped, B's session stored) -> A's 401 returned, no re-send, B's tokens intact", async () => {
    const tA = fakeJwt({ sub: 'user-A', nonce: 'a' });
    const tB = fakeJwt({ sub: 'user-B', nonce: 'b' });
    seed(tA, 'RA');
    fetchMock.mockImplementation(async (u) => {
      if (isRefresh(u)) {
        seed(tB, 'RB'); // B signs in while A's refresh is in flight
        return refreshOk(fakeJwt({ sub: 'user-A', nonce: 'a2' }), 'RA2');
      }
      return jsonRes(401, { who: 'A' });
    });
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(401);
    expect(apiCalls()).toHaveLength(1); // never re-sent
    expect(refreshCalls()).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(tB);
    expect(getRefreshToken()).toBe('RB'); // A's 200 was not saved
  });

  it("the transient fallback: refresh only delayed, B's valid token appeared meanwhile -> A's 401 returned, no re-send, no sign-out", async () => {
    const tA = fakeJwt({ sub: 'user-A', nonce: 'a' });
    const tB = fakeJwt({ sub: 'user-B', nonce: 'b' });
    seed(tA, 'RA');
    fetchMock.mockImplementation(async (u) => {
      if (isRefresh(u)) {
        seed(tB, 'RB');
        return {
          ok: false,
          status: 429,
          headers: { get: () => '120' }, // a long cooldown: apiFetch gives up at once
          json: async () => ({}),
        } as unknown as Response;
      }
      return jsonRes(401, { who: 'A' });
    });
    const res = await apiFetch('/api/x');
    expect(res.status).toBe(401);
    expect(apiCalls()).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe(tB);
  });

  it("control: the transient fallback with the SAME user's fresh token IS retried", async () => {
    const tA = fakeJwt({ sub: 'user-A', nonce: 'a' });
    const tA2 = fakeJwt({ sub: 'user-A', nonce: 'a2' });
    seed(tA, 'RA');
    fetchMock.mockImplementation(async (u, i) => {
      if (isRefresh(u)) {
        seed(tA2, 'RA2');
        return {
          ok: false,
          status: 429,
          headers: { get: () => '120' },
          json: async () => ({}),
        } as unknown as Response;
      }
      return bearer([u, i]) === `Bearer ${tA2}` ? jsonRes(200) : jsonRes(401);
    });
    expect((await apiFetch('/api/x')).status).toBe(200);
    expect(apiCalls().map(bearer)).toEqual([`Bearer ${tA}`, `Bearer ${tA2}`]);
  });
});
