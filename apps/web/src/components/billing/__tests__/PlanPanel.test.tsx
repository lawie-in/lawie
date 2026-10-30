// T-509 AC1-AC5 through the Settings Plan block: status card, Cancel flow, subscribe gates,
// generic failures, switch note, no dead buttons. Pending Ink is in PlanPanel-pending.test.tsx.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import VerifyEmailPrompt from '../../VerifyEmailPrompt';
import { PlanPanel } from '../PlanPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFetchPlans = jest.fn();
jest.mock('@/lib/plans', () => ({
  ...jest.requireActual('@/lib/plans'),
  fetchPlans: () => mockFetchPlans(),
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'asha@example.com' } }),
}));
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    balance: { totalInk: 7, planTier: 'free' },
    loaded: true,
    loading: false,
    refresh: jest.fn(async () => {}),
  }),
}));

const mockPrivacyFetch = jest.fn();
const mockPrecheck = jest.fn();
let blocked = new WeakSet<object>();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: (res: object) => blocked.has(res),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: (...a: unknown[]) => mockPrecheck(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  __esModule: true,
  ...jest.requireActual('@/components/VerifyEmailPrompt'),
  useNeedsEmailVerification: () => false,
}));

const CATALOGUE = {
  subscriptions: [
    { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
    { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
    { id: 'solo_yearly', tier: 'solo', cycle: 'yearly', priceInr: 7990, inkPerCycle: 50 },
    { id: 'pro_yearly', tier: 'pro', cycle: 'yearly', priceInr: 19990, inkPerCycle: 150 },
  ],
  topups: [],
};
const FREE = {
  tier: 'free',
  state: 'lapsed',
  status: null,
  renewsAt: null,
  cancelAtCycleEnd: false,
};
const SOLO = {
  tier: 'solo',
  state: 'active',
  status: 'active',
  renewsAt: '2026-10-14T10:00:00.000Z',
  cancelAtCycleEnd: false,
};
const GENERIC = 'Something did not work. Try again.';

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => {
  const make = (): Record<string, unknown> => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
    clone: () => make(),
  });
  return make();
};

let statusBody: unknown;
let statusCalls: number;
const gst = { ensureReady: jest.fn() } as never;
const hrefSet = jest.fn();
const originalLocation = window.location;
let container: HTMLDivElement;
let root: Root;

const text = () => container.textContent ?? '';
const bodyText = () => document.body.textContent ?? '';
const allButtons = () => Array.from(document.body.querySelectorAll('button'));
const find = (label: string, scope: ParentNode = document.body) =>
  Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as
    | HTMLButtonElement
    | undefined;
