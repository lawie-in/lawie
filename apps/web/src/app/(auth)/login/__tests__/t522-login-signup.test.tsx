/**
 * T-522 — Create account: the neutral "Check your email" screen (AJ-522-M2, S4, S6, S8, M4), the
 * password checklist and the S7 error (AJ-522-S7), and the referral lines R5, R6 (AJ-522-S2).
 * Strings are copied from handoff/legal/T-511-copy-rulings-ajay.md (origin/develop_staging).
 * Mounted with react-dom/client, like t517-login.test.tsx.
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMAIL = 'new.person@example.com';
const TITLE = 'Check your email';
const BODY = "We've sent a link to new.person@example.com. Open it to continue.";
const SENT = 'Request sent. Check your inbox and spam folder.'; // S6
const WAIT = 'Please wait before asking for another email.'; // M4 generic
const READY = 'You can resend the email now.'; // S6
const FAIL = 'Something did not work. Try again.'; // S8 / S13
const S7 = 'Use at least 8 characters, with an upper-case letter, a lower-case letter and a digit.';
const LIMIT_N = (n: number) => `Too many requests. Please wait ${n} minutes, then try again.`;
const DIFFERENT = 'Use a different email'; // S4
const NEUTRAL = { status: 'success', data: { status: 'check_email' } };

let root: Root | null = null;
let host: HTMLElement | null = null;
let replace: jest.Mock;
const flush = () => act(async () => void (await Promise.resolve()));
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

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

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const byText = (sel: string, text: string) => qa(sel).find((e) => norm(e.textContent) === text);
const status = () => norm(q('#check-email-status')?.textContent);
const alertText = () => norm(q('[role="alert"]')?.textContent);
const bodyText = () => norm(document.body.textContent);

function setInput(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const fillSignup = (password = 'Passw0rdOk') =>
  act(async () => {
    setInput(q<HTMLInputElement>('#name')!, 'New Person');
    setInput(q<HTMLInputElement>('#email')!, EMAIL);
    setInput(q<HTMLInputElement>('#password')!, password);
  });
const tickConsent = () => act(async () => void q<HTMLInputElement>('#consent')!.click());
const submit = async () => {
  await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
  await flush();
};
const click = async (el: HTMLElement) => {
  await act(async () => void el.click());
  await flush();
};

type Reply = { status: number; body?: unknown; headers?: Record<string, string>; throws?: boolean };
let calls: { path: string; init: RequestInit }[];
let registerReply: Reply;
let resendReplies: Reply[];
function res(r: Reply) {
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: { get: (k: string) => r.headers?.[k] ?? null },
    json: async () => r.body ?? {},
  };
}
function installFetch() {
  calls = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path, init });
    if (path === '/api/auth/register') {
      if (registerReply.throws) throw new Error('offline');
      return res(registerReply);
    }
    if (path === '/api/auth/verify-email/resend-by-email') {
      const r = resendReplies.shift() ?? { status: 202, body: NEUTRAL };
      if (r.throws) throw new Error('offline');
      return res(r);
    }
    return res({ status: 404 });
  }) as unknown as typeof fetch;
}
const resendCalls = () => calls.filter((c) => c.path === '/api/auth/verify-email/resend-by-email');

async function signUpToCheckEmail() {
  await mount('mode=signup');
  await fillSignup();
  await tickConsent();
  await submit();
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockLogin.mockClear();
  registerReply = { status: 202, body: NEUTRAL };
  resendReplies = [];
  installFetch();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Create account: any 202 is the same Check your email screen (AJ-522-M2)', () => {
  const bodies: [string, unknown][] = [
    ['the standard neutral body', NEUTRAL],
    ['an empty body', {}],
    ['a different data.status', { status: 'success', data: { status: 'something_else' } }],
    ['a body with session tokens', { data: { accessToken: 'a', refreshToken: 'r', user: {} } }],
    ['a body claiming an existing account', { message: 'An account with this email exists' }],
  ];

  it.each(bodies)('%s: the identical screen, and no session starts', async (_l, body) => {
    registerReply = { status: 202, body };
    await signUpToCheckEmail();
    expect(q('h1')!.textContent).toBe(TITLE);
    expect(bodyText()).toContain(BODY);
    expect(byText('button', 'Resend email')).toBeDefined();
    expect(byText('button', DIFFERENT)).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(q('[role="alert"]')).toBeNull();
  });

  it('the screen is byte-identical for every body (same text content)', async () => {
    const texts: string[] = [];
    for (const [, body] of bodies) {
      registerReply = { status: 202, body };
      await signUpToCheckEmail();
      texts.push(norm(q('main')?.textContent));
      act(() => root!.unmount());
      host!.remove();
      root = null;
    }
    expect(new Set(texts).size).toBe(1);
  });

  it('there is no 409 branch: a 409 never shows the Check your email screen or an "exists" line', async () => {
    registerReply = { status: 409, body: { message: 'An account with this email already exists' } };
    await signUpToCheckEmail();
    expect(bodyText()).not.toContain(TITLE);
    expect(bodyText()).not.toContain('already exists');
    expect(byText('a', 'Sign in instead')).toBeUndefined();
  });

  it('moves focus to the title', async () => {
    await signUpToCheckEmail();
    expect(document.activeElement).toBe(q('h1'));
  });
});

describe('Resend email (resend-by-email) and the 2-minute client timer (M4, S6)', () => {
  it('during the wait, pressing Resend shows the M4 wait line and sends nothing (the timer starts at submit)', async () => {
    jest.useFakeTimers();
    await signUpToCheckEmail();
    await act(async () => void jest.advanceTimersByTime(60_000));
    await click(byText('button', 'Resend email')!);
    expect(status()).toBe(WAIT);
    expect(resendCalls()).toHaveLength(0);
  });

  it('when the 2 minutes from submit end, the wait line becomes the S6 end-of-wait line', async () => {
    jest.useFakeTimers();
    await signUpToCheckEmail();
    await act(async () => void jest.advanceTimersByTime(100_000));
    await click(byText('button', 'Resend email')!);
    expect(status()).toBe(WAIT);
    await act(async () => void jest.advanceTimersByTime(19_000));
    expect(status()).toBe(WAIT);
    await act(async () => void jest.advanceTimersByTime(2_000));
    expect(status()).toBe(READY);
  });

  it('after the wait, Resend POSTs {email} to resend-by-email and shows the S6 sent line (never the address)', async () => {
    jest.useFakeTimers();
    await signUpToCheckEmail();
    await act(async () => void jest.advanceTimersByTime(121_000));
    await click(byText('button', 'Resend email')!);
    expect(resendCalls()).toHaveLength(1);
    const { init } = resendCalls()[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ email: EMAIL });
    expect(calls.some((c) => c.path === '/api/auth/verify-email/resend')).toBe(false);
    expect(status()).toBe(SENT);
    expect(status()).not.toContain(EMAIL);
    // A new wait starts: an immediate second press sends nothing.
    await click(byText('button', 'Resend email')!);
    expect(resendCalls()).toHaveLength(1);
    expect(status()).toBe(WAIT);
  });

  it('a 429 from resend-by-email shows the M4 wait line', async () => {
    jest.useFakeTimers();
    resendReplies = [{ status: 429, headers: { 'Retry-After': '120' }, body: {} }];
    await signUpToCheckEmail();
    await act(async () => void jest.advanceTimersByTime(121_000));
    await click(byText('button', 'Resend email')!);
    expect(status()).toBe(WAIT);
  });

  it.each([
    ['a 500', { status: 500 } as Reply],
    ['a 503', { status: 503 } as Reply],
    ['a network error', { status: 0, throws: true } as Reply],
  ])('%s: S13 line plus Retry, never the S8 connection line', async (_l, reply) => {
    jest.useFakeTimers();
    resendReplies = [reply, { status: 202, body: NEUTRAL }];
    await signUpToCheckEmail();
    await act(async () => void jest.advanceTimersByTime(121_000));
    await click(byText('button', 'Resend email')!);
    expect(alertText()).toBe(`${FAIL}Retry`);
    expect(bodyText()).not.toContain("Couldn't send the email");
    expect(bodyText()).not.toContain('Check your connection');
    await click(byText('button', 'Retry')!);
    expect(resendCalls()).toHaveLength(2);
    expect(status()).toBe(SENT);
  });

  it('the status line is a role=status region', async () => {
    await signUpToCheckEmail();
    expect(q('#check-email-status')!.getAttribute('role')).toBe('status');
  });
});

describe('Use a different email (S4)', () => {
  it('goes back to the form with every field kept and Email focused', async () => {
    jest.useFakeTimers();
    await signUpToCheckEmail();
    await click(byText('button', DIFFERENT)!);
    await act(async () => void jest.advanceTimersByTime(50));
    expect(q('h1')!.textContent).not.toBe(TITLE);
    expect(q<HTMLInputElement>('#name')!.value).toBe('New Person');
    expect(q<HTMLInputElement>('#email')!.value).toBe(EMAIL);
    expect(q<HTMLInputElement>('#password')!.value).toBe('Passw0rdOk');
    expect(document.activeElement).toBe(q('#email'));
  });
});

describe('Create account errors (S8)', () => {
  it('429 with Retry-After 600: the T-221 limit line with 10 minutes, from the header only', async () => {
    registerReply = {
      status: 429,
      headers: { 'Retry-After': '600' },
      body: { retryAfter: 5, message: 'x' },
    };
    await signUpToCheckEmail();
    expect(alertText()).toContain(LIMIT_N(10));
    expect(bodyText()).not.toContain(TITLE);
  });

  it('429 with Retry-After 60: the one-minute variant', async () => {
    registerReply = { status: 429, headers: { 'Retry-After': '60' } };
    await signUpToCheckEmail();
    expect(alertText()).toContain('Too many requests. Please wait 1 minute, then try again.');
  });

  it('429 with no Retry-After: the "few minutes" variant', async () => {
    registerReply = { status: 429 };
    await signUpToCheckEmail();
    expect(alertText()).toContain('Too many requests. Please wait a few minutes, then try again.');
  });

  it('503: the S8 line plus Retry, and Retry submits again', async () => {
    registerReply = { status: 503 };
    await signUpToCheckEmail();
    expect(alertText()).toBe(`${FAIL}Retry`);
    registerReply = { status: 202, body: NEUTRAL };
    await click(byText('button', 'Retry')!);
    expect(calls.filter((c) => c.path === '/api/auth/register')).toHaveLength(2);
    expect(q('h1')!.textContent).toBe(TITLE);
  });
});

describe('password checklist from the shared constant, S7 error (AJ-522-S7)', () => {
  const rules = () => qa('#password-rules li').map((li) => norm(li.textContent));

  it('keeps the T-234 checklist, and ticks each rule per the shared rule (8, A-Z, a-z, 0-9)', async () => {
    await mount('mode=signup');
    expect(norm(q('#password-rules')!.textContent)).toContain('Your password needs:');
    expect(rules()).toHaveLength(4);
    expect(rules()[0]).toContain('At least 8 characters');
    await act(async () => setInput(q<HTMLInputElement>('#password')!, 'Abcdef1'));
    expect(rules()[0]).toContain('not yet');
    await act(async () => setInput(q<HTMLInputElement>('#password')!, 'Abcdefg1'));
    for (const r of rules()) expect(r).toContain('done');
  });

  it.each([
    ['too short', 'Ab1'],
    ['no capital', 'abcdefg1'],
    ['no small letter', 'ABCDEFG1'],
    ['no digit', 'Abcdefgh'],
  ])(
    'Create account with a password that is %s shows the S7 line and sends nothing',
    async (_l, pw) => {
      await mount('mode=signup');
      await fillSignup(pw);
      await tickConsent();
      await submit();
      expect(bodyText()).toContain(S7);
      expect(calls).toHaveLength(0);
      expect(rules()).toHaveLength(4);
    },
  );

  it('a strong password shows no S7 line', async () => {
    await mount('mode=signup');
    await fillSignup('Abcdefg1');
    await tickConsent();
    await submit();
    expect(bodyText()).not.toContain(S7);
  });

  it('Sign in never applies the password rule', async () => {
    await mount('mode=signin');
    await act(async () => {
      setInput(q<HTMLInputElement>('#email')!, 'a@example.com');
      setInput(q<HTMLInputElement>('#password')!, 'abc');
    });
    await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
    await flush();
    expect(bodyText()).not.toContain(S7);
  });
});

describe('referral lines (AJ-522-S2): R5, R6, R10, R14', () => {
  const R5 = (n: number, label: string) =>
    `Code applied${label ? ` — ${label}` : ''}. ${n} Ink will be added when you verify your email. New accounts only.`;
  const R6 = 'Code applied. Bonus Ink will be added when you verify your email. New accounts only.';
  const R6_MODAL = 'Bonus Ink will be added when you verify your email. New accounts only.';
  const R10 = (n: number) => `${n} Ink added to your account once you verify your email`;
  const R14 = 'Your bonus is added once you verify your email.';

  async function applyCode(validateBody: unknown) {
    global.fetch = jest.fn(async () => res({ status: 200, body: validateBody })) as never;
    await mount('mode=signup&ref=abc12');
    await click(byText('button', 'Apply')!);
    await flush();
  }
  const feedback = () => norm(q('#referral-feedback')?.textContent);
  const modal = () => norm(q('[role="dialog"]')?.textContent);

  it('R5 inline (with a label) and R10 + R14 in the offer modal, when the server gives an Ink amount', async () => {
    await applyCode({ valid: true, bonusInk: 5, label: 'Friends' });
    expect(modal()).toContain(R10(5));
    expect(modal()).toContain(R14);
    await click(byText('button', 'Claim offer')!);
    expect(feedback()).toBe(R5(5, 'Friends'));
  });

  it('R5 without a label', async () => {
    await applyCode({ valid: true, bonusInk: 7 });
    await click(byText('button', 'Claim offer')!);
    expect(feedback()).toBe(R5(7, ''));
  });

  it('R6 inline and the modal R6 when no Ink amount is known; never "0 Ink"', async () => {
    await applyCode({ valid: true });
    expect(modal()).toContain(R6_MODAL);
    expect(modal()).toContain(R14);
    expect(modal()).not.toContain('0 Ink');
    await click(byText('button', 'Claim offer')!);
    expect(feedback()).toBe(R6);
  });

  it('the old "added now" lines are gone', async () => {
    await applyCode({ valid: true, bonusInk: 5 });
    const all = bodyText();
    expect(all).not.toMatch(/added to your account now|Ink added when you sign up|immediately/i);
  });
});
