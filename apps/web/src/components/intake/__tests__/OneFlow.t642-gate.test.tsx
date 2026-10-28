// T-642 AC8 (AJ-642-M3/M6): OneFlow's generate (confirm brief) sends no generate request while the
// Google sign-up consent is needed; the panel's checkbox gets focus. Unchanged when not needed.
// (The confirm-button ghost is pending with Priya and is not tested.) Harness: OneFlow.t522.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, KindSummary } from '../briefTypes';

import SignupConsentPrompt from '@/components/SignupConsentPrompt';
import { resetSignupConsent } from '@/lib/signupConsent';

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

let needs = true;
let briefReply: () => unknown;
async function mountFlow() {
  await act(async () => {
    root.render(
      <>
        <SignupConsentPrompt />
        <OneFlow kinds={KINDS} loadingKinds={false} />
      </>,
    );
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  needs = true;
  resetSignupConsent();
  Element.prototype.scrollIntoView = jest.fn();
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  briefReply = () => okRes({ outcome: 'brief', brief, questions: [] });
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return okRes({ data: { needsSignupConsent: needs } });
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

async function toBrief() {
  await mountFlow();
  await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

describe('T-642: OneFlow generate', () => {
  it('needed: Confirm sends no generate request, focuses the checkbox, stays on the brief', async () => {
    await toBrief();
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    await wait(5);
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.getElementById('signup-consent-box'));
    expect(buttonWith('Confirm brief and continue')).toBeDefined();
    expect(buttonWith('Confirm brief and continue')!.disabled).toBe(false);
  });

  it('not needed: Confirm sends the generate request as before', async () => {
    needs = false;
    mockPrivacyFetch.mockResolvedValue(refusedRes());
    await toBrief();
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
  });

  it('unknown state (no panel): Confirm is let through', async () => {
    mockPrivacyFetch.mockResolvedValue(refusedRes());
    await act(async () => {
      root.render(<OneFlow kinds={KINDS} loadingKinds={false} />);
    });
    await flush();
    await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
  });
});