const dialog = () => document.body.querySelector('[role="dialog"]');

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}
async function click(el: HTMLElement | undefined) {
  expect(el).toBeDefined();
  await act(async () => el!.click());
  await flush();
}
async function mountWithPrompt() {
  await act(async () => {
    root.render(
      <>
        <div data-testid="plan-wrap">
          <PlanPanel gst={gst} />
        </div>
        <VerifyEmailPrompt />
      </>,
    );
  });
  await flush();
}
async function mount() {
  await act(async () => {
    root.render(<PlanPanel gst={gst} />);
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  blocked = new WeakSet();
  statusBody = { data: FREE };
  statusCalls = 0;
  (gst as { ensureReady: jest.Mock }).ensureReady.mockResolvedValue(true);
  mockFetchPlans.mockResolvedValue(CATALOGUE);
  mockPrecheck.mockResolvedValue(false);
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/status') {
      statusCalls += 1;
      return reply(200, statusBody);
    }
    if (path === '/api/credits/balance') return reply(200, { totalInk: 7, planTier: 'free' });
    return reply(200, {});
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      set href(v: string) {
        hrefSet(v);
      },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('T-509 AC1 plan chooser in Settings', () => {
  it('free user: Free, Solo, Pro cards with catalogue prices and Ink, yearly hidden, no status card', async () => {
    await mount();
    expect(text()).toContain('₹0');
    expect(text()).toContain('₹799 a month');
    expect(text()).toContain('50 Ink a month');
    expect(text()).toContain('₹1,999 a month');
    expect(text()).toContain('150 Ink a month');
    expect(text()).not.toMatch(/year|19,990|7,990/i);
    expect(container.querySelector('[data-testid="subscription-status"]')).toBeNull();
    expect(text()).toContain('Current plan');
    expect(text()).toContain(
      'Prices include GST. Plan Ink does not carry over. Top-up Ink does not expire while your account is open.',
    );
  });

  it('shows skeletons while plans load, and no prices', async () => {
    mockFetchPlans.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('₹799');
    expect(find('Choose Solo')).toBeUndefined();
  });

  it.each([
    ['Choose Solo', 'solo_monthly', 'Choose Pro'],
    ['Choose Pro', 'pro_monthly', 'Choose Solo'],
  ])(
    '%s sends %s and goes to the shortUrl; afterwards the buttons stay disabled and a second click sends nothing',
    async (label, planId, other) => {
      mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: 'https://rzp.io/x' } }));
      await mount();
      await click(find(label));
      expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
      const [key, path, init] = mockPrivacyFetch.mock.calls[0];
      expect(key).toBe('subscribe');
      expect(path).toBe('/api/billing/subscribe');
      expect(JSON.parse(init.body)).toEqual({ planId });
      expect(hrefSet).toHaveBeenCalledWith('https://rzp.io/x');
      // Redirecting: both Choose buttons stay disabled, and clicking again sends no second call.
      expect(find(other)!.disabled).toBe(true);
      expect(find(label)!.disabled).toBe(true);
      await click(find(other));
      await click(find(label));
      expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
      expect(hrefSet).toHaveBeenCalledTimes(1);
    },
  );

  it('no State saved (ensureReady false): no subscribe call', async () => {
    (gst as { ensureReady: jest.Mock }).ensureReady.mockResolvedValue(false);
    await mount();
    await click(find('Choose Solo'));
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('plans failing to load: generic failure and Retry, which refetches and then shows the cards', async () => {
    mockFetchPlans.mockRejectedValueOnce(new Error('500'));
    await mount();
    expect(text()).toContain(GENERIC);
    expect(text()).not.toContain('₹799');
    await click(find('Retry', container));
    expect(mockFetchPlans).toHaveBeenCalledTimes(2);
    expect(text()).toContain('₹799 a month');
    expect(text()).not.toContain(GENERIC);
  });

  it('a failing /status also gives the generic failure (never a wrong current plan)', async () => {
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/api/billing/status' ? reply(500, {}) : reply(200, {}),
    );
    await mount();
    expect(text()).toContain(GENERIC);
    expect(find('Choose Solo')).toBeUndefined();
  });
});

