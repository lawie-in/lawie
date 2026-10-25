// T-370 — the settings page's Upgrade block: "Upgrade to Pro" buys Pro and is labelled from the
// plan catalogue. Acceptance criterion 3.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPlan = 'free';
// T-509: GET /api/billing/status (T-508) decides the current plan, not the JWT plan.
let mockStatus: Record<string, unknown> = {
  tier: 'free',
  state: 'lapsed',
  status: null,
  renewsAt: null,
  cancelAtCycleEnd: false,
};
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'A', email: 'a@example.com', plan: mockPlan },
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useUsage', () => ({ useUsage: () => ({ data: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...args: unknown[]) => mockPrivacyFetch(...args),
  usePrivacyDescribedBy: () => undefined,
  // T-436: the State picker waits for acceptance through this.
  onPrivacyAccepted: () => () => {},
}));

const CATALOGUE = {
  subscriptions: [
    { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
    { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
  ],
  topups: [],
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<SettingsPage />);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

const buttonByText = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === t) as
    | HTMLButtonElement
    | undefined;
const upgradeButton = () => buttonByText('Choose Pro');

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan = 'free';
  mockStatus = {
    tier: 'free',
    state: 'lapsed',
    status: null,
    renewsAt: null,
    cancelAtCycleEnd: false,
  };
  // T-436: the user already has a State saved (GET /api/auth/me), so Subscribe is not blocked.
  mockApiFetch.mockImplementation(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (path === '/api/auth/me') return { data: { gstStateCode: '07' } };
      if (path === '/api/billing/status') return { data: mockStatus };
      if (path === '/api/credits/balance') return { totalInk: 5, planTier: 'free' };
      return CATALOGUE;
    },
  }));
  mockPrivacyFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { shortUrl: '' } }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-370 settings page upgrade', () => {
  it('reads the catalogue from billing GET /plans', async () => {
    await mount();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/plans');
  });

  it('shows Choose Solo and Choose Pro with both catalogue prices and Ink, no Unlimited', async () => {
    await mount();
    expect(buttonByText('Choose Solo')).toBeDefined();
    expect(upgradeButton()).toBeDefined();
    expect(container.textContent).toContain('₹799 a month');
    expect(container.textContent).toContain('₹1,999 a month');
    expect(container.textContent).toContain('50 Ink a month');
    expect(container.textContent).toContain('150 Ink a month');
    expect(container.textContent).not.toContain('Upgrade to Pro — ₹1,999/month');
    expect(container.textContent).not.toMatch(/unlimited/i);
  });

  it('the Pro button sends the Pro planId to /api/billing/subscribe', async () => {
    await mount();
    await act(async () => upgradeButton()?.click());
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    const [, path, init] = mockPrivacyFetch.mock.calls[0];
    expect(path).toBe('/api/billing/subscribe');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ planId: 'pro_monthly' });
  });

  it('a Pro user (status pro, active) gets no Choose buttons and a Current plan label', async () => {
    mockPlan = 'pro';
    mockStatus = {
      tier: 'pro',
      state: 'active',
      status: 'active',
      renewsAt: '2026-11-14T00:00:00.000Z',
      cancelAtCycleEnd: false,
    };
    await mount();
    expect(buttonByText('Choose Pro')).toBeUndefined();
    expect(buttonByText('Choose Solo')).toBeUndefined();
    expect(container.textContent).toContain('Current plan');
    expect(container.textContent).toContain('Renews on 14 Nov 2026');
    expect(container.textContent).not.toMatch(/unlimited/i);
    expect(container.textContent).not.toContain('Manage on Razorpay');
  });
});
