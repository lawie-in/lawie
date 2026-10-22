// T-535 — top-up modal follows signed copy §4.6 (T-511 copy v1); no Popular / Best value chips.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PaywallModal } from '../PaywallModal';
import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-535' } }) }));
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

const reply = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
// Both legacy badge values are served: the UI must not render either.
const PLANS = {
  topups: [
    { id: 'topup_mini', ink: 3, priceInr: 65, pricePerInkInr: 21.67 },
    { id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3, badge: 'POPULAR' },
    { id: 'topup_max', ink: 100, priceInr: 699, pricePerInkInr: 6.99, badge: 'BEST_VALUE' },
  ],
};

let plansReply: () => Promise<unknown>;
let container: HTMLDivElement;
let root: Root;
const text = () => document.body.textContent ?? '';
const buttons = () => Array.from(document.body.querySelectorAll('button'));

async function flush() {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });
}
async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  plansReply = async () => reply(200, PLANS);
  mockApiFetch.mockImplementation(async (path: string) =>
    path === '/api/billing/plans' ? plansReply() : reply(200, { data: { gstStateCode: null } }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-535 TopUpModal signed copy (§4.6)', () => {
  it('title is exactly "Top up Ink" and it is the only such text (no eyebrow)', async () => {
    await render(<TopUpModal onClose={jest.fn()} />);
    const title = document.body.querySelector('[role="dialog"] h2, [role="dialog"] [id]')!;
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const labelled = document.getElementById(dialog.getAttribute('aria-labelledby')!)!;
    expect(labelled.textContent).toBe('Top up Ink');
    expect(title).toBeDefined();
    expect(text().split('Top up Ink')).toHaveLength(2);
    expect(text()).not.toContain('Buy Ink for your bench');
  });

  it('shows the signed GST + no-expiry note, byte-exact', async () => {
    await render(<TopUpModal onClose={jest.fn()} />);
    expect(text()).toContain(
      'Prices include GST. Top-up Ink does not expire while your account is open.',
    );
    expect(text()).not.toContain('never expires');
    expect(text()).not.toContain('stacks with your subscription');
  });

  it('pack labels are "{ink} Ink, ₹{price}" and nothing else is on the pack button', async () => {
    await render(<TopUpModal onClose={jest.fn()} />);
    const packs = Array.from(document.body.querySelectorAll('button[aria-pressed]')).map(
      (b) => b.textContent,
    );
    expect(packs).toEqual(['3 Ink, ₹65', '30 Ink, ₹249', '100 Ink, ₹699']);
  });

  it('the pay button reads exactly "Buy"', async () => {
    await render(<TopUpModal onClose={jest.fn()} />);
    expect(buttons().some((b) => b.textContent === 'Buy')).toBe(true);
    expect(text()).not.toContain('Pay with Razorpay');
  });

  it('old pack names and per-Ink lines are gone', async () => {
    await render(<TopUpModal onClose={jest.fn()} />);
    expect(text()).not.toMatch(/Mini|Mid|Max/);
    expect(text()).not.toContain('per Ink');
  });

  it('while loading: skeleton, only the visually hidden "Loading", no visible copy or spinner text', async () => {
    plansReply = () => new Promise(() => {});
    await render(<TopUpModal onClose={jest.fn()} />);
    const status = document.body.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('Loading');
    const visible = Array.from(status.querySelectorAll('*')).filter(
      (el) => el.textContent && !el.closest('.sr-only') && !el.closest('[aria-hidden="true"]'),
    );
    expect(visible).toHaveLength(0);
    expect(text()).not.toContain('Loading packs');
    expect(text()).not.toContain('…');
  });

  it('error state: "Could not load top-up plans." and "Retry"', async () => {
    plansReply = async () => reply(500);
    await render(<TopUpModal onClose={jest.fn()} />);
    expect(document.body.querySelector('[role="alert"]')!.textContent).toContain(
      'Could not load top-up plans.',
    );
    expect(buttons().some((b) => b.textContent === 'Retry')).toBe(true);
  });
});

describe('T-535 no Popular / Best value chips', () => {
  it('TopUpModal renders neither chip even when the plan carries a legacy badge', async () => {
    await render(<TopUpModal onClose={jest.fn()} />);
    expect(text()).not.toMatch(/popular/i);
    expect(text()).not.toMatch(/best value/i);
  });

  it('PaywallModal renders neither chip', async () => {
    await render(
      <PaywallModal documentLabel="Bail application" cost={5} balance={1} onClose={jest.fn()} />,
    );
    expect(text()).toContain('Upgrade to Solo');
    expect(text()).not.toMatch(/popular/i);
    expect(text()).not.toMatch(/best value/i);
  });

  it('PaywallModal -> Top up Ink opens the TopUpModal, still without chips', async () => {
    await render(
      <PaywallModal documentLabel="Bail application" cost={5} balance={1} onClose={jest.fn()} />,
    );
    const topUp = buttons().find((b) => b.textContent?.includes('Top up Ink'))!;
    await act(async () => topUp.click());
    await flush();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).not.toMatch(/popular|best value/i);
  });
});
