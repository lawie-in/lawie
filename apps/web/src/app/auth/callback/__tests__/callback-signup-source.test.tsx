/**
 * T-344 — /auth/callback clears the stored sign-up tags (lawie_signup_utm) only after a
 * successful code exchange; every error return keeps them for the next try.
 * Mounted with react-dom/client (no @testing-library/dom in this workspace).
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import CallbackPage from '../page';

import { SIGNUP_SOURCE_STORAGE_KEY } from '@/lib/signup-source';

const loginMock = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: loginMock }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAGS = JSON.stringify({ utmSource: 'news', utmMedium: 'email', utmCampaign: 'launch' });
const VERIFIER = 'A'.repeat(43);
const VERIFIER_KEY = 'lawie.oauth.verifier';

let root: Root | null = null;
let host: HTMLElement | null = null;
let replace: jest.Mock;
const flush = () => act(async () => void (await Promise.resolve()));

async function mount(query: string, opts: { verifier?: boolean } = {}) {
  window.sessionStorage.setItem(SIGNUP_SOURCE_STORAGE_KEY, TAGS);
  if (opts.verifier !== false) window.sessionStorage.setItem(VERIFIER_KEY, VERIFIER);
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

const tags = () => window.sessionStorage.getItem(SIGNUP_SOURCE_STORAGE_KEY);

beforeEach(() => {
  window.sessionStorage.clear();
  loginMock.mockClear();
  global.fetch = jest.fn() as unknown as typeof fetch;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('/auth/callback and the sign-up tags', () => {
  it('success: tokens saved, tags removed, redirect to /dashboard', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ accessToken: 'acc', refreshToken: 'ref' }),
    });
    await mount('code=one-time');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(loginMock).toHaveBeenCalledWith('acc', 'ref');
    expect(tags()).toBeNull();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('?error= (cancelled or failed at Google): tags kept', async () => {
    await mount('error=access_denied');
    expect(replace).toHaveBeenCalledWith('/login?error=oauth_failed');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(tags()).toBe(TAGS);
  });

  it('no code: tags kept', async () => {
    await mount('');
    expect(replace).toHaveBeenCalledWith('/login?error=missing_tokens');
    expect(tags()).toBe(TAGS);
  });

  it('no verifier in this tab: tags kept, no exchange', async () => {
    await mount('code=one-time', { verifier: false });
    expect(replace).toHaveBeenCalledWith('/login?error=sign_in_incomplete');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(tags()).toBe(TAGS);
  });

  it('exchange returns non-200: tags kept', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ status: 401, json: async () => ({}) });
    await mount('code=one-time');
    expect(replace).toHaveBeenCalledWith('/login?error=invalid_code');
    expect(loginMock).not.toHaveBeenCalled();
    expect(tags()).toBe(TAGS);
  });

  it('exchange throws: tags kept', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    await mount('code=one-time');
    expect(replace).toHaveBeenCalledWith('/login?error=invalid_code');
    expect(loginMock).not.toHaveBeenCalled();
    expect(tags()).toBe(TAGS);
  });
});
