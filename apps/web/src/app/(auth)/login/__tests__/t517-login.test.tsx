/**
 * T-517 AC3, AC4: sign-up and login in Night Library. Create account is the first tab, the consent
 * box (AJ-517-M3) gates Create account and Google on that tab, the signed error lines (§2.4) are
 * shown, Retry repeats the last attempt, loading disables the form, and the old behaviour (register
 * body, 409 handling, password checklist, Forgot password, PKCE start) is kept.
 * Mounted with react-dom/client, like login-signup-source.test.tsx.
 */
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import { act } from 'react';
import { TextEncoder } from 'util';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WRONG = 'That email and password do not match. Try again, or reset your password.';
const NETWORK = 'Could not reach Lawie. Check your connection and try again.';
const SERVER = 'Could not sign you in. Try again.';
const CONSENT_REQUIRED = 'Please accept the Privacy Policy and Terms to continue.';
// AJ-517-M16 (Ajay, f74ee365): both versions, no date.
const CONSENT_LABEL =
  'I have read and agree to the Terms (version 2026-10-22) and the Privacy Policy (version 2026-10-15).';
const BY_CONTINUING =
  "By continuing, you agree to Lawie's Terms of Service and confirm you have read our Privacy Policy.";

let root: Root | null = null;
let host: HTMLElement | null = null;
let push: jest.Mock;
let replace: jest.Mock;
const flush = () => act(async () => void (await Promise.resolve()));
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

async function mount(query: string) {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
  push = jest.fn();
  replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push, replace, prefetch: jest.fn() });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<LoginPage />));
  await flush();
}

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const byText = (sel: string, text: string) => qa(sel).find((e) => norm(e.textContent) === text);
const tabs = () => qa('[role="tab"]');
const alertText = () => norm(q('[role="alert"]')?.textContent);

function setInput(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const fillSignup = () =>
  act(async () => {
    setInput(q<HTMLInputElement>('#name')!, 'New Person');
    setInput(q<HTMLInputElement>('#email')!, 'new.person@example.com');
    setInput(q<HTMLInputElement>('#password')!, 'Passw0rdOk');
  });
const fillSignin = () =>
  act(async () => {
    setInput(q<HTMLInputElement>('#email')!, 'a@example.com');
    setInput(q<HTMLInputElement>('#password')!, 'Passw0rdOk');
  });
const tickConsent = () => act(async () => void q<HTMLInputElement>('#consent')!.click());
const submit = async () => {
  await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
  await flush();
};
const googleButton = () => byText('button', 'Continue with Google') as HTMLButtonElement;

const respond = (status: number, json: unknown = {}) =>
  jest
    .fn()
    .mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => json });
const setFetch = (f: jest.Mock) => {
  global.fetch = f as unknown as typeof fetch;
  return f;
};
const OK_BODY = { data: { accessToken: 'a', refreshToken: 'r', user: {} } };
// T-522 (Arjun ruling 1): Create account answers 202 { status: 'success', data: { status: 'check_email' } }.
const NEUTRAL_BODY = { status: 'success', data: { status: 'check_email' } };
// AJ-511-M3 via AJ-522-M2 (handoff/legal/T-511-copy-rulings-ajay.md).
const CHECK_BODY = "We've sent a link to new.person@example.com. Open it to continue.";

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
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  // jsdom cannot navigate; it logs "not implemented" on console.error.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  jest.restoreAllMocks();
});

