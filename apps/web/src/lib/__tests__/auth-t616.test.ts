// T-616: auth.ts additions: forced end vs explicit sign-out (matter text), and the expiry helpers
// that are corrected for a wrong local clock.
import {
  clearAllLocalState,
  clearTokens,
  adoptForeignSession,
  endSessionForced,
  isTokenExpired,
  MAX_CLOCK_SKEW_MS,
  msUntilExpiry,
  saveTokens,
  tokenExpiryMs,
  userFromToken,
} from '../auth';

import { ACCESS, fakeJwt, REFRESH } from './helpers/fakeJwt';

const PREFILL = 'lawie:draft-prefill';
const MARKER = 'lawie:forced-end-subject';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => jest.useRealTimers());

describe('endSessionForced', () => {
  it('removes the tokens and the privacy flags, keeps the prefill, sets the subject marker', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'u1' }));
    localStorage.setItem(REFRESH, 'r');
    sessionStorage.setItem(PREFILL, 'private matter text');
    sessionStorage.setItem('lawie_privacy_prompt_shown:u1', '1');
    endSessionForced();
    expect(localStorage.getItem(ACCESS)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBeNull();
    expect(sessionStorage.getItem('lawie_privacy_prompt_shown:u1')).toBeNull();
    expect(sessionStorage.getItem(PREFILL)).toBe('private matter text');
    expect(sessionStorage.getItem(MARKER)).toBe('u1');
  });

  it('keeps the marker in sessionStorage only (not shared with other tabs)', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'u1' }));
    endSessionForced();
    expect(localStorage.getItem(MARKER)).toBeNull();
  });

  it('with no readable token, sets no marker (the next sign-in drops the text)', () => {
    sessionStorage.setItem(PREFILL, 'text');
    localStorage.setItem(ACCESS, 'not-a-jwt');
    endSessionForced();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
    saveTokens(fakeJwt({ sub: 'u1' }), 'r2');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
  });
});

describe('endSessionForced called twice (round 3 must-fix 1: only ever sets the marker)', () => {
  it('the second call, with no token left, keeps the marker and the matter text', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'u1' }));
    localStorage.setItem(REFRESH, 'r');
    sessionStorage.setItem(PREFILL, 'private matter text');
    endSessionForced();
    expect(sessionStorage.getItem(MARKER)).toBe('u1');
    endSessionForced(); // a second request sharing the same refused refresh
    expect(sessionStorage.getItem(MARKER)).toBe('u1');
    expect(sessionStorage.getItem(PREFILL)).toBe('private matter text');
    expect(localStorage.getItem(ACCESS)).toBeNull();
  });

  it('twice, then the same user signs in: text kept; a different user: text dropped', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'A' }));
    sessionStorage.setItem(PREFILL, "A's text");
    endSessionForced();
    endSessionForced();
    saveTokens(fakeJwt({ sub: 'A', nonce: '2' }), 'r2');
    expect(sessionStorage.getItem(PREFILL)).toBe("A's text");

    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'A' }));
    sessionStorage.setItem(PREFILL, "A's text");
    endSessionForced();
    endSessionForced();
    saveTokens(fakeJwt({ sub: 'B' }), 'r3');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('with an unreadable token the call does not set a marker and does not delete an existing one', () => {
    sessionStorage.setItem(MARKER, 'u1');
    localStorage.setItem(ACCESS, 'not-a-jwt');
    endSessionForced();
    expect(sessionStorage.getItem(MARKER)).toBe('u1');
  });

  it('explicit sign-out after two forced ends still wipes the text and the marker', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'u1' }));
    sessionStorage.setItem(PREFILL, 'text');
    endSessionForced();
    endSessionForced();
    clearTokens();
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });
});

