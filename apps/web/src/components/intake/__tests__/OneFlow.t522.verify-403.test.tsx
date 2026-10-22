// T-522 (AJ-522-M6): a 403 email_verification_required in OneFlow (intake/brief and
// generate-from-brief) opens the Draft dialog at the moment of the action. Not now has first
// focus, the buttons stay enabled, the advocate stays on the same step, and nothing redirects.
// The real VerifyEmailPrompt runs here.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, KindSummary } from '../briefTypes';

import VerifyEmailPrompt from '@/components/VerifyEmailPrompt';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'alice@example.com' }, isLoading: false }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: () => <div data-testid="paywall" />,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));

// AJ-522-M6 / S14, copied from handoff/legal/T-511-copy-rulings-ajay.md.
const TITLE = 'Verify your email to continue';
const BODY = 'Verify your email to start drafting. We sent a link to a***@example.com.';
const TYPED = 'My client was arrested under a FIR and needs regular bail please.';

const brief: Brief = {
  kind: { id: 'bail', name: 'Bail application', court_document: false },
  court: { state: null, court_type: null, court: null },
  items: [],
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
};
const KINDS: KindSummary[] = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 2,
  },
  {
    template_id: 'other',
    display_name: 'Other',
    category: 'civil',
    description: '',
    plan_access: 'free',
    credits_cost: 9,
  },
];

const refusedRes = () => {
  const r = {
    ok: false,
    status: 403,
    headers: { get: () => null },
    json: async () => ({ error: 'email_verification_required' }),
    clone: () => r,
  };
  return r;
};
const okRes = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => body,
  clone() {
    return this;
  },
});

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const buttonWith = (t: string, within: ParentNode = container) =>
  Array.from(within.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(t)) as
    | HTMLButtonElement
    | undefined;
const setText = async (ta: HTMLTextAreaElement, v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

let briefReply: () => unknown;
async function mountFlow() {
  await act(async () => {
    root.render(
      <>
        <VerifyEmailPrompt />
        <OneFlow kinds={KINDS} loadingKinds={false} />
      </>,
    );
  });
  await flush();
}
function expectM6Dialog() {
  const d = dialog();
  expect(d).not.toBeNull();
  expect(d!.querySelector('h2')?.textContent).toBe(TITLE);
  expect(d!.textContent).toContain(BODY);
  expect(document.activeElement).toBe(buttonWith('Not now', d!));
  expect(buttonWith('Not now', d!)!.disabled).toBe(false);
  expect(buttonWith('Resend email', d!)!.disabled).toBe(false);
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid="paywall"]')).toBeNull();
}

beforeEach(() => {
  jest.clearAllMocks();
  briefReply = () => okRes({ outcome: 'brief', brief, questions: [] });
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return okRes({ data: {} });
    return briefReply();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('T-522: 403 email_verification_required in OneFlow', () => {
  it('intake/brief 403: the M6 dialog opens, the advocate stays on the same step with their text, no message, Continue enabled', async () => {
    briefReply = refusedRes;
    await mountFlow();
    await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expectM6Dialog();
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe(TYPED);
    expect(container.textContent).not.toContain('email_verification_required');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(buttonWith('Continue')!.disabled).toBe(false);
    await act(async () => buttonWith('Not now', dialog()!)!.click());
    await flush();
    expect(dialog()).toBeNull();
    expect(buttonWith('Continue')!.disabled).toBe(false);
  });

  it('generate-from-brief 403: back on the brief with the dialog over it; Confirm stays enabled; no redirect', async () => {
    await mountFlow();
    await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    mockPrivacyFetch.mockResolvedValue(refusedRes());
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expectM6Dialog();
    expect(buttonWith('Confirm brief and continue')).toBeDefined();
    expect(buttonWith('Confirm brief and continue')!.disabled).toBe(false);
    expect(container.textContent).not.toContain('Pro plan');
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    await act(async () => buttonWith('Not now', dialog()!)!.click());
    await flush();
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(2);
  });

  it('a 403 with another code on intake/brief does not open the dialog', async () => {
    briefReply = () => {
      const r = {
        ok: false,
        status: 403,
        headers: { get: () => null },
        json: async () => ({ error: 'something_else' }),
        clone: () => r,
      };
      return r;
    };
    await mountFlow();
    await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(dialog()).toBeNull();
  });
});
