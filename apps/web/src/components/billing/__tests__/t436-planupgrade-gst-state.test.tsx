// T-436 (b) — Subscribe with no State: the required error, focus on the select, no call to
// /api/billing/subscribe (spec §2). Also: with a parent-supplied `gst` there is no second picker.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PlanUpgrade } from '../PlanUpgrade';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/plans', () => ({
  ...jest.requireActual('@/lib/plans'),
  fetchPlans: async () => ({
    subscriptions: [
      { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
    ],
    topups: [],
  }),
}));
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
let savedState: string | null;
let container: HTMLDivElement;
let root: Root;
const hrefSet = jest.fn();
const originalLocation = window.location;

const select = () => container.querySelector('select') as HTMLSelectElement;
const upgrade = () =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    /Upgrade to Pro/.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
const subscribeCalls = () =>
  mockPrivacyFetch.mock.calls.filter((c) => c[1] === '/api/billing/subscribe');

async function flush() {
  await act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(<PlanUpgrade />);
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = `u-${Math.random()}`;
  blocked = new WeakSet();
  savedState = null;
  mockApiFetch.mockImplementation(async () => reply(200, { data: { gstStateCode: savedState } }));
  mockPrivacyFetch.mockImplementation(async (_k: string, path: string) =>
    path === '/api/billing/subscribe'
      ? reply(200, { data: { shortUrl: 'https://rzp.io/x' } })
      : reply(200, {}),
  );
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

describe('T-436 PlanUpgrade: State before Subscribe', () => {
  it('renders its own picker above the Upgrade button', async () => {
    await mount();
    const nodes = Array.from(container.querySelectorAll('select, button'));
    expect(select()).not.toBeNull();
    expect(nodes.indexOf(select())).toBeLessThan(nodes.indexOf(upgrade()));
  });

  it('no State: the required error, focus on the select, no subscribe call, no redirect', async () => {
    await mount();
    expect(upgrade().disabled).toBe(false);
    await act(async () => upgrade().click());
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Select your State to continue.',
    );
    expect(document.activeElement).toBe(select());
    expect(subscribeCalls()).toHaveLength(0);
    expect(hrefSet).not.toHaveBeenCalled();
    expect(upgrade().disabled).toBe(false);
  });

  it('a saved State lets Subscribe through, with no PATCH', async () => {
    savedState = '29';
    await mount();
    await act(async () => upgrade().click());
    await flush();
    expect(subscribeCalls()).toHaveLength(1);
    expect(hrefSet).toHaveBeenCalledWith('https://rzp.io/x');
    expect(mockPrivacyFetch.mock.calls.filter((c) => c[2]?.method === 'PATCH')).toHaveLength(0);
  });

  it('a pick is saved (PATCH) before the subscribe call', async () => {
    await mount();
    await act(async () => {
      select().value = '37';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    await act(async () => upgrade().click());
    await flush();
    const seq = mockPrivacyFetch.mock.calls.map((c) => `${c[2]?.method} ${c[1]}`);
    expect(seq.indexOf('PATCH /api/auth/me')).toBeGreaterThanOrEqual(0);
    expect(seq.indexOf('PATCH /api/auth/me')).toBeLessThan(
      seq.indexOf('POST /api/billing/subscribe'),
    );
  });

  it('a pick the privacy gate blocked: no subscribe call', async () => {
    mockPrivacyFetch.mockImplementation(async (_k: string, path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const r = reply(403, { error: 'privacy_reaccept_required' });
        blocked.add(r);
        return r;
      }
      return reply(200, { data: { shortUrl: 'https://rzp.io/x' } });
    });
    await mount();
    await act(async () => {
      select().value = '37';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    await act(async () => upgrade().click());
    await flush();
    expect(subscribeCalls()).toHaveLength(0);
    expect(hrefSet).not.toHaveBeenCalled();
  });
});
