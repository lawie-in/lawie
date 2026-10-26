// T-616: only a same-site path is ever a return path after a forced sign-in (no open redirect).
import {
  buildLoginRedirect,
  POST_LOGIN_PATH_KEY,
  rememberPostLoginPath,
  safeReturnPath,
  takePostLoginPath,
} from '../safeReturnPath';

afterEach(() => sessionStorage.clear());

describe('safeReturnPath: accepted', () => {
  it.each([
    '/dashboard',
    '/dashboard/new',
    '/dashboard/documents/abc123',
    '/dashboard/documents?filter=draft',
    '/dashboard/new#section',
    '/admin/users',
    '/pricing',
    '/dashboard/' + 'a'.repeat(400),
  ])('%s', (p) => {
    expect(safeReturnPath(p)).toBe(p);
  });

  it('exactly 512 characters is accepted', () => {
    const p = '/' + 'a'.repeat(511);
    expect(p).toHaveLength(512);
    expect(safeReturnPath(p)).toBe(p);
  });
});

describe('safeReturnPath: rejected', () => {
  const bad: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['number', 5],
    ['object', {}],
    ['array', ['/dashboard']],
    ['empty string', ''],
    ['513 chars', '/' + 'a'.repeat(512)],
    ['no leading slash', 'dashboard'],
    ['absolute URL', 'https://evil.example/x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['protocol-relative //evil.com', '//evil.com'],
    ['//evil.com/path', '//evil.com/dashboard'],
    ['slash-backslash /\\evil.com', '/\\evil.com'],
    ['backslash later', '/dashboard\\evil'],
    ['space', '/dash board'],
    ['tab', '/dash\tboard'],
    ['newline', '/dashboard\nx'],
    ['carriage return', '/dashboard\rx'],
    ['NUL', '/dash\u0000board'],
    ['DEL', '/dash\u007fboard'],
    ['unicode space', '/dash board'],
    ['encoded CRLF %0d%0a', '/dashboard%0d%0aSet-Cookie:x'],
    ['encoded %0D%0A upper', '/dashboard%0D%0A'],
    ['encoded slash %2f', '/%2fevil.com'],
    ['encoded slash %2F//', '/%2F%2Fevil.com'],
    ['encoded backslash %5c', '/%5cevil.com'],
    ['encoded backslash %5C', '/dashboard%5Cx'],
    ['encoded control %1f', '/a%1fb'],
    ['encoded DEL %7f', '/a%7Fb'],
    ['colon in path', '/dashboard:evil'],
    ['colon scheme-like in path', '/javascript:alert(1)'],
    ['/login', '/login'],
    ['/login?next=/x', '/login?next=%2Fdashboard'],
    ['/login/x', '/login/x'],
    ['/LOGIN case', '/LOGIN'],
    ['/auth', '/auth'],
    ['/auth/callback', '/auth/callback'],
    ['/auth/callback?code=x', '/auth/callback?code=x'],
    ['/api', '/api'],
    ['/api/auth/refresh', '/api/auth/refresh'],
    ['/API/x', '/API/x'],
    // T-616 review round 2: "//" anywhere, dot segments, encoded dots
    ['//x', '//x'],
    ['/x//y', '/x//y'],
    ['/./x', '/./x'],
    ['/a/../b', '/a/../b'],
    ['/../x', '/../x'],
    ['/%2e%2e/x', '/%2e%2e/x'],
    ['/%2E/x', '/%2E/x'],
    ['/%2E%2e/x mixed case', '/%2E%2e/x'],
    ['/.//evil.com', '/.//evil.com'],
    ['/a/..//evil.com', '/a/..//evil.com'],
    ['/%2e%2e//evil.com', '/%2e%2e//evil.com'],
    ['/x//evil.com', '/x//evil.com'],
    ['// in the query part', '/dashboard?next=//evil.com'],
  ];
  it.each(bad)('%s', (_name, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it('ordinary paths are still accepted next to the new rules', () => {
    for (const p of ['/dashboard', '/dashboard/new', '/dashboard/documents/abc123']) {
      expect(safeReturnPath(p)).toBe(p);
    }
    expect(safeReturnPath('/a.b/c.d')).toBe('/a.b/c.d'); // dots inside a segment are not dot segments
  });

  it('a path that only starts like /login is fine (/loginx, /authors, /apiary)', () => {
    expect(safeReturnPath('/loginx')).toBe('/loginx');
    expect(safeReturnPath('/authors')).toBe('/authors');
    expect(safeReturnPath('/apiary')).toBe('/apiary');
  });
});

describe('buildLoginRedirect', () => {
  it('keeps the pathname only', () => {
    expect(buildLoginRedirect('/dashboard/new')).toBe('/login?next=%2Fdashboard%2Fnew');
  });
  it('drops the query string and the hash', () => {
    expect(buildLoginRedirect('/dashboard/new?draft=secret+text#top')).toBe(
      '/login?next=%2Fdashboard%2Fnew',
    );
    expect(buildLoginRedirect('/dashboard#top')).toBe('/login?next=%2Fdashboard');
  });
  it('plain /login for "/" (nothing to come back to)', () => {
    expect(buildLoginRedirect('/')).toBe('/login');
    expect(buildLoginRedirect('/?x=1')).toBe('/login');
  });
  it.each([null, undefined, '', '//evil.com', '/\\evil.com', '/login', '/auth/callback', '/api/x'])(
    'plain /login for an unsafe input %p',
    (v) => {
      expect(buildLoginRedirect(v as string | null | undefined)).toBe('/login');
    },
  );
});

describe('rememberPostLoginPath / takePostLoginPath', () => {
  it('stores a safe path and takes (reads and removes) it once', () => {
    rememberPostLoginPath('/dashboard/new');
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/dashboard/new');
    expect(localStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
    expect(takePostLoginPath()).toBe('/dashboard/new');
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
    expect(takePostLoginPath()).toBeNull();
  });
  it('does not store an unsafe path, and clears an earlier one', () => {
    rememberPostLoginPath('/dashboard');
    rememberPostLoginPath('//evil.com');
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
    rememberPostLoginPath(null);
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
  });
  it('re-validates on take: a tampered stored value gives null and is removed', () => {
    sessionStorage.setItem(POST_LOGIN_PATH_KEY, '//evil.com');
    expect(takePostLoginPath()).toBeNull();
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
  });
  it('never throws when storage is unavailable', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => rememberPostLoginPath('/dashboard')).not.toThrow();
    spy.mockRestore();
    const g = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(takePostLoginPath()).toBeNull();
    g.mockRestore();
  });
});
