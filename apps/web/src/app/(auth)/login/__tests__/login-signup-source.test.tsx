/**
 * T-242 — /login: ?ref=CODE pre-fills the referral box and opens Create account (unless
 * ?mode=signin); the lawie_referral_code write is gone; the landing tags go in the register body
 * and on the Google start URL, and are cleared afterwards.
 * Mounted with react-dom/client (no @testing-library/dom in this workspace).
 */
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useSearchParams } from 'next/navigation';

import LoginPage from '../page';

import { SIGNUP_SOURCE_STORAGE_KEY } from '@/lib/signup-source';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const flush = () => act(async () => void (await Promise.resolve()));

async function mount(query: string) {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<LoginPage />));
  await flush();
}

const box = () => document.getElementById('referral-code') as HTMLInputElement | null;
const tab = (name: string) =>
  Array.from(document.querySelectorAll('[role="tab"]')).find((t) =>
    (t.textContent ?? '').includes(name),
  ) as HTMLElement | undefined;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  jest.restoreAllMocks();
});

describe('?ref=CODE', () => {
  it('opens Create account with the box pre-filled and upper-cased', async () => {
    await mount('ref=abc12');
    expect(box()).not.toBeNull();
    expect(box()!.value).toBe('ABC12');
    expect(tab('Create account')?.getAttribute('aria-selected')).toBe('true');
  });

  it('?mode=signup&ref=CODE also pre-fills', async () => {
    await mount('mode=signup&ref=xyz');
    expect(box()!.value).toBe('XYZ');
  });

  it('?mode=signin&ref=CODE stays on Sign in (no referral box)', async () => {
    await mount('mode=signin&ref=abc12');
    expect(box()).toBeNull();
    expect(tab('Sign in')?.getAttribute('aria-selected')).toBe('true');
  });

  it('trims and caps the code at 16 characters', async () => {
    await mount(`ref=${encodeURIComponent('  abcdefghijklmnopqrstuvwxyz ')}`);
    expect(box()!.value).toBe('ABCDEFGHIJKLMNOP');
  });

  it('an empty or blank ref changes nothing: Sign in, no box', async () => {
    await mount('ref=%20%20');
    expect(box()).toBeNull();
  });

  it('no ref: default Sign in; mode=signup gives an empty box', async () => {
    await mount('');
    expect(box()).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    await mount('mode=signup');
    expect(box()!.value).toBe('');
  });

  it('the visitor can still edit the box', async () => {
    await mount('ref=abc12');
    const input = box()!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'new1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(box()!.value).toBe('NEW1');
  });
});

describe('Create account request (email)', () => {
  function setInput(el: HTMLInputElement, value: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('the register body carries the stored tags and the referral code; tags cleared on success', async () => {
    window.sessionStorage.setItem(
      SIGNUP_SOURCE_STORAGE_KEY,
      JSON.stringify({ utmSource: 'news', utmMedium: 'email', utmCampaign: 'launch' }),
    );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { accessToken: 'a', refreshToken: 'r', user: {} } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await mount('mode=signup&ref=abc12');

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      for (const input of Array.from(form.querySelectorAll('input'))) {
        if (input.id === 'referral-code') continue;
        if (input.type === 'email') setInput(input, 'new.person@example.com');
        else if (input.type === 'password') setInput(input, 'Passw0rdOk');
        else if (input.type === 'text') setInput(input, 'New Person');
        else if (input.type === 'checkbox' && !input.checked) input.click();
      }
    });
    await act(async () => {
      form.requestSubmit();
    });
    await flush();

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/auth/register'));
    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body as string);
    expect(body).toMatchObject({
      email: 'new.person@example.com',
      utmSource: 'news',
      utmMedium: 'email',
      utmCampaign: 'launch',
      referralCode: 'ABC12',
    });
    expect(window.sessionStorage.getItem(SIGNUP_SOURCE_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem('lawie_referral_code')).toBeNull();
    expect(window.localStorage.getItem('lawie_referral_code')).toBeNull();
  });
});

describe('source scan', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf8');
  it('no lawie_referral_code write remains in the login page', () => {
    expect(src).not.toMatch(/lawie_referral_code/);
  });
  it('the Google start URL is built from URLSearchParams with the three utm params', () => {
    expect(src).toMatch(/params\.set\('utmSource'/);
    expect(src).toMatch(/params\.set\('utmMedium'/);
    expect(src).toMatch(/params\.set\('utmCampaign'/);
  });
});
