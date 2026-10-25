/**
 * T-343 review round 1 (should-fix): clearTokens also forgets the privacy prompt's
 * "shown this sign-in" flags, and only those.
 */
import { PRIVACY_PROMPT_SHOWN_PREFIX, clearTokens, saveTokens } from '../auth';
import { DRAFT_PREFILL_KEY } from '@/components/intake/initialQuery';

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

describe('clearTokens (T-565 item 40): the command bar matter text does not outlive the sign-in', () => {
  it('removes lawie:draft-prefill from sessionStorage and leaves other keys alone', () => {
    sessionStorage.setItem('lawie:draft-prefill', 'bail for Asha Rao, FIR 12/2026');
    sessionStorage.setItem('other_key', 'keep');
    clearTokens();
    expect(sessionStorage.getItem('lawie:draft-prefill')).toBeNull();
    expect(sessionStorage.getItem('other_key')).toBe('keep');
  });

  it('does not touch a localStorage key of the same name', () => {
    localStorage.setItem('lawie:draft-prefill', 'x');
    clearTokens();
    expect(localStorage.getItem('lawie:draft-prefill')).toBe('x');
  });

  it('uses the same key the command bar writes and the describe step reads', () => {
    expect(DRAFT_PREFILL_KEY).toBe('lawie:draft-prefill');
  });

  it('still clears the tokens when sessionStorage.removeItem throws', () => {
    localStorage.setItem('lawie_access_token', 'a');
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage) {
      if (this === sessionStorage) throw new Error('blocked');
    });
    expect(() => clearTokens()).not.toThrow();
  });
});

describe('saveTokens (T-565 item 40, review round 3): a new session drops the matter text', () => {
  const jwt = (sub: string) =>
    `h.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.s`;
  const KEY = 'lawie:draft-prefill';

  it('no token stored before: the key is cleared', () => {
    sessionStorage.setItem(KEY, 'left by another user');
    saveTokens(jwt('u1'), 'r1');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('lawie_refresh_token')).toBe('r1');
  });

  it('a different sub: the key is cleared', () => {
    saveTokens(jwt('u1'), 'r1');
    sessionStorage.setItem(KEY, 'u1 text');
    saveTokens(jwt('u2'), 'r2');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('the same sub (refresh or re-issue): the key is kept', () => {
    saveTokens(jwt('u1'), 'r1');
    sessionStorage.setItem(KEY, 'u1 text');
    saveTokens(jwt('u1'), 'r2');
    expect(sessionStorage.getItem(KEY)).toBe('u1 text');
  });

  it('a stored token that cannot be read counts as no session: cleared', () => {
    localStorage.setItem('lawie_access_token', 'garbage');
    sessionStorage.setItem(KEY, 'x');
    saveTokens(jwt('u1'), 'r1');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('does not throw when sessionStorage is blocked, and still stores the tokens', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage) {
      if (this === sessionStorage) throw new Error('blocked');
    });
    expect(() => saveTokens(jwt('u1'), 'r1')).not.toThrow();
    expect(localStorage.getItem('lawie_refresh_token')).toBe('r1');
  });
});
