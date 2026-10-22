// T-549 item 3 (Rajesh T-531 F7): TopUpModal on the Dialog sheet pattern. Shared surface classes,
// z-[60], no drag handle, side safe-area insets, and the Razorpay step-aside unchanged.
import { readFileSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

import {
  DIALOG_OVERLAY_CLASS,
  DIALOG_SHEET_CLASS,
  DIALOG_TALL_CAP_CLASS,
} from '@/components/ui/Dialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-549' } }) }));
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
  VerifyEmailCard: () => null,
  isEmailVerificationRequired: async () => false,
  useNeedsEmailVerification: () => false,
}));

const reply = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const packs = (n: number) => ({
  topups: Array.from({ length: n }, (_, i) => ({
    // the dialog preselects topup_mid, so the second pack has that id
    id: i === 0 ? 'topup_mini' : i === 1 ? 'topup_mid' : `topup_${i}`,
    ink: i === 1 ? 30 : 10 + i,
    priceInr: i === 1 ? 249 : 99 + i * 50,
    pricePerInkInr: 9.9,
    ...(i === 1 ? { badge: 'POPULAR' } : {}),
  })),
});

let plans: unknown;
let container: HTMLDivElement;
let root: Root;
let onClose: jest.Mock;
let rzpOpts: Record<string, unknown> | null;
let rzpOpen: jest.Mock;

const dialogEl = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null;
const overlayEl = () =>
  document.body.querySelector('[data-state="open"].fixed.inset-0') as HTMLElement | null;
const button = (name: string) =>
  Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  ) as HTMLButtonElement | undefined;
const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
const flush = () =>
  act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });
