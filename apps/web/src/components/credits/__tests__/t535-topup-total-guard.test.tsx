// T-535 round 2: "You'll pay" equals the Razorpay charge, and Checkout never opens for any other
// amount. Mismatch shows the signed generic failure (T-511 §5) in the order-error slot.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-535' } }) }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  VerifyEmailCard: () => null,
  isEmailVerificationRequired: async () => false,
  useNeedsEmailVerification: () => false,
}));

const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const PLANS = {
  topups: [
    { id: 'topup_mini', ink: 3, priceInr: 65, pricePerInkInr: 21.67 },
    { id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3 },
  ],
};
// 20% off the 249 pack.
const COUPON = { valid: true, code: 'SAVE20', discountInr: 50, finalPriceInr: 199 };
const GENERIC = 'Something did not work. Try again.';
const order = (amountInr: number, ink = 30) =>
  reply({ data: { orderId: 'o1', amountInr, ink, razorpayKeyId: 'rzp_test' } });

let container: HTMLDivElement;
let root: Root;
let onClose: jest.Mock;
let rzpCtor: jest.Mock;
let rzpOpen: jest.Mock;
let lastOpts: Record<string, unknown> | null;

const body = () => document.body.textContent ?? '';
const button = (name: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === name) as
    | HTMLButtonElement
    | undefined;
const dialog = () => document.body.querySelector('[role="dialog"]');
const alertText = () => document.body.querySelector('[role="alert"]')?.textContent;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });
}
async function click(el: HTMLElement | undefined) {
  await act(async () => el!.click());
  await flush();
}
async function mount() {
  await act(async () => {
    root.render(<TopUpModal onClose={onClose} />);
  });
  await flush();
}
async function selectMid() {
  await click(
    Array.from(document.body.querySelectorAll('button[aria-pressed]')).find((b) =>
      b.textContent?.startsWith('30 Ink'),
    ) as HTMLElement,
  );
}
async function applyCoupon() {
  const input = document.body.querySelector(
    'input[placeholder^="Coupon code"]',
  ) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'save20',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(button('Apply'));
}
const youPay = () => {
  const label = Array.from(document.body.querySelectorAll('p')).find(
    (p) => p.textContent === "You'll pay",
  )!;
  return label.nextElementSibling!.textContent!;
};

beforeEach(() => {
  jest.clearAllMocks();
  onClose = jest.fn();
  lastOpts = null;
  rzpOpen = jest.fn();
  rzpCtor = jest.fn();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/plans') return reply(PLANS);
    if (path.startsWith('/api/billing/validate-coupon/')) return reply(COUPON);
    return reply({ data: { gstStateCode: '07' } });
  });
  (window as unknown as { Razorpay: unknown }).Razorpay = function Rzp(
    opts: Record<string, unknown>,
  ) {
    rzpCtor(opts);
    lastOpts = opts;
    return { open: rzpOpen };
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
});

describe('T-535 You will pay equals the Razorpay charge', () => {
  it('no coupon: the total shown is the pack price and opts.amount is that total x 100', async () => {
    mockPrivacyFetch.mockResolvedValue(order(249));
    await mount();
    await selectMid();
    expect(youPay()).toContain('₹249');
    await click(button('Buy'));
    expect(rzpCtor).toHaveBeenCalledTimes(1);
    expect(lastOpts!.amount).toBe(249 * 100);
    expect(rzpOpen).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull(); // steps aside for Checkout, as before
    expect(alertText()).toBeUndefined();
  });

  it('percent coupon: the total shown is coupon.finalPriceInr and opts.amount is that total x 100', async () => {
    mockPrivacyFetch.mockResolvedValue(order(199));
    await mount();
    await selectMid();
    await applyCoupon();
    expect(youPay()).toContain('₹199');
    await click(button('Buy'));
    const sent = JSON.parse(mockPrivacyFetch.mock.calls[0][2].body);
    expect(sent).toEqual({ skuId: 'topup_mid', couponCode: 'SAVE20' });
    expect(rzpCtor).toHaveBeenCalledTimes(1);
    expect(lastOpts!.amount).toBe(199 * 100);
    expect(rzpOpen).toHaveBeenCalledTimes(1);
  });
});

describe('T-535 amount guard', () => {
  function expectBlocked() {
    expect(rzpCtor).not.toHaveBeenCalled();
    expect(rzpOpen).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="razorpay"]')).toBeNull();
    expect(alertText()).toBe(GENERIC);
    expect(dialog()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(button('Buy')!.disabled).toBe(false);
  }

  it('no coupon, order amount differs from the price shown: blocked, then a matching retry opens Checkout', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(order(1));
    await mount();
    await selectMid();
    await click(button('Buy'));
    expectBlocked();

    mockPrivacyFetch.mockResolvedValueOnce(order(249));
    await click(button('Buy'));
    expect(rzpCtor).toHaveBeenCalledTimes(1);
    expect(lastOpts!.amount).toBe(24900);
    expect(rzpOpen).toHaveBeenCalledTimes(1);
  });

  it('coupon applied but the order returns the full price (coupon dropped): blocked, retry with the discounted amount opens', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(order(249));
    await mount();
    await selectMid();
    await applyCoupon();
    expect(youPay()).toContain('₹199');
    await click(button('Buy'));
    expectBlocked();

    mockPrivacyFetch.mockResolvedValueOnce(order(199));
    await click(button('Buy'));
    expect(rzpCtor).toHaveBeenCalledTimes(1);
    expect(lastOpts!.amount).toBe(19900);
  });

  it('missing order data: blocked with the generic message, not "Network error"; retry opens', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply({}));
    await mount();
    await selectMid();
    await click(button('Buy'));
    expectBlocked();
    expect(body()).not.toContain('Network error');

    mockPrivacyFetch.mockResolvedValueOnce(order(249));
    await click(button('Buy'));
    expect(rzpCtor).toHaveBeenCalledTimes(1);
  });

  it('a non-finite order amount is blocked', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(
      reply({ data: { orderId: 'o1', amountInr: 'x', ink: 30, razorpayKeyId: 'k' } }),
    );
    await mount();
    await selectMid();
    await click(button('Buy'));
    expectBlocked();
  });

  it('a matching amount opens Checkout with no error shown', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(order(65, 3));
    await mount();
    const mini = Array.from(document.body.querySelectorAll('button[aria-pressed]')).find((b) =>
      b.textContent?.startsWith('3 Ink'),
    ) as HTMLElement;
    await click(mini);
    await click(button('Buy'));
    expect(rzpCtor).toHaveBeenCalledTimes(1);
    expect(lastOpts!.amount).toBe(6500);
    expect(body()).not.toContain(GENERIC);
  });
});