describe('saveTokens after a forced end', () => {
  function forcedEndFor(sub: string) {
    localStorage.setItem(ACCESS, fakeJwt({ sub }));
    localStorage.setItem(REFRESH, 'r');
    sessionStorage.setItem(PREFILL, 'private matter text');
    endSessionForced();
  }

  it('the SAME user signing in again keeps the matter text, and the marker is consumed', () => {
    forcedEndFor('u1');
    saveTokens(fakeJwt({ sub: 'u1' }), 'r2');
    expect(sessionStorage.getItem(PREFILL)).toBe('private matter text');
    expect(sessionStorage.getItem(MARKER)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBe('r2');
  });

  it('a DIFFERENT user drops the matter text', () => {
    forcedEndFor('u1');
    saveTokens(fakeJwt({ sub: 'u2' }), 'r2');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('a refresh for the signed-in same user keeps it; a first sign-in with no history drops it', () => {
    sessionStorage.setItem(PREFILL, 'text');
    saveTokens(fakeJwt({ sub: 'u1' }), 'r');
    expect(sessionStorage.getItem(PREFILL)).toBeNull(); // no earlier subject
    sessionStorage.setItem(PREFILL, 'text');
    saveTokens(fakeJwt({ sub: 'u1' }), 'r2'); // refresh, same user
    expect(sessionStorage.getItem(PREFILL)).toBe('text');
    saveTokens(fakeJwt({ sub: 'u2' }), 'r3'); // other user
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
  });
});

describe('clearTokens (explicit sign-out)', () => {
  it('wipes the prefill and the forced-end marker along with the tokens', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'u1' }));
    localStorage.setItem(REFRESH, 'r');
    sessionStorage.setItem(PREFILL, 'text');
    sessionStorage.setItem(MARKER, 'u1');
    clearTokens();
    expect(localStorage.getItem(ACCESS)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBeNull();
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('after a forced end, a later explicit sign-out wipes the text and the marker', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'u1' }));
    sessionStorage.setItem(PREFILL, 'text');
    endSessionForced();
    clearTokens();
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    saveTokens(fakeJwt({ sub: 'u1' }), 'r');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
  });

  it('clearAllLocalState also removes the matter text and the marker', () => {
    sessionStorage.setItem(PREFILL, 'text');
    sessionStorage.setItem(MARKER, 'u1');
    clearAllLocalState();
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });
});

