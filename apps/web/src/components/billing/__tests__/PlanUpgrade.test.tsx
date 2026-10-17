// T-370 — the settings "Upgrade" block buys the plan it shows, labelled from the catalogue.
// Mounted with react-dom/client (no @testing-library/dom), like PrivacyUpdatePrompt.test.tsx.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PlanUpgrade } from '../PlanUpgrade';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFetchPlans = jest.fn();
jest.mock('@/lib/plans', () => ({
  ...jest.requireActual('@/lib/plans'),
  fetchPlans: () => mockFetchPlans(),
}));

const mockPrivacyFetch = jest.fn();
const mockIsPrivacyBlocked = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: (res: unknown) => mockIsPrivacyBlocked(res),
  privacyFetch: (...args: unknown[]) => mockPrivacyFetch(...args),
  usePrivacyDescribedBy: () => undefined,
  // T-436: the State picker waits for acceptance through this.
  onPrivacyAccepted: () => () => {},
}));

// T-436: the block renders its own State picker; the signed-in user already has a State saved
// (GET /api/auth/me), so Subscribe is not blocked and the tests below keep their point.
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'plan-upgrade-user' } }),
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// T-223: the verify card replaces the upgrade button for an unverified email user.
const mockNeedsVerification = jest.fn();
const mockIsVerificationRequired = jest.fn();
jest.mock('@/components/VerifyEmailPrompt', () => ({
  VerifyEmailCard: () => <div data-testid="verify-card">Verify your email</div>,
  isEmailVerificationRequired: (res: unknown) => mockIsVerificationRequired(res),
  useNeedsEmailVerification: () => mockNeedsVerification(),
}));

// Both tiers, so a wrong pick (solo) would be visible.
const CATALOGUE = {
  subscriptions: [
    { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
    { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
    { id: 'pro_yearly', tier: 'pro', cycle: 'yearly', priceInr: 19990, inkPerCycle: 150 },
  ],
  topups: [],
};

const hrefSet = jest.fn();
const originalLocation = window.location;
let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

async function mount(props: Parameters<typeof PlanUpgrade>[0] = {}) {
  await act(async () => {
    root.render(<PlanUpgrade {...props} />);
  });
  await flush();
}

const button = () => container.querySelector('button') as HTMLButtonElement | null;
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPrivacyBlocked.mockReturnValue(false);
  mockNeedsVerification.mockReturnValue(false);
  mockIsVerificationRequired.mockResolvedValue(false);
  mockFetchPlans.mockResolvedValue(CATALOGUE);
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { gstStateCode: '07' } }),
  });
  // jsdom's location.href setter is not implemented; swap in an object that records it.
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
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('T-370 PlanUpgrade label', () => {
  it('shows the Pro name, price and Ink from the catalogue, never Solo or Unlimited', async () => {
    await mount();
    expect(button()?.textContent).toBe('Upgrade to Pro — ₹1,999/month');
    // T-509: the tick list (with its Ink line) was dropped; the Ink now shows on the plan cards.
    expect(container.textContent).not.toContain('799');
    expect(container.textContent).not.toMatch(/(^|\D)50 Ink/);
    expect(container.textContent).not.toMatch(/unlimited/i);
    expect(button()?.disabled).toBe(false);
  });

  it('follows the catalogue, not a constant: a changed Pro price is what is shown', async () => {
    mockFetchPlans.mockResolvedValue({
      subscriptions: [
        { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 2499, inkPerCycle: 200 },
      ],
      topups: [],
    });
    await mount();
    expect(button()?.textContent).toBe('Upgrade to Pro — ₹2,499/month');
    expect(container.textContent).not.toContain('1,999');
  });

  it('can be pointed at another plan by tier and cycle', async () => {
    await mount({ tier: 'pro', cycle: 'yearly' });
    expect(button()?.textContent).toBe('Upgrade to Pro — ₹19,990/year');
  });

  it('shows no price while the catalogue is loading, and the button is disabled', async () => {
    mockFetchPlans.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(button()?.textContent).toBe('Loading plan…');
    expect(button()?.disabled).toBe(true);
    expect(container.textContent).not.toContain('₹');
    expect(container.textContent).not.toContain('Ink');
    button()?.click();
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('shows an error and no button or price when the catalogue fails to load', async () => {
    mockFetchPlans.mockRejectedValue(new Error('500'));
    await mount();
    expect(container.textContent).toBe(
      'Could not load plan details. Please refresh the page to upgrade.',
    );
    expect(button()).toBeNull();
    expect(container.textContent).not.toContain('₹');
  });

  it('shows the same error, with no fallback price, when the plan is not in the catalogue', async () => {
    mockFetchPlans.mockResolvedValue({ subscriptions: [CATALOGUE.subscriptions[0]], topups: [] });
    await mount();
    expect(container.textContent).toContain('Could not load plan details.');
    expect(button()).toBeNull();
    expect(container.textContent).not.toContain('₹');
  });
});

describe('T-370 PlanUpgrade subscribe call', () => {
  it('sends the Pro planId with a JSON content-type, not an empty body', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: 'https://rzp.io/x' } }));
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    const [key, path, init] = mockPrivacyFetch.mock.calls[0];
    expect(key).toBe('subscribe');
    expect(path).toBe('/api/billing/subscribe');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ planId: 'pro_monthly' });
  });

  it('sends the planId of the plan chosen by tier and cycle', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: 'https://rzp.io/x' } }));
    await mount({ tier: 'pro', cycle: 'yearly' });
    await act(async () => button()?.click());
    await flush();
    expect(JSON.parse(mockPrivacyFetch.mock.calls[0][2].body)).toEqual({ planId: 'pro_yearly' });
  });

  it('redirects to the shortUrl on success', async () => {
    const url = 'https://rzp.io/pay-pro';
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: { shortUrl: url } }));
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(hrefSet).toHaveBeenCalledWith(url);
  });

  it('shows the generic failure, never the server text, and does not redirect on a non-2xx reply', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(400, { error: 'Unknown plan id' }));
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(container.textContent).toContain('Something did not work. Try again.');
    expect(container.textContent).not.toContain('Unknown plan id');
    expect(hrefSet).not.toHaveBeenCalled();
    expect(button()?.disabled).toBe(false);
  });

  it('says so when no payment link comes back', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(200, { data: {} }));
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(container.textContent).toContain('Something did not work. Try again.');
    expect(container.textContent).not.toContain('No payment link');
  });

  it('shows a network error when the call throws', async () => {
    mockPrivacyFetch.mockRejectedValue(new Error('offline'));
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(container.textContent).toContain('Something did not work. Try again.');
    expect(container.textContent).not.toContain('Network error');
  });

  it('does nothing further when the privacy gate blocked the call (T-343)', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(403, { error: 'privacy_reaccept_required' }));
    mockIsPrivacyBlocked.mockReturnValue(true);
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(container.textContent).not.toContain('Failed to start subscription');
    expect(button()?.disabled).toBe(false);
  });
});