describe('T-509 AC2 subscribed user: status card and switch note', () => {
  it('Solo active: plan, Active, Renews on, Current plan on Solo, Cancel plan present', async () => {
    statusBody = { data: SOLO };
    await mount();
    const sc = container.querySelector('[data-testid="subscription-status"]')!;
    expect(sc.textContent).toContain('Solo');
    expect(sc.textContent).toContain('Active');
    expect(sc.textContent).toContain('Renews on 14 Oct 2026');
    expect(find('Cancel plan')).toBeDefined();
    expect(find('Choose Solo')).toBeUndefined();
    expect(find('Upgrade to Pro')).toBeDefined();
  });

  it('Upgrade to Pro shows the switch note and makes no subscribe call', async () => {
    statusBody = { data: SOLO };
    await mount();
    await click(find('Upgrade to Pro'));
    expect(text()).toContain(
      'To change plans, cancel your current plan and choose the new one after 14 Oct 2026.',
    );
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('Pro active: Switch to Solo shows the switch note', async () => {
    statusBody = { data: { ...SOLO, tier: 'pro' } };
    await mount();
    await click(find('Switch to Solo'));
    expect(text()).toContain('choose the new one after 14 Oct 2026.');
  });

  it('cancelAtCycleEnd: Ends on {date}, no Cancel plan', async () => {
    statusBody = { data: { ...SOLO, cancelAtCycleEnd: true } };
    await mount();
    expect(text()).toContain('Ends on 14 Oct 2026');
    expect(find('Cancel plan')).toBeUndefined();
  });

  it('raw status cancelled with state active: Ends on, no Cancel plan', async () => {
    statusBody = { data: { ...SOLO, status: 'cancelled' } };
    await mount();
    expect(text()).toContain('Ends on 14 Oct 2026');
    expect(find('Cancel plan')).toBeUndefined();
  });

  it('lapsed: Lapsed, "Choose a plan to start again.", and the Choose buttons are back', async () => {
    statusBody = { data: { ...SOLO, state: 'lapsed', status: 'cancelled' } };
    await mount();
    expect(text()).toContain('Lapsed');
    expect(text()).toContain('Choose a plan to start again.');
    expect(find('Choose Solo')).toBeDefined();
    expect(find('Choose Pro')).toBeDefined();
    expect(find('Cancel plan')).toBeUndefined();
  });

  it('an unfinished checkout (status created) shows no Lapsed card', async () => {
    statusBody = { data: { ...SOLO, state: 'lapsed', status: 'created' } };
    await mount();
    expect(container.querySelector('[data-testid="subscription-status"]')).toBeNull();
    expect(text()).not.toContain('Lapsed');
  });

  it('past_due: Payment failed chip and the signed banner text; no Retry payment button anywhere', async () => {
    statusBody = { data: { ...SOLO, state: 'past_due', status: 'halted' } };
    await mount();
    expect(text()).toContain('Payment failed');
    const banner = container.querySelector('[data-kind="payment-failed"]')!;
    expect(banner).not.toBeNull();
    // AJ-509-M2: signed text with the support address as a mailto link.
    expect(banner.textContent).toBe(
      'Your last payment did not go through. For help, write to contact@lawie.in.',
    );
    const link = banner.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('mailto:contact@lawie.in');
    expect(link.textContent).toBe('contact@lawie.in');
    expect(text()).not.toContain('Update your payment details');
    // Priya: no Retry payment button and no banner action.
    expect(banner.querySelector('button')).toBeNull();
    expect(find('Retry payment')).toBeUndefined();
    expect(text()).not.toContain('Retry payment');
  });

  it('the payment-failed banner is absent when the plan is active', async () => {
    statusBody = { data: SOLO };
    await mount();
    expect(container.querySelector('[data-kind="payment-failed"]')).toBeNull();
  });
});

describe('T-509 AC2 cancel flow', () => {
  const CANCELLED = { ...SOLO, cancelAtCycleEnd: true };
  async function openDialog() {
    statusBody = { data: SOLO };
    await mount();
    await click(find('Cancel plan'));
  }

  it('opens a confirm dialog with the signed title, body with the date, and both buttons', async () => {
    await openDialog();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Cancel your plan?');
    expect(dialog()!.textContent).toContain(
      'Your plan ends on 14 Oct 2026. Ink you already have stays until then. Plan Ink does not carry over after that. Top-up Ink stays.',
    );
    expect(find('Keep my plan', dialog()!)).toBeDefined();
    expect(find('Cancel plan', dialog()!)).toBeDefined();
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('the Cancel plan link is the md size (44px target), not sm', async () => {
    statusBody = { data: SOLO };
    await mount();
    expect(find('Cancel plan')!.getAttribute('data-size')).toBe('md');
  });

  it('Keep my plan closes the dialog and makes no cancel call', async () => {
    await openDialog();
    await click(find('Keep my plan', dialog()!));
    expect(dialog()).toBeNull();
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
    expect(text()).toContain('Renews on 14 Oct 2026');
  });

  it('confirm POSTs /api/billing/cancel via privacyFetch, then the card shows Ends on, the inline confirmation, and no Cancel plan', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: CANCELLED }));
    await openDialog();
    await click(find('Cancel plan', dialog()!));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    const [key, path, init] = mockPrivacyFetch.mock.calls[0];
    expect(key).toBe('plan-cancel');
    expect(path).toBe('/api/billing/cancel');
    expect(init.method).toBe('POST');
    expect(dialog()).toBeNull();
    expect(text()).toContain('Ends on 14 Oct 2026');
    expect(text()).not.toContain('Renews on');
    expect(text()).toContain('Your plan will end on 14 Oct 2026.');
    expect(find('Cancel plan')).toBeUndefined();
  });

  it('503: error line in the dialog, confirm becomes Retry; Retry then succeeds', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(503, { error: 'try_again' }));
    await openDialog();
    await click(find('Cancel plan', dialog()!));
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Could not cancel your plan. Try again.');
    expect(dialog()!.textContent).not.toContain('try_again');
    expect(find('Retry', dialog()!)).toBeDefined();
    expect(find('Cancel plan', dialog()!)).toBeUndefined();

    mockPrivacyFetch.mockResolvedValueOnce(reply(200, { data: CANCELLED }));
    await click(find('Retry', dialog()!));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    expect(text()).toContain('Your plan will end on 14 Oct 2026.');
  });

  it.each([500, 400])('%s gives the same error line and Retry', async (status) => {
    mockPrivacyFetch.mockResolvedValue(reply(status, { error: 'boom' }));
    await openDialog();
    await click(find('Cancel plan', dialog()!));
    expect(dialog()!.textContent).toContain('Could not cancel your plan. Try again.');
    expect(find('Retry', dialog()!)).toBeDefined();
  });

  it('a network error gives the error line and Retry', async () => {
    mockPrivacyFetch.mockRejectedValue(new Error('offline'));
    await openDialog();
    await click(find('Cancel plan', dialog()!));
    expect(dialog()!.textContent).toContain('Could not cancel your plan. Try again.');
    expect(find('Retry', dialog()!)).toBeDefined();
  });

  it('409 (no live plan any more): the dialog closes and the status is reloaded', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(409, { error: 'no_active_subscription' }));
    await openDialog();
    const before = statusCalls;
    statusBody = { data: { ...SOLO, state: 'lapsed', status: 'cancelled' } };
    await click(find('Cancel plan', dialog()!));
    expect(dialog()).toBeNull();
    expect(statusCalls).toBeGreaterThan(before);
    expect(text()).toContain('Lapsed');
    expect(text()).not.toContain('Could not cancel');
  });

  it('privacy block: the dialog closes and the privacy banner shows', async () => {
    const res = reply(403, { error: 'privacy_reaccept_required' });
    blocked.add(res);
    mockPrivacyFetch.mockResolvedValue(res);
    await openDialog();
    await click(find('Cancel plan', dialog()!));
    expect(dialog()).toBeNull();
    expect(container.querySelector('[data-kind="privacy-reaccept"]')!.textContent).toContain(
      'Please review and accept the updated Privacy Policy to continue.',
    );
    await click(find('Review and accept'));
    expect(mockPrecheck).toHaveBeenCalledWith('plan-cancel');
  });
});

