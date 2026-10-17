// T-509 AC3: after payment the Ink shown is never stale. While billing says a paid plan is
// active but the credits balance (the webhook's grant) is still on another tier, Settings shows
// the pending line, re-checks every 5 s, stops when they agree, and gives up after 2 minutes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PlanPanel } from '../PlanPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFetchPlans = jest.fn();
jest.mock('@/lib/plans', () => ({
  ...jest.requireActual('@/lib/plans'),
  fetchPlans: () => mockFetchPlans(),
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u', email: 'a@b.co' } }),
}));

// The credits hook is driven by a mutable balance; refresh() re-reads it like the real one
// re-fetches /api/credits/balance.
let mockBalance = { totalInk: 5, planTier: 'free' };
const mockRefresh = jest.fn(async () => {});
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({ balance: mockBalance, loaded: true, loading: false, refresh: mockRefresh }),
}));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  privacyPrecheck: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  ...jest.requireActual('@/components/VerifyEmailPrompt'),
  isEmailVerificationRequired: async () => false,
  useNeedsEmailVerification: () => false,
}));

const PENDING = 'Payment received. Your Ink will appear here in a moment.';
const CATALOGUE = {
  subscriptions: [
    { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
    { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
  ],
  topups: [],
};
const reply = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => body,
});

let status: Record<string, unknown>;
let statusCalls: number;
const gst = { ensureReady: jest.fn(async () => true) } as never;
let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
/** Ticks in 1 s steps, each in its own act, so state updates between polls are flushed. */
async function advanceBySteps(totalMs: number) {
  for (let t = 0; t < totalMs; t += 1000) await advance(1000);
}
async function mount() {
  await act(async () => {
    root.render(<PlanPanel gst={gst} />);
  });
  await advance(0);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockBalance = { totalInk: 5, planTier: 'free' };
  status = {
    tier: 'pro',
    state: 'active',
    status: 'active',
    renewsAt: '2026-11-14T10:00:00.000Z',
    cancelAtCycleEnd: false,
  };
  statusCalls = 0;
  mockFetchPlans.mockResolvedValue(CATALOGUE);
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/status') {
      statusCalls += 1;
      return reply({ data: status });
    }
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
});

describe('T-509 AC3 pending Ink in Settings', () => {
  it('shows the pending line, not a stale Ink number, while /status says Pro and credits say free', async () => {
    await mount();
    expect(text()).toContain(PENDING);
    expect(text()).not.toContain('You have 5 Ink');
    expect(text()).not.toMatch(/You have \d+ Ink/);
  });

  it('shows the pending line for an authorised (not yet active) plan too', async () => {
    status = { ...status, status: 'authenticated' };
    await mount();
    expect(text()).toContain(PENDING);
  });

  it('shows the Ink number at once when /status and credits agree', async () => {
    mockBalance = { totalInk: 150, planTier: 'pro' };
    await mount();
    expect(text()).not.toContain(PENDING);
    expect(text()).toContain('You have 150 Ink');
  });

  it('a free user never sees the pending line', async () => {
    status = {
      tier: 'free',
      state: 'lapsed',
      status: null,
      renewsAt: null,
      cancelAtCycleEnd: false,
    };
    await mount();
    expect(text()).not.toContain(PENDING);
    expect(text()).toContain('You have 5 Ink');
  });

  it('re-checks /status and the balance every 5 s, and stops once the webhook has landed', async () => {
    await mount();
    const startCalls = statusCalls;
    await advance(4900);
    expect(statusCalls).toBe(startCalls); // not before 5 s
    await advance(200);
    expect(statusCalls).toBe(startCalls + 1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(text()).toContain(PENDING); // still not landed

    // The webhook lands: the balance is now on Pro.
    mockRefresh.mockImplementationOnce(async () => {
      mockBalance = { totalInk: 150, planTier: 'pro' };
    });
    await advance(5000);
    expect(text()).not.toContain(PENDING);
    expect(text()).toContain('You have 150 Ink');

    const settled = statusCalls;
    await advanceBySteps(60_000);
    expect(statusCalls).toBe(settled); // the poll stopped
  });

  it('is bounded: never polls forever, and after 2 minutes shows the number as it is', async () => {
    await mount();
    await advanceBySteps(125_000);
    const atLimit = statusCalls;
    expect(atLimit).toBeGreaterThan(5);
    expect(atLimit).toBeLessThanOrEqual(1 + 24);
    await advanceBySteps(300_000);
    expect(statusCalls).toBe(atLimit);
    expect(text()).not.toContain(PENDING);
    expect(text()).toContain('You have 5 Ink');
  });

  it('a failing /status during the poll keeps the pending line and tries again', async () => {
    await mount();
    const base = mockApiFetch.getMockImplementation()!;
    let fail = true;
    mockApiFetch.mockImplementation(async (path: string, init?: unknown) => {
      if (path === '/api/billing/status' && fail) throw new Error('offline');
      return base(path, init);
    });
    await advance(5100);
    expect(text()).toContain(PENDING);
    fail = false;
    const n = statusCalls;
    await advance(5000);
    expect(statusCalls).toBe(n + 1);
  });
});
