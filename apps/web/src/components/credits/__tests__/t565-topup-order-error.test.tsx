// T-565 item 45 (Ajay, pre-Anushka review row 45): every top-up order failure shows the one signed
// line `Something did not work. Try again.` in a role=alert box with a ghost Retry button that runs
// Buy again. No billing code, server message or network detail is shown. Coupon reasons are signed
// as they are and keep showing.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-565' } }) }));
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
  useNeedsEmailVerification: () => false,
}));

const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const PLANS = {
  topups: [{ id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3 }],
};
const GENERIC = 'Something did not work. Try again.';
const GOOD_ORDER = reply({
  data: { orderId: 'o1', amountInr: 249, ink: 30, razorpayKeyId: 'rzp_test' },
});

let container: HTMLDivElement;
let root: Root;
let rzpOpen: jest.Mock;
let couponReply: () => unknown;

const body = () => document.body.textContent ?? '';
const button = (name: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === name) as
    | HTMLButtonElement
    | undefined;
const box = () => document.body.querySelector('[role="alert"]');
async function flush() {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });
}
async function click(el: HTMLElement | undefined) {
  await act(async () => el!.click());
  await flush();
}
async function mountModal() {
  await act(async () => {
    root.render(<TopUpModal onClose={jest.fn()} />);
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  rzpOpen = jest.fn();
  couponReply = () => reply({ valid: true, code: 'SAVE20', discountInr: 50, finalPriceInr: 199 });
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/plans') return reply(PLANS);
    if (path.startsWith('/api/billing/validate-coupon/')) return couponReply();
    return reply({ data: { gstStateCode: '07' } });
  });
  (window as unknown as { Razorpay: unknown }).Razorpay = function Rzp() {
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

const RAW = [
  'Order creation failed',
  'Network error',
  'Could not load Razorpay',
  'contact support',
  'something_else',
  'BAD_REQUEST_ERROR',
  'topup_failed',
];

describe('every top-up order failure shows the generic line and Retry', () => {
  it.each([
    ['500 with a server error string', () => reply({ error: 'Order creation failed' }, 500)],
    ['400 with a raw code', () => reply({ error: 'BAD_REQUEST_ERROR' }, 400)],
    ['403 with an unknown code', () => reply({ error: 'something_else' }, 403)],
    [
      '502 with a non-JSON body',
      () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('html');
        },
      }),
    ],
    ['order data missing', () => reply({})],
    [
      'order amount differs from the price shown',
      () => reply({ data: { orderId: 'o', amountInr: 1, ink: 30, razorpayKeyId: 'k' } }),
    ],
  ])('%s', async (_n, res) => {
    mockPrivacyFetch.mockResolvedValueOnce(res());
    await mountModal();
    await click(button('Buy'));
    expect(box()!.querySelector('p')!.textContent).toBe(GENERIC);
    expect(box()!.querySelector('button')!.textContent).toBe('Retry');
    for (const raw of RAW) expect(body()).not.toContain(raw);
    expect(rzpOpen).not.toHaveBeenCalled();
  });

  it('a thrown network error (fetch rejects)', async () => {
    mockPrivacyFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    await mountModal();
    await click(button('Buy'));
    expect(box()!.querySelector('p')!.textContent).toBe(GENERIC);
    expect(body()).not.toContain('Network error');
    expect(body()).not.toContain('Failed to fetch');
  });

  it('Razorpay failing to load (script cannot be loaded)', async () => {
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    mockPrivacyFetch.mockResolvedValueOnce(GOOD_ORDER);
    await mountModal();
    await click(button('Buy'));
    const script = document.querySelector('script[src*="razorpay"]') as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    await act(async () => script!.dispatchEvent(new Event('error')));
    await flush();
    expect(box()!.querySelector('p')!.textContent).toBe(GENERIC);
    expect(body()).not.toContain('Could not load Razorpay');
    expect(body()).not.toContain('contact support');
    script!.remove();
  });

  it('Razorpay open() throwing', async () => {
    rzpOpen.mockImplementation(() => {
      throw new Error('boom');
    });
    mockPrivacyFetch.mockResolvedValueOnce(GOOD_ORDER);
    await mountModal();
    await click(button('Buy'));
    expect(box()!.querySelector('p')!.textContent).toBe(GENERIC);
    expect(body()).not.toContain('boom');
  });

  it('there is no error box before any failure, and none after a success', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(GOOD_ORDER);
    await mountModal();
    expect(box()).toBeNull();
    await click(button('Buy'));
    expect(box()).toBeNull();
    expect(rzpOpen).toHaveBeenCalledTimes(1);
  });
});