describe('T-509 AC4 subscribe gates and failures', () => {
  it('403 email_verification_required opens the M6 Subscribe dialog: Choose stays enabled, no redirect, no banner', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(403, { error: 'email_verification_required' }));
    await mountWithPrompt();
    await click(find('Choose Solo'));
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    // AJ-522-M6 shared title and Subscribe body (T-511-copy-rulings-ajay.md)
    expect(d.textContent).toContain('Verify your email to continue');
    expect(d.textContent).toContain('Verify your email to subscribe.');
    expect(find('Resend email', d)).toBeDefined();
    expect(find('Not now', d)).toBeDefined();
    expect(find('Choose Solo')?.hasAttribute('disabled')).toBe(false);
    expect(find('Choose Pro')?.hasAttribute('disabled')).toBe(false);
    // The M3 dashboard bar is mounted beside the panel; the panel itself shows no banner.
    expect(
      container.querySelector('[data-testid="plan-wrap"] [data-kind="verify-email"]'),
    ).toBeNull();
    expect(text()).not.toContain('Order creation failed');
    expect(text()).not.toContain('email_verification_required');
    expect(text()).not.toContain(GENERIC);
    expect(hrefSet).not.toHaveBeenCalled();
    await click(find('Not now', d));
  });

  it('a 403 with any other code does not open the M6 dialog and shows the generic failure', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(403, { error: 'something_else' }));
    await mountWithPrompt();
    await click(find('Choose Solo'));
    expect(dialog()).toBeNull();
    expect(text()).toContain(GENERIC);
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it('privacy block on subscribe: privacy banner with Review and accept, not "Order creation failed"', async () => {
    const res = reply(403, { error: 'privacy_reaccept_required' });
    blocked.add(res);
    mockPrivacyFetch.mockResolvedValue(res);
    await mount();
    await click(find('Choose Pro'));
    expect(container.querySelector('[data-kind="privacy-reaccept"]')!.textContent).toContain(
      'Please review and accept the updated Privacy Policy to continue.',
    );
    expect(text()).not.toContain('Order creation failed');
    expect(text()).not.toContain(GENERIC);
    await click(find('Review and accept'));
    expect(mockPrecheck).toHaveBeenCalledWith('subscribe');
  });

  it('Review and accept scrolls to the P7 box when the re-accept dialog cannot open', async () => {
    const res = reply(403, {});
    blocked.add(res);
    mockPrivacyFetch.mockResolvedValue(res);
    mockPrecheck.mockResolvedValue(false);
    const box = document.createElement('div');
    box.id = 'reaccept-p7-subscribe';
    const scroll = jest.fn();
    box.scrollIntoView = scroll;
    document.body.appendChild(box);
    await mount();
    await click(find('Choose Pro'));
    await click(find('Review and accept'));
    expect(scroll).toHaveBeenCalled();
  });

  it.each([
    ['409 subscription_exists', reply(409, { error: 'subscription_exists' })],
    ['409 subscription_in_progress', reply(409, { error: 'subscription_in_progress' })],
    ['503 try_again', reply(503, { error: 'try_again' })],
    ['500 Order creation failed', reply(500, { error: 'Order creation failed' })],
    ['200 with no link', reply(200, { data: {} })],
  ])('%s: generic failure with Retry; server text never shown', async (_n, res) => {
    mockPrivacyFetch.mockResolvedValue(res);
    await mount();
    await click(find('Choose Solo'));
    expect(text()).toContain(GENERIC);
    expect(text()).not.toMatch(
      /subscription_exists|subscription_in_progress|try_again|Order creation failed/,
    );
    expect(find('Retry', container)).toBeDefined();
    expect(container.querySelector('[data-kind="verify-email"]')).toBeNull();
    expect(container.querySelector('[data-kind="privacy-reaccept"]')).toBeNull();
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it('a network error: generic failure; Retry sends the same plan again and can succeed', async () => {
    mockPrivacyFetch.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await click(find('Choose Pro'));
    expect(text()).toContain(GENERIC);
    expect(text()).not.toContain('offline');
    mockPrivacyFetch.mockResolvedValueOnce(reply(200, { data: { shortUrl: 'https://rzp.io/r' } }));
    await click(find('Retry', container));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockPrivacyFetch.mock.calls[1][2].body)).toEqual({ planId: 'pro_monthly' });
    expect(hrefSet).toHaveBeenCalledWith('https://rzp.io/r');
  });

  it('"Order creation failed" is not in the source of the plan area', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = jest.requireActual('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = jest.requireActual('path') as typeof import('path');
    for (const f of ['PlanPanel.tsx', 'useSubscribe.ts', 'PlanChooser.tsx', 'planCopy.ts']) {
      expect(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).not.toContain(
        'Order creation failed',
      );
    }
  });
});

