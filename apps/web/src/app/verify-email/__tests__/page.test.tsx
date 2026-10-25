/* eslint-disable @typescript-eslint/no-explicit-any */
// Makes this file a module so its top-level names do not clash with other test files under tsc.
export {};
// T-522 (AJ-522-S5, S12) — the /verify-email landing page the emailed link opens: the five states.
// Mounted with react-dom/client; module state (the one-POST-per-token map) is reset per test by
// loading a fresh copy of the page (jest.resetModules, then dynamic imports; no require).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Strings typed out independently of the source, copied from
// handoff/legal/T-511-copy-rulings-ajay.md (origin/develop_staging) AJ-522-S5, S12, M4.
const S = {
  verifying: 'Verifying your email…', // AJ-522-S12
  stillWorking: 'Still working…', // AJ-522-S5 (after 8 s)
  verifiedTitle: 'Email verified',
  verifiedSignedIn: 'Your email is verified. You can continue.',
  goToShelf: 'Go to your shelf',
  verifiedSignedOut: 'Your email is verified. Sign in to continue.',
  signIn: 'Sign in',
  expiredTitle: 'This link has expired or was already used.',
  expiredLine:
    'Sign in to continue. If your email is not verified yet, you can ask for a new link.',
  failed: "We couldn't verify your email just now. Please try again.",
  tryAgain: 'Try again',
  resend: 'Resend email',
  sent: 'Email sent. Check your inbox and spam folder.', // AJ-522-M4
  // T-223 lines this ticket replaced: they must not render any more.
  oldExpired: 'This link has expired. Send a new one.',
  oldExpiredSignedOut: 'This link has expired. Sign in to send a new one.',
  oldAlready: 'Your email is already verified.',
};
const TOKEN = 'TOK_s3cr3t_abc123';
const ACCESS = 'access.jwt.value';
const REFRESH = 'refresh.jwt.value';
const FULL_EMAIL = 'alice.secret@example.com';
const VERIFY = '/api/auth/verify-email';
const RESEND = '/api/auth/verify-email/resend';
const RESEND_BY_EMAIL = '/api/auth/verify-email/resend-by-email';

let mockUser: { id: string; email: string } | null;
let mockLoading: boolean;
const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: mockLogin, logout: jest.fn(), isLoading: mockLoading }),
}));

type Reply = { status?: number; body?: unknown; throws?: boolean };
type Handler = Reply | ((n: number) => Reply);
let calls: { url: string; path: string; method: string; body?: string; init: RequestInit }[];
let handlers: Record<string, Handler>;
let consoleSpies: jest.SpyInstance[];
let h: Awaited<ReturnType<typeof load>> | undefined;
let pendingVerify: ((r: Reply) => void) | null = null;

function fakeResponse(status: number, body: unknown) {
  const make = (): any => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => JSON.parse(JSON.stringify(body)),
    clone: () => make(),
  });
  return make();
}
function installFetch() {
  calls = [];
  const counts: Record<string, number> = {};
  (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const p = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({
      url: String(url),
      path: p,
      method: init.method ?? 'GET',
      body: init.body as string,
      init,
    });
    counts[p] = (counts[p] ?? 0) + 1;
    const hd = handlers[p];
    const r = typeof hd === 'function' ? hd(counts[p]) : hd;
    if (!r) return fakeResponse(404, {});
    if (r.throws) throw new Error('network');
    return fakeResponse(r.status ?? 200, r.body ?? {});
  });
}
const me = (emailVerified: boolean, hasGoogle: boolean): Reply => ({
  body: { data: { emailVerified, hasGoogle } },
});
const SIGNIN_OK: Reply = {
  body: { status: 'verified', accessToken: ACCESS, refreshToken: REFRESH, user: { id: 'u1' } },
};
const verifyCalls = () => calls.filter((c) => c.path === VERIFY);

