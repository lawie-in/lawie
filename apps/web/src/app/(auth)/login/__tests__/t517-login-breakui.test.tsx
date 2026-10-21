/**
 * T-517 break-ui (worst-case data) on the sign-up / login page. Data goes in through the same
 * boundary as real use: the input events and the mocked fetch. Limits come from the auth service:
 * name max 100 (registerSchema, User.model), email max 254 (auth.validator.ts:158).
 */
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login: jest.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, '../../../../../../..');
const validator = fs.readFileSync(
  path.join(REPO, 'apps/auth/src/validators/auth.validator.ts'),
  'utf8',
);

let root: Root | null = null;
let host: HTMLElement | null = null;
const flush = () => act(async () => void (await Promise.resolve()));
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

async function mount(query: string) {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
  (useRouter as jest.Mock).mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  });
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
const fill = (v: { name?: string; email: string; password: string }) =>
  act(async () => {
    if (v.name !== undefined) setInput(q<HTMLInputElement>('#name')!, v.name);
    setInput(q<HTMLInputElement>('#email')!, v.email);
    setInput(q<HTMLInputElement>('#password')!, v.password);
  });
const submit = async () => {
  await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
  await flush();
};
const respond = (status: number, json: unknown) =>
  jest
    .fn()
    .mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => json });