describe('T-509 Back from Razorpay (bfcache) and a failing redirect', () => {
  const pageshow = (persisted: boolean) => {
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: persisted });
    act(() => {
      window.dispatchEvent(e);
    });
  };
  const chooseDisabled = () => [find('Choose Solo')!.disabled, find('Choose Pro')!.disabled];

  async function redirected() {
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: 'https://rzp.io/x' } }));
    await mount();
    await click(find('Choose Solo'));
    expect(chooseDisabled()).toEqual([true, true]);
  }

  it('pageshow with persisted=true re-enables the buttons, and a new Choose sends a new /subscribe', async () => {
    await redirected();
    pageshow(true);
    await flush();
    expect(chooseDisabled()).toEqual([false, false]);
    await click(find('Choose Pro'));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockPrivacyFetch.mock.calls[1][2].body)).toEqual({ planId: 'pro_monthly' });
  });

  it('pageshow with persisted=false leaves them disabled and sends nothing', async () => {
    await redirected();
    pageshow(false);
    await flush();
    expect(chooseDisabled()).toEqual([true, true]);
    await click(find('Choose Pro'));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
  });

  it('if setting window.location.href throws: generic failure, buttons enabled (not stuck)', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(_v: string) {
          throw new Error('blocked');
        },
      },
    });
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: 'https://rzp.io/x' } }));
    await mount();
    await click(find('Choose Solo'));
    expect(text()).toContain(GENERIC);
    expect(chooseDisabled()).toEqual([false, false]);
    // And a retry is possible: a second press sends a second call.
    await click(find('Choose Pro'));
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
  });

  it('the pageshow listener is removed on unmount: no state update afterwards', async () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await redirected();
    const added = add.mock.calls.filter((c) => c[0] === 'pageshow');
    expect(added).toHaveLength(1);
    act(() => root.unmount());
    const removed = remove.mock.calls.filter((c) => c[0] === 'pageshow');
    expect(removed).toHaveLength(1);
    expect(removed[0][1]).toBe(added[0][1]);
    pageshow(true);
    expect(errors).not.toHaveBeenCalled();
    root = createRoot(container);
    add.mockRestore();
    remove.mockRestore();
    errors.mockRestore();
  });
});

