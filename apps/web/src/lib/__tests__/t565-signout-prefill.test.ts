// T-565 item 40 / T-616: what happens to the command bar's matter text (lawie:draft-prefill)
// when the session ends.
//  - A forced end (apiFetch: the auth service refused the refresh token) KEEPS it (T-616 AC3: an
//    unsaved description is not lost when sign-in is required).
//  - The user's own sign-out (clearTokens) still wipes it.
import { apiFetch } from '../apiFetch';
import { clearTokens } from '../auth';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

it('a 401 whose refresh is refused removes the tokens but KEEPS lawie:draft-prefill (T-616)', async () => {
  localStorage.setItem('lawie_access_token', 'old');
  localStorage.setItem('lawie_refresh_token', 'r');
  sessionStorage.setItem('lawie:draft-prefill', 'private matter text');
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }) // the request
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }); // the refresh
  jest.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom: navigation not implemented
  void apiFetch('/api/anything'); // never resolves after the forced sign-out
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
  expect(localStorage.getItem('lawie_access_token')).toBeNull();
  expect(localStorage.getItem('lawie_refresh_token')).toBeNull();
  expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('private matter text');
});

it('an EXPLICIT sign-out (clearTokens) still wipes lawie:draft-prefill', () => {
  localStorage.setItem('lawie_access_token', 'old');
  localStorage.setItem('lawie_refresh_token', 'r');
  sessionStorage.setItem('lawie:draft-prefill', 'private matter text');
  clearTokens();
  expect(localStorage.getItem('lawie_access_token')).toBeNull();
  expect(sessionStorage.getItem('lawie:draft-prefill')).toBeNull();
});
