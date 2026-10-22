// T-525 stage A: the top-up dialog on Radix Dialog primitives. Semantics, close paths, focus,
// and stepping aside while Razorpay Checkout is open.
import { act, StrictMode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-525' } }) }));
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

let plansReply: () => Promise<unknown>;
let container: HTMLDivElement;
let root: Root;
let onClose: jest.Mock;
let rzpOpts: Record<string, unknown> | null;
let rzpOpen: jest.Mock;

const dialogEl = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null;
const button = (name: string) =>
  Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  ) as HTMLButtonElement | undefined;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(<TopUpModal onClose={onClose} />);
  });
  await flush();
}
const key = (k: string, target: Element = document.activeElement ?? document.body) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });

beforeEach(() => {
  jest.clearAllMocks();
  onClose = jest.fn();
  rzpOpts = null;
  rzpOpen = jest.fn();
  plansReply = async () => reply(200, PLANS);
  mockApiFetch.mockImplementation(async (path: string) =>
    path === '/api/billing/plans' ? plansReply() : reply(200, { data: { gstStateCode: '07' } }),
  );
  mockPrivacyFetch.mockResolvedValue(
    reply(200, {
      data: { orderId: 'o1', amountInr: 249, ink: 30, razorpayKeyId: 'rzp_test' },
    }),
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

describe('T-525 top-up dialog: semantics', () => {
  it('portals to document.body, not into the caller container', async () => {
    await mount();
    expect(dialogEl()).not.toBeNull();
    expect(container.contains(dialogEl())).toBe(false);
    expect(document.body.contains(dialogEl())).toBe(true);
  });

  it('is a modal dialog labelled by its title', async () => {
    await mount();
    const d = dialogEl() as HTMLElement;
    expect(d.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(d.getAttribute('aria-labelledby') as string);
    expect(title).not.toBeNull();
    expect(title?.textContent?.length).toBeGreaterThan(0);
    expect(d.contains(title)).toBe(true);
  });

  it('has a Close button named "Close"', async () => {
    await mount();
    expect(button('Close')).toBeDefined();
  });

  it('keeps the signed strings', async () => {
    await mount();
    expect(button('Buy')).toBeDefined();
    plansReply = () => new Promise(() => {});
    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    expect(document.body.textContent).not.toContain('Loading packs');
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Loading');
  });

  it('packs are buttons with aria-pressed; the Mid pack starts pressed', async () => {
    await mount();
    const packs = Array.from(document.body.querySelectorAll('button[aria-pressed]'));
    expect(packs).toHaveLength(2);
    expect(packs.filter((p) => p.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(packs.find((p) => p.getAttribute('aria-pressed') === 'true')?.textContent).toContain(
      '30 Ink, ₹249',
    );
    act(() => (packs[0] as HTMLElement).click());
    expect(packs[0].getAttribute('aria-pressed')).toBe('true');
    expect(packs[1].getAttribute('aria-pressed')).toBe('false');
  });
});

describe('T-525 top-up dialog: closing', () => {
  it('Escape calls onClose', async () => {
    await mount();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the Close button calls onClose', async () => {
    await mount();
    act(() => (button('Close') as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click on the overlay calls onClose; a click inside does not', async () => {
    await mount();
    act(() => (dialogEl() as HTMLElement).click());
    expect(onClose).not.toHaveBeenCalled();
    const overlay = document.body.querySelector('[data-state="open"].fixed.inset-0') as HTMLElement;
    expect(overlay).not.toBeNull();
    // Radix closes on pointerdown outside
    act(() => {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('T-525 top-up dialog: focus', () => {
  it('opens with focus inside the dialog, on the title, never on Retry or a pack', async () => {
    await mount();
    const d = dialogEl() as HTMLElement;
    const title = document.getElementById(d.getAttribute('aria-labelledby') as string);
    expect(document.activeElement).toBe(title);
    expect(document.activeElement).not.toBe(button('Retry'));
  });

  it('a first-load failure does not put focus on Retry', async () => {
    plansReply = async () => reply(500);
    await mount();
    expect(button('Retry')).toBeDefined();
    expect(document.activeElement).not.toBe(button('Retry'));
    expect(dialogEl()?.contains(document.activeElement)).toBe(true);
  });

  it('Tab from the last control wraps inside the dialog (focus stays in)', async () => {
    await mount();
    const d = dialogEl() as HTMLElement;
    const focusables = Array.from(
      d.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]'),
    );
    focusables[focusables.length - 1].focus();
    key('Tab');
    await flush();
    expect(d.contains(document.activeElement)).toBe(true);
  });
});

describe('T-525 top-up dialog: Razorpay Checkout', () => {
  async function pay() {
    await act(async () => (button('Buy') as HTMLElement).click());
    await flush();
  }

  it('the dialog steps aside while Checkout is open and comes back, with focus on Pay, when dismissed', async () => {
    await mount();
    await pay();
    expect(rzpOpen).toHaveBeenCalledTimes(1);
    expect(dialogEl()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
    });
    await flush();
    expect(dialogEl()).not.toBeNull();
    const payBtn = button('Buy') as HTMLButtonElement;
    expect(payBtn.disabled).toBe(false);
    expect(document.activeElement).toBe(payBtn);
  });

  it('a Checkout success refreshes credits and closes', async () => {
    const changed = jest.fn();
    window.addEventListener('creditsChanged', changed);
    await mount();
    await pay();
    act(() => (rzpOpts as { handler: () => void }).handler());
    expect(changed).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    window.removeEventListener('creditsChanged', changed);
  });

  it('Razorpay open() throwing keeps the dialog up with an error', async () => {
    rzpOpen.mockImplementation(() => {
      throw new Error('boom');
    });
    await mount();
    await pay();
    expect(dialogEl()).not.toBeNull();
    expect(document.body.textContent).toContain('Network error');
    const alert = Array.from(document.body.querySelectorAll('[role="alert"]')).find((n) =>
      n.textContent?.includes('Network error'),
    );
    expect(alert).toBeDefined();
    expect(alert?.tagName).toBe('P');
  });

  it('the order is for the selected pack (Mid by default)', async () => {
    await mount();
    await pay();
    const [, url, init] = mockPrivacyFetch.mock.calls[0];
    expect(url).toBe('/api/billing/topup/order');
    expect(JSON.parse((init as { body: string }).body)).toEqual({ skuId: 'topup_mid' });
  });
});

describe('T-525 top-up dialog: focus return to the opener', () => {
  let opener: HTMLButtonElement;
  let hostClosed: jest.Mock;
  function Host() {
    const [open, setOpen] = useState(true);
    return open ? (
      <TopUpModal
        onClose={() => {
          hostClosed();
          setOpen(false);
        }}
      />
    ) : null;
  }
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  async function mountHost() {
    opener = document.createElement('button');
    opener.textContent = 'Buy ink';
    document.body.appendChild(opener);
    opener.focus();
    await act(async () => {
      root.render(<Host />);
    });
    await flush();
    expect(dialogEl()).not.toBeNull();
    expect(document.activeElement).not.toBe(opener);
  }
  const pay = async () => {
    await act(async () => (button('Buy') as HTMLElement).click());
    await flush();
  };
  beforeEach(() => {
    hostClosed = jest.fn();
  });
  afterEach(() => {
    opener.remove();
    document.getElementById('dashboard-main')?.remove();
  });

  it('restores focus to the opener when it unmounts', async () => {
    await mountHost();
    act(() => root.unmount());
    await settle();
    expect(document.activeElement).toBe(opener);
    root = createRoot(container);
  });

  it('under StrictMode (double effects) focus still returns to the real opener, not the title', async () => {
    opener = document.createElement('button');
    opener.textContent = 'Buy ink';
    document.body.appendChild(opener);
    opener.focus();
    await act(async () => {
      root.render(
        <StrictMode>
          <Host />
        </StrictMode>,
      );
    });
    await flush();
    expect(dialogEl()).not.toBeNull();
    expect(document.activeElement).not.toBe(opener);
    key('Escape');
    await settle();
    expect(dialogEl()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.activeElement?.getAttribute('role')).toBeNull();
  });

  it('Escape returns focus to the opener', async () => {
    await mountHost();
    key('Escape');
    await settle();
    expect(hostClosed).toHaveBeenCalledTimes(1);
    expect(dialogEl()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('the Close button returns focus to the opener', async () => {
    await mountHost();
    act(() => (button('Close') as HTMLElement).click());
    await settle();
    expect(dialogEl()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('an overlay click returns focus to the opener', async () => {
    await mountHost();
    const overlay = document.body.querySelector('[data-state="open"].fixed.inset-0') as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(dialogEl()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('a Checkout success (onClose) leaves focus on the opener, not stranded on body', async () => {
    await mountHost();
    await pay();
    expect(dialogEl()).toBeNull();
    act(() => (rzpOpts as { handler: () => void }).handler());
    await settle();
    expect(hostClosed).toHaveBeenCalledTimes(1);
    expect(dialogEl()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('a Checkout success after a hide/reopen cycle returns focus to the opener once', async () => {
    await mountHost();
    await pay();
    await act(async () => {
      (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
    });
    await flush();
    await settle();
    const focusOpener = jest.spyOn(opener, 'focus');
    await pay();
    act(() => (rzpOpts as { handler: () => void }).handler());
    await settle();
    expect(hostClosed).toHaveBeenCalledTimes(1);
    expect(focusOpener).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it('unmounting while hidden for Checkout restores focus exactly once', async () => {
    await mountHost();
    const focusOpener = jest.spyOn(opener, 'focus');
    await pay();
    await settle();
    expect(dialogEl()).toBeNull();
    expect(focusOpener).not.toHaveBeenCalled();
    act(() => root.unmount());
    await settle();
    expect(focusOpener).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    root = createRoot(container);
  });

  it('dismissing Checkout does not restore focus to the opener', async () => {
    await mountHost();
    const focusOpener = jest.spyOn(opener, 'focus');
    await pay();
    await act(async () => {
      (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
    });
    await flush();
    await settle();
    expect(focusOpener).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Buy'));
  });

  it('falls back to #dashboard-main when the opener was removed', async () => {
    const main = document.createElement('main');
    main.id = 'dashboard-main';
    main.tabIndex = -1;
    document.body.appendChild(main);
    await mountHost();
    opener.remove();
    key('Escape');
    await settle();
    expect(document.activeElement).toBe(main);
  });

  it('with no opener and no #dashboard-main, closing does not throw', async () => {
    await mountHost();
    opener.remove();
    expect(() => key('Escape')).not.toThrow();
    await settle();
    expect(dialogEl()).toBeNull();
  });

  it('closing for Razorpay Checkout moves no focus (not to the opener, not to main)', async () => {
    const main = document.createElement('main');
    main.id = 'dashboard-main';
    main.tabIndex = -1;
    document.body.appendChild(main);
    await mountHost();
    const focusOpener = jest.spyOn(opener, 'focus');
    const focusMain = jest.spyOn(main, 'focus');
    await pay();
    await settle();
    expect(rzpOpen).toHaveBeenCalledTimes(1);
    expect(dialogEl()).toBeNull();
    expect(focusOpener).not.toHaveBeenCalled();
    expect(focusMain).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(opener);
    main.remove();
  });

  it('after Checkout is dismissed, reopening focuses Pay', async () => {
    await mountHost();
    await pay();
    await act(async () => {
      (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
    });
    await flush();
    await settle();
    expect(document.activeElement).toBe(button('Buy'));
  });

  it('the opener stays the original element across the Checkout hide and reopen', async () => {
    await mountHost();
    await pay();
    await act(async () => {
      (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
    });
    await flush();
    await settle();
    // focus is now on Pay (inside the dialog); a real close must still go to the first opener
    expect(dialogEl()?.contains(document.activeElement)).toBe(true);
    key('Escape');
    await settle();
    expect(dialogEl()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('two Checkout round trips then Escape still return to the original opener', async () => {
    await mountHost();
    for (let i = 0; i < 2; i += 1) {
      await pay();
      await act(async () => {
        (rzpOpts?.modal as { ondismiss: () => void }).ondismiss();
      });
      await flush();
      await settle();
    }
    key('Escape');
    await settle();
    expect(document.activeElement).toBe(opener);
  });

  it('Razorpay open() throwing does not arm the skip flag: a later Escape still restores focus', async () => {
    rzpOpen.mockImplementation(() => {
      throw new Error('boom');
    });
    await mountHost();
    await pay();
    expect(dialogEl()).not.toBeNull();
    key('Escape');
    await settle();
    expect(document.activeElement).toBe(opener);
  });
});