describe('Retry', () => {
  it('is a ghost button inside the alert box', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply({ error: 'x' }, 500));
    await mountModal();
    await click(button('Buy'));
    const retry = box()!.querySelector('button')!;
    expect(retry.getAttribute('data-variant')).toBe('ghost');
  });

  it('runs Buy again: a second order request is made with the same pack, and success opens Checkout', async () => {
    mockPrivacyFetch
      .mockResolvedValueOnce(reply({ error: 'Order creation failed' }, 500))
      .mockResolvedValueOnce(GOOD_ORDER);
    await mountModal();
    await click(button('Buy'));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    await click(button('Retry'));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    expect(mockPrivacyFetch.mock.calls[1][1]).toBe('/api/billing/topup/order');
    expect(JSON.parse(mockPrivacyFetch.mock.calls[1][2].body)).toEqual({ skuId: 'topup_mid' });
    expect(rzpOpen).toHaveBeenCalledTimes(1);
    expect(box()).toBeNull();
  });

  it('resends the applied coupon', async () => {
    mockPrivacyFetch
      .mockResolvedValueOnce(reply({ error: 'x' }, 500))
      .mockResolvedValueOnce(
        reply({ data: { orderId: 'o', amountInr: 199, ink: 30, razorpayKeyId: 'k' } }),
      );
    await mountModal();
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
    await click(button('Buy'));
    await click(button('Retry'));
    expect(JSON.parse(mockPrivacyFetch.mock.calls[1][2].body)).toEqual({
      skuId: 'topup_mid',
      couponCode: 'SAVE20',
    });
    expect(rzpOpen).toHaveBeenCalledTimes(1);
  });

  it('when the retry fails again the box stays and focus returns to Retry', async () => {
    mockPrivacyFetch.mockResolvedValue(reply({ error: 'x' }, 500));
    await mountModal();
    await click(button('Buy'));
    const first = button('Retry')!;
    first.focus();
    await click(first);
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    expect(box()!.querySelector('p')!.textContent).toBe(GENERIC);
    expect(document.activeElement).toBe(button('Retry'));
    expect(document.activeElement?.textContent).toBe('Retry');
  });

  it('while the retried order is in flight Retry is gone and Buy is busy, so a second click cannot double-submit', async () => {
    let release!: (v: unknown) => void;
    mockPrivacyFetch
      .mockResolvedValueOnce(reply({ error: 'x' }, 500))
      .mockReturnValueOnce(new Promise((r) => (release = r)));
    await mountModal();
    await click(button('Buy'));
    await click(button('Retry'));
    expect(button('Retry')).toBeUndefined();
    expect(box()).toBeNull();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    release(GOOD_ORDER);
    await flush();
    expect(rzpOpen).toHaveBeenCalledTimes(1);
  });
});

describe('coupon reasons are signed as they are and still show', () => {
  it('an invalid coupon shows the server reason, not the generic line', async () => {
    couponReply = () => reply({ valid: false, reason: 'Coupon has expired.' });
    mockPrivacyFetch.mockResolvedValue(GOOD_ORDER);
    await mountModal();
    const input = document.body.querySelector(
      'input[placeholder^="Coupon code"]',
    ) as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'old');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(button('Apply'));
    expect(body()).toContain('Coupon has expired.');
    expect(body()).not.toContain(GENERIC);
  });
});
