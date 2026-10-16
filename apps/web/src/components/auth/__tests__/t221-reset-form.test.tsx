/**
 * T-221 AC3: the reset form. Check on load (dead link -> R5), the four-rule checklist (same rules
 * as sign-up), the server's 422 mapped to rule lines, success R4, and the token never in the DOM.
 */
import { useParams } from 'next/navigation';
import { act } from 'react';

import ResetPasswordForm, { RESET_STRINGS } from '../ResetPasswordForm';

import { jsonResponse, mountEl, submit, text, type as typeInto, unmountEl } from './t221-helpers';

const TOKEN = 'ab12'.repeat(16);
const fetchMock = jest.fn();
const pw = () => document.getElementById('new-password') as HTMLInputElement;
const items = () => Array.from(document.querySelectorAll('#password-rules li'));
const itemFor = (label: string) => items().find((li) => (li.textContent ?? '').includes(label))!;

async function mountWith(token: string, checkBody: unknown = { valid: true }, status = 200) {
  (useParams as jest.Mock).mockReturnValue({ token });
  fetchMock.mockResolvedValueOnce(jsonResponse(status, checkBody));
  await mountEl(<ResetPasswordForm />);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  unmountEl();
  jest.useRealTimers();
});

describe('check on load', () => {
  it('GETs the token check, then shows the form', async () => {
    await mountWith(TOKEN);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/auth/reset-password/${TOKEN}`);
    expect(init.method).toBe('GET');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(pw()).not.toBeNull();
    expect(text()).toContain(RESET_STRINGS.title);
  });

  it('valid:false (R5): "no longer works", a way to get a new link, no form', async () => {
    await mountWith(TOKEN, { valid: false });
    expect(text()).toContain(RESET_STRINGS.deadTitle);
    expect(pw()).toBeNull();
    const link = Array.from(document.querySelectorAll('a')).find((a) =>
      (a.textContent ?? '').includes(RESET_STRINGS.deadCta),
    );
    expect(link?.getAttribute('href')).toBe('/forgot-password');
  });

  it.each([
    ['short', 'abc'],
    ['upper-case hex', 'AB12'.repeat(16)],
    ['empty', ''],
  ])('a malformed token (%s) goes straight to R5 with no request', async (_l, token) => {
    (useParams as jest.Mock).mockReturnValue({ token });
    await mountEl(<ResetPasswordForm />);
    expect(text()).toContain(RESET_STRINGS.deadTitle);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('if the check itself fails (network), the form is still shown', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: TOKEN });
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await mountEl(<ResetPasswordForm />);
    expect(pw()).not.toBeNull();
  });
});

describe('rule checklist (same four rules as sign-up)', () => {
  it('lists the four rules, none met when empty', async () => {
    await mountWith(TOKEN);
    expect(items()).toHaveLength(4);
    for (const l of [
      RESET_STRINGS.ruleMinLength,
      RESET_STRINGS.ruleUppercase,
      RESET_STRINGS.ruleLowercase,
      RESET_STRINGS.ruleNumber,
    ]) {
      expect(itemFor(l).textContent).toContain(RESET_STRINGS.ruleUnmet);
    }
  });

  it('ticks each rule live as the password is typed', async () => {
    await mountWith(TOKEN);
    await typeInto(pw(), 'abcdefgh');
    expect(itemFor(RESET_STRINGS.ruleMinLength).textContent).toContain(RESET_STRINGS.ruleMet);
    expect(itemFor(RESET_STRINGS.ruleLowercase).textContent).toContain(RESET_STRINGS.ruleMet);
    expect(itemFor(RESET_STRINGS.ruleUppercase).textContent).toContain(RESET_STRINGS.ruleUnmet);
    expect(itemFor(RESET_STRINGS.ruleNumber).textContent).toContain(RESET_STRINGS.ruleUnmet);
    await typeInto(pw(), 'Abcdefg1');
    for (const li of items()) expect(li.textContent).toContain(RESET_STRINGS.ruleMet);
  });

  it.each([
    ['too short', 'Ab1', RESET_STRINGS.errShort],
    ['no uppercase', 'abcdefg1', RESET_STRINGS.errUpper],
    ['no lowercase', 'ABCDEFG1', RESET_STRINGS.errLower],
    ['no digit', 'Abcdefgh', RESET_STRINGS.errNumber],
  ])(
    '%s: submit is blocked client side with its own line, no request for the save',
    async (_l, p, msg) => {
      await mountWith(TOKEN);
      await typeInto(pw(), p);
      await submit();
      expect(text()).toContain(msg);
      expect(fetchMock).toHaveBeenCalledTimes(1); // the load check only
    },
  );

  it('the show/hide button toggles the field type', async () => {
    await mountWith(TOKEN);
    expect(pw().type).toBe('password');
    const btn = document.querySelector(
      `button[aria-label="${RESET_STRINGS.show}"]`,
    ) as HTMLButtonElement;
    await act(async () => btn.click());
    expect(pw().type).toBe('text');
  });
});

describe('save', () => {
  it('POSTs {password} only to the token URL; success R4 clears the field, no auto sign-in', async () => {
    await mountWith(TOKEN);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'success' }));
    await typeInto(pw(), 'Brand1New');
    await submit();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/auth/reset-password/${TOKEN}`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ password: 'Brand1New' });
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(text()).toContain(RESET_STRINGS.doneTitle);
    expect(text()).toContain('signed you out on all other devices');
    expect(document.querySelector('a[href="/login"]')).not.toBeNull();
    expect(pw()).toBeNull();
    expect(text()).not.toContain('Brand1New');
  });

  it('server 422 with unmet rule ids: maps to the rule line, not the raw server text, and stays on the form', async () => {
    await mountWith(TOKEN);
    // Client thinks it is fine; the server disagrees on one rule.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        error: 'weak_password',
        message: 'Must contain at least one number',
        unmet: ['number'],
      }),
    );
    await typeInto(pw(), 'Abcdefg1');
    await submit();
    expect(text()).toContain(RESET_STRINGS.errNumber);
    expect(text()).not.toContain('Must contain at least one number');
    expect(itemFor(RESET_STRINGS.ruleNumber).textContent).toContain(RESET_STRINGS.ruleUnmet);
    expect(itemFor(RESET_STRINGS.ruleMinLength).textContent).toContain(RESET_STRINGS.ruleMet);
    expect(pw()).not.toBeNull();
    expect(text()).not.toContain(RESET_STRINGS.doneTitle);
  });

  it('server 422 with several rules or no ids: the "everything in the list" line', async () => {
    await mountWith(TOKEN);
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { error: 'weak_password' }));
    await typeInto(pw(), 'Abcdefg1');
    await submit();
    expect(text()).toContain(RESET_STRINGS.errSeveral);
  });

  it('server 400 (used or expired meanwhile) goes to R5', async () => {
    await mountWith(TOKEN);
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'invalid_or_expired_token' }));
    await typeInto(pw(), 'Abcdefg1');
    await submit();
    expect(text()).toContain(RESET_STRINGS.deadTitle);
  });

  it.each([500, 503])('HTTP %s shows the network line and keeps the form', async (status) => {
    await mountWith(TOKEN);
    fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
    await typeInto(pw(), 'Abcdefg1');
    await submit();
    expect(text()).toContain(RESET_STRINGS.network);
    expect(pw()).not.toBeNull();
  });

  it('network error shows the network line', async () => {
    await mountWith(TOKEN);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await typeInto(pw(), 'Abcdefg1');
    await submit();
    expect(text()).toContain(RESET_STRINGS.network);
  });
});

describe('the token is never rendered (AC5)', () => {
  it.each(['form', 'weak', 'done', 'dead'])('not in the DOM in state %s', async (state) => {
    if (state === 'dead') {
      await mountWith(TOKEN, { valid: false });
    } else {
      await mountWith(TOKEN);
      if (state === 'weak') {
        await typeInto(pw(), 'x');
        await submit();
      }
      if (state === 'done') {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
        await typeInto(pw(), 'Abcdefg1');
        await submit();
      }
    }
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);
  });
});