describe('expiry helpers', () => {
  it('tokenExpiryMs reads exp in ms; null for missing/garbage', () => {
    expect(tokenExpiryMs(fakeJwt({ exp: 2_000_000_000 }))).toBe(2_000_000_000_000);
    expect(tokenExpiryMs(null)).toBeNull();
    expect(tokenExpiryMs('garbage')).toBeNull();
  });

  it('isTokenExpired: null, garbage and a token with no exp count as expired', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired('garbage')).toBe(true);
    const noExp = ['e30', Buffer.from('{"sub":"u"}').toString('base64url'), 's'].join('.');
    expect(isTokenExpired(noExp)).toBe(true);
  });

  it('with a trusted clock: a valid token has time left, an expired one is negative', () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    saveTokens(fakeJwt({ sub: 'u1', expiresInSec: 900 }), 'r'); // skew 0
    expect(msUntilExpiry(fakeJwt({ expiresInSec: 100 }))).toBeCloseTo(100_000, -3);
    expect(isTokenExpired(fakeJwt({ expiresInSec: 100 }))).toBe(false);
    expect(isTokenExpired(fakeJwt({ expiresInSec: -1 }))).toBe(true);
    expect(msUntilExpiry(fakeJwt({ expiresInSec: -5 }))!).toBeLessThan(0);
  });

  it('local clock 10 minutes AHEAD of the server: a fresh token is not seen as nearly expired', () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    const nowSec = Math.floor(Date.now() / 1000);
    // server minted it 10 min "ago" by our clock: iat = now-600, exp = iat+900
    const t = fakeJwt({ iat: nowSec - 600, exp: nowSec - 600 + 900 });
    saveTokens(t, 'r');
    // naive local check would say 300 s left; skew-corrected says the full 900 s
    expect(msUntilExpiry(t)).toBe(900_000);
    jest.advanceTimersByTime(100_000);
    expect(msUntilExpiry(t)).toBe(800_000);
  });

  it('local clock 10 minutes BEHIND: an already-expired-by-server token is not trusted as valid', () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    const nowSec = Math.floor(Date.now() / 1000);
    const t = fakeJwt({ iat: nowSec + 600, exp: nowSec + 600 + 900 });
    saveTokens(t, 'r');
    expect(msUntilExpiry(t)).toBe(900_000); // not 1500 s
    jest.advanceTimersByTime(901_000);
    expect(isTokenExpired(t)).toBe(true);
  });

  it('a skew beyond min(10 min, the token lifetime) is clamped: a token that expired 1100 s ago cannot be made valid (T-616 review)', () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    const nowSec = Math.floor(Date.now() / 1000);
    const t = fakeJwt({ iat: nowSec - 2000, exp: nowSec - 2000 + 900 }); // exp is 1100 s in our past
    expect(isTokenExpired(t)).toBe(true); // before any saved token: trusts own clock
    saveTokens(t, 'r');
    expect(MAX_CLOCK_SKEW_MS).toBe(600_000);
    // skew clamped from 2000 s to 600 s: 1100 s past exp becomes 500 s past, still expired
    expect(msUntilExpiry(t)).toBe(-500_000);
    expect(isTokenExpired(t)).toBe(true);
  });

  it('a skew inside the limit is fully applied (500 s ahead, 900 s lifetime)', () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    const nowSec = Math.floor(Date.now() / 1000);
    const t = fakeJwt({ iat: nowSec - 500, exp: nowSec - 500 + 900 });
    saveTokens(t, 'r');
    expect(msUntilExpiry(t)).toBe(900_000);
  });

  it("the clamp is also limited by the token's own lifetime (300 s token, 400 s skew -> 300 s)", () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    const nowSec = Math.floor(Date.now() / 1000);
    const t = fakeJwt({ iat: nowSec - 400, exp: nowSec - 400 + 300 });
    saveTokens(t, 'r');
    expect(msUntilExpiry(t)).toBe(200_000); // exp is 100 s past by the local clock; skew 300 s
  });

  it('a skew of the same size the other way (local clock behind) is clamped too', () => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z') });
    const nowSec = Math.floor(Date.now() / 1000);
    const t = fakeJwt({ iat: nowSec + 5000, exp: nowSec + 5000 + 900 });
    saveTokens(t, 'r');
    // skew -5000 s clamped to -600 s: exp is 5900 s ahead of the real now, minus the 600 s shift
    expect(msUntilExpiry(t)).toBe(5_300_000);
  });
});

describe('userFromToken', () => {
  it('names the user even when the token has expired', () => {
    const u = userFromToken(
      fakeJwt({ expiresInSec: -100, sub: 'u9', email: 'a@b.example', name: 'A', role: 'Admin' }),
    );
    expect(u).toEqual({ id: 'u9', email: 'a@b.example', name: 'A', role: 'Admin', plan: 'free' });
  });
  it('null for null or garbage', () => {
    expect(userFromToken(null)).toBeNull();
    expect(userFromToken('garbage')).toBeNull();
  });
});

describe('saveTokens marker rule (review must-fix 1)', () => {
  function forcedEndFor(sub: string) {
    localStorage.setItem(ACCESS, fakeJwt({ sub }));
    localStorage.setItem(REFRESH, 'r');
    sessionStorage.setItem(PREFILL, "A's private matter text");
    endSessionForced();
  }

  it("Sequence B: B signs in here while localStorage already holds B's token and the marker names A -> A's text is wiped", () => {
    forcedEndFor('user-A');
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'user-B' })); // another tab signed B in
    localStorage.setItem(REFRESH, 'rb');
    saveTokens(fakeJwt({ sub: 'user-B', nonce: 'second' }), 'rb2');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it("when a marker exists only that user keeps the text, even with that user's token in localStorage", () => {
    forcedEndFor('user-A');
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'user-A' }));
    saveTokens(fakeJwt({ sub: 'user-A', nonce: 'again' }), 'ra2');
    expect(sessionStorage.getItem(PREFILL)).toBe("A's private matter text");
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('the marker is removed by every saveTokens, whatever the outcome', () => {
    sessionStorage.setItem(MARKER, 'user-A');
    saveTokens(fakeJwt({ sub: 'user-A' }), 'r');
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('no marker and no earlier user: the text is wiped', () => {
    sessionStorage.setItem(PREFILL, 'stray text');
    saveTokens(fakeJwt({ sub: 'user-A' }), 'r');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
  });

  it('a refresh for the same user (no marker, same sub) keeps the text', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'user-A' }));
    sessionStorage.setItem(PREFILL, 'text');
    saveTokens(fakeJwt({ sub: 'user-A', nonce: 'r' }), 'r2');
    expect(sessionStorage.getItem(PREFILL)).toBe('text');
  });

  it('a different user than the stored one (no marker) drops the text', () => {
    localStorage.setItem(ACCESS, fakeJwt({ sub: 'user-A' }));
    sessionStorage.setItem(PREFILL, 'text');
    saveTokens(fakeJwt({ sub: 'user-B' }), 'r2');
    expect(sessionStorage.getItem(PREFILL)).toBeNull();
  });
});

