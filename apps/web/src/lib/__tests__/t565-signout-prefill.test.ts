// T-565 item 40: apiFetch's forced sign-out (the refresh failed after a 401) goes through
// clearTokens, so the command bar's matter text is dropped on that path too.
import { apiFetch } from '../apiFetch';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

it('a 401 whose refresh fails clears lawie:draft-prefill along with the tokens', async () => {
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
  expect(sessionStorage.getItem('lawie:draft-prefill')).toBeNull();
});
