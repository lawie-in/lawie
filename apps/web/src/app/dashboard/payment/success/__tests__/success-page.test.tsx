// T-509 AC3: the page after payment never shows stale Ink. It shows the pending line until
// billing says the plan is active AND the credits balance is on that plan, then
// "Welcome to Lawie {Solo|Pro}!", then goes to the dashboard. Bounded at 2 minutes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PaymentSuccessPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = jest.fn();
// Next's useRouter returns a stable object; the mock must too (the page's effect depends on it).
const mockRouter = { replace: (...a: unknown[]) => mockReplace(...a) };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login: mockLogin }) }));
const mockApiFetch = jest.fn();
const mockRefreshAccessToken = jest.fn();
jest.mock('@/lib/apiFetch', () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  refreshAccessToken: () => mockRefreshAccessToken(),
}));
jest.mock('@/lib/auth', () => ({ getRefreshToken: () => 'refresh-token-1' }));
const mockNotify = jest.fn();
jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: () => mockNotify() }));

const PENDING = 'Payment received. Your Ink will appear here in a moment.';
const reply = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
});

let status: Record<string, unknown>;
let creditsTier: string;
let statusCalls: number;
let rawFetch: jest.Mock;
const originalFetch = global.fetch;
let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
async function advanceBySteps(totalMs: number, step = 1000) {
  for (let t = 0; t < totalMs; t += step) await advance(step);
}
async function mount() {
  await act(async () => {
    root.render(<PaymentSuccessPage />);
  });
  await advance(0);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  status = {
    tier: 'solo',
    state: 'active',
    status: 'active',
    renewsAt: null,
    cancelAtCycleEnd: false,
  };
  creditsTier = 'solo';
  statusCalls = 0;
  rawFetch = jest.fn();
  global.fetch = rawFetch as never;
  mockRefreshAccessToken.mockResolvedValue('new-access');
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/status') {
      statusCalls += 1;
      return reply({ data: status });
    }
    if (path === '/api/credits/balance') return reply({ totalInk: 50, planTier: creditsTier });
    return reply({});
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe('T-509 payment success page', () => {
  it('shows the pending line first, never a welcome or an Ink number, while the webhook has not landed', async () => {
    creditsTier = 'free';
    await mount();
    expect(text()).toContain(PENDING);
    expect(text()).not.toContain('Welcome to Lawie');
    expect(text()).not.toMatch(/\d+ Ink/);
    await advanceBySteps(9000);
    expect(text()).toContain(PENDING);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('polls /status every 3 s while pending', async () => {
    creditsTier = 'free';
    await mount();
    const n = statusCalls;
    await advance(2900);
    expect(statusCalls).toBe(n);
    await advance(200);
    expect(statusCalls).toBe(n + 1);
  });

  it('Solo lands: "Welcome to Lawie Solo!", session synced once, credits notified, redirect after 1.5 s', async () => {
    await mount();
    expect(text()).toContain('Welcome to Lawie Solo!');
    expect(text()).not.toContain(PENDING);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('new-access', 'refresh-token-1');
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    await advance(1600);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('Pro lands: "Welcome to Lawie Pro!"', async () => {
    status = { ...status, tier: 'pro' };
    creditsTier = 'pro';
    await mount();
    expect(text()).toContain('Welcome to Lawie Pro!');
    expect(text()).not.toContain('Welcome to Lawie Solo!');
  });

  it('pending turns into the welcome once the balance reaches the new plan', async () => {
    creditsTier = 'free';
    await mount();
    expect(text()).toContain(PENDING);
    creditsTier = 'solo';
    await advance(3100);
    expect(text()).toContain('Welcome to Lawie Solo!');
    await advance(1600);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('billing active but the balance on the old tier is not "landed" (stale Ink)', async () => {
    creditsTier = 'pro'; // e.g. an old Pro balance while Solo is bought
    await mount();
    expect(text()).toContain(PENDING);
    expect(text()).not.toContain('Welcome');
  });

  it('an authorised-only plan (status authenticated) is not landed yet', async () => {
    status = { ...status, status: 'authenticated' };
    await mount();
    expect(text()).toContain(PENDING);
  });

  it('a failing /status keeps the pending line and tries again', async () => {
    const base = mockApiFetch.getMockImplementation()!;
    let fail = true;
    mockApiFetch.mockImplementation(async (path: string) => {
      if (fail && path === '/api/billing/status') throw new Error('offline');
      return base(path);
    });
    await mount();
    expect(text()).toContain(PENDING);
    fail = false;
    await advance(3100);
    expect(text()).toContain('Welcome to Lawie Solo!');
  });

  it('times out after 2 minutes: stops polling, syncs the session, redirects anyway', async () => {
    creditsTier = 'free';
    await mount();
    await advanceBySteps(121_000);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    await advance(1600);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    expect(text()).not.toContain('Welcome to Lawie');
    const n = statusCalls;
    await advanceBySteps(30_000);
    expect(statusCalls).toBe(n);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('refreshes through the shared refreshAccessToken, never a raw /api/auth/refresh fetch', async () => {
    await mount();
    await advance(2000);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(rawFetch).not.toHaveBeenCalled();
    expect(mockApiFetch.mock.calls.map((c) => c[0])).not.toContain('/api/auth/refresh');
  });

  it('does not log in with a failed refresh', async () => {
    mockRefreshAccessToken.mockResolvedValue(null);
    await mount();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(text()).toContain('Welcome to Lawie Solo!');
  });

  it('the redirect timer is cleared on unmount (no replace after leaving)', async () => {
    await mount();
    act(() => root.unmount());
    await advance(5000);
    expect(mockReplace).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});

// T-525: restyle-specific structure. Text nodes and behaviour are asserted above; this pins the
// folio card, spinner, check disc and the single status region.
describe('T-525 payment success page restyle', () => {
  const statuses = () => container.querySelectorAll('[role="status"]');

  it('pending: a decorative spinner, exactly one role=status carrying the pending line, no button or link', async () => {
    creditsTier = 'free';
    await mount();
    expect(statuses()).toHaveLength(1);
    expect(statuses()[0].textContent).toBe(PENDING);
    expect(container.querySelector('.animate-spin, [class*="animate-spin"]')).not.toBeNull();
    expect(
      container.querySelector(
        '[aria-hidden="true"] svg, svg[aria-hidden="true"], [aria-hidden="true"]',
      ),
    ).not.toBeNull();
    expect(container.querySelector('button, a')).toBeNull();
    expect(container.querySelector('svg[viewBox="0 0 64 64"]')).toBeNull();
  });

  it('landed: the spinner is gone, one check/seal mark (aria-hidden), one role=status with the welcome', async () => {
    await mount();
    expect(statuses()).toHaveLength(1);
    expect(statuses()[0].textContent).toBe('Welcome to Lawie Solo!');
    expect(container.querySelector('[class*="animate-spin"]')).toBeNull();
    const mark = container.querySelector('svg[viewBox="0 0 64 64"]') as SVGElement;
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain('Redirecting you to the dashboard…');
  });

  it('is a single 440px-max centred card with a 60svh minimum and no second primary action', async () => {
    await mount();
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('min-h-[60svh]');
    expect(outer.children).toHaveLength(1);
    expect((outer.firstElementChild as HTMLElement).className).toContain('max-w-[440px]');
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('timeout: pending line plus the redirect line, still one status region', async () => {
    creditsTier = 'free';
    await mount();
    await advanceBySteps(121_000);
    await advance(1600);
    expect(statuses()).toHaveLength(1);
    expect(text()).toContain('Redirecting you to the dashboard…');
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});
