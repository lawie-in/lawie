// T-510 — top-up modal: a failed plans request shows the error and Retry, never a forever spinner.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TopUpModal } from '../TopUpModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-510' } }) }));
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
  openVerifyIfDraftRefused: async () => false,
  VerifyEmailCard: () => null,
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
const ERR = 'Could not load top-up plans.';

let plansReply: () => Promise<unknown>;
let container: HTMLDivElement;
let root: Root;
const text = () => document.body.textContent ?? '';
const alertEl = () => document.body.querySelector('[role="alert"]');
const retryBtn = () =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Retry');
const planCalls = () => mockApiFetch.mock.calls.filter((c) => c[0] === '/api/billing/plans');

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(<TopUpModal onClose={jest.fn()} />);
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

describe('T-510 top-up modal: plans failure', () => {
  it('shows the packs and no error or spinner when plans load', async () => {
    await mount();
    expect(text()).toContain('10 Ink, ₹99');
    expect(alertEl()).toBeNull();
    expect(text()).not.toContain('Loading packs');
  });

  it('shows a skeleton while the request is pending', async () => {
    plansReply = () => new Promise(() => {});
    await mount();
    // T-535: skeleton, no visible copy; only the visually hidden "Loading" status label.
    const status = document.body.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('Loading');
    expect(status.querySelector('.sr-only')!.textContent).toBe('Loading');
    expect(text()).not.toContain('Loading packs');
    expect(alertEl()).toBeNull();
  });

  it.each([
    [
      'rejected request',
      async () => {
        throw new Error('network');
      },
    ],
    ['non-OK (500)', async () => reply(500, PLANS)],
    ['undefined response', async () => undefined],
    ['body without topups', async () => reply(200, { subscriptions: [] })],
    ['topups not an array', async () => reply(200, { topups: 'nope' })],
    ['empty topups list', async () => reply(200, { topups: [] })],
    ['null body', async () => reply(200, null)],
  ])('%s -> error and Retry, no spinner', async (_n, fn) => {
    plansReply = fn;
    await mount();
    expect(alertEl()!.textContent).toContain(ERR);
    expect(retryBtn()).toBeDefined();
    expect(text()).not.toContain('Loading packs');
    expect(document.body.querySelector('[role="status"]')).toBeNull();
  });

  it('Retry refetches /api/billing/plans and then shows the packs without the error', async () => {
    plansReply = async () => reply(500);
    await mount();
    expect(planCalls()).toHaveLength(1);
    plansReply = async () => reply(200, PLANS);
    await act(async () => retryBtn()!.click());
    await flush();
    expect(planCalls()).toHaveLength(2);
    expect(text()).toContain('30 Ink, ₹249');
    expect(alertEl()).toBeNull();
    expect(retryBtn()).toBeUndefined();
  });

  it('Retry that fails again shows the error again; the skeleton shows during the retry', async () => {
    plansReply = async () => reply(500);
    await mount();
    let release!: () => void;
    plansReply = () => new Promise((r) => (release = () => r(reply(500))));
    await act(async () => retryBtn()!.click());
    expect(document.body.querySelector('[role="status"]')!.textContent).toBe('Loading');
    expect(alertEl()).toBeNull();
    await act(async () => release());
    await flush();
    expect(alertEl()!.textContent).toContain(ERR);
    expect(text()).not.toContain('Loading packs');
  });

  it('Buy stays disabled while plans have failed', async () => {
    plansReply = async () => reply(500);
    await mount();
    const pay = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent === 'Buy',
    ) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
  });

  it('focus returns to the Retry button when the reload fails again', async () => {
    plansReply = async () => reply(500);
    await mount();
    await act(async () => retryBtn()!.click());
    await flush();
    expect(retryBtn()).toBeDefined();
    expect(document.activeElement).toBe(retryBtn());
  });

  it('focus moves to the first pack when the reload succeeds', async () => {
    plansReply = async () => reply(500);
    await mount();
    plansReply = async () => reply(200, PLANS);
    await act(async () => retryBtn()!.click());
    await flush();
    const first = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /10 Ink, ₹99/.test(b.textContent ?? ''),
    );
    expect(first).toBeDefined();
    expect(document.activeElement).toBe(first);
  });

  it('does not steal focus when plans fail on the first load (no Retry pressed)', async () => {
    plansReply = async () => reply(500);
    await mount();
    expect(document.activeElement).not.toBe(retryBtn());
  });
});
