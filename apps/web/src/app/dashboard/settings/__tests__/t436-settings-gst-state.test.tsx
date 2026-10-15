// T-436 (b) — settings: one State picker in the Plan card; the nag "Your State is not set." with
// "Set your State" shows only when no State is saved AND an invoice row used the fallback; the
// action focuses the select.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPlan = 'free';
let mockUserId = 'u';
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mockUserId, name: 'A', email: 'a@example.com', plan: mockPlan },
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useUsage', () => ({ useUsage: () => ({ data: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const row = (id: string, source: unknown) => ({
  id,
  number: `LAW/2026-27/${id}`,
  kind: 'invoice',
  issuedAt: '2026-10-14T10:00:00.000Z',
  total: 117700,
  originalInvoiceNumber: null,
  placeOfSupply: source === undefined ? undefined : { source },
});
let savedState: string | null;
let invoices: unknown[];

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';
const select = () => container.querySelector('select') as HTMLSelectElement;
const nagButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Set your State');

async function mount() {
  await act(async () => {
    root.render(<SettingsPage />);
  });
  await act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan = 'free';
  mockUserId = `u-${Math.random()}`;
  savedState = null;
  invoices = [];
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return ok({ data: { gstStateCode: savedState } });
    if (path === '/api/billing/invoices') return ok({ data: invoices });
    if (path === '/api/billing/plans') {
      return ok({
        subscriptions: [
          { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
        ],
        topups: [],
      });
    }
    return ok({});
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-436 settings: one State picker', () => {
  it.each(['free', 'pro'])(
    'exactly one State select for a %s user, inside the Plan card',
    async (plan) => {
      mockPlan = plan;
      await mount();
      expect(container.querySelectorAll('select')).toHaveLength(1);
      expect(select().id).toBe('settings-gst-state');
    },
  );

  it('pre-fills from /me', async () => {
    savedState = '38';
    await mount();
    expect(select().value).toBe('38');
  });
});

describe('T-436 settings: the State nag', () => {
  it('shows when no State is saved and an invoice used the fallback', async () => {
    invoices = [row('1', 'fallback')];
    await mount();
    expect(text()).toContain('Your State is not set.');
    expect(nagButton()).toBeDefined();
  });

  it('shows when only one of several rows used the fallback', async () => {
    invoices = [row('1', 'user'), row('2', 'fallback')];
    await mount();
    expect(text()).toContain('Your State is not set.');
  });

  it('does not show when no State is saved but no invoice used the fallback', async () => {
    invoices = [row('1', 'user')];
    await mount();
    expect(text()).not.toContain('Your State is not set.');
    expect(nagButton()).toBeUndefined();
  });

  it('does not show with no invoices, or rows that do not say', async () => {
    await mount();
    expect(text()).not.toContain('Your State is not set.');
    act(() => root.unmount());
    root = createRoot(container);
    invoices = [row('1', undefined), row('2', 'nonsense')];
    mockUserId = `u-${Math.random()}`;
    await mount();
    expect(text()).not.toContain('Your State is not set.');
  });

  it('does not show when a State is saved, even with a fallback invoice', async () => {
    savedState = '29';
    invoices = [row('1', 'fallback')];
    await mount();
    expect(text()).not.toContain('Your State is not set.');
  });

  it('"Set your State" focuses the select', async () => {
    invoices = [row('1', 'fallback')];
    await mount();
    (select() as HTMLElement).scrollIntoView = jest.fn();
    expect(document.activeElement).not.toBe(select());
    await act(async () => nagButton()?.click());
    expect(document.activeElement).toBe(select());
  });
});
