// T-616 (a): the late-401 race, guarded at the apiFetch layer on its own. refreshSession is
// mocked and must NOT be called: apiFetch itself compares the token the request was sent with to
// the stored one (sessionRefresh's own re-read is a second line of defence, tested elsewhere).
import { apiFetch } from '../apiFetch';

import { ACCESS, fakeJwt, jsonRes, REFRESH } from './helpers/fakeJwt';

const mockRefreshSession = jest.fn();
jest.mock('../sessionRefresh', () => ({
  refreshSession: (...a: unknown[]) => mockRefreshSession(...a),
  refreshInFlight: () => null,
}));

const realFetch = global.fetch;
const realLocation = window.location;
const replace = jest.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockRefreshSession.mockReset();
  replace.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/dashboard', replace },
  });
});
afterEach(() => {
  global.fetch = realFetch;
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

it('a 401 for a request sent with the old token, after a refresh already succeeded: retried with the stored new token, refreshSession never called, session intact', async () => {
  const t1 = fakeJwt({ nonce: 'old' });
  const t2 = fakeJwt({ nonce: 'new' });
  localStorage.setItem(ACCESS, t1);
  localStorage.setItem(REFRESH, 'R1');
  let release: (r: Response) => void = () => undefined;
  const fetchMock = jest.fn((_u: string, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).Authorization;
    return auth === `Bearer ${t1}`
      ? new Promise<Response>((res) => (release = res))
      : Promise.resolve(jsonRes(200, { retried: true }));
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  const p = apiFetch('/api/me');
  await Promise.resolve();
  localStorage.setItem(ACCESS, t2); // a refresh saved T2/R2 meanwhile
  localStorage.setItem(REFRESH, 'R2');
  release(jsonRes(401));
  const res = await p;

  expect(res.status).toBe(200);
  expect(mockRefreshSession).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe(
    `Bearer ${t2}`,
  );
  expect(replace).not.toHaveBeenCalled();
  expect(localStorage.getItem(ACCESS)).toBe(t2);
  expect(localStorage.getItem(REFRESH)).toBe('R2');
});

it('a 401 for the token that is still the stored one does call refreshSession (staleAccessToken = that token)', async () => {
  const t1 = fakeJwt({ nonce: 'only' });
  localStorage.setItem(ACCESS, t1);
  localStorage.setItem(REFRESH, 'R1');
  mockRefreshSession.mockResolvedValue({ kind: 'transient' });
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue(jsonRes(401)) as unknown as typeof fetch;
  const p = apiFetch('/api/me').catch((e) => e);
  await jest.advanceTimersByTimeAsync(6000);
  await p;
  jest.useRealTimers();
  expect(mockRefreshSession).toHaveBeenCalledWith({ staleAccessToken: t1 });
});