async function mount() {
  await act(async () => {
    root.render(<TopUpModal onClose={onClose} />);
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  onClose = jest.fn();
  rzpOpts = null;
  rzpOpen = jest.fn();
  plans = packs(2);
  mockApiFetch.mockImplementation(async (path: string) =>
    path === '/api/billing/plans'
      ? reply(200, plans)
      : reply(200, { data: { gstStateCode: '07' } }),
  );
  mockPrivacyFetch.mockResolvedValue(
    reply(200, { data: { orderId: 'o1', amountInr: 249, ink: 30, razorpayKeyId: 'rzp_test' } }),
  );
  (window as unknown as { Razorpay: unknown }).Razorpay = function Rzp(
    opts: Record<string, unknown>,
  ) {
    rzpOpts = opts;
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

describe('T-549 TopUpModal: shared Dialog sheet classes and layer', () => {
  it('the content carries every DIALOG_SHEET_CLASS and DIALOG_TALL_CAP_CLASS token', async () => {
    await mount();
    const c = tokens(dialogEl()!.className);
    for (const t of tokens(DIALOG_SHEET_CLASS)) expect(c).toContain(t);
    for (const t of tokens(DIALOG_TALL_CAP_CLASS)) expect(c).toContain(t);
  });

  it('the overlay carries every DIALOG_OVERLAY_CLASS token', async () => {
    await mount();
    const c = tokens(overlayEl()!.className);
    for (const t of tokens(DIALOG_OVERLAY_CLASS)) expect(c).toContain(t);
  });

  it('renders at z-[60] on both the overlay and the content, not z-50', async () => {
    await mount();
    for (const el of [dialogEl()!, overlayEl()!]) {
      const c = tokens(el.className);
      expect(c).toContain('z-[60]');
      expect(c).not.toContain('z-50');
    }
  });

  it('the constants themselves are z-[60] and the dvh triple', () => {
    expect(tokens(DIALOG_OVERLAY_CLASS)).toContain('z-[60]');
    expect(tokens(DIALOG_SHEET_CLASS)).toEqual(
      expect.arrayContaining([
        'z-[60]',
        'max-h-[90vh]',
        'max-h-[90dvh]',
        'supports-[height:100dvh]:max-h-[90dvh]',
      ]),
    );
    expect(tokens(DIALOG_TALL_CAP_CLASS)).toEqual(
      expect.arrayContaining([
        'min-[641px]:max-h-[calc(100vh-64px)]',
        'min-[641px]:max-h-[calc(100dvh-64px)]',
        'min-[641px]:supports-[height:100dvh]:max-h-[calc(100dvh-64px)]',
      ]),
    );
  });

  it('is a sheet at 640px and below (12px top radius, flush bottom) and 4px centred above', async () => {
    await mount();
    expect(tokens(dialogEl()!.className)).toEqual(
      expect.arrayContaining([
        'inset-x-0',
        'bottom-0',
        'rounded-t-[12px]',
        'min-[641px]:rounded-nl-md',
        'min-[641px]:w-[min(440px,calc(100vw-32px))]',
      ]),
    );
  });
});

describe('T-549 TopUpModal: no drag handle', () => {
  it('has no 40x4 handle bar anywhere in the dialog', async () => {
    await mount();
    const d = dialogEl()!;
    const bar = Array.from(d.querySelectorAll('div')).filter((el) => {
      const c = tokens(el.className);
      return c.includes('h-1') && c.includes('w-10');
    });
    expect(bar).toHaveLength(0);
    expect(d.firstElementChild!.tagName).toBe('HEADER');
  });

  it('the source has no handle classes or comment left', () => {
    const src = readFileSync(join(__dirname, '..', 'TopUpModal.tsx'), 'utf8');
    expect(src).not.toMatch(/h-1 w-10/);
    expect(src).not.toMatch(/drag handle/i);
  });
});

describe('T-549 TopUpModal: side safe-area insets', () => {
  it('sheet mode clears the left, right and bottom insets; they reset from 641px', async () => {
    await mount();
    const c = tokens(dialogEl()!.className);
    expect(c).toEqual(
      expect.arrayContaining([
        'pl-[env(safe-area-inset-left,0px)]',
        'pr-[env(safe-area-inset-right,0px)]',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'min-[641px]:pl-0',
        'min-[641px]:pr-0',
        'min-[641px]:pb-0',
      ]),
    );
  });

  it('the sections keep px-nl-6 and the dividers stay full width (insets are on the surface)', async () => {
    await mount();
    const d = dialogEl()!;
    expect(tokens(d.querySelector('header')!.className)).toContain('px-nl-6');
    const footer = d.querySelector('footer')!;
    expect(tokens(footer.className)).toEqual(expect.arrayContaining(['px-nl-6', 'border-t']));
    expect(tokens(d.querySelector('header')!.className)).toContain('pt-nl-6');
  });
});

describe('T-549 TopUpModal: Razorpay step-aside is unchanged', () => {
  const pay = async () => {
    await act(async () => (button('Buy') as HTMLElement).click());
    await flush();
  };

  it('the content and the overlay are unmounted while Checkout is open, not hidden', async () => {
    await mount();
    expect(dialogEl()).not.toBeNull();
    await pay();
    expect(rzpOpen).toHaveBeenCalledTimes(1);
    expect(dialogEl()).toBeNull();
    expect(overlayEl()).toBeNull();
    expect(document.body.querySelector('[data-state]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('comes back, with focus on Buy, when Checkout is dismissed', async () => {
    await mount();
    await pay();
    await act(async () => {
      (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
    });
    await flush();
    expect(dialogEl()).not.toBeNull();
    expect(document.activeElement).toBe(button('Buy'));
  });

  it('the source keeps open={!checkoutOpen} and never forces the content to stay mounted', () => {
    const src = readFileSync(join(__dirname, '..', 'TopUpModal.tsx'), 'utf8');
    expect(src).toContain('open={!checkoutOpen}');
    expect(src).not.toContain('forceMount');
    expect(src).toContain('closingForCheckout');
    expect(src).not.toMatch(/confirmLoading/);
  });
});

describe('T-549 TopUpModal: many packs (break-ui, class level in jsdom)', () => {
  it('renders 12 packs inside a scrolling, height-capped sheet with the footer still present', async () => {
    plans = packs(12);
    await mount();
    const d = dialogEl()!;
    expect(d.querySelectorAll('button[aria-pressed]')).toHaveLength(12);
    const c = tokens(d.className);
    expect(c).toEqual(
      expect.arrayContaining([
        'overflow-y-auto',
        'overscroll-contain',
        'flex',
        'flex-col',
        'max-h-[90dvh]',
        'min-[641px]:max-h-[calc(100dvh-64px)]',
      ]),
    );
    expect(d.querySelector('footer')).not.toBeNull();
    expect(button('Buy')).toBeDefined();
    expect(button('Close')).toBeDefined();
  });
});