describe('T-509 AC5 no dead buttons', () => {
  it('no "Manage on Razorpay", no "Cancel subscription" anywhere', async () => {
    for (const body of [FREE, SOLO]) {
      statusBody = { data: body };
      await mount();
      expect(bodyText()).not.toContain('Manage on Razorpay');
      expect(bodyText()).not.toContain('Cancel subscription');
    }
  });

  it('free: every button in the plan area is Choose Solo / Choose Pro and each one calls subscribe', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: 'https://rzp.io/x' } }));
    await mount();
    expect(allButtons().map((b) => b.textContent?.trim())).toEqual(['Choose Solo', 'Choose Pro']);
    // A fresh mount per button: after a redirect the buttons stay disabled on purpose.
    for (const label of ['Choose Solo', 'Choose Pro']) {
      act(() => root.unmount());
      root = createRoot(container);
      await mount();
      await click(find(label));
    }
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
    expect(mockPrivacyFetch.mock.calls.map((c) => JSON.parse(c[2].body).planId)).toEqual([
      'solo_monthly',
      'pro_monthly',
    ]);
  });

  it('live Solo: every button does something (Cancel plan opens the dialog, Upgrade to Pro shows the note)', async () => {
    statusBody = { data: SOLO };
    await mount();
    expect(
      allButtons()
        .map((b) => b.textContent?.trim())
        .sort(),
    ).toEqual(['Cancel plan', 'Upgrade to Pro'].sort());
    await click(find('Upgrade to Pro'));
    expect(text()).toContain('To change plans');
    await click(find('Cancel plan'));
    expect(dialog()).not.toBeNull();
  });

  it('live Pro: Switch to Solo and Cancel plan are the only buttons', async () => {
    statusBody = { data: { ...SOLO, tier: 'pro' } };
    await mount();
    expect(
      allButtons()
        .map((b) => b.textContent?.trim())
        .sort(),
    ).toEqual(['Cancel plan', 'Switch to Solo'].sort());
  });
});
