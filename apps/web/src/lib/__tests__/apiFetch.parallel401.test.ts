// T-616 round 3 (must-fix 1): two requests in the same tab both get a 401 and the refresh token is
// refused. endSessionForced runs twice; the second call finds no token and must NOT erase the
// forced-end marker the first one wrote, or the matter text is lost on the re-sign-in. Real
// sessionRefresh and auth.ts over jsdom storage and a fake fetch.
import { apiFetch } from '../apiFetch';
import { saveTokens } from '../auth';
import { refreshInFlight, resetRefreshState } from '../sessionRefresh';

import { ACCESS, fakeJwt, jsonRes, REFRESH } from './helpers/fakeJwt';

const PREFILL = 'lawie:draft-prefill';
const MARKER = 'lawie:forced-end-subject';
const TEXT = "user A's private matter text";

const realFetch = global.fetch;
const realLocation = window.location;
const replace = jest.fn();
let refreshCalls: number;

beforeEach(() => {
  resetRefreshState();
  localStorage.clear();
  sessionStorage.clear();
  replace.mockReset();
  refreshCalls = 0;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/dashboard/new', replace },
  });
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).endsWith('/api/auth/refresh')) refreshCalls += 1;
    return jsonRes(401); // the API rejects the access token, the auth service refuses the refresh
  }) as unknown as typeof fetch;
});
afterEach(async () => {
  await refreshInFlight();
  global.fetch = realFetch;
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

async function twoParallel401s() {
  localStorage.setItem(ACCESS, fakeJwt({ sub: 'user-A' }));
  localStorage.setItem(REFRESH, 'RA');
  sessionStorage.setItem(PREFILL, TEXT);
  // Neither promise ever resolves (the browser is navigating): let them run to the redirect.
  void apiFetch('/api/one');
  void apiFetch('/api/two');
  await new Promise((r) => setTimeout(r, 20));
}

describe('two parallel 401s with a refused refresh token', () => {
  it('both requests end the session (two redirects), the refresh endpoint is called once, tokens are gone', async () => {
    await twoParallel401s();
    expect(replace).toHaveBeenCalledTimes(2);
    expect(refreshCalls).toBe(1);
    expect(localStorage.getItem(ACCESS)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBeNull();
  });

  it('the marker (user A) and the matter text survive BOTH calls', async () => {
    await twoParallel401s();
    expect(sessionStorage.getItem(MARKER)).toBe('user-A');
    expect(sessionStorage.getItem(PREFILL)).toBe(TEXT);
  });

  it("signing in again as A keeps A's text and consumes the marker", async () => {
    await twoParallel401s();
    saveTokens(fakeJwt({ sub: 'user-A', nonce: 'again' }), 'RA2');
    expect(sessionStorage.getItem(PREFILL)).toBe(TEXT);
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it("signing in as B drops A's text and consumes the marker", async () => {
    await twoParallel401s();
    saveTokens(fakeJwt({ sub: 'user-B' }), 'RB');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });
});
