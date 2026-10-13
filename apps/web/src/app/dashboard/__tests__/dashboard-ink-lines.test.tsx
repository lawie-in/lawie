// T-372 (ADR-025 D3): the dashboard shows Ink, never a document-count entitlement.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DashboardPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: 'free' } }),
}));
let mockUsed = 2;
jest.mock('@/hooks/useUsage', () => ({
  useUsage: () => ({ data: { used: mockUsed, limit: 3, remaining: 3 - mockUsed }, loading: false }),
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

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
function route(balance: () => Promise<unknown>) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/credits/balance') return balance();
    if (path === '/api/billing/plans')
      return Promise.resolve(ok({ subscriptions: [], topups: [] }));
    return Promise.resolve(ok({ documents: [] }));
  });
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
const text = () => container.textContent ?? '';

beforeEach(() => {
  jest.clearAllMocks();
  mockUsed = 2;
  route(async () => ok({ totalInk: 12 }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-372 dashboard Ink lines: free user with documents', () => {
  it('shows "You have N Ink" and no document-count entitlement', async () => {
    await mount();
    expect(text()).toContain('You have 12 Ink');
    expect(text()).not.toMatch(/remaining/i);
    expect(text()).not.toMatch(/free documents?/i);
    expect(text()).not.toMatch(/documents\/month/i);
  });

  it('shows "You have 0 Ink" for a real server balance of 0', async () => {
    route(async () => ok({ totalInk: 0 }));
    await mount();
    expect(text()).toContain('You have 0 Ink');
  });

  it('leaves the line out when the balance fetch fails', async () => {
    route(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await mount();
    expect(text()).not.toContain('You have');
    expect(text()).not.toContain('Ink');
  });
});

describe('T-372 dashboard Ink lines: empty state', () => {
  beforeEach(() => {
    mockUsed = 0;
  });

  it('shows the Ink balance and "No credit card required" with no /month', async () => {
    await mount();
    expect(text()).toContain("You have 12 Ink. Let's draft your first one.");
    expect(text()).toContain('No credit card required');
    expect(text()).not.toContain('/month');
    expect(text()).not.toMatch(/free documents?/i);
    expect(text()).not.toMatch(/documents\/month/i);
  });

  it('shows "You have 0 Ink" for a real server 0', async () => {
    route(async () => ok({ totalInk: 0 }));
    await mount();
    expect(text()).toContain("You have 0 Ink. Let's draft your first one.");
  });

  it('drops the Ink sentence when the balance is unknown', async () => {
    route(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await mount();
    expect(text()).toContain("Let's draft your first one.");
    expect(text()).not.toContain('You have');
    expect(text()).toContain('No credit card required');
  });
});
