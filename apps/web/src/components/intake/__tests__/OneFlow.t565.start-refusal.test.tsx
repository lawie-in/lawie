// T-565 wave 2b B5 + W13 + T-567 item 41, through OneFlow's real SSE reader and start handling.
//  - a refused start routes like the form flow: 409 -> documents-list line, no retry; plan-gate
//    403 -> plan line, no retry; everything else -> the generic line with retry. Never the
//    server's text. Retry resends the same run_id.
//  - inkReleased === true is the only way to "No Ink was used."
//  - dropped connections show CONNECTION_LOST alone.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, KindSummary } from '../briefTypes';
import {
  CHECK_DOCUMENTS_LIST,
  CONNECTION_LOST,
  DRAFT_DID_NOT_FINISH,
  NOT_ON_CURRENT_PLAN,
  NO_INK_USED,
  SOMETHING_DID_NOT_WORK,
} from '../generationFailure';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => false,
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

function sse(chunks: string[], runId: string | null = null) {
  const enc = new NodeTextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === 'X-Run-Id' ? runId : null) },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
}
const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const refused = (status: number, body: unknown, runId: string | null = null) => ({
  ok: false,
  status,
  headers: { get: (h: string) => (h === 'X-Run-Id' ? runId : null) },
  json: async () => body,
});

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(t),
  ) as HTMLButtonElement | undefined;
