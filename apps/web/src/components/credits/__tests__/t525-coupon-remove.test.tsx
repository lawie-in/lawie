// T-525 round 3: the applied-coupon remove control is an icon-only button; its name is
// "Remove coupon" and the icon is hidden from the accessibility tree.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-525' } }) }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  VerifyEmailCard: () => null,
  isEmailVerificationRequired: async () => false,
  useNeedsEmailVerification: () => false,
}));

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const PLANS = { topups: [{ id: 'topup_mini', ink: 10, priceInr: 99, pricePerInkInr: 9.9 }] };

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/plans') return reply(PLANS);
    if (path.startsWith('/api/billing/validate-coupon/'))
      return reply({ valid: true, code: 'WELCOME10', discountInr: 10, finalPriceInr: 89 });
    return reply({ data: { gstStateCode: '07' } });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('applied coupon remove button', () => {
  it('is named "Remove coupon", hides its icon, and removes the coupon', async () => {
    await act(async () => root.render(<TopUpModal onClose={jest.fn()} />));
    await flush();
    const input = document.body.querySelector(
      'input[placeholder^="Coupon code"]',
    ) as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'welcome10',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const apply = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    ) as HTMLButtonElement;
    await act(async () => apply.click());
    await flush();
    const remove = document.body.querySelector(
      'button[aria-label="Remove coupon"]',
    ) as HTMLButtonElement;
    expect(remove).not.toBeNull();
    expect(remove.getAttribute('type')).toBe('button');
    expect(remove.textContent).toBe('');
    expect(remove.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.textContent).toContain('WELCOME10');
    act(() => remove.click());
    expect(document.body.querySelector('button[aria-label="Remove coupon"]')).toBeNull();
    expect(document.body.querySelector('input[placeholder^="Coupon code"]')).not.toBeNull();
  });
});