async function load(opts: { strict?: boolean; token?: string | null } = {}) {
  jest.resetModules();
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const nav = await import('next/navigation');
  const token = opts.token === undefined ? TOKEN : opts.token;
  window.history.replaceState(null, '', token ? `/verify-email?token=${token}` : '/verify-email');
  (nav.useSearchParams as jest.Mock).mockReturnValue(
    new URLSearchParams(token ? `token=${token}` : ''),
  );
  const router = { push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() };
  (nav.useRouter as jest.Mock).mockReturnValue(router);
  const pageMod = await import('../page');
  const Page = pageMod.default;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const flush = () =>
    act(async () => {
      for (let i = 0; i < 15; i += 1) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  return {
    act,
    flush,
    router,
    metadata: pageMod.metadata,
    async mount() {
      const el = React.createElement(Page);
      await act(async () =>
        root.render(opts.strict ? React.createElement(React.StrictMode, null, el) : el),
      );
      await flush();
    },
    /** For fake timers: the macrotask flush would hang, so only microtasks are drained. */
    async mountFake() {
      await act(async () => root.render(React.createElement(Page)));
      await act(async () => {
        for (let i = 0; i < 15; i += 1) await Promise.resolve();
      });
    },
    async unmount() {
      await act(async () => root.unmount());
    },
    async click(el: Element) {
      await act(async () => {
        (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();
    },
  };
}
const byText = (label: string) =>
  Array.from(document.querySelectorAll('button, a')).find((b) => b.textContent === label) as
    | HTMLElement
    | undefined;
const title = () => document.querySelector('h1')?.textContent;
const bodyText = () => document.body.textContent ?? '';
const alertText = () =>
  Array.from(document.querySelectorAll('[role="alert"]'))
    .map((r) => r.textContent)
    .join('|');
const politeText = () =>
  Array.from(document.querySelectorAll('[role="status"]'))
    .map((r) => r.textContent)
    .filter(Boolean)
    .join('|');

function signIn() {
  mockUser = { id: 'u1', email: FULL_EMAIL };
  localStorage.setItem('lawie_access_token', 'a.b.c');
}

beforeEach(() => {
  mockUser = null;
  mockLoading = false;
  mockLogin.mockReset();
  pendingVerify = null;
  localStorage.clear();
  handlers = { [VERIFY]: { body: { status: 'verified' } } };
  installFetch();
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(async () => {
  await h?.unmount();
  h = undefined;
  document.body.innerHTML = '';
  jest.useRealTimers();
  consoleSpies.forEach((s) => s.mockRestore());
});

describe('T-522 landing — the token', () => {
  it('removes ?token= from the address bar, keeping the path', async () => {
    h = await load();
    expect(window.location.search).toContain('token=');
    await h.mount();
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/verify-email');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('POSTs the token exactly once, in the JSON body, to a fixed path; the token is never in a URL', async () => {
    h = await load();
    await h.mount();
    const c = verifyCalls();
    expect(c).toHaveLength(1);
    expect(c[0].method).toBe('POST');
    expect(JSON.parse(c[0].body as string)).toEqual({ token: TOKEN });
    expect(c[0].init.referrerPolicy).toBe('no-referrer');
    for (const call of calls) {
      expect(call.url).not.toContain(TOKEN);
      expect(call.path).not.toContain('token');
    }
    expect(c[0].path).toBe(VERIFY);
  });

  it('sends the POST once under StrictMode double effects, and re-renders do not spend it again', async () => {
    handlers[VERIFY] = SIGNIN_OK;
    h = await load({ strict: true });
    await h.mount();
    await h.flush();
    expect(verifyCalls()).toHaveLength(1);
    expect(mockLogin).toHaveBeenCalledWith(ACCESS, REFRESH);
    expect(bodyText()).toContain(S.verifiedSignedIn);
  });

  it('the page head: no-referrer and noindex', async () => {
    h = await load();
    expect(h.metadata.referrer).toBe('no-referrer');
    expect(h.metadata.robots).toEqual({ index: false, follow: false });
  });

  it('no console call contains the token, the session tokens or the address', async () => {
    signIn();
    handlers[VERIFY] = { status: 500, body: {} };
    h = await load();
    await h.mount();
    handlers[VERIFY] = SIGNIN_OK;
    await h.click(byText(S.tryAgain) as Element);
    const all = consoleSpies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c));
    for (const line of all) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain(ACCESS);
      expect(line).not.toContain('alice');
    }
  });
});

describe('AJ-522-S5 state 1 — verifying (S12)', () => {
  it('shows "Verifying your email…" while the POST is pending, then "Still working…" after 8 s', async () => {
    jest.useFakeTimers();
    (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      const p = String(url).replace(/^https?:\/\/[^/]+/, '');
      calls.push({ url: String(url), path: p, method: init.method ?? 'GET', init });
      if (p === VERIFY) {
        return new Promise((resolve) => {
          pendingVerify = (r) => resolve(fakeResponse(r.status ?? 200, r.body ?? {}));
        });
      }
      return fakeResponse(404, {});
    });
    h = await load();
    await h.mountFake();
    expect(title()).toBe(S.verifying);
    expect(title()).not.toBe('Verify your email');
    expect(bodyText()).not.toContain(S.stillWorking);
    await h.act(async () => {
      jest.advanceTimersByTime(7_000);
    });
    expect(bodyText()).not.toContain(S.stillWorking);
    await h.act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(bodyText()).toContain(S.stillWorking);
    expect(verifyCalls()).toHaveLength(1);
    await h.act(async () => {
      pendingVerify?.({ body: SIGNIN_OK.body });
      for (let i = 0; i < 15; i += 1) await Promise.resolve();
    });
    expect(title()).toBe(S.verifiedTitle);
  });

  it('waits for auth to finish loading before deciding', async () => {
    mockLoading = true;
    h = await load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(title()).toBe(S.verifying);
  });
});

describe('AJ-522-S5 state 2 — verified and signed in', () => {
  it('a sign-in link response logs the user in, and shows the signed title, line and button', async () => {
    handlers[VERIFY] = SIGNIN_OK;
    h = await load();
    await h.mount();
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith(ACCESS, REFRESH);
    expect(title()).toBe(S.verifiedTitle);
    expect(politeText()).toBe(S.verifiedSignedIn);
    expect(byText(S.goToShelf)).toBeDefined();
    expect(byText(S.signIn)).toBeUndefined();
    expect(byText(S.tryAgain)).toBeUndefined();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(bodyText()).not.toContain(ACCESS);
    expect(bodyText()).not.toContain(REFRESH);
  });

  it('Go to your shelf goes to the dashboard', async () => {
    handlers[VERIFY] = SIGNIN_OK;
    h = await load();
    await h.mount();
    await h.click(byText(S.goToShelf) as Element);
    expect(h.router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('a verify-only link opened with a session shows the same signed-in state, without a second login', async () => {
    signIn();
    handlers['/api/auth/me'] = me(false, false);
    handlers[VERIFY] = { body: { status: 'verified' } };
    h = await load();
    await h.mount();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(title()).toBe(S.verifiedTitle);
    expect(politeText()).toBe(S.verifiedSignedIn);
  });

  it('already_verified with tokens also signs in', async () => {
    handlers[VERIFY] = {
      body: { status: 'already_verified', accessToken: ACCESS, refreshToken: REFRESH },
    };
    h = await load();
    await h.mount();
    expect(mockLogin).toHaveBeenCalledWith(ACCESS, REFRESH);
    expect(title()).toBe(S.verifiedTitle);
  });

  it('signed in and already verified: skips the page to /dashboard without spending the link', async () => {
    signIn();
    handlers['/api/auth/me'] = me(true, false);
    h = await load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(h.router.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('signed in as a Google user: skips to /dashboard, no verify POST', async () => {
    signIn();
    handlers['/api/auth/me'] = me(false, true);
    h = await load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(h.router.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('signed in but /me fails: falls through to the POST (the token is the credential)', async () => {
    signIn();
    handlers['/api/auth/me'] = { status: 500, body: {} };
    h = await load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(1);
    expect(title()).toBe(S.verifiedTitle);
  });
});

describe('AJ-522-S5 state 3 — verified, not signed in', () => {
  it('a 200 without tokens and no session: the sign-in line and a Sign in button, no login', async () => {
    handlers[VERIFY] = { body: { status: 'verified' } };
    h = await load();
    await h.mount();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(politeText()).toBe(S.verifiedSignedOut);
    expect(byText(S.signIn)).toBeDefined();
    expect(byText(S.goToShelf)).toBeUndefined();
    expect(byText(S.resend)).toBeUndefined();
    expect(bodyText()).not.toContain(S.verifiedSignedIn);
  });

  it('Sign in goes to the sign-in form', async () => {
    h = await load();
    await h.mount();
    await h.click(byText(S.signIn) as Element);
    expect(h.router.push).toHaveBeenCalledWith('/login?mode=signin');
  });

  it('a token without a refresh token does not log anyone in', async () => {
    handlers[VERIFY] = { body: { status: 'verified', accessToken: ACCESS } };
    h = await load();
    await h.mount();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(politeText()).toBe(S.verifiedSignedOut);
  });
});

describe('AJ-522-S5 state 4 — expired or used', () => {
  it('a 400 signed out: the signed title and line, Sign in, no Resend, no login, no resend call', async () => {
    handlers[VERIFY] = { status: 400, body: { error: 'verify_link_invalid' } };
    h = await load();
    await h.mount();
    expect(title()).toBe(S.expiredTitle);
    expect(bodyText()).toContain(S.expiredLine);
    expect(byText(S.signIn)).toBeDefined();
    expect(byText(S.resend)).toBeUndefined();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.path.includes('resend'))).toHaveLength(0);
    expect(bodyText()).not.toContain(S.oldExpired);
    expect(bodyText()).not.toContain(S.oldExpiredSignedOut);
  });

  it('Resend email shows only when a session exists, and uses the signed-in resend (never resend-by-email)', async () => {
    signIn();
    handlers['/api/auth/me'] = me(false, false);
    handlers[VERIFY] = { status: 400, body: { error: 'verify_link_invalid' } };
    handlers[RESEND] = { status: 202, body: {} };
    h = await load();
    await h.mount();
    expect(title()).toBe(S.expiredTitle);
    expect(byText(S.resend)).toBeDefined();
    await h.click(byText(S.resend) as Element);
    expect(calls.filter((c) => c.path === RESEND)).toHaveLength(1);
    expect(calls.filter((c) => c.path === RESEND_BY_EMAIL)).toHaveLength(0);
    expect(politeText()).toContain(S.sent);
    expect(bodyText()).not.toContain(FULL_EMAIL);
  });

  it('Sign in on the expired state goes to the sign-in form', async () => {
    handlers[VERIFY] = { status: 400, body: {} };
    h = await load();
    await h.mount();
    await h.click(byText(S.signIn) as Element);
    expect(h.router.push).toHaveBeenCalledWith('/login?mode=signin');
  });

  it('no token in the link: the expired state and no POST', async () => {
    h = await load({ token: null });
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(title()).toBe(S.expiredTitle);
    expect(byText(S.resend)).toBeUndefined();
  });
});

describe('AJ-522-S5 state 5 — failure', () => {
  it.each([
    ['500', { status: 500, body: {} }],
    ['503', { status: 503, body: {} }],
    ['network error', { throws: true }],
  ])('%s: the signed failure line plus Try again, never the expired state', async (_l, reply) => {
    handlers[VERIFY] = reply as Reply;
    h = await load();
    await h.mount();
    expect(alertText()).toBe(S.failed);
    expect(byText(S.tryAgain)).toBeDefined();
    expect(title()).not.toBe(S.expiredTitle);
    expect(bodyText()).not.toContain('expired');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('Try again re-POSTs the same token (a second POST only because the first failed) and then shows the result', async () => {
    let n = 0;
    handlers[VERIFY] = () => (++n === 1 ? { status: 503, body: {} } : SIGNIN_OK);
    h = await load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(1);
    await h.click(byText(S.tryAgain) as Element);
    const c = verifyCalls();
    expect(c).toHaveLength(2);
    expect(JSON.parse(c[1].body as string)).toEqual({ token: TOKEN });
    expect(title()).toBe(S.verifiedTitle);
    expect(mockLogin).toHaveBeenCalledWith(ACCESS, REFRESH);
    expect(byText(S.tryAgain)).toBeUndefined();
  });

  it('Try again moves focus to the page title, not <body>', async () => {
    handlers[VERIFY] = { status: 500, body: {} };
    h = await load();
    await h.mount();
    await h.click(byText(S.tryAgain) as Element);
    expect(document.activeElement).toBe(document.querySelector('h1'));
  });
});

describe('focus and the old T-223 strings', () => {
  it('each settled state moves focus to the title', async () => {
    handlers[VERIFY] = SIGNIN_OK;
    h = await load();
    await h.mount();
    expect(document.activeElement).toBe(document.querySelector('h1'));
  });

  it('the old "already verified" and "expired, send a new one" lines never render', async () => {
    handlers[VERIFY] = { body: { status: 'already_verified' } };
    h = await load();
    await h.mount();
    expect(bodyText()).not.toContain(S.oldAlready);
    expect(bodyText()).not.toContain(S.oldExpired);
  });
});
