/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
// Makes this file a module so its top-level names do not clash with other test files under tsc.
export {};
// T-223 AC4 (web) — the /verify-email landing page the emailed link opens.
// Mounted with react-dom/client; module state (the one-POST-per-token map) is reset per test.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Strings typed out independently of the source.
// Signed: handoff/legal/T-223-verify-email-signed.md (part B "all states approved as drafted").
// Not yet signed ("Ajay to check", handoff/marketing/copy/verify-email-t223.md "Additions for Ajay"):
// landingError, landingErrorRetry, expiredSignedOut, expiredSignedOutCta.
const S = {
  title: 'Verify your email',
  verified: 'Your email is verified. You can continue.',
  already: 'Your email is already verified.',
  expired: 'This link has expired. Send a new one.',
  resend: 'Resend email',
  landingError: "We couldn't verify your email just now. Please try again.",
  retry: 'Try again',
  expiredSignedOut: 'This link has expired. Sign in to send a new one.',
  signIn: 'Sign in',
  sent: 'Email sent to a***@example.com. Check your inbox and your spam folder.',
};
const TOKEN = 'TOK_s3cr3t_abc123';
const FULL_EMAIL = 'alice.secret@example.com';
const VERIFY = '/api/auth/verify-email';

let mockUser: { id: string; email: string } | null;
let mockLoading: boolean;
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: jest.fn(), logout: jest.fn(), isLoading: mockLoading }),
}));

type Reply = { status?: number; body?: unknown; throws?: boolean };
type Handler = Reply | ((n: number) => Reply);
let calls: { url: string; path: string; method: string; body?: string }[];
let handlers: Record<string, Handler>;
let consoleSpies: jest.SpyInstance[];
let h: ReturnType<typeof load>;

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
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ url: String(url), path, method: init.method ?? 'GET', body: init.body as string });
    counts[path] = (counts[path] ?? 0) + 1;
    const hd = handlers[path];
    const r = typeof hd === 'function' ? hd(counts[path]) : hd;
    if (!r) return fakeResponse(404, {});
    if (r.throws) throw new Error('network');
    return fakeResponse(r.status ?? 200, r.body ?? {});
  });
}
const me = (emailVerified: boolean, hasGoogle: boolean): Reply => ({
  body: { data: { emailVerified, hasGoogle } },
});
const verifyCalls = () => calls.filter((c) => c.path === VERIFY);