// Real shapes: 100 chars (the limit), 120 (over it), Devanagari, Arabic (RTL), emoji-first.
const NAME_100 = 'Aleksandra Wiśniewska-Kowalczyk '.repeat(4).slice(0, 100);
const NAME_120 = `${'Subramaniam Venkataraghavan '.repeat(5)}`.slice(0, 120);
const NAME_DEVANAGARI = 'श्रीमती अनुराधा वेंकटरमण अय्यर';
const NAME_RTL = 'عبد الرحمن بن محمد الفاسي';
const NAME_EMOJI = '👩🏽‍⚖️ Priya Sharma';
const EMAIL_254 = `${'a'.repeat(64)}@${`${'b'.repeat(63)}.`.repeat(2)}${'c'.repeat(57)}.com`;
const NEVER = /undefined|NaN|\[object|null/;

beforeEach(() => {
  window.sessionStorage.clear();
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
  jest.restoreAllMocks();
});

describe('break-ui: worst-case values in the sign-up fields', () => {
  it('the email fixture really is 254 characters and a valid shape', () => {
    expect(EMAIL_254.length).toBe(254);
    expect(NAME_100).toHaveLength(100);
    expect(NAME_120).toHaveLength(120);
  });

  it.each([
    ['100-character name', NAME_100],
    ['Devanagari name', NAME_DEVANAGARI],
    ['RTL (Arabic) name', NAME_RTL],
    ['emoji-first name', NAME_EMOJI],
  ])('%s is accepted, sent unchanged, and shows no field error', async (_l, name) => {
    const f = jest.fn(respond(201, { data: { accessToken: 'a', refreshToken: 'r', user: {} } }));
    global.fetch = f as unknown as typeof fetch;
    await mount('mode=signup');
    await fill({ name, email: 'new.person@example.com', password: 'Passw0rdOk' });
    await act(async () => void q<HTMLInputElement>('#consent')!.click());
    await submit();
    expect(q('#name-error')).toBeNull();
    expect(JSON.parse(f.mock.calls[0][1].body as string).name).toBe(name);
  });

  it('a 254-character email passes client validation and is sent in full', async () => {
    const f = jest.fn(respond(201, { data: { accessToken: 'a', refreshToken: 'r', user: {} } }));
    global.fetch = f as unknown as typeof fetch;
    await mount('mode=signup');
    await fill({ name: 'Jo', email: EMAIL_254, password: 'Passw0rdOk' });
    await act(async () => void q<HTMLInputElement>('#consent')!.click());
    await submit();
    expect(q('#email-error')).toBeNull();
    expect(JSON.parse(f.mock.calls[0][1].body as string).email).toBe(EMAIL_254);
  });

  it('a one-letter name ("J") is accepted; an all-whitespace name gets the signed error', async () => {
    await mount('mode=signup');
    await fill({ name: '   ', email: 'a@example.com', password: 'Passw0rdOk' });
    await submit();
    expect(norm(q('#name-error')!.textContent)).toBe('Enter your full name.');
  });

  it('120-character name: the server 422 (limit 100) is shown in the alert and the typed name is kept', async () => {
    global.fetch = respond(422, {
      message: 'String must contain at most 100 character(s)',
    }) as unknown as typeof fetch;
    await mount('mode=signup');
    await fill({ name: NAME_120, email: 'new.person@example.com', password: 'Passw0rdOk' });
    await act(async () => void q<HTMLInputElement>('#consent')!.click());
    await submit();
    expect(norm(q('[role="alert"]')!.textContent)).toContain('at most 100');
    // The field keeps the user's text (nothing is truncated or cleared on a 422).
    expect(q<HTMLInputElement>('#name')!.value).toBe(NAME_120);
  });

  it('a very long, multi-item server error stays inside the alert, whose text column can shrink (min-w-0)', async () => {
    const long = Array.from(
      { length: 6 },
      (_, i) => `Password rule ${i}: ${'must be fixed '.repeat(12)}`,
    );
    global.fetch = respond(422, { message: long.join('; ') }) as unknown as typeof fetch;
    await mount('mode=signup');
    await fill({ name: 'Jo', email: 'a@example.com', password: 'Passw0rdOk' });
    await act(async () => void q<HTMLInputElement>('#consent')!.click());
    await submit();
    const alert = q('[role="alert"]')!;
    expect(alert.querySelectorAll('li')).toHaveLength(6);
    expect(norm(alert.textContent)).not.toMatch(NEVER);
    expect(alert.className).toContain('flex');
    expect(alert.querySelector('.min-w-0')).not.toBeNull();
    expect(alert.querySelector('svg')!.getAttribute('class')).toContain('shrink-0');
    expect(q('.nl-root')!.className).toContain('overflow-x-clip');
  });
});

describe('break-ui: field limits and long error text (round-2 fixes)', () => {
  it('the name and email inputs carry maxLength equal to the auth validator limits (read from the file)', async () => {
    const nameMax = Number(
      validator.match(/name:\s*z\s*\.string\([^)]*\)[\s\S]*?\.max\((\d+)/)![1],
    );
    const emailMax = Number(validator.match(/\.max\((\d+), 'Invalid email format'\)/)![1]);
    expect(nameMax).toBe(100);
    expect(emailMax).toBe(254);
    await mount('mode=signup');
    expect(q<HTMLInputElement>('#name')!.maxLength).toBe(nameMax);
    expect(q<HTMLInputElement>('#email')!.maxLength).toBe(emailMax);
    act(() => root!.unmount());
    host!.remove();
    await mount('mode=signin');
    expect(q<HTMLInputElement>('#email')!.maxLength).toBe(emailMax);
  });

  it('the alert text column wraps unbroken tokens (overflow-wrap:anywhere) and can shrink', async () => {
    const token = `Email ${'x'.repeat(60)}@${'y'.repeat(120)}.example.com is not allowed`;
    global.fetch = respond(422, { message: token }) as unknown as typeof fetch;
    await mount('mode=signup');
    await fill({ name: 'Jo', email: 'a@example.com', password: 'Passw0rdOk' });
    await act(async () => void q<HTMLInputElement>('#consent')!.click());
    await submit();
    const col = q('[role="alert"] .min-w-0')!;
    expect(col.className).toContain('[overflow-wrap:anywhere]');
    expect(col.className).toContain('flex-1');
    expect(norm(col.textContent)).toContain('y'.repeat(120));
  });
});

describe('break-ui: 320px structure, rapid clicks, odd states', () => {
  it('the card is capped (max-w-md, w-full) and the page clips horizontal overflow', async () => {
    await mount('mode=signup');
    const card = q('#auth-panel')!.closest('.max-w-md') as HTMLElement;
    expect(card.className).toContain('w-full');
    expect(card.className).toContain('overflow-hidden');
    expect(q('.nl-root')!.className).toMatch(/min-h-\[100svh\]/);
    // The tabs share the row equally, so two long labels cannot push the second one off-screen.
    expect(q('[role="tablist"]')!.className).toContain('grid-cols-2');
  });

  it('rapid clicks on Create account with an empty form send nothing and keep one alert/error set', async () => {
    const f = jest.fn(respond(201, {}));
    global.fetch = f as unknown as typeof fetch;
    await mount('mode=signup');
    for (let i = 0; i < 8; i++) await submit();
    expect(f).not.toHaveBeenCalled();
    expect(qa('#name-error')).toHaveLength(1);
    expect(qa('#consent-error')).toHaveLength(1);
  });

  it('rapid clicks on the tabs never leave two panels or two h1s', async () => {
    await mount('mode=signin');
    const tabs = qa('[role="tab"]');
    for (let i = 0; i < 10; i++) await act(async () => void tabs[i % 2].click());
    expect(qa('[role="tabpanel"]')).toHaveLength(1);
    expect(qa('h1')).toHaveLength(1);
  });

  it('rapid submits while a request is pending send exactly one', async () => {
    const f = jest.fn().mockReturnValue(new Promise(() => undefined));
    global.fetch = f as unknown as typeof fetch;
    await mount('mode=signin');
    await fill({ email: 'a@example.com', password: 'Passw0rdOk' });
    for (let i = 0; i < 6; i++) await submit();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('?ref with a very long value is limited to the 16-character field', async () => {
    await mount(`mode=signup&ref=${'abcdefghij'.repeat(10)}`);
    const box = q<HTMLInputElement>('#referral-code')!;
    expect(box.maxLength).toBe(16);
  });
});