describe('tabs (AC4)', () => {
  it('Create account is first, Sign in second, in a named tablist', async () => {
    await mount('mode=signup');
    expect(tabs().map((t) => norm(t.textContent))).toEqual(['Create account', 'Sign in']);
    expect(q('[role="tablist"]')!.getAttribute('aria-label')).toBe('Sign in or create account');
  });

  it('?mode=signup and ?ref open Create account; ?mode=signin and no param open Sign in', async () => {
    await mount('mode=signup');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(q('h1')!.textContent).toBe('Create your account');
    act(() => root!.unmount());
    host!.remove();
    await mount('ref=abc');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    act(() => root!.unmount());
    host!.remove();
    await mount('mode=signin&ref=abc');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(q('h1')!.textContent).toBe('Welcome back');
    act(() => root!.unmount());
    host!.remove();
    await mount('');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('Home goes to Create account, End to Sign in, with explicit ?mode= URLs', async () => {
    await mount('mode=signin');
    const key = (el: HTMLElement, k: string) =>
      act(
        async () =>
          void el.dispatchEvent(
            new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
          ),
      );
    await key(tabs()[1], 'Home');
    expect(push).toHaveBeenLastCalledWith('/login?mode=signup', { scroll: false });
    act(() => root!.unmount());
    host!.remove();
    await mount('mode=signup');
    await key(tabs()[0], 'End');
    expect(push).toHaveBeenLastCalledWith('/login?mode=signin', { scroll: false });
    await key(tabs()[0], 'ArrowRight');
    expect(push).toHaveBeenLastCalledWith('/login?mode=signin', { scroll: false });
  });

  it('clicking the other tab pushes its URL', async () => {
    await mount('mode=signup');
    await act(async () => void tabs()[1].click());
    expect(push).toHaveBeenCalledWith('/login?mode=signin', { scroll: false });
  });
});

describe('consent (AJ-517-M3)', () => {
  it('Create account has an unticked consent box with the signed label and Terms / Privacy links', async () => {
    await mount('mode=signup');
    const box = q<HTMLInputElement>('#consent')!;
    expect(box.checked).toBe(false);
    expect(norm(q('label[for="consent"]')!.textContent)).toBe(CONSENT_LABEL);
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-10-15');
    expect(norm(q('label[for="consent"]')!.textContent)).not.toMatch(/\d{1,2} Oct/);
    const links = Array.from(q('label[for="consent"]')!.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/terms', '/privacy']);
  });

  it('Sign in has no consent box; the "By continuing" line sits in the tabpanel just below Google, outside the form (AJ-517-M18)', async () => {
    await mount('mode=signin');
    expect(q('#consent')).toBeNull();
    const panel = q('[role="tabpanel"]')!;
    expect(norm(panel.textContent)).toContain(BY_CONTINUING);
    expect(norm(q('form')!.textContent)).not.toContain('By continuing');
    const line = qa('p, div, small, span').find(
      (e) => norm(e.textContent) === BY_CONTINUING,
    ) as HTMLElement;
    expect(line).toBeDefined();
    expect(q('form')!.contains(line)).toBe(false);
    expect(panel.contains(line)).toBe(true);
    // Directly below Continue with Google: Google precedes the line, the form follows it.
    const order = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(order(googleButton(), line)).toBe(true);
    expect(order(line, q('form')!)).toBe(true);
    const links = Array.from(line.querySelectorAll('a'));
    expect(links.map((a) => [norm(a.textContent), a.getAttribute('href')])).toEqual([
      ['Terms of Service', '/terms'],
      ['Privacy Policy', '/privacy'],
    ]);
  });

  it('T-642 AC1: Create account shows the same "By continuing" line under Google, byte for byte, with both links', async () => {
    await mount('mode=signup');
    const panel = q('[role="tabpanel"]')!;
    const line = qa('p, div, small, span').find(
      (e) => norm(e.textContent) === BY_CONTINUING,
    ) as HTMLElement;
    expect(line).toBeDefined();
    expect(q('form')!.contains(line)).toBe(false);
    expect(panel.contains(line)).toBe(true);
    expect(
      Boolean(googleButton().compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Array.from(line.querySelectorAll('a')).map((a) => [
        norm(a.textContent),
        a.getAttribute('href'),
      ]),
    ).toEqual([
      ['Terms of Service', '/terms'],
      ['Privacy Policy', '/privacy'],
    ]);
    // T-642 AC2 (AJ-642-M1): the email form keeps its checkbox.
    expect(q('#consent')).not.toBeNull();
  });

  it('the auth page footer has no Cookie settings button (analytics never loads here)', async () => {
    await mount('mode=signin');
    expect(qa('footer button').some((b) => /cookie settings/i.test(b.textContent ?? ''))).toBe(
      false,
    );
  });

  it('unticked: Create account is blocked with the signed error, focus goes to the box, nothing is sent', async () => {
    const f = setFetch(respond(201, OK_BODY));
    await mount('mode=signup');
    await fillSignup();
    await submit();
    expect(f).not.toHaveBeenCalled();
    expect(norm(q('#consent-error')!.textContent)).toBe(CONSENT_REQUIRED);
    expect(document.activeElement).toBe(q('#consent'));
    expect(q('#consent')!.getAttribute('aria-invalid')).toBe('true');
    expect(q('#consent')!.getAttribute('aria-describedby')).toBe('consent-error');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('ticking the box clears the error', async () => {
    setFetch(respond(201, OK_BODY));
    await mount('mode=signup');
    await fillSignup();
    await submit();
    expect(q('#consent-error')).not.toBeNull();
    await tickConsent();
    expect(q('#consent-error')).toBeNull();
  });

  it('empty fields and no consent: the field errors show and focus goes to the first field', async () => {
    const f = setFetch(respond(201, OK_BODY));
    await mount('mode=signup');
    await submit();
    expect(f).not.toHaveBeenCalled();
    expect(norm(q('#name-error')!.textContent)).toBe('Enter your full name.');
    expect(q('#consent-error')).not.toBeNull();
    expect(document.activeElement).toBe(q('#name'));
  });

  it('T-642 (AJ-642-M1): Continue with Google on Create account needs no tick: the PKCE start runs with the box unticked', async () => {
    stubCrypto();
    await mount('mode=signup');
    expect((q('#consent') as HTMLInputElement).checked).toBe(false);
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    await flush();
    expect(q('#consent-error')).toBeNull();
    expect(window.sessionStorage.getItem('lawie.oauth.verifier')).not.toBeNull();
  });

  it('T-642 AC4: the Google redirect params are the same on both tabs (challenge only, no consent param)', async () => {
    stubCrypto();
    const prevApiUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
    const urls: string[] = [];
    const orig = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(orig, {
        get: (t, k) => (k === 'href' ? (urls[urls.length - 1] ?? t.href) : Reflect.get(t, k)),
        set: (_t, k, v) => {
          if (k === 'href') urls.push(String(v));
          return true;
        },
      }),
    });
    try {
      for (const mode of ['mode=signup', 'mode=signin']) {
        await mount(mode);
        await act(async () => void googleButton().click());
        await flush();
        await flush();
        await flush();
        act(() => root!.unmount());
        host!.remove();
      }
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
      if (prevApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = prevApiUrl;
    }
    expect(urls).toHaveLength(2);
    const keys = urls.map((u) => [...new URL(u).searchParams.keys()].sort());
    expect(keys[0]).toEqual(keys[1]);
    expect(keys[0]).toContain('challenge');
    expect(keys[0].some((k) => /consent|terms|accept/i.test(k))).toBe(false);
    expect(new URL(urls[0]).pathname).toBe('/api/auth/google');
  });

  it('T-642: the tick does not change the Google start (same verifier stored)', async () => {
    stubCrypto();
    await mount('mode=signup');
    await tickConsent();
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    await flush();
    expect(q('#consent-error')).toBeNull();
    expect(window.sessionStorage.getItem('lawie.oauth.verifier')).not.toBeNull();
  });

  it('Google on the Sign in tab is not gated', async () => {
    stubCrypto();
    await mount('mode=signin');
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    await flush();
    expect(window.sessionStorage.getItem('lawie.oauth.verifier')).not.toBeNull();
    expect(q('#consent-error')).toBeNull();
  });
});

describe('email sign-up and sign-in (AC4)', () => {
  it('ticked: register is called with the unchanged body (no consent field), then the Check your email screen; no login, no redirect', async () => {
    const f = setFetch(respond(202, NEUTRAL_BODY));
    await mount('mode=signup');
    await fillSignup();
    await tickConsent();
    await submit();
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/auth\/register$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'New Person',
      email: 'new.person@example.com',
      password: 'Passw0rdOk',
    });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(q('h1')!.textContent).toBe('Check your email');
    expect(document.body.textContent).toContain(CHECK_BODY);
  });

  it('Sign in posts email and password to /api/auth/login', async () => {
    const f = setFetch(respond(200, OK_BODY));
    await mount('mode=signin');
    await fillSignin();
    await submit();
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/auth\/login$/);
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'a@example.com',
      password: 'Passw0rdOk',
    });
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('Forgot password is on Sign in only', async () => {
    await mount('mode=signin');
    expect(byText('a', 'Forgot password?')!.getAttribute('href')).toBe('/forgot-password');
    act(() => root!.unmount());
    host!.remove();
    await mount('mode=signup');
    expect(byText('a', 'Forgot password?')).toBeUndefined();
  });

  it('Create account keeps the T-234 password checklist and ticks rules as met', async () => {
    await mount('mode=signup');
    const rules = () => norm(q('#password-rules')!.textContent);
    expect(rules()).toContain('Your password needs:');
    for (const r of [
      'At least 8 characters',
      'One capital letter (A–Z)',
      'One small letter (a–z)',
      'One number (0–9)',
    ]) {
      expect(rules()).toContain(r);
    }
    expect(rules()).toContain('(not yet)');
    await act(async () => setInput(q<HTMLInputElement>('#password')!, 'Passw0rdOk'));
    expect(rules()).not.toContain('(not yet)');
  });

  it('show / hide password toggles the field type and the aria-label', async () => {
    await mount('mode=signin');
    const pw = q<HTMLInputElement>('#password')!;
    expect(pw.type).toBe('password');
    await act(async () => void q('button[aria-label="Show password"]')!.click());
    expect(pw.type).toBe('text');
    expect(q('button[aria-label="Hide password"]')!.textContent).toBe('Hide');
    expect(q('button[aria-label="Show password"]')).toBeNull();
    await act(async () => void q('button[aria-label="Hide password"]')!.click());
    expect(pw.type).toBe('password');
    expect(q('button[aria-label="Show password"]')!.textContent).toBe('Show');
  });

  it('the referral code still goes in the register body', async () => {
    const f = setFetch(respond(201, OK_BODY));
    await mount('mode=signup&ref=abc12');
    await fillSignup();
    await tickConsent();
    await submit();
    expect(JSON.parse(f.mock.calls[0][1].body as string).referralCode).toBe('ABC12');
  });
});

describe('errors (§2.4)', () => {
  it('401: the signed wrong-password line, in a focused alert; password cleared', async () => {
    setFetch(respond(401, { message: 'Invalid credentials' }));
    await mount('mode=signin');
    await fillSignin();
    await submit();
    expect(alertText()).toContain(WRONG);
    expect(alertText()).not.toContain('Invalid credentials');
    expect(alertText()).not.toMatch(/verify your email to sign in/i);
    expect(document.activeElement).toBe(q('[role="alert"]'));
    expect(q<HTMLInputElement>('#password')!.value).toBe('');
  });

  it('fetch rejects: the network line with Retry; Retry repeats the request', async () => {
    const f = setFetch(jest.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    await mount('mode=signin');
    await fillSignin();
    await submit();
    expect(alertText()).toContain(NETWORK);
    const retry = byText('button', 'Retry')!;
    expect(retry).toBeDefined();
    f.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await act(async () => void retry.click());
    await flush();
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toBe(f.mock.calls[0][0]);
    expect(f.mock.calls[1][1].body).toBe(f.mock.calls[0][1].body);
    expect(alertText()).toContain(WRONG);
    expect(alertText()).not.toContain(NETWORK);
  });

  it.each([500, 502, 503, 429])(
    '%i: the "Could not sign you in. Try again." banner with Retry',
    async (status) => {
      const f = setFetch(respond(status, { message: 'raw server text' }));
      await mount('mode=signin');
      await fillSignin();
      await submit();
      expect(alertText()).toContain(SERVER);
      expect(alertText()).not.toContain('raw server text');
      expect(alertText()).not.toContain(NETWORK);
      f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => OK_BODY });
      await act(async () => void byText('button', 'Retry')!.click());
      await flush();
      expect(f).toHaveBeenCalledTimes(2);
      expect(replace).toHaveBeenCalledWith('/dashboard');
    },
  );

  it('a non-JSON 500 body still gets the banner', async () => {
    setFetch(
      jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => Promise.reject(new Error('x')),
      }),
    );
    await mount('mode=signin');
    await fillSignin();
    await submit();
    expect(alertText()).toContain(SERVER);
  });

  it('T-522: there is no 409 branch on Create account: no "account exists" text, no "Sign in instead"', async () => {
    setFetch(respond(409, { message: 'An account with this email already exists' }));
    await mount('mode=signup');
    await fillSignup();
    await tickConsent();
    await submit();
    expect(document.body.textContent).not.toContain('An account with this email already exists');
    expect(byText('a', 'Sign in instead')).toBeUndefined();
    expect(document.body.textContent).not.toContain('Check your email');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('422: the messages are listed and the field is marked invalid', async () => {
    setFetch(respond(422, { message: 'Email is invalid; Password too short' }));
    await mount('mode=signup');
    await fillSignup();
    await tickConsent();
    await submit();
    expect(alertText()).toContain('Please check the following:');
    expect(alertText()).toContain('Email is invalid');
    expect(alertText()).toContain('Password too short');
    expect(q('#email')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('?error=oauth_failed and ?error=sign_in_incomplete keep their lines', async () => {
    await mount('error=oauth_failed');
    expect(alertText()).toContain("Google sign-in didn't work. Please try again.");
    act(() => root!.unmount());
    host!.remove();
    await mount('error=sign_in_incomplete');
    expect(alertText()).toContain("We couldn't finish signing you in. Please try again.");
  });

  it('Retry after a blocked Google start repeats Google, not the email form', async () => {
    // Without crypto.subtle the Google start shows the https line (no Retry); with sessionStorage
    // failing it shows the network line with Retry, which must repeat Google.
    stubCrypto();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const f = setFetch(respond(200, OK_BODY));
    await mount('mode=signin');
    await act(async () => void googleButton().click());
    await flush();
    await flush();
    expect(alertText()).toContain(NETWORK);
    await act(async () => void byText('button', 'Retry')!.click());
    await flush();
    await flush();
    expect(f).not.toHaveBeenCalled();
    expect(alertText()).toContain(NETWORK);
  });
});

describe('loading', () => {
  it('shows "Please wait", aria-busy and disabled fields while the request is pending', async () => {
    let resolve!: (v: unknown) => void;
    setFetch(jest.fn().mockReturnValue(new Promise((r) => (resolve = r))));
    await mount('mode=signup');
    await fillSignup();
    await tickConsent();
    await submit();
    const btn = q<HTMLButtonElement>('button[type="submit"]')!;
    expect(norm(btn.textContent)).toBe('Please wait');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    for (const id of ['#name', '#email', '#password', '#consent', '#referral-code']) {
      expect(q<HTMLInputElement>(id)!.disabled).toBe(true);
    }
    expect(googleButton().disabled).toBe(true);
    await act(async () => {
      resolve({ ok: true, status: 202, json: async () => NEUTRAL_BODY });
    });
    await flush();
    expect(q('h1')!.textContent).toBe('Check your email');
    expect(replace).not.toHaveBeenCalled();
  });

  it('a double submit while pending sends one request', async () => {
    const f = setFetch(jest.fn().mockReturnValue(new Promise(() => undefined)));
    await mount('mode=signin');
    await fillSignin();
    await submit();
    await act(
      async () =>
        void q('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('theme toggle and chrome (AC3)', () => {
  it('has the theme toggle in the top bar and in the phone menu; no sign-in actions in the bar', async () => {
    await mount('mode=signin');
    const values = (root: ParentNode) =>
      Array.from(root.querySelectorAll('fieldset input[type="radio"]')).map(
        (r) => (r as HTMLInputElement).value,
      );
    expect(qa('header fieldset')).toHaveLength(1);
    expect(values(q('header')!)).toEqual(['night', 'daylight', 'system']);
    expect(q('[data-topbar-mobile-menu]')).toBeNull();
    await act(async () => void q<HTMLButtonElement>('[data-topbar-menu-trigger]')!.click());
    expect(qa('[data-topbar-menu] fieldset')).toHaveLength(1);
    expect(values(q('[data-topbar-menu]')!)).toEqual(['night', 'daylight', 'system']);
    // The form is the action on the auth pages: no call to action in the bar or the menu.
    expect(qa('header a').map((a) => a.textContent)).not.toContain('Start with 5 free Ink');
    expect(qa('header a').map((a) => a.textContent)).not.toContain('Start free');
    expect(qa('[data-topbar-menu] a')).toHaveLength(0);
  });

  it('has the Night Library footer with the grievance line', async () => {
    await mount('mode=signup');
    expect(q('[data-grievance-line]')).not.toBeNull();
    expect(q('footer')).not.toBeNull();
  });

  it('the tab panel is labelled by the selected tab; the main form has no horizontal-scroll classes', async () => {
    await mount('mode=signup');
    expect(q('#auth-panel')!.getAttribute('aria-labelledby')).toBe('tab-signup');
    expect(q('.nl-root')!.className).toContain('overflow-x-clip');
  });
});