function load(opts: { strict?: boolean; token?: string | null } = {}) {
  jest.resetModules();
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const token = opts.token === undefined ? TOKEN : opts.token;
  window.history.replaceState(null, '', token ? `/verify-email?token=${token}` : '/verify-email');
  require('next/navigation').useSearchParams.mockReturnValue(
    new URLSearchParams(token ? `token=${token}` : ''),
  );
  const Page = require('../page').default;
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
    async mount() {
      const el = React.createElement(Page);
      await act(async () =>
        root.render(opts.strict ? React.createElement(React.StrictMode, null, el) : el),
      );
      await flush();
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
const alertText = () =>
  Array.from(document.querySelectorAll('[role="alert"]'))
    .map((r) => r.textContent)
    .join('|');
const politeText = () =>
  Array.from(document.querySelectorAll('[role="status"]'))
    .map((r) => r.textContent)
    .filter(Boolean) // the page's own region and the resend core's region may both be mounted
    .join('|');

function signIn() {
  mockUser = { id: 'u1', email: FULL_EMAIL };
  localStorage.setItem('lawie_access_token', 'a.b.c');
}

beforeEach(() => {
  mockUser = null;
  mockLoading = false;
  localStorage.clear();
  handlers = { [VERIFY]: { body: { status: 'verified' } } };
  installFetch();
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(async () => {
  await h?.unmount();
  document.body.innerHTML = '';
  consoleSpies.forEach((s) => s.mockRestore());
});

describe('T-223 AC4 — landing: token handling', () => {
  it('strips ?token= from the address bar, keeping the path', async () => {
    h = load();
    expect(window.location.search).toContain('token=');
    await h.mount();
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/verify-email');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('POSTs the token in the JSON body to a fixed path; the token is never in a URL', async () => {
    h = load();
    await h.mount();
    const c = verifyCalls();
    expect(c).toHaveLength(1);
    expect(c[0].method).toBe('POST');
    expect(JSON.parse(c[0].body as string)).toEqual({ token: TOKEN });
    for (const call of calls) {
      expect(call.url).not.toContain(TOKEN);
      expect(call.path).not.toContain('token');
    }
    expect(c[0].path).toBe(VERIFY);
  });

  it('sends the POST once under StrictMode double effects', async () => {
    h = load({ strict: true });
    await h.mount();
    expect(verifyCalls()).toHaveLength(1);
    expect(document.body.textContent).toContain(S.verified);
  });

  it('the page head: no-referrer and noindex', () => {
    h = load();
    const { metadata } = require('../page');
    expect(metadata.referrer).toBe('no-referrer');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('no console call contains the token or the address, on success, expiry and error', async () => {
    signIn();
    handlers[VERIFY] = { status: 500, body: {} };
    h = load();
    await h.mount();
    handlers[VERIFY] = { throws: true };
    await h.click(byText(S.retry) as Element);
    const all = consoleSpies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c));
    for (const line of all) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain('alice');
    }
  });
});

describe('T-223 AC4 — landing: outcomes and signed strings', () => {
  it('verified: signed "verified" text in the page and the polite region', async () => {
    h = load();
    await h.mount();
    expect(document.querySelector('h1')?.textContent).toBe(S.title);
    expect(document.querySelector('p')?.textContent).toBe(S.verified);
    expect(politeText()).toBe(S.verified);
    expect(byText(S.retry)).toBeUndefined();
  });

  it('already_verified: signed "already verified" text', async () => {
    handlers[VERIFY] = { body: { status: 'already_verified' } };
    h = load();
    await h.mount();
    expect(document.querySelector('p')?.textContent).toBe(S.already);
    expect(politeText()).toBe(S.already);
  });

  it('signed in, link expired (400): expired line plus Resend, which posts to /resend', async () => {
    signIn();
    handlers['/api/auth/me'] = me(false, false);
    handlers[VERIFY] = { status: 400, body: { error: 'verify_link_invalid' } };
    handlers['/api/auth/verify-email/resend'] = { status: 202, body: {} };
    h = load();
    await h.mount();
    expect(alertText()).toBe(S.expired);
    expect(document.body.textContent).toContain(S.expired);
    expect(byText(S.signIn)).toBeUndefined();
    await h.click(byText(S.resend) as Element);
    expect(calls.filter((c) => c.path === '/api/auth/verify-email/resend')).toHaveLength(1);
    expect(politeText()).toBe(S.sent);
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
  });

  it('signed out, link expired: signed-out line and a Sign in link to /login; no Resend', async () => {
    handlers[VERIFY] = { status: 400, body: { error: 'verify_link_invalid' } };
    h = load();
    await h.mount();
    expect(alertText()).toBe(S.expiredSignedOut);
    const link = byText(S.signIn) as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/login');
    expect(byText(S.resend)).toBeUndefined();
    expect(calls.filter((c) => c.path.includes('resend'))).toHaveLength(0);
  });

  it('no token in the link: expired state, no POST', async () => {
    h = load({ token: null });
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(alertText()).toBe(S.expiredSignedOut);
  });

  it.each([
    ['500', { status: 500, body: {} }],
    ['503', { status: 503, body: {} }],
    ['network error', { throws: true }],
  ])('%s: error text plus Try again, never the expired text', async (_l, reply) => {
    handlers[VERIFY] = reply as Reply;
    h = load();
    await h.mount();
    expect(alertText()).toBe(S.landingError);
    expect(document.body.textContent).not.toContain('expired');
    expect(byText(S.retry)).toBeDefined();
  });

  it('Try again re-POSTs the same token and then shows the result', async () => {
    let n = 0;
    handlers[VERIFY] = () =>
      ++n === 1 ? { status: 503, body: {} } : { body: { status: 'verified' } };
    h = load();
    await h.mount();
    await h.click(byText(S.retry) as Element);
    const c = verifyCalls();
    expect(c).toHaveLength(2);
    expect(JSON.parse(c[1].body as string)).toEqual({ token: TOKEN });
    expect(document.querySelector('p')?.textContent).toBe(S.verified);
    expect(byText(S.retry)).toBeUndefined();
  });

  it('Try again moves focus to the page title, not <body>', async () => {
    handlers[VERIFY] = { status: 500, body: {} };
    h = load();
    await h.mount();
    await h.click(byText(S.retry) as Element);
    expect(document.activeElement).toBe(document.querySelector('h1'));
  });

  it('signed in and already verified: "already verified", no verify POST', async () => {
    signIn();
    handlers['/api/auth/me'] = me(true, false);
    h = load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(document.querySelector('p')?.textContent).toBe(S.already);
  });

  it('signed in as a Google user: "already verified", no verify POST', async () => {
    signIn();
    handlers['/api/auth/me'] = me(false, true);
    h = load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(document.querySelector('p')?.textContent).toBe(S.already);
  });

  it('signed in but /me fails: falls through to the POST (the token is the credential)', async () => {
    signIn();
    handlers['/api/auth/me'] = { status: 500, body: {} };
    h = load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(1);
    expect(document.querySelector('p')?.textContent).toBe(S.verified);
  });

  it('waits for auth to finish loading before deciding', async () => {
    mockLoading = true;
    h = load();
    await h.mount();
    expect(verifyCalls()).toHaveLength(0);
    expect(document.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
  });
});
