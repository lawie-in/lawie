// T-372 (ADR-025 D3): settings shows the Ink balance, never a documents-used count.
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
jest.mock('@/hooks/useUsage', () => ({
  useUsage: () => ({ data: { used: 2, limit: 3, remaining: 1 } }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
}));

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
function route(balance: () => Promise<unknown>) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/credits/balance') return balance();
    return Promise.resolve(
      ok({
        subscriptions: [
          { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
        ],
        topups: [],
      }),
    );
  });
}
const balanceCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/credits/balance').length;

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
const text = () => container.textContent ?? '';

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan = 'free';
  route(async () => ok({ totalInk: 9 }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-372 settings: Ink line', () => {
  it('shows "You have N Ink" once the balance has loaded', async () => {
    await mount();
    expect(text()).toContain('You have 9 Ink');
  });

  it('shows "You have 0 Ink" for a real server 0', async () => {
    route(async () => ok({ totalInk: 0 }));
    await mount();
    expect(text()).toContain('You have 0 Ink');
  });

  it('shows nothing on a failed balance fetch, not a made-up 0', async () => {
    route(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await mount();
    expect(text()).not.toContain('You have');
  });

  it('never shows a documents-used count or "remaining"', async () => {
    await mount();
    expect(text()).not.toMatch(/documents used/i);
    expect(text()).not.toMatch(/of \d+ documents/i);
    expect(text()).not.toMatch(/remaining/i);
  });

  it('shows no Ink balance line to a Pro user and fetches no balance', async () => {
    mockPlan = 'pro';
    await mount();
    expect(text()).not.toContain('You have');
    expect(balanceCalls()).toBe(0);
    expect(text()).not.toMatch(/documents used/i);
  });
});
