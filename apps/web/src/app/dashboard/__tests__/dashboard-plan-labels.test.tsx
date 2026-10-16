// T-370 — the dashboard's Upgrade link and Pro subtitle/banner take the plan name, price and
// Ink from billing's catalogue (GET /plans), never from constants.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DashboardPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPlan = 'free';
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: mockPlan } }),
}));
// A free user with documents used, so the populated branch (with the Upgrade link) renders.
jest.mock('@/hooks/useUsage', () => ({
  useUsage: () => ({
    data: { used: 2, limit: 3, remaining: 1 },
    loading: false,
  }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const CATALOGUE = {
  subscriptions: [
    { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
    { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
  ],
  topups: [],
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
function route(plans: () => Promise<unknown>) {
  mockApiFetch.mockImplementation((path: string) =>
    path === '/api/billing/plans' ? plans() : Promise.resolve(ok({ documents: [] })),
  );
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<DashboardPage />);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

const upgradeLink = () =>
  container.querySelector('a[href="/dashboard/settings"]') as HTMLAnchorElement | null;

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan = 'free';
  route(async () => ok(CATALOGUE));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-370 dashboard: free user Upgrade link', () => {
  it('shows the catalogue Pro price, never ₹799 or Unlimited', async () => {
    await mount();
    expect(upgradeLink()?.textContent).toBe('Upgrade to Pro — ₹1,999/mo');
    expect(container.textContent).not.toContain('799');
    expect(container.textContent).not.toMatch(/unlimited/i);
  });

  it('follows the catalogue when the Pro price changes', async () => {
    route(async () =>
      ok({
        subscriptions: [
          { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 2499, inkPerCycle: 200 },
        ],
        topups: [],
      }),
    );
    await mount();
    expect(upgradeLink()?.textContent).toBe('Upgrade to Pro — ₹2,499/mo');
  });

  it('is neutral, with no price, while the catalogue is loading', async () => {
    route(() => new Promise(() => {}));
    await mount();
    expect(upgradeLink()?.textContent).toBe('Upgrade to Pro');
    expect(container.textContent).not.toContain('₹');
  });

  it('is neutral, with no price, when the catalogue fetch fails', async () => {
    route(() => Promise.reject(new Error('offline')));
    await mount();
    expect(upgradeLink()?.textContent).toBe('Upgrade to Pro');
    expect(container.textContent).not.toContain('₹');
  });

  it('is neutral when the catalogue has no pro_monthly', async () => {
    route(async () => ok({ subscriptions: [CATALOGUE.subscriptions[0]], topups: [] }));
    await mount();
    expect(upgradeLink()?.textContent).toBe('Upgrade to Pro');
    expect(container.textContent).not.toContain('₹');
  });
});

describe('T-372 dashboard: documents counter hidden', () => {
  it('shows no "documents used" text or usage count to a free user', async () => {
    await mount();
    expect(upgradeLink()).not.toBeNull(); // the populated free branch did render
    expect(container.textContent).not.toMatch(/documents used/i);
    expect(container.textContent).not.toMatch(/\d+ of \d+ documents/i);
  });
});

describe('T-370 dashboard: Pro user subtitle and banner', () => {
  beforeEach(() => {
    mockPlan = 'pro';
  });

  it('shows 150 Ink from the catalogue and no "unlimited"', async () => {
    await mount();
    expect(container.textContent).toContain('Your Pro plan includes 150 Ink/month');
    expect(container.textContent).toContain('Pro plan — 150 Ink/month');
    expect(container.textContent).not.toMatch(/unlimited/i);
    expect(upgradeLink()).toBeNull();
  });

  it('gives the neutral text, with no Ink figure, when the fetch fails', async () => {
    route(() => Promise.reject(new Error('offline')));
    await mount();
    expect(container.textContent).toContain('Your Pro plan is active');
    expect(container.textContent).not.toContain('includes');
    expect(container.textContent).not.toMatch(/\d+ Ink/);
    expect(container.textContent).not.toContain('₹');
    expect(container.textContent).not.toMatch(/unlimited/i);
    expect(container.textContent).toContain('Pro plan');
  });
});
