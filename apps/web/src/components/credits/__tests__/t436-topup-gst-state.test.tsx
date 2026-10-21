// T-436 (b) — the top-up modal asks for the State before Pay (spec §2): no State -> the error,
// focus on the select, Razorpay not opened, no order call. Consent order (Ajay Addendum 7 (2)):
// a pick the privacy gate blocked is not saved, so Pay does not go on.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockUserId = 'u';
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockPrivacyFetch = jest.fn();
let blocked = new WeakSet<object>();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: (res: object) => blocked.has(res),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
let mockNeedsVerification = false;
jest.mock('@/components/VerifyEmailPrompt', () => ({
  VerifyEmailCard: () => <div data-testid="verify-card" />,
  isEmailVerificationRequired: async () => false,
  useNeedsEmailVerification: () => mockNeedsVerification,
}));

const reply = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const PLANS = {
  topups: [
    { id: 'topup_mini', ink: 10, priceInr: 99, pricePerInkInr: 9.9 },
    { id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3, badge: 'POPULAR' },
  ],
};
const ORDER = {
  data: { orderId: 'o1', amountInr: 249, ink: 30, razorpayKeyId: 'k' },
};

let savedState: string | null;
let container: HTMLDivElement;
let root: Root;
const rzpOpen = jest.fn();
const rzpCtor = jest.fn();

const select = () => document.body.querySelector('select') as HTMLSelectElement;
const payBtn = () =>
  Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent === 'Buy',
  ) as HTMLButtonElement;
const callsTo = (p: string) => mockPrivacyFetch.mock.calls.filter((c) => c[1] === p);

async function flush() {
  await act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(<TopUpModal onClose={jest.fn()} />);
  });
  await flush();
}
async function pay() {
  await act(async () => payBtn().click());
  await flush();
}
async function pick(code: string) {
  await act(async () => {
    select().value = code;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = `u-${Math.random()}`;
  blocked = new WeakSet();
  mockNeedsVerification = false;
  savedState = null;
  mockApiFetch.mockImplementation(async (path: string) =>
    path === '/api/auth/me'
      ? reply(200, { data: { gstStateCode: savedState } })
      : reply(200, PLANS),
  );
  mockPrivacyFetch.mockImplementation(async (_k: string, path: string) =>
    path === '/api/billing/topup/order' ? reply(200, ORDER) : reply(200, {}),
  );
  rzpCtor.mockImplementation(() => ({ open: rzpOpen }));
  (window as unknown as { Razorpay: unknown }).Razorpay = rzpCtor;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
});

describe('T-436 top-up modal: State before Pay', () => {
  it('shows the picker between the coupon and Pay (tab order: coupon, State, Pay)', async () => {
    await mount();
    const nodes = Array.from(document.body.querySelectorAll('input, select, button'));
    const coupon = document.body.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLElement;
    expect(coupon).not.toBeNull();
    expect(nodes.indexOf(coupon)).toBeLessThan(nodes.indexOf(select()));
    expect(nodes.indexOf(select())).toBeLessThan(nodes.indexOf(payBtn()));
  });

  it('Pay with no State: the required error, focus on the select, no order, Razorpay not opened', async () => {
    await mount();
    expect(payBtn().disabled).toBe(false); // the button stays enabled (spec §2)
    await pay();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      'Select your State to continue.',
    );
    expect(document.activeElement).toBe(select());
    expect(callsTo('/api/billing/topup/order')).toHaveLength(0);
    expect(rzpCtor).not.toHaveBeenCalled();
    expect(rzpOpen).not.toHaveBeenCalled();
    expect(payBtn().disabled).toBe(false);
  });

  it('Pay with a saved State goes on: one order call, Razorpay opened, no PATCH', async () => {
    savedState = '29';
    await mount();
    expect(select().value).toBe('29');
    await pay();
    expect(callsTo('/api/billing/topup/order')).toHaveLength(1);
    expect(rzpOpen).toHaveBeenCalledTimes(1);
    expect(mockPrivacyFetch.mock.calls.filter((c) => c[2]?.method === 'PATCH')).toHaveLength(0);
  });

  it('a State picked in the modal is saved before the order is created', async () => {
    await mount();
    await pick('37');
    await pay();
    const paths = mockPrivacyFetch.mock.calls.map((c) => `${c[2]?.method ?? 'GET'} ${c[1]}`);
    expect(paths.indexOf('PATCH /api/auth/me')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('PATCH /api/auth/me')).toBeLessThan(
      paths.indexOf('POST /api/billing/topup/order'),
    );
    expect(rzpOpen).toHaveBeenCalledTimes(1);
  });

  it('a pick the privacy gate blocked is not saved, so Pay does not go on', async () => {
    mockPrivacyFetch.mockImplementation(async (_k: string, path: string, init?: RequestInit) => {
      if (path === '/api/auth/me' && init?.method === 'PATCH') {
        const r = reply(403, { error: 'privacy_reaccept_required' });
        blocked.add(r);
        return r;
      }
      return reply(200, ORDER);
    });
    await mount();
    await pick('37');
    await pay();
    expect(callsTo('/api/billing/topup/order')).toHaveLength(0);
    expect(rzpOpen).not.toHaveBeenCalled();
    expect(payBtn().disabled).toBe(false);
  });

  it('an unverified user sees the verify card and no State picker', async () => {
    mockNeedsVerification = true;
    await mount();
    expect(document.body.querySelector('[data-testid="verify-card"]')).not.toBeNull();
    expect(select()).toBeNull();
  });
});