describe('T-223 PlanUpgrade email verification', () => {
  const card = () => container.querySelector('[data-testid="verify-card"]');

  it('shows the verify card and no upgrade button when verification is needed', async () => {
    mockNeedsVerification.mockReturnValue(true);
    await mount();
    expect(card()).not.toBeNull();
    expect(button()).toBeNull();
  });

  it('shows the card and no button while the catalogue is still loading', async () => {
    mockNeedsVerification.mockReturnValue(true);
    mockFetchPlans.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(card()).not.toBeNull();
    expect(button()).toBeNull();
  });

  it('shows the card, not the load error, when the catalogue fails', async () => {
    mockNeedsVerification.mockReturnValue(true);
    mockFetchPlans.mockRejectedValue(new Error('500'));
    await mount();
    expect(card()).not.toBeNull();
    expect(button()).toBeNull();
    expect(container.textContent).not.toContain('Could not load plan details');
  });

  it('shows the card, not the load error, when the plan is missing from the catalogue', async () => {
    mockNeedsVerification.mockReturnValue(true);
    mockFetchPlans.mockResolvedValue({ subscriptions: [], topups: [] });
    await mount();
    expect(card()).not.toBeNull();
    expect(container.textContent).not.toContain('Could not load plan details');
  });

  it('does not show the card for a verified user', async () => {
    await mount();
    expect(card()).toBeNull();
    expect(button()).not.toBeNull();
  });

  it('a 403 email_verification_required reply means no redirect and no error text', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(403, { error: 'email_verification_required' }));
    mockIsVerificationRequired.mockResolvedValue(true);
    await mount();
    await act(async () => button()?.click());
    await flush();
    expect(mockIsVerificationRequired).toHaveBeenCalledTimes(1);
    expect(hrefSet).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('email_verification_required');
    expect(container.textContent).not.toContain('Failed to start subscription');
    expect(container.textContent).not.toContain('Network error');
    expect(container.textContent).not.toContain('No payment link');
    expect(button()?.disabled).toBe(false);
  });
});
