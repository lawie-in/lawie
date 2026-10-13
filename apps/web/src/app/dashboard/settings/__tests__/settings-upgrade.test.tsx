// T-370 — the settings page's Upgrade block: "Upgrade to Pro" buys Pro and is labelled from the
// plan catalogue. Acceptance criterion 3.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPlan = 'free';
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

const upgradeButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    /Upgrade|Loading plan/.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan = 'free';
  mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => CATALOGUE });
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

  it('labels the button from the catalogue Pro plan: ₹1,999 and 150 Ink, no ₹799 or Unlimited', async () => {
    await mount();
    expect(upgradeButton()?.textContent).toBe('Upgrade to Pro — ₹1,999/month');
    expect(container.textContent).toContain('150 Ink/month');
    expect(container.textContent).not.toContain('799');
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

  it('shows no upgrade block, and no "Unlimited", for a Pro user', async () => {
    mockPlan = 'pro';
    await mount();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(upgradeButton()).toBeUndefined();
    expect(container.textContent).toContain('Pro plan');
    expect(container.textContent).not.toMatch(/unlimited/i);
  });
});
