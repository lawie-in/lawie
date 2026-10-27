// T-642 AC7, AC8 (the shared gate): the sign-up consent panel and lib/signupConsent.
import { act } from 'react';

import SignupConsentPrompt from '../SignupConsentPrompt';

import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';
import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import {
  focusSignupConsent,
  refreshSignupConsent,
  resetSignupConsent,
  signupConsentBlocksNow,
  signupConsentGate,
} from '@/lib/signupConsent';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
let mockUser: { id: string } | null = { id: 'u1' };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false }),
}));

const P8 = 'Could not save your acceptance. Please try again.';
const ERR = 'Please accept the Privacy Policy and Terms to continue.';
const LABEL =
  'I have read and agree to the Terms (version 2026-10-22) and the Privacy Policy (version 2026-10-15).';
const INTRO =
  'You signed up with Google. Please read and accept our Terms and Privacy Policy to keep using Lawie.';
const flush = () => act(async () => void (await Promise.resolve()));
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const ok = (needs: boolean) => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { needsSignupConsent: needs } }),
});
const box = () => q('#signup-consent-box') as HTMLInputElement;
const accept = () =>
  qa('button').find((b) => b.textContent === 'Accept and continue') as HTMLButtonElement;
let scroll: jest.Mock;

function me(needs: boolean) {
  mockApiFetch.mockImplementation(async (url: string, init?: { method?: string }) =>
    init?.method === 'POST' ? { ok: true, status: 200, json: async () => ({}) } : ok(needs),
  );
}
async function mountPanel() {
  mount(<SignupConsentPrompt />);
  await flush();
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1' };
  scroll = jest.fn();
  Element.prototype.scrollIntoView = scroll;
  stubMatchMedia();
  resetSignupConsent();
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

describe('T-642 AC7 the panel', () => {
  it('hides when /me says not needed, and when the user is signed out', async () => {
    me(false);
    await mountPanel();
    expect(q('#signup-consent-panel')).toBeNull();
    cleanupMounted();
    mockUser = null;
    me(true);
    await mountPanel();
    expect(q('#signup-consent-panel')).toBeNull();
  });

  it('shows the signed M2 copy, M16 box unticked, a11y wiring, disabled button', async () => {
    me(true);
    await mountPanel();
    const panel = q('#signup-consent-panel')!;
    expect(panel.getAttribute('role')).toBe('region');
    const h = q('#signup-consent-heading')!;
    expect(panel.getAttribute('aria-labelledby')).toBe('signup-consent-heading');
    expect(h.textContent).toBe('Before you continue');
    const intro = q('#signup-consent-intro')!;
    expect(norm(intro.textContent)).toBe(INTRO);
    expect(qa('a', intro).map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Terms', '/terms'],
      ['Privacy Policy', '/privacy'],
    ]);
    expect(norm(q('label[for="signup-consent-box"]')!.textContent)).toBe(LABEL);
    expect(box().type).toBe('checkbox');
    expect(box().checked).toBe(false);
    expect(box().getAttribute('aria-describedby')).toBe('signup-consent-intro');
    expect(accept().disabled).toBe(true);
    expect(q('[role="dialog"]')).toBeNull();
    expect(q('[aria-modal="true"]')).toBeNull();
    expect(qa('button').some((b) => /close|dismiss|later/i.test(b.textContent ?? ''))).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', expect.anything());
  });

  it('ticking enables the button; accept POSTs then the panel hides', async () => {
    me(true);
    await mountPanel();
    await act(async () => void box().click());
    expect(accept().disabled).toBe(false);
    await act(async () => void accept().click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me/signup-consent', { method: 'POST' });
    expect(q('#signup-consent-panel')).toBeNull();
  });

  it('failed save: panel stays, button re-enables, P8 shows', async () => {
    mockApiFetch.mockImplementation(async (_u: string, init?: { method?: string }) =>
      init?.method === 'POST' ? { ok: false, status: 500, json: async () => ({}) } : ok(true),
    );
    await mountPanel();
    await act(async () => void box().click());
    await act(async () => void accept().click());
    await flush();
    expect(q('#signup-consent-panel')).not.toBeNull();
    expect(accept().disabled).toBe(false);
    expect(norm(q('[role="alert"]')!.textContent)).toBe(P8);
  });

  it('a network error on accept is also P8', async () => {
    mockApiFetch.mockImplementation(async (_u: string, init?: { method?: string }) => {
      if (init?.method === 'POST') throw new Error('net');
      return ok(true);
    });
    await mountPanel();
    await act(async () => void box().click());
    await act(async () => void accept().click());
    await flush();
    expect(norm(q('[role="alert"]')!.textContent)).toBe(P8);
  });
});

describe('T-642 AC8 the shared gate', () => {
  it('blocks, shows the M3 error (role=alert, aria-describedby), focuses the checkbox, scrolls smooth; ticking clears the error', async () => {
    me(true);
    await mountPanel();
    jest.useFakeTimers();
    let blocked = false;
    await act(async () => void (blocked = await signupConsentGate()));
    act(() => void jest.advanceTimersByTime(1));
    expect(blocked).toBe(true);
    expect(document.activeElement).toBe(box());
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(norm(q('[role="alert"]')!.textContent)).toBe(ERR);
    expect(box().getAttribute('aria-describedby')).toBe(
      'signup-consent-intro signup-consent-error',
    );
    await act(async () => void box().click());
    expect(q('#signup-consent-error')).toBeNull();
  });

  it('reduced motion: no smooth scroll', async () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    me(true);
    await mountPanel();
    jest.useFakeTimers();
    await act(async () => void (await signupConsentGate()));
    act(() => void jest.advanceTimersByTime(1));
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('not needed: lets through, no scroll, no focus change', async () => {
    me(false);
    await mountPanel();
    expect(await signupConsentGate()).toBe(false);
    expect(signupConsentBlocksNow()).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('unknown state (not mounted / /me failed): fails open', async () => {
    expect(await signupConsentGate()).toBe(false);
    expect(signupConsentBlocksNow()).toBe(false);
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await refreshSignupConsent()).toBeNull();
    expect(await signupConsentGate()).toBe(false);
  });

  it('focusSignupConsent(50) waits the delay', async () => {
    me(true);
    await mountPanel();
    jest.useFakeTimers();
    focusSignupConsent(50);
    act(() => void jest.advanceTimersByTime(49));
    expect(document.activeElement).not.toBe(box());
    act(() => void jest.advanceTimersByTime(1));
    expect(document.activeElement).toBe(box());
  });
});
