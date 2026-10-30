// T-436 (c) AC6: the Invoices card sits on /dashboard/settings in the spec order:
// Profile, Plan, then (T-646) the Billing tab: Invoices, Payments, Ink history, then Close account, Sign out.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'A', email: 'a@example.com', plan: 'pro' },
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useUsage', () => ({ useUsage: () => ({ data: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
  // T-436: the State picker waits for acceptance through this.
  onPrivacyAccepted: () => () => {},
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockApiFetch.mockReset();
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/payments') return ok({ payments: [] });
    if (path.startsWith('/api/credits/history'))
      return ok({ entries: [], balance: 0, nextCursor: null });
    return ok({
      data: [
        {
          id: 'i1',
          number: 'LAW-2026-27-0001',
          kind: 'invoice',
          issuedAt: '2026-10-14T06:00:00.000Z',
          total: 79900,
          originalInvoiceNumber: null,
        },
      ],
    });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount() {
  await act(async () => {
    root.render(<SettingsPage />);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

describe('T-436 settings page: Invoices card', () => {
  it('cards are in order Profile, Plan, Invoices, Payments, Ink history, Close account (with Sign out), Appearance', async () => {
    await mount();
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual([
      'Profile',
      'Plan',
      'Invoices',
      'Payments',
      'Ink history',
      'Close account',
      'Appearance',
    ]);
    const text = container.textContent ?? '';
    expect(text.lastIndexOf('Close account')).toBeLessThan(text.indexOf('Sign out'));
  });

  it('Invoices card is a labelled section and renders the fetched invoice for a Pro user', async () => {
    await mount();
    const section = container.querySelector('section[aria-labelledby="invoices-heading"]')!;
    expect(section.querySelector('h2')?.textContent).toBe('Invoices');
    expect(section.textContent).toContain('LAW-2026-27-0001');
    expect(section.textContent).toContain('₹799');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/invoices');
  });

  it('Invoices comes after the Plan card and before the Close account card in the DOM', async () => {
    await mount();
    const byId = (id: string) => container.querySelector(`#${id}`)!;
    const inv = byId('invoices-heading');
    const close = byId('close-account-heading');
    expect(inv.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('T-646: Invoices is in the Billing panel, not the Plan panel', async () => {
    await mount();
    const panel = container.querySelector('#settings-panel-billing')!;
    expect(panel.querySelector('#invoices-heading')).not.toBeNull();
    expect(panel.querySelector('#payments-heading')).not.toBeNull();
    expect(panel.querySelector('#ink-history-heading')).not.toBeNull();
    expect(container.querySelector('#settings-panel-plan #invoices-heading')).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/payments');
    expect(
      mockApiFetch.mock.calls.some((c) => String(c[0]).startsWith('/api/credits/history?limit=20')),
    ).toBe(true);
  });
});
