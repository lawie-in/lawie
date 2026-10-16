/**
 * T-221 AC1 / AC4: the forgot-password form, states F1-F6.
 *  F2 bad format: client only, no request · F4 sent: the same for any 200, echoes the address
 *  F5 429: minutes from Retry-After (or the body), no hint about the account · F6 network / 5xx
 */
import { act } from 'react';

import ForgotPasswordForm, { FORGOT_STRINGS, limitMessage } from '../ForgotPasswordForm';

import { jsonResponse, mountEl, submit, text, type as typeInto, unmountEl } from './t221-helpers';

const input = () => document.getElementById('forgot-email') as HTMLInputElement;
const fetchMock = jest.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  unmountEl();
  jest.useRealTimers();
});

describe('F1 default', () => {
  it('shows the email field, the CTA and a link back to sign in', async () => {
    await mountEl(<ForgotPasswordForm />);
    expect(input()).not.toBeNull();
    expect(text()).toContain(FORGOT_STRINGS.cta);
    const back = Array.from(document.querySelectorAll('a')).find((a) =>
      (a.textContent ?? '').includes(FORGOT_STRINGS.back),
    );
    expect(back?.getAttribute('href')).toBe('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('F2 format errors are client only', () => {
  it.each([
    ['empty', '', FORGOT_STRINGS.errEmpty],
    ['no at sign', 'not-an-email', FORGOT_STRINGS.errFormat],
    ['no dot', 'a@b', FORGOT_STRINGS.errFormat],
  ])('%s: message shown, no request', async (_l, value, message) => {
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), value);
    await submit();
    expect(text()).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });
});

describe('F4 sent: the same screen for every 200', () => {
  it('POSTs the trimmed email and echoes it; the wording never says an account exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'success' }));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), '  Someone@Example.com ');
    await submit();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/auth/forgot-password');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'Someone@Example.com' });
    expect(text()).toContain(FORGOT_STRINGS.sentTitle);
    expect(text()).toContain('Someone@Example.com');
    expect(text()).toContain('If Someone@Example.com has a Lawie account');
    expect(text()).toContain('expires in 30 minutes');
    expect(text()).not.toMatch(/no account|not found|doesn't exist|does not exist/i);
  });

  it('"Use a different email" returns to the form with the address kept', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(FORGOT_STRINGS.sentSecondary),
    )!;
    await act(async () => btn.click());
    expect(input().value).toBe('a@b.co');
  });
});

describe('F5 rate limited (AC4)', () => {
  it('Retry-After 600 s: "10 minutes"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': '600' }),
    );
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain('Too many requests. Please wait 10 minutes, then try again.');
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).not.toContain(FORGOT_STRINGS.sentTitle);
  });

  it('header hidden by CORS: falls back to body.retryAfter, rounded up', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: 'rate_limited', retryAfter: 61 }));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain('Please wait 2 minutes');
  });

  it('under a minute: "1 minute"; nothing usable: "a few minutes"', async () => {
    expect(limitMessage(1)).toBe(FORGOT_STRINGS.limitOne);
    expect(limitMessage(null)).toBe(FORGOT_STRINGS.limitUnknown);
    fetchMock.mockResolvedValue(jsonResponse(429, {}, { 'Retry-After': '20' }));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain('Please wait 1 minute,');
  });

  it('the limit message says nothing about whether an account exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, {}, { 'Retry-After': '600' }));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(FORGOT_STRINGS.limit).not.toMatch(/account|exist|registered/i);
  });
});

describe('F6 network, server error, timeout', () => {
  it('network failure: message and "Try again", which re-sends', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain(FORGOT_STRINGS.network);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const retry = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(FORGOT_STRINGS.networkCta),
    )!;
    await act(async () => retry.click());
    await act(async () => void (await Promise.resolve()));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(text()).toContain(FORGOT_STRINGS.sentTitle);
  });

  it.each([500, 503])('HTTP %s is the same network message', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status, {}));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain(FORGOT_STRINGS.network);
  });

  it('server 400 (its own format check) shows the F2 line, not an error banner', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid_email' }));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain(FORGOT_STRINGS.errFormat);
  });

  it('a request that never answers is aborted after 15 s and shows F6', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal!.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    expect(text()).toContain(FORGOT_STRINGS.ctaLoading);
    await act(async () => {
      jest.advanceTimersByTime(15_001);
    });
    await act(async () => void (await Promise.resolve()));
    expect(text()).toContain(FORGOT_STRINGS.network);
  });

  it('double submit while sending sends one request', async () => {
    let release!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    await mountEl(<ForgotPasswordForm />);
    await typeInto(input(), 'a@b.co');
    await submit();
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release(jsonResponse(200, {})));
  });
});
