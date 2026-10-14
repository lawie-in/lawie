import { clearAllLocalState } from '@/lib/auth';

// T-115c — after an account is closed, every lawie* key goes except the analytics consent choice.
describe('clearAllLocalState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('removes every lawie* key from localStorage and sessionStorage, keeps lawie.consent.analytics', () => {
    const lawie = [
      'lawie.sectionFinder.recents',
      'lawie_referral_shown',
      'lawie.oauth.verifier',
      'lawie_signup_utm',
      'lawie:document-delete-outcome',
      'lawie_splash_seen',
      'lawie_access_token',
      'lawie_refresh_token',
    ];
    for (const k of lawie) {
      window.localStorage.setItem(k, 'v');
      window.sessionStorage.setItem(k, 'v');
    }
    window.localStorage.setItem('lawie.consent.analytics', '{"choice":"accepted"}');
    window.sessionStorage.setItem('lawie.consent.analytics', 'x');
    window.localStorage.setItem('theme', 'dark');
    window.sessionStorage.setItem('other', '1');

    clearAllLocalState();

    for (const k of lawie) {
      expect(window.localStorage.getItem(k)).toBeNull();
      expect(window.sessionStorage.getItem(k)).toBeNull();
    }
    expect(window.localStorage.getItem('lawie.consent.analytics')).toBe('{"choice":"accepted"}');
    expect(window.sessionStorage.getItem('lawie.consent.analytics')).toBe('x');
    // Keys that are not Lawie's are not ours to remove.
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(window.sessionStorage.getItem('other')).toBe('1');
  });

  it('removes many keys without skipping any (iterates safely while deleting)', () => {
    for (let i = 0; i < 40; i += 1) window.localStorage.setItem(`lawie.k${i}`, 'v');
    clearAllLocalState();
    expect(window.localStorage.length).toBe(0);
  });

  it('never throws when storage is unavailable', () => {
    const spy = jest.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('denied');
    });
    window.localStorage.setItem('lawie.x', '1');
    expect(() => clearAllLocalState()).not.toThrow();
    spy.mockRestore();
  });
});
