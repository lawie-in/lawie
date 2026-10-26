/**
 * T-616 AC3: /login?next=<path> returns the user to the page they were on after a forced sign-in.
 * Only a safe same-site path is honoured (no open redirect). For Google the path goes to this
 * tab's sessionStorage, never into the Google URL or the OAuth state.
 */
import { TextEncoder } from 'util';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

import { POST_LOGIN_PATH_KEY } from '@/lib/safeReturnPath';

const mockLogin = jest.fn();
let mockUser: { id: string } | null = null;
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, user: mockUser }),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
let replace: jest.Mock;
const hrefs: string[] = [];
const realLocation = window.location;
const flush = () => act(async () => void (await Promise.resolve()));
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const googleButton = () =>
  Array.from(document.querySelectorAll('button')).find((b) =>
    /continue with google/i.test(b.textContent ?? ''),
  ) as HTMLButtonElement;

async function mount(query: string) {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
  replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace, prefetch: jest.fn() });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<LoginPage />));
  await flush();
}
function setInput(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function emailSignIn() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { accessToken: 'acc', refreshToken: 'ref' } }),
  }) as unknown as typeof fetch;
  await act(async () => {
    setInput(q<HTMLInputElement>('#email')!, 'a@example.com');
    setInput(q<HTMLInputElement>('#password')!, 'Passw0rdOk');
  });
  await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
  await flush();
  await flush();
}
function stubCrypto() {
  if (typeof globalThis.TextEncoder === 'undefined') {
    Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
  }
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: (a: Uint8Array) => a.fill(7),
      subtle: { digest: async () => new Uint8Array(32).buffer },
    },
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockLogin.mockClear();
  mockUser = null;
  hrefs.length = 0;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  jest.restoreAllMocks();
});

describe('email sign-in', () => {
  it('honours a safe ?next=: logs in, then replaces to it', async () => {
    await mount('mode=signin&next=%2Fdashboard%2Fnew');
    await emailSignIn();
    expect(mockLogin).toHaveBeenCalledWith('acc', 'ref');
    expect(replace).toHaveBeenCalledWith('/dashboard/new');
  });

  it('no ?next=: /dashboard as before', async () => {
    await mount('mode=signin');
    await emailSignIn();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it.each([
    ['//evil.example', '%2F%2Fevil.example'],
    ['https://evil.example', 'https%3A%2F%2Fevil.example'],
    ['/\\evil.example', '%2F%5Cevil.example'],
    ['javascript:alert(1)', 'javascript%3Aalert(1)'],
    ['/login', '%2Flogin'],
    ['/auth/callback', '%2Fauth%2Fcallback'],
    ['/api/auth/refresh', '%2Fapi%2Fauth%2Frefresh'],
    ['encoded CRLF', '%2Fx%250d%250a'],
  ])('an unsafe ?next= (%s) is ignored: /dashboard', async (_n, enc) => {
    await mount(`mode=signin&next=${enc}`);
    await emailSignIn();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });
});

describe('Google', () => {
  beforeEach(() => {
    stubCrypto();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...realLocation,
        set href(v: string) {
          hrefs.push(v);
        },
        get href() {
          return 'http://localhost/login';
        },
      },
    });
  });

  it('stores the validated next in sessionStorage; the redirect URL never contains it', async () => {
    await mount('mode=signin&next=%2Fdashboard%2Fnew');
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    await flush();
    expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/dashboard/new');
    expect(window.localStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]).toMatch(/\/api\/auth\/google\?/);
    expect(hrefs[0]).not.toContain('dashboard');
    expect(hrefs[0]).not.toContain('next');
    expect(decodeURIComponent(hrefs[0])).not.toContain('/dashboard/new');
  });

  it('an unsafe next is not stored (and clears an earlier stored value)', async () => {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, '/dashboard/old');
    await mount('mode=signin&next=%2F%2Fevil.example');
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    await flush();
    expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
    expect(hrefs[0]).not.toContain('evil');
  });

  it('with no next at all nothing is stored', async () => {
    await mount('mode=signin');
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    await flush();
    expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
  });

  it('after a failed Google return (?error=, no next) the stored path is still used for email sign-in, and not removed', async () => {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, '/dashboard/documents');
    await mount('mode=signin&error=oauth_failed');
    await emailSignIn();
    expect(replace).toHaveBeenCalledWith('/dashboard/documents');
    expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/dashboard/documents');
  });

  it('a tampered stored path is ignored on the ?error= return', async () => {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, '//evil.example');
    await mount('mode=signin&error=oauth_failed');
    await emailSignIn();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('the stored path is NOT read without ?error= (a plain visit to /login)', async () => {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, '/dashboard/documents');
    await mount('mode=signin');
    await emailSignIn();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });
});

describe('already signed in', () => {
  it('with a safe next: goes straight there', async () => {
    mockUser = { id: 'u1' };
    await mount('mode=signin&next=%2Fdashboard%2Fnew');
    expect(replace).toHaveBeenCalledWith('/dashboard/new');
  });

  it('with an unsafe next: no redirect from this effect', async () => {
    mockUser = { id: 'u1' };
    await mount('mode=signin&next=%2F%2Fevil.example');
    expect(replace).not.toHaveBeenCalled();
  });

  it('with no next: no redirect from this effect (unchanged)', async () => {
    mockUser = { id: 'u1' };
    await mount('mode=signin');
    expect(replace).not.toHaveBeenCalled();
  });

  it('signed out with a next: no redirect', async () => {
    await mount('mode=signin&next=%2Fdashboard%2Fnew');
    expect(replace).not.toHaveBeenCalled();
  });
});
