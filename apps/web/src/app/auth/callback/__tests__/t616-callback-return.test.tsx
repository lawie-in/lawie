/**
 * T-616 AC3: /auth/callback sends the user back to the page they started from. The path is taken
 * (read, removed, validated again) only after a successful code exchange; anything unsafe goes to
 * /dashboard.
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import CallbackPage from '../page';

import { POST_LOGIN_PATH_KEY } from '@/lib/safeReturnPath';

const loginMock = jest.fn();
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login: loginMock }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VERIFIER_KEY = 'lawie.oauth.verifier';
let root: Root | null = null;
let host: HTMLElement | null = null;
let replace: jest.Mock;
const flush = () => act(async () => void (await Promise.resolve()));

function exchangeOk() {
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ accessToken: 'acc', refreshToken: 'ref' }),
  }) as unknown as typeof fetch;
}
async function mount(query: string, stored?: string) {
  window.sessionStorage.setItem(VERIFIER_KEY, 'A'.repeat(43));
  if (stored !== undefined) window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, stored);
  replace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<CallbackPage />));
  await flush();
  await flush();
}

beforeEach(() => {
  window.sessionStorage.clear();
  loginMock.mockClear();
  exchangeOk();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

it('success: goes to the stored path and removes the key', async () => {
  await mount('code=one-time', '/dashboard/new');
  expect(loginMock).toHaveBeenCalledWith('acc', 'ref');
  expect(replace).toHaveBeenCalledWith('/dashboard/new');
  expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
});

it('success with no stored path: /dashboard', async () => {
  await mount('code=one-time');
  expect(replace).toHaveBeenCalledWith('/dashboard');
});

it.each([
  '//evil.example',
  'https://evil.example',
  '/\\evil.example',
  '/login',
  '/api/x',
  'javascript:alert(1)',
])('an unsafe stored value (%s) goes to /dashboard and is removed', async (bad) => {
  await mount('code=one-time', bad);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith('/dashboard');
  expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
});

it('a ?next= in the callback URL is never used', async () => {
  await mount('code=one-time&next=%2Fdashboard%2Fnew');
  expect(replace).toHaveBeenCalledWith('/dashboard');
});

it('an error return keeps the stored path (the user is sent back to /login to try again)', async () => {
  await mount('error=access_denied', '/dashboard/new');
  expect(replace).toHaveBeenCalledWith('/login?error=oauth_failed');
  expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/dashboard/new');
});

it('a failed exchange keeps the stored path and does not navigate to it', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ status: 401, json: async () => ({}) }) as unknown as typeof fetch;
  await mount('code=one-time', '/dashboard/new');
  expect(loginMock).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalledWith('/dashboard/new');
  expect(window.sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/dashboard/new');
});

it('referral notice: Continue goes to the stored path, not always /dashboard', async () => {
  window.sessionStorage.setItem('lawie_referral_shown', '1');
  await mount('code=one-time&referral=not_applied', '/dashboard/new');
  expect(replace).not.toHaveBeenCalled();
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /continue/i.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
  expect(btn).toBeDefined();
  await act(async () => void btn.click());
  expect(replace).toHaveBeenCalledWith('/dashboard/new');
});