const setText = async (ta: HTMLTextAreaElement, v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
const text = () => container.textContent ?? '';
const generateCalls = () => mockPrivacyFetch.mock.calls;
const sentBody = (n: number) => JSON.parse(generateCalls()[n][2].body);

async function toBrief() {
  await act(async () => {
    root.render(<OneFlow kinds={KINDS} loadingKinds={false} />);
  });
  await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}
async function confirmWith(response: unknown) {
  mockPrivacyFetch.mockResolvedValue(response);
  await act(async () => buttonWith('Confirm brief and continue')?.click());
  await flush();
}
async function retryWith(response: unknown) {
  mockPrivacyFetch.mockResolvedValue(response);
  await act(async () => buttonWith('Try again')?.click());
  await flush();
}
const heading = () => container.querySelector('h1')?.textContent;

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ outcome: 'brief', brief, questions: [] }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('B5: a refused start routes like the form flow (heading, no Ink claim, never the reason)', () => {
  it('409: the documents-list line and NO Try again button', async () => {
    await toBrief();
    await confirmWith(
      refused(409, { error: 'draft_in_progress', message: 'Already running.' }, 'run-1'),
    );
    expect(heading()).toBe(CHECK_DOCUMENTS_LIST);
    expect(buttonWith('Try again')).toBeUndefined();
    expect(buttonWith('Back to the brief')).toBeDefined();
    expect(text()).not.toContain('Already running.');
    expect(text()).not.toContain('draft_in_progress');
    expect(text()).not.toContain('No Ink was used');
    expect(container.querySelector('[data-no-ink-claim="false"]')).not.toBeNull();
  });

  it('409 never sends a second request, not even after the UI settles', async () => {
    await toBrief();
    await confirmWith(refused(409, {}, 'run-1'));
    await flush();
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it.each([
    ['upgradeUrl', { upgradeUrl: '/dashboard/settings' }],
    ['upgradeUrl with other text', { error: 'nope', upgradeUrl: 'https://x.in/plans' }],
    ['requires a Pro plan', { error: 'This template requires a Pro plan' }],
    ['requires an Enterprise plan', { error: 'requires an Enterprise plan' }],
  ])('plan-gate 403 (%s): the plan line and NO retry', async (_n, body) => {
    await toBrief();
    await confirmWith(refused(403, body));
    expect(heading()).toBe(NOT_ON_CURRENT_PLAN);
    expect(heading()).toBe('This document is not available on your current plan.');
    expect(buttonWith('Try again')).toBeUndefined();
    expect(text()).not.toContain('requires');
    expect(text()).not.toContain('Pro plan');
    expect(generateCalls()).toHaveLength(1);
  });

  it.each([
    ['400', 400, { error: 'bad_input', message: 'Brief is incomplete.' }],
    ['400 empty', 400, {}],
    ['401', 401, { error: 'unauthorized' }],
    ['403 not a plan gate', 403, { error: 'forbidden' }],
    ['403 no body', 403, {}],
    ['429', 429, { error: 'rate_limited', message: 'Slow down.' }],
    ['500', 500, { message: 'The service is busy right now.' }],
    ['502', 502, {}],
    ['503', 503, { error: 'unavailable' }],
  ])('%s: the generic line with Try again, never the server text', async (_n, status, body) => {
    await toBrief();
    await confirmWith(refused(status, body));
    expect(heading()).toBe(SOMETHING_DID_NOT_WORK);
    expect(buttonWith('Try again')).toBeDefined();
    for (const raw of [
      'bad_input',
      'Brief is incomplete.',
      'unauthorized',
      'forbidden',
      'rate_limited',
      'Slow down.',
      'busy right now',
      'unavailable',
    ]) {
      expect(text()).not.toContain(raw);
    }
    expect(text()).not.toContain('No Ink was used');
    expect(container.querySelector('[data-no-ink-claim="false"]')).not.toBeNull();
  });

  it('a 400 no_match is still the no-match screen, not the generic card', async () => {
    await toBrief();
    await confirmWith(refused(400, { error: 'no_match' }));
    expect(text()).not.toContain(SOMETHING_DID_NOT_WORK);
    expect(buttonWith('Try again')).toBeUndefined();
  });

  it('a non-JSON refusal body still gives the generic line', async () => {
    await toBrief();
    await confirmWith({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => {
        throw new Error('html');
      },
    });
    expect(heading()).toBe(SOMETHING_DID_NOT_WORK);
  });

  it('Try again resends the SAME run_id (from X-Run-Id), not a fresh run', async () => {
    await toBrief();
    await confirmWith(refused(500, {}, 'run-abc'));
    expect(sentBody(0)).not.toHaveProperty('run_id');
    await retryWith(refused(500, {}, 'run-abc'));
    expect(generateCalls()).toHaveLength(2);
    expect(sentBody(1).run_id).toBe('run-abc');
    await retryWith(sse([], 'run-abc'));
    expect(sentBody(2).run_id).toBe('run-abc');
    expect(generateCalls()).toHaveLength(3);
  });

  it('Try again after a 429 with no X-Run-Id sends no run_id (nothing to resend)', async () => {
    await toBrief();
    await confirmWith(refused(429, {}));
    await retryWith(sse([]));
    expect(sentBody(1)).not.toHaveProperty('run_id');
    expect(sentBody(1).described).toBe(TYPED);
  });

  it('a fresh Confirm after Back to the brief starts a new run (no old run_id)', async () => {
    await toBrief();
    await confirmWith(refused(500, {}, 'run-old'));
    await act(async () => buttonWith('Back to the brief')?.click());
    await flush();
    await confirmWith(refused(500, {}, 'run-new'));
    expect(sentBody(1)).not.toHaveProperty('run_id');
  });
});

describe('T-567 item 41 / 41b: only inkReleased === true allows "No Ink was used."', () => {
  const failWith = async (payload: Record<string, unknown>) => {
    await toBrief();
    await confirmWith(
      sse([ev('error', { reason: 'Stopped.', code: 'drafter_failed', ...payload })]),
    );
  };

  it('true: No Ink was used. is shown with the claim marker', async () => {
    await failWith({ inkReleased: true });
    expect(text()).toContain(DRAFT_DID_NOT_FINISH);
    expect(text()).toContain(NO_INK_USED);
    expect(text()).not.toContain(CHECK_DOCUMENTS_LIST);
    expect(container.querySelector('[data-no-ink-claim="true"]')).not.toBeNull();
  });

  it.each([
    ['absent', {}],
    ['false', { inkReleased: false }],
    ['the string "true"', { inkReleased: 'true' }],
    ['1', { inkReleased: 1 }],
    ['null', { inkReleased: null }],
  ])('%s: the documents-list line, no claim', async (_n, payload) => {
    await failWith(payload);
    expect(text()).toContain(DRAFT_DID_NOT_FINISH);
    expect(text()).toContain(CHECK_DOCUMENTS_LIST);
    expect(text()).not.toContain('No Ink was used');
    expect(container.querySelector('[data-no-ink-claim="true"]')).toBeNull();
  });

  it('inkReleased true on insufficient_ink does not add the claim (reason only)', async () => {
    await toBrief();
    await confirmWith(
      sse([
        ev('error', { reason: 'Not enough Ink.', code: 'insufficient_ink', inkReleased: true }),
      ]),
    );
    expect(text()).toContain('Not enough Ink.');
    expect(text()).not.toContain('No Ink was used');
  });
});

describe('W13: no prose reasons on dropped connections or reasonless errors', () => {
  const OLD = [
    'The connection was lost before the draft was finished.',
    'Lost the connection to the drafting service.',
    'The drafting service returned an error.',
    'The drafting service sent nothing back.',
    'The draft could not be started. Please try again.',
  ];
  const expectNoOld = () => {
    for (const o of OLD) expect(text()).not.toContain(o);
  };

  it('stream ends without done: Connection lost. Check your documents. alone', async () => {
    await toBrief();
    await confirmWith(sse([ev('message', { text: 'partial' })]));
    expect(heading()).toBe(CONNECTION_LOST);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(CONNECTION_LOST);
    expectNoOld();
    expect(buttonWith('Try again')).toBeDefined();
  });

  it('fetch throws: the same card alone', async () => {
    await toBrief();
    mockPrivacyFetch.mockRejectedValue(new Error('network'));
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(heading()).toBe(CONNECTION_LOST);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(CONNECTION_LOST);
    expectNoOld();
  });

  it('an error event with no reason: heading + documents line, no filler text', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { code: 'x' })]));
    expect(heading()).toBe(DRAFT_DID_NOT_FINISH);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      DRAFT_DID_NOT_FINISH + CHECK_DOCUMENTS_LIST,
    );
    expectNoOld();
  });

  it('an error event whose reason is not a string is treated as no reason', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { reason: { a: 1 } })]));
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      DRAFT_DID_NOT_FINISH + CHECK_DOCUMENTS_LIST,
    );
  });

  it('an error event with a string reason still shows it under the signed lines', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { reason: 'The drafter stopped.', code: 'x' })]));
    expect(text()).toContain('The drafter stopped.');
  });

  it('empty body: heading + documents line, no Ink claim, no old prose', async () => {
    await toBrief();
    await confirmWith({ ok: true, status: 200, headers: { get: () => null }, body: null });
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      DRAFT_DID_NOT_FINISH + CHECK_DOCUMENTS_LIST,
    );
    expectNoOld();
  });
});
