/**
 * T-343 review round 1 (should-fix): clearTokens also forgets the privacy prompt's
 * "shown this sign-in" flags, and only those.
 */
import { PRIVACY_PROMPT_SHOWN_PREFIX, clearTokens } from '../auth';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => jest.restoreAllMocks());

describe('clearTokens (T-343)', () => {
  it('uses the documented prefix', () => {
    expect(PRIVACY_PROMPT_SHOWN_PREFIX).toBe('lawie_privacy_prompt_shown:');
  });

  it('removes every lawie_privacy_prompt_shown: key and leaves other keys alone', () => {
    sessionStorage.setItem('lawie_privacy_prompt_shown:u1:2026-10-12b', '1');
    sessionStorage.setItem('lawie_privacy_prompt_shown:u2:2026-10-11', '1');
    sessionStorage.setItem('lawie_privacy_prompt_shown:u3:x', '1');
    sessionStorage.setItem('other_key', 'keep');
    sessionStorage.setItem('lawie_signup_source', 'keep2');
    localStorage.setItem('lawie_access_token', 'a');
    localStorage.setItem('lawie_refresh_token', 'r');
    localStorage.setItem('lawie_privacy_prompt_shown:u1:v', 'local-keep');

    clearTokens();

    expect(sessionStorage.length).toBe(2);
    expect(sessionStorage.getItem('other_key')).toBe('keep');
    expect(sessionStorage.getItem('lawie_signup_source')).toBe('keep2');
    expect(sessionStorage.getItem('lawie_privacy_prompt_shown:u1:2026-10-12b')).toBeNull();
    expect(localStorage.getItem('lawie_access_token')).toBeNull();
    expect(localStorage.getItem('lawie_refresh_token')).toBeNull();
    // Only sessionStorage is touched by the prompt cleanup.
    expect(localStorage.getItem('lawie_privacy_prompt_shown:u1:v')).toBe('local-keep');
  });

  it('is a no-op on empty storage', () => {
    expect(() => clearTokens()).not.toThrow();
  });

  it('still clears the tokens and does not throw when sessionStorage is unavailable', () => {
    localStorage.setItem('lawie_access_token', 'a');
    localStorage.setItem('lawie_refresh_token', 'r');
    sessionStorage.setItem('lawie_privacy_prompt_shown:u1:v', '1');
    jest.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => clearTokens()).not.toThrow();
    expect(localStorage.getItem('lawie_access_token')).toBeNull();
    expect(localStorage.getItem('lawie_refresh_token')).toBeNull();
  });
});