describe('adoptForeignSession (a session this tab did not save itself)', () => {
  const text = () => sessionStorage.getItem(PREFILL);
  const tok = (sub: string) => fakeJwt({ sub });
  beforeEach(() => sessionStorage.setItem(PREFILL, 'matter text'));

  describe('previous user known (a user id)', () => {
    it('no marker: same user keeps, another user wipes', () => {
      adoptForeignSession(tok('A'), 'A');
      expect(text()).toBe('matter text');
      adoptForeignSession(tok('B'), 'A');
      expect(text()).toBeNull();
    });
    it('marker present: stays only if the adopted sub equals the marker; the marker is removed', () => {
      sessionStorage.setItem(MARKER, 'A');
      adoptForeignSession(tok('A'), 'A');
      expect(text()).toBe('matter text');
      expect(sessionStorage.getItem(MARKER)).toBeNull();
      sessionStorage.setItem(MARKER, 'A');
      adoptForeignSession(tok('B'), 'B');
      expect(text()).toBeNull();
      expect(sessionStorage.getItem(MARKER)).toBeNull();
    });
  });

  describe('previous user null (signed out)', () => {
    it('no marker: wiped', () => {
      adoptForeignSession(tok('A'), null);
      expect(text()).toBeNull();
    });
    it('marker names the adopted user: kept (Sequence A with the same user coming back)', () => {
      sessionStorage.setItem(MARKER, 'A');
      adoptForeignSession(tok('A'), null);
      expect(text()).toBe('matter text');
      expect(sessionStorage.getItem(MARKER)).toBeNull();
    });
    it("marker names another user: wiped (Sequence A: B appears after A's forced end)", () => {
      sessionStorage.setItem(MARKER, 'A');
      adoptForeignSession(tok('B'), null);
      expect(text()).toBeNull();
      expect(sessionStorage.getItem(MARKER)).toBeNull();
    });
  });

  describe('previous user undefined (page load)', () => {
    it('no marker: unchanged', () => {
      adoptForeignSession(tok('A'), undefined);
      expect(text()).toBe('matter text');
    });
    it('marker names a different user: wiped; marker removed', () => {
      sessionStorage.setItem(MARKER, 'A');
      adoptForeignSession(tok('B'), undefined);
      expect(text()).toBeNull();
      expect(sessionStorage.getItem(MARKER)).toBeNull();
    });
    it('marker names the same user: kept; marker removed', () => {
      sessionStorage.setItem(MARKER, 'A');
      adoptForeignSession(tok('A'), undefined);
      expect(text()).toBe('matter text');
      expect(sessionStorage.getItem(MARKER)).toBeNull();
    });
  });

  it('an unreadable token with a marker wipes; it never throws', () => {
    sessionStorage.setItem(MARKER, 'A');
    expect(() => adoptForeignSession('garbage', undefined)).not.toThrow();
    expect(text()).toBeNull();
  });

  it('explicit sign-out still wipes text and marker', () => {
    sessionStorage.setItem(MARKER, 'A');
    clearTokens();
    expect(text()).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });
});
